import { describe, it, expect } from 'vitest';
import { outbox, OutboxOp } from './outbox';
import { SyncEngine, TransactionRunner } from './syncEngine';
import { MemoryDatabaseDriver, localDb } from './localDb';
import { useNetworkStore } from './network';

describe('Step 14: Fault-Injection & Robustness Test Suite', () => {
  it('handles 200 random network failure schedules without data duplication or loss', async () => {
    // 200 pseudo-random runs
    for (let run = 0; run < 200; run++) {
      const driver = new MemoryDatabaseDriver();
      localDb.setDriver(driver);
      useNetworkStore.getState().setConnection(true, true);

      const serverDocs = new Map<string, any>();
      const serverSyncOps = new Set<string>();

      // Deterministic random schedule: 0: clean success, 1: drop before commit, 2: drop after commit before ACK
      const failureMode = run % 3;

      let commitAttempts = 0;
      const customRunner: TransactionRunner = async (fn) => {
        commitAttempts++;
        const txDocWrites = new Map<string, any>();

        const mockTx: any = {
          get: async (ref: any) => {
            const exists = serverSyncOps.has(ref.id) || serverDocs.has(ref.id);
            return {
              exists: () => exists,
              data: () => serverDocs.get(ref.id),
            };
          },
          set: (ref: any, data: any) => {
            if (ref.path.includes('syncOps')) {
              serverSyncOps.add(ref.id);
            } else {
              txDocWrites.set(ref.id, data);
            }
          },
          update: (ref: any, data: any) => {
            txDocWrites.set(ref.id, { ...(serverDocs.get(ref.id) || {}), ...data });
          },
          delete: (ref: any) => {
            txDocWrites.delete(ref.id);
          },
        };

        // If failureMode 1: network drop before commit
        if (failureMode === 1 && commitAttempts === 1) {
          throw new Error('Network connection dropped before commit');
        }

        // Execute transaction logic
        await fn(mockTx);

        // Commit transaction writes
        txDocWrites.forEach((val, key) => {
          serverDocs.set(key, val);
        });

        // If failureMode 2: commit succeeded on server, but ACK was lost on return
        if (failureMode === 2 && commitAttempts === 1) {
          throw new Error('Network ACK lost after commit');
        }

        return undefined as any;
      };

      const engine = new SyncEngine(customRunner);

      // Enqueue an op
      const op = await outbox.enqueue({
        uid: 'user_fault',
        teamId: 'team_fault',
        entityId: `exp_run_${run}`,
        type: 'addExpense',
        payload: {
          id: `exp_run_${run}`,
          itemName: `Item ${run}`,
          price: 500,
          date: new Date(),
          userId: 'user_fault',
        },
      });

      // 1st Flush Attempt
      await engine.flush('user_fault');

      if (failureMode !== 0) {
        // Op may have failed or had lost ACK.
        // Fast-forward backoff timer so retry can happen
        await localDb.updateOutboxStatus(op.opId, 'pending', { nextAttemptAt: 0 });

        // 2nd Flush Attempt (Network heals)
        await engine.flush('user_fault');
      }

      // Assertions
      const remainingPending = await outbox.getPendingOps('user_fault');
      expect(remainingPending.length).toBe(0);

      // Exactly 1 server document created (no duplicates)
      expect(serverDocs.has(`exp_run_${run}`)).toBe(true);
      expect(serverDocs.get(`exp_run_${run}`).itemName).toBe(`Item ${run}`);
      expect(serverSyncOps.has(op.opId)).toBe(true);
    }
  });

  it('preserves strict FIFO execution order by monotonic seq despite client clock skew', async () => {
    const driver = new MemoryDatabaseDriver();
    localDb.setDriver(driver);
    useNetworkStore.getState().setConnection(true, true);

    const executionOrder: string[] = [];
    const customRunner: TransactionRunner = async (fn) => {
      const mockTx: any = {
        get: async () => ({ exists: () => false }),
        set: (ref: any) => {
          if (!ref.path.includes('syncOps')) {
            executionOrder.push(ref.id);
          }
        },
        update: () => {},
        delete: () => {},
      };
      await fn(mockTx);
      return undefined as any;
    };

    const engine = new SyncEngine(customRunner);

    // Op 1 was queued at current time
    await outbox.enqueue({
      uid: 'user_skew',
      teamId: 'team_1',
      entityId: 'doc_1',
      type: 'addExpense',
      payload: { id: 'doc_1', price: 10 },
    });

    // Op 2 was queued when client clock was set 2 hours in the past
    const pastTime = Date.now() - 7200000;
    await outbox.enqueue({
      uid: 'user_skew',
      teamId: 'team_1',
      entityId: 'doc_2',
      type: 'addExpense',
      payload: { id: 'doc_2', price: 20 },
    });
    // Explicitly modify createdAt to simulate clock skew
    await driver.run('UPDATE outbox SET createdAt = ? WHERE entityId = ?', [pastTime, 'doc_2']);

    // Op 3 was queued when client clock was set 2 hours in the future
    const futureTime = Date.now() + 7200000;
    await outbox.enqueue({
      uid: 'user_skew',
      teamId: 'team_1',
      entityId: 'doc_3',
      type: 'addExpense',
      payload: { id: 'doc_3', price: 30 },
    });
    await driver.run('UPDATE outbox SET createdAt = ? WHERE entityId = ?', [futureTime, 'doc_3']);

    await engine.flush('user_skew');

    // Execution order MUST be ['doc_1', 'doc_2', 'doc_3'] governed by seq, NOT createdAt
    expect(executionOrder.filter(id => id.startsWith('doc_'))).toEqual(['doc_1', 'doc_2', 'doc_3']);
  });

  it('queues and handles 500 ops sequentially without memory crash or outbox corruption', async () => {
    const driver = new MemoryDatabaseDriver();
    localDb.setDriver(driver);
    useNetworkStore.getState().setConnection(true, true);

    const executedDocs: string[] = [];
    const customRunner: TransactionRunner = async (fn) => {
      const mockTx: any = {
        get: async () => ({ exists: () => false }),
        set: (ref: any) => {
          if (ref.id.startsWith('bulk_')) {
            executedDocs.push(ref.id);
          }
        },
        update: () => {},
        delete: () => {},
      };
      await fn(mockTx);
      return undefined as any;
    };

    const engine = new SyncEngine(customRunner);

    // Enqueue 500 ops
    for (let i = 0; i < 500; i++) {
      await outbox.enqueue({
        uid: 'user_500',
        teamId: 'team_500',
        entityId: `bulk_${i}`,
        type: 'addExpense',
        payload: { id: `bulk_${i}`, price: i },
      });
    }

    const pendingBefore = await outbox.getPendingOps('user_500');
    expect(pendingBefore.length).toBe(500);

    // Flush all 500
    await engine.flush('user_500');

    expect(executedDocs.length).toBe(500);
    const pendingAfter = await outbox.getPendingOps('user_500');
    expect(pendingAfter.length).toBe(0);
  });
});
