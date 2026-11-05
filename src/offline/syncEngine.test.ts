import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncEngine, TransactionRunner } from './syncEngine';
import { outbox, calculateBackoffMs, isNonRetryableError } from './outbox';
import { localDb, MemoryDatabaseDriver } from './localDb';
import { useNetworkStore } from './network';
import {
  applyExpenseOverlay,
  applyMemberOverlay,
  applyAttendanceOverlay,
  applyLoanOverlay,
} from './overlay';
import { AppUser, Expense, Attendance, PersonalLoan } from '../models/types';

describe('SyncEngine & Outbox Logic', () => {
  beforeEach(() => {
    localDb.setDriver(new MemoryDatabaseDriver());
    useNetworkStore.setState({ isOnline: true });
  });

  describe('Backoff Schedule & Error Classification', () => {
    it('calculates correct backoff delays [2s, 5s, 15s, 60s, 5m]', () => {
      expect(calculateBackoffMs(1)).toBe(2000);
      expect(calculateBackoffMs(2)).toBe(5000);
      expect(calculateBackoffMs(3)).toBe(15000);
      expect(calculateBackoffMs(4)).toBe(60000);
      expect(calculateBackoffMs(5)).toBe(300000);
      expect(calculateBackoffMs(10)).toBe(300000); // capped at 5min
    });

    it('identifies non-retryable errors correctly', () => {
      expect(isNonRetryableError(new Error('FirebaseError: permission-denied'))).toBe(true);
      expect(isNonRetryableError(new Error('invalid-argument: Bad price'))).toBe(true);
      expect(isNonRetryableError(new Error('Document not-found'))).toBe(true);
      expect(isNonRetryableError(new Error('Network request failed'))).toBe(false);
      expect(isNonRetryableError(new Error('Timeout'))).toBe(false);
    });
  });

  describe('Syncing Reset After Simulated Kill', () => {
    it('resets ops stuck in syncing back to pending on startup', async () => {
      const op = await outbox.enqueue({
        uid: 'user_1',
        teamId: 't1',
        type: 'addExpense',
        payload: { id: 'exp_1', itemName: 'Lunch' },
      });

      await outbox.markSyncing(op.opId);
      const before = await outbox.getPendingOps('user_1');
      expect(before[0].status).toBe('syncing');

      // Simulate app restart / crash recovery
      const engine = new SyncEngine();
      await engine.init('user_1');

      const after = await outbox.getPendingOps('user_1');
      expect(after[0].status).toBe('pending');
    });
  });

  describe('Idempotency & Replay Protection', () => {
    it('applies once and skips on replay when marker exists', async () => {
      const markerStore = new Set<string>();
      let writeCount = 0;

      const fakeRunner: TransactionRunner = async (fn) => {
        const fakeTx: any = {
          get: async (ref: any) => ({
            exists: () => markerStore.has(ref.path || ref.id),
          }),
          set: (ref: any, data: any) => {
            if ((ref.path || ref.id).includes('syncOps')) {
              markerStore.add(ref.path || ref.id);
            } else {
              writeCount++;
            }
          },
          update: () => { writeCount++; },
          delete: () => { writeCount++; },
        };
        return fn(fakeTx);
      };

      const engine = new SyncEngine(fakeRunner);

      const op = await outbox.enqueue({
        uid: 'u1',
        teamId: 't1',
        type: 'addExpense',
        payload: { id: 'exp_idem', itemName: 'Tea', price: 100 },
        opId: 'op_unique_1',
      });

      // First run: executes writes and creates marker
      await engine.flush('u1');
      expect(writeCount).toBeGreaterThan(0);
      expect(markerStore.has('syncOps/op_unique_1')).toBe(true);

      // Simulate network acknowledgement failure: re-enqueue same opId
      await outbox.enqueue({
        uid: 'u1',
        teamId: 't1',
        type: 'addExpense',
        payload: { id: 'exp_idem', itemName: 'Tea', price: 100 },
        opId: 'op_unique_1',
      });

      const writesBeforeReplay = writeCount;
      await engine.flush('u1');

      // Write count did not increase because marker existed!
      expect(writeCount).toBe(writesBeforeReplay);
    });
  });

  describe('Per-Document Blocking & Unrelated Ops', () => {
    it('failed op blocks later ops on the same document, but does not block other documents', async () => {
      let failDocA = true;

      const fakeRunner: TransactionRunner = async (fn) => {
        const fakeTx: any = {
          get: async () => ({ exists: () => false }),
          set: (ref: any) => {
            if ((ref.path || ref.id).includes('expenses/doc_A') && failDocA) {
              throw new Error('doc_A failed');
            }
          },
          update: (ref: any) => {
            if ((ref.path || ref.id).includes('expenses/doc_A') && failDocA) {
              throw new Error('doc_A failed');
            }
          },
          delete: () => {},
        };
        return fn(fakeTx);
      };

      const engine = new SyncEngine(fakeRunner);

      // Op 1: touches doc_A (will fail)
      await outbox.enqueue({
        uid: 'u1',
        teamId: 't1',
        type: 'updateExpense',
        payload: { id: 'doc_A', itemName: 'Doc A v1' },
        entityId: 'doc_A',
      });

      // Op 2: also touches doc_A (should be blocked behind Op 1)
      await outbox.enqueue({
        uid: 'u1',
        teamId: 't1',
        type: 'updateExpense',
        payload: { id: 'doc_A', itemName: 'Doc A v2' },
        entityId: 'doc_A',
      });

      // Op 3: touches doc_B (should succeed independently!)
      await outbox.enqueue({
        uid: 'u1',
        teamId: 't1',
        type: 'addExpense',
        payload: { id: 'doc_B', itemName: 'Doc B' },
        entityId: 'doc_B',
      });

      await engine.flush('u1');

      const all = await outbox.getAllOps('u1');
      const op1 = all.find(o => o.payload.itemName === 'Doc A v1');
      const op2 = all.find(o => o.payload.itemName === 'Doc A v2');
      const op3 = all.find(o => o.payload.itemName === 'Doc B');

      expect(op1?.status).toBe('pending'); // failed with retry backoff
      expect(op1?.attempts).toBe(1);

      expect(op2?.status).toBe('pending');
      expect(op2?.attempts).toBe(0); // blocked, not attempted!

      expect(op3).toBeUndefined(); // doc_B was synced and marked done (deleted from outbox)
    });
  });

  describe('Outbox Overlay (applyOutbox)', () => {
    it('applies optimistic adds, updates, and deletes to expenses', () => {
      const serverExpenses: Expense[] = [
        {
          id: 'exp_1',
          userId: 'u1',
          userName: 'Alice',
          itemName: 'Groceries',
          quantity: '1',
          price: 1000,
          category: 'utility',
          date: new Date('2026-11-01'),
          teamId: 't1',
          isEdited: false,
          createdAt: new Date('2026-11-01'),
        },
      ];

      const outboxOps: any[] = [
        {
          opId: 'op_1',
          uid: 'u1',
          teamId: 't1',
          type: 'addExpense' as const,
          payload: {
            id: 'exp_pending',
            userId: 'u1',
            userName: 'Alice',
            itemName: 'Snacks',
            quantity: '1',
            price: 250,
            category: 'none',
            date: new Date('2026-11-02'),
            teamId: 't1',
            isEdited: false,
            createdAt: new Date('2026-11-02'),
          },
          status: 'pending' as const,
          attempts: 0,
          nextAttemptAt: 0,
          createdAt: Date.now(),
        },
        {
          opId: 'op_2',
          uid: 'u1',
          teamId: 't1',
          type: 'updateExpense' as const,
          payload: {
            id: 'exp_1',
            itemName: 'Groceries (Updated)',
            price: 1200,
          },
          status: 'pending' as const,
          attempts: 0,
          nextAttemptAt: 0,
          createdAt: Date.now(),
        },
      ];

      const overlay = applyExpenseOverlay(serverExpenses, outboxOps);

      expect(overlay).toHaveLength(2);
      expect(overlay[0].id).toBe('exp_pending');
      expect(overlay[0]._pending).toBe(true);

      const exp1 = overlay.find(e => e.id === 'exp_1');
      expect(exp1?.itemName).toBe('Groceries (Updated)');
      expect(exp1?.price).toBe(1200);
      expect(exp1?._pending).toBe(true);

      // Now add a delete operation
      outboxOps.push({
        opId: 'op_3',
        uid: 'u1',
        teamId: 't1',
        type: 'deleteExpense' as const,
        payload: { id: 'exp_1' },
        status: 'pending' as const,
        attempts: 0,
        nextAttemptAt: 0,
        createdAt: Date.now(),
      });

      const afterDelete = applyExpenseOverlay(serverExpenses, outboxOps);
      expect(afterDelete).toHaveLength(1);
      expect(afterDelete[0].id).toBe('exp_pending');
    });

    it('applies member financial adjustments (wallet, settlement, carry forward)', () => {
      const serverMembers: AppUser[] = [
        {
          id: 'u1',
          name: 'Munir',
          email: 'munir@test.com',
          phone: '',
          role: 'user',
          teamId: 't1',
          walletBalance: 0,
          monthlyWallets: { '2026-11': 1000 },
          monthlySettlements: { '2026-11': 0 },
          currency: 'PKR',
          createdAt: new Date(),
        },
      ];

      const outboxOps = [
        {
          opId: 'op_w',
          uid: 'u1',
          teamId: 't1',
          type: 'updateWallet' as const,
          payload: { userId: 'u1', monthKey: '2026-11', delta: 500 },
          status: 'pending' as const,
          attempts: 0,
          nextAttemptAt: 0,
          createdAt: Date.now(),
        },
        {
          opId: 'op_s',
          uid: 'u1',
          teamId: 't1',
          type: 'recordSettlement' as const,
          payload: { userId: 'u1', monthKey: '2026-11', delta: 2485 },
          status: 'pending' as const,
          attempts: 0,
          nextAttemptAt: 0,
          createdAt: Date.now(),
        },
        {
          opId: 'op_c',
          uid: 'u1',
          teamId: 't1',
          type: 'carryForward' as const,
          payload: { userId: 'u1', fromMonthKey: '2026-11', toMonthKey: '2026-12', amount: 300 },
          status: 'pending' as const,
          attempts: 0,
          nextAttemptAt: 0,
          createdAt: Date.now(),
        },
      ];

      const overlay = applyMemberOverlay(serverMembers, outboxOps);
      const m = overlay[0];

      expect(m.monthlyWallets?.['2026-11']).toBe(1500); // 1000 + 500
      expect(m.monthlySettlements?.['2026-11']).toBe(2485); // 0 + 2485
      expect(m.monthlyCarriedOut?.['2026-11']).toBe(300);
      expect(m.monthlyCarryIn?.['2026-12']).toBe(300);
    });
  });
});
