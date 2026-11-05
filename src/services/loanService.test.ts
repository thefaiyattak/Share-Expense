import { describe, it, expect } from 'vitest';
import { loanService } from './loanService';
import { PersonalLoan } from '../models/types';

describe('loanService.getUserLoanSummary', () => {
  it('correctly calculates 0 toCollect and 0 toPay when counterparty loans are fully repaid (User Request #1 fix)', () => {
    const currentUserId = 'user_usman';
    const otherUserId = 'user_munir';

    // Munir and Usman have active loans: Usman borrowed 8,760 and Usman gave 8,760 back
    const loans: PersonalLoan[] = [
      {
        id: 'l1',
        teamId: 't1',
        lenderId: currentUserId,
        lenderName: 'Usman',
        borrowerId: otherUserId,
        borrowerName: 'Munir Khan',
        amount: 1760,
        date: '2026-11-03',
        createdAt: '2026-11-03T00:00:00.000Z',
        status: 'PENDING',
      },
      {
        id: 'l2',
        teamId: 't1',
        lenderId: currentUserId,
        lenderName: 'Usman',
        borrowerId: otherUserId,
        borrowerName: 'Munir Khan',
        amount: 7000,
        date: '2026-11-03',
        createdAt: '2026-11-03T00:00:00.000Z',
        status: 'PENDING',
      },
      {
        id: 'l3',
        teamId: 't1',
        lenderId: otherUserId,
        lenderName: 'Munir Khan',
        borrowerId: currentUserId,
        borrowerName: 'Usman',
        amount: 360,
        date: '2026-10-26',
        createdAt: '2026-10-26T00:00:00.000Z',
        status: 'PENDING',
      },
      {
        id: 'l4',
        teamId: 't1',
        lenderId: otherUserId,
        lenderName: 'Munir Khan',
        borrowerId: currentUserId,
        borrowerName: 'Usman',
        amount: 8400,
        date: '2026-10-26',
        createdAt: '2026-10-26T00:00:00.000Z',
        status: 'PENDING',
      },
    ];

    // Total given = 8,760, total borrowed = 8,760. Net with Munir is 0.
    const summary = loanService.getUserLoanSummary(currentUserId, loans);

    expect(summary.toCollect).toBe(0);
    expect(summary.toPay).toBe(0);
    expect(summary.netBalance).toBe(0);
  });

  it('correctly nets per counterparty across multiple members', () => {
    const currentUserId = 'user_me';
    const alice = 'user_alice';
    const bob = 'user_bob';

    const loans: PersonalLoan[] = [
      // Alice: lent 5000, borrowed 2000 -> Alice owes me 3000
      {
        id: 'l1',
        teamId: 't1',
        lenderId: currentUserId,
        lenderName: 'Me',
        borrowerId: alice,
        borrowerName: 'Alice',
        amount: 5000,
        date: '2026-11-01',
        createdAt: '2026-11-01T00:00:00.000Z',
        status: 'PENDING',
      },
      {
        id: 'l2',
        teamId: 't1',
        lenderId: alice,
        lenderName: 'Alice',
        borrowerId: currentUserId,
        borrowerName: 'Me',
        amount: 2000,
        date: '2026-11-02',
        createdAt: '2026-11-02T00:00:00.000Z',
        status: 'PENDING',
      },
      // Bob: lent 1000, borrowed 4000 -> I owe Bob 3000
      {
        id: 'l3',
        teamId: 't1',
        lenderId: currentUserId,
        lenderName: 'Me',
        borrowerId: bob,
        borrowerName: 'Bob',
        amount: 1000,
        date: '2026-11-01',
        createdAt: '2026-11-01T00:00:00.000Z',
        status: 'PENDING',
      },
      {
        id: 'l4',
        teamId: 't1',
        lenderId: bob,
        lenderName: 'Bob',
        borrowerId: currentUserId,
        borrowerName: 'Me',
        amount: 4000,
        date: '2026-11-02',
        createdAt: '2026-11-02T00:00:00.000Z',
        status: 'PENDING',
      },
    ];

    const summary = loanService.getUserLoanSummary(currentUserId, loans);
    expect(summary.toCollect).toBe(3000);
    expect(summary.toPay).toBe(3000);
    expect(summary.netBalance).toBe(0);
  });

  it('ignores loans marked SETTLED', () => {
    const currentUserId = 'user_me';
    const charlie = 'user_charlie';

    const loans: PersonalLoan[] = [
      {
        id: 'l1',
        teamId: 't1',
        lenderId: currentUserId,
        lenderName: 'Me',
        borrowerId: charlie,
        borrowerName: 'Charlie',
        amount: 10000,
        date: '2026-11-01',
        createdAt: '2026-11-01T00:00:00.000Z',
        status: 'SETTLED',
      },
    ];

    const summary = loanService.getUserLoanSummary(currentUserId, loans);
    expect(summary.toCollect).toBe(0);
    expect(summary.toPay).toBe(0);
    expect(summary.netBalance).toBe(0);
  });
});
