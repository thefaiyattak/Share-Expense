import { describe, it, expect, vi } from 'vitest';
import { settleDebts, settlementService } from './settlementService';
import { AppUser } from '../models/types';

describe('settleDebts', () => {
  it('balances perfectly when sum(creditors) === sum(debtors)', () => {
    const creditors = [{ id: 'u1', name: 'Alice', balance: 100 }];
    const debtors = [
      { id: 'u2', name: 'Bob', balance: 60 },
      { id: 'u3', name: 'Charlie', balance: 40 },
    ];

    const plan = settleDebts(creditors, debtors);
    expect(plan).toHaveLength(2);
    expect(plan).toEqual([
      { fromId: 'u2', fromName: 'Bob', toId: 'u1', toName: 'Alice', amount: 60 },
      { fromId: 'u3', fromName: 'Charlie', toId: 'u1', toName: 'Alice', amount: 40 },
    ]);
  });

  it('asserts and auto-balances 1 rupee discrepancy without throwing or leaking', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Creditors expect 100, debtors only owe 99
    const creditors = [{ id: 'u1', name: 'Alice', balance: 100 }];
    const debtors = [{ id: 'u2', name: 'Bob', balance: 99 }];

    const plan = settleDebts(creditors, debtors);

    expect(spy).toHaveBeenCalled();
    // Alice's balance was adjusted down from 100 to 99 to balance with Bob
    expect(plan).toEqual([
      { fromId: 'u2', fromName: 'Bob', toId: 'u1', toName: 'Alice', amount: 99 },
    ]);

    spy.mockRestore();
  });

  it('returns empty when no creditors or no debtors', () => {
    expect(settleDebts([], [{ id: 'u1', name: 'Bob', balance: 50 }])).toEqual([]);
    expect(settleDebts([{ id: 'u1', name: 'Alice', balance: 50 }], [])).toEqual([]);
  });

  it('clears to 0 when multiple debtors and creditors match', () => {
    const creditors = [
      { id: 'c1', name: 'C1', balance: 70 },
      { id: 'c2', name: 'C2', balance: 30 },
    ];
    const debtors = [
      { id: 'd1', name: 'D1', balance: 50 },
      { id: 'd2', name: 'D2', balance: 50 },
    ];

    const plan = settleDebts(creditors, debtors);
    const totalPaid = plan.reduce((s, p) => s + p.amount, 0);
    expect(totalPaid).toBe(100);
  });
});

describe('settlementService exact rounding integration', () => {
  it('ensures total shares match total spent even for odd splits (e.g. 100 split 3 ways)', () => {
    const members: AppUser[] = [
      { id: 'u1', name: 'Alice', email: 'a@test.com', phone: '', role: 'user', walletBalance: 0, teamId: 't1', currency: 'PKR', createdAt: new Date() },
      { id: 'u2', name: 'Bob', email: 'b@test.com', phone: '', role: 'user', walletBalance: 0, teamId: 't1', currency: 'PKR', createdAt: new Date() },
      { id: 'u3', name: 'Charlie', email: 'c@test.com', phone: '', role: 'user', walletBalance: 0, teamId: 't1', currency: 'PKR', createdAt: new Date() },
    ];

    // Alice paid 100 out of pocket. Total spent = 100.
    const memberSpentMap = { u1: 100, u2: 0, u3: 0 };
    // Raw unrounded equal shares: 33.333333333333336 each
    const shares = { u1: 100 / 3, u2: 100 / 3, u3: 100 / 3 };

    const summary = settlementService.calculateSettlement({
      members,
      memberSpentMap,
      shares,
      monthKey: '2026-11',
    });

    // Sum of calculated shares across all members must exactly equal 100
    const sumCalculatedShares = summary.poolRefunds.reduce((acc, r) => acc + r.calculatedShare, 0);
    expect(sumCalculatedShares).toBe(100);

    // Sum of transactions must clear Alice's credit (100 - 34 = 66)
    const totalTransactions = summary.peerToPeerTransactions.reduce((acc, t) => acc + t.amount, 0);
    expect(totalTransactions).toBe(66);
    expect(summary.peerToPeerTransactions).toEqual([
      { fromId: 'u2', fromName: 'Bob', toId: 'u1', toName: 'Alice', amount: 33 },
      { fromId: 'u3', fromName: 'Charlie', toId: 'u1', toName: 'Alice', amount: 33 },
    ]);
  });
});
