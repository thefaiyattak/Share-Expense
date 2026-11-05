import { describe, it, expect } from 'vitest';
import {
  computeMemberMonth,
  validateSettlement,
  toMonthKey,
  getMemberMonthDeposit,
  getMemberMonthSettled,
  getNextMonthKey,
  getPrevMonthKey,
} from './monthBalance';
import { AppUser } from '../models/types';

function createMockMember(partial: Partial<AppUser>): AppUser {
  return {
    id: 'user_1',
    name: 'Test Member',
    email: 'test@example.com',
    phone: '',
    role: 'user',
    teamId: 'team_1',
    walletBalance: 0,
    currency: 'PKR',
    createdAt: new Date(),
    ...partial,
  };
}

describe('monthBalance utility', () => {
  it('formats month keys correctly with toMonthKey', () => {
    expect(toMonthKey(new Date(2026, 9, 15))).toBe('2026-10');
    expect(toMonthKey('2026-10-01T00:00:00.000Z')).toBe('2026-10');
  });

  it('respects legacy 2026-08 deposit fallback when no monthlyWallets exist', () => {
    const legacyMember = createMockMember({ walletBalance: 3500 });
    expect(getMemberMonthDeposit(legacyMember, '2026-08')).toBe(3500);
    expect(getMemberMonthDeposit(legacyMember, '2026-09')).toBe(0);
  });

  it('reads monthlyWallets deposit when present', () => {
    const member = createMockMember({
      monthlyWallets: { '2026-10': 2500 },
    });
    expect(getMemberMonthDeposit(member, '2026-10')).toBe(2500);
    expect(getMemberMonthDeposit(member, '2026-11')).toBe(0);
  });

  describe('Acceptance Criteria from Step 5', () => {
    it('Oct 2026: Munir spent 5380, share 2895, deposit 0 -> pending +2,485', () => {
      const munir = createMockMember({
        id: 'munir',
        name: 'Munir',
        walletBalance: 0,
        monthlyWallets: { '2026-10': 0 },
      });
      const res = computeMemberMonth({
        member: munir,
        monthKey: '2026-10',
        spent: 5380,
        share: 2895,
      });

      expect(res.deposit).toBe(0);
      expect(res.spent).toBe(5380);
      expect(res.share).toBe(2895);
      expect(res.net).toBe(2485);
      expect(res.settled).toBe(0);
      expect(res.remaining).toBe(2485);
      expect(res.isReceiving).toBe(true);
      expect(res.isSettled).toBe(false);
    });

    it('Faisal spent 550, share 3035, deposit 2485 -> pending 0 (Settled)', () => {
      const faisal = createMockMember({
        id: 'faisal',
        name: 'Faisal',
        monthlyWallets: { '2026-10': 2485 },
      });
      const res = computeMemberMonth({
        member: faisal,
        monthKey: '2026-10',
        spent: 550,
        share: 3035,
      });

      expect(res.deposit).toBe(2485);
      expect(res.spent).toBe(550);
      expect(res.share).toBe(3035);
      expect(res.net).toBe(0);
      expect(res.settled).toBe(0);
      expect(res.remaining).toBe(0);
      expect(res.isSettled).toBe(true);
    });

    it('Record +2485 for Munir -> Settled, deposit still 0', () => {
      const munir = createMockMember({
        id: 'munir',
        name: 'Munir',
        monthlyWallets: { '2026-10': 0 },
        monthlySettlements: { '2026-10': 2485 },
      });
      const res = computeMemberMonth({
        member: munir,
        monthKey: '2026-10',
        spent: 5380,
        share: 2895,
      });

      expect(res.deposit).toBe(0);
      expect(res.net).toBe(2485);
      expect(res.settled).toBe(2485);
      expect(res.remaining).toBe(0);
      expect(res.isSettled).toBe(true);
    });

    it('Partial payments: +1000 then +1485 -> remaining +1485, then Settled', () => {
      const munirStep1 = createMockMember({
        id: 'munir',
        name: 'Munir',
        monthlySettlements: { '2026-10': 1000 },
      });
      const res1 = computeMemberMonth({
        member: munirStep1,
        monthKey: '2026-10',
        spent: 5380,
        share: 2895,
      });
      expect(res1.remaining).toBe(1485);
      expect(res1.isSettled).toBe(false);

      // Validate second step of +1485
      const err = validateSettlement({
        net: res1.net,
        settled: res1.settled,
        delta: 1485,
      });
      expect(err).toBeNull();

      const munirStep2 = createMockMember({
        id: 'munir',
        name: 'Munir',
        monthlySettlements: { '2026-10': 2485 },
      });
      const res2 = computeMemberMonth({
        member: munirStep2,
        monthKey: '2026-10',
        spent: 5380,
        share: 2895,
      });
      expect(res2.remaining).toBe(0);
      expect(res2.isSettled).toBe(true);
    });

    it('+3000 is rejected (max 2485)', () => {
      const err = validateSettlement({
        net: 2485,
        settled: 0,
        delta: 3000,
      });
      expect(err).toBe('Amount is more than what is pending (max 2485)');
    });

    it('-100 is rejected (wrong direction) for member who is owed', () => {
      const err = validateSettlement({
        net: 2485,
        settled: 0,
        delta: -100,
      });
      expect(err).toBe('This member is owed money - use + Paid to member');
    });

    it('A member who owes 550 with a Rs 0 wallet: -200 gives -350, then -350 gives Settled', () => {
      const debtor = createMockMember({
        id: 'debtor',
        name: 'Debtor',
        monthlyWallets: { '2026-10': 0 },
      });

      // Initially owes 550 (spent 0, share 550)
      const initial = computeMemberMonth({
        member: debtor,
        monthKey: '2026-10',
        spent: 0,
        share: 550,
      });
      expect(initial.net).toBe(-550);
      expect(initial.remaining).toBe(-550);

      // Pay in -200
      const err1 = validateSettlement({
        net: -550,
        settled: 0,
        delta: -200,
      });
      expect(err1).toBeNull();

      const step1Member = createMockMember({
        ...debtor,
        monthlySettlements: { '2026-10': -200 },
      });
      const step1 = computeMemberMonth({
        member: step1Member,
        monthKey: '2026-10',
        spent: 0,
        share: 550,
      });
      expect(step1.remaining).toBe(-350);
      expect(step1.isSettled).toBe(false);

      // Pay remaining -350
      const err2 = validateSettlement({
        net: -550,
        settled: -200,
        delta: -350,
      });
      expect(err2).toBeNull();

      const step2Member = createMockMember({
        ...debtor,
        monthlySettlements: { '2026-10': -550 },
      });
      const step2 = computeMemberMonth({
        member: step2Member,
        monthKey: '2026-10',
        spent: 0,
        share: 550,
      });
      expect(step2.remaining).toBe(0);
      expect(step2.isSettled).toBe(true);
    });

    it('A mistaken entry is reversed by entering the opposite sign', () => {
      // Munir had 2485 settled, but admin entered by mistake and wants to reverse 1000
      const err = validateSettlement({
        net: 2485,
        settled: 2485,
        delta: -1000,
      });
      expect(err).toBeNull();

      // Over-reversing below 0 is blocked
      const overReverseErr = validateSettlement({
        net: 2485,
        settled: 2485,
        delta: -3000,
      });
      expect(overReverseErr).toBe('Reversal amount cannot exceed what has been settled');
    });

    it('Rejects zero amount delta', () => {
      const err = validateSettlement({
        net: 2485,
        settled: 0,
        delta: 0,
      });
      expect(err).toBe('Please enter a valid non-zero amount');
    });

    it('Reports nothing pending when net and settled are both 0', () => {
      const err = validateSettlement({
        net: 0,
        settled: 0,
        delta: 100,
      });
      expect(err).toBe('Nothing is pending for this month');
    });
  });

  describe('Step 7: Carry to Next Month & Undo Carry', () => {
    it('computes next and previous month keys across year boundaries', () => {
      expect(getNextMonthKey('2026-10')).toBe('2026-11');
      expect(getNextMonthKey('2026-12')).toBe('2027-01');
      expect(getPrevMonthKey('2026-11')).toBe('2026-10');
      expect(getPrevMonthKey('2027-01')).toBe('2026-12');
    });

    it('carrying positive surplus (+2485) clears current month to Settled and credits next month', () => {
      // Month M (2026-10): Munir has remaining +2485
      const munirOctBefore = createMockMember({
        id: 'munir',
        monthlyWallets: { '2026-10': 0 },
      });
      const octBefore = computeMemberMonth({
        member: munirOctBefore,
        monthKey: '2026-10',
        spent: 5380,
        share: 2895,
      });
      expect(octBefore.remaining).toBe(2485);
      expect(octBefore.isSettled).toBe(false);

      // Carry +2485 to 2026-11: monthlyCarriedOut['2026-10'] = 2485, monthlyCarryIn['2026-11'] = 2485
      const munirOctAfter = createMockMember({
        ...munirOctBefore,
        monthlyCarriedOut: { '2026-10': 2485 },
        monthlyCarryIn: { '2026-11': 2485 },
      });

      const octAfter = computeMemberMonth({
        member: munirOctAfter,
        monthKey: '2026-10',
        spent: 5380,
        share: 2895,
      });
      // Cleared to Settled
      expect(octAfter.remaining).toBe(0);
      expect(octAfter.carriedOut).toBe(2485);
      expect(octAfter.isSettled).toBe(true);

      // Verify double carry is blocked because remaining is 0
      expect(octAfter.remaining !== 0).toBe(false);

      // Month M+1 (2026-11): has carry-in credit of +2485
      const novRes = computeMemberMonth({
        member: munirOctAfter,
        monthKey: '2026-11',
        spent: 0,
        share: 0,
      });
      expect(novRes.carryIn).toBe(2485);
      expect(novRes.net).toBe(2485);
      expect(novRes.remaining).toBe(2485);
      expect(novRes.isReceiving).toBe(true);
    });

    it('carrying negative deficit (-1500) clears current month to Settled and debits next month', () => {
      // Month M (2026-10): Member owes 1500
      const debtorOctBefore = createMockMember({
        monthlyWallets: { '2026-10': 0 },
      });
      const octBefore = computeMemberMonth({
        member: debtorOctBefore,
        monthKey: '2026-10',
        spent: 0,
        share: 1500,
      });
      expect(octBefore.remaining).toBe(-1500);

      // Carry -1500 to next month
      const debtorAfter = createMockMember({
        monthlyCarriedOut: { '2026-10': -1500 },
        monthlyCarryIn: { '2026-11': -1500 },
      });

      const octAfter = computeMemberMonth({
        member: debtorAfter,
        monthKey: '2026-10',
        spent: 0,
        share: 1500,
      });
      expect(octAfter.remaining).toBe(0);
      expect(octAfter.carriedOut).toBe(-1500);
      expect(octAfter.isSettled).toBe(true);

      // Month M+1 has carry-in deficit of -1500
      const novRes = computeMemberMonth({
        member: debtorAfter,
        monthKey: '2026-11',
        spent: 0,
        share: 0,
      });
      expect(novRes.carryIn).toBe(-1500);
      expect(novRes.net).toBe(-1500);
      expect(novRes.remaining).toBe(-1500);
      expect(novRes.isReceiving).toBe(false);
    });

    it('undo carry reverses carry-out and carry-in, restoring pending balance', () => {
      const memberCarried = createMockMember({
        monthlyCarriedOut: { '2026-10': 2485 },
        monthlyCarryIn: { '2026-11': 2485 },
      });

      // Undo carry: subtract 2485 from both
      const memberUndone = createMockMember({
        monthlyCarriedOut: { '2026-10': 0 },
        monthlyCarryIn: { '2026-11': 0 },
      });

      const octRestored = computeMemberMonth({
        member: memberUndone,
        monthKey: '2026-10',
        spent: 5380,
        share: 2895,
      });
      expect(octRestored.remaining).toBe(2485);
      expect(octRestored.carriedOut).toBe(0);
      expect(octRestored.isSettled).toBe(false);

      const novRestored = computeMemberMonth({
        member: memberUndone,
        monthKey: '2026-11',
        spent: 0,
        share: 0,
      });
      expect(novRestored.carryIn).toBe(0);
      expect(novRestored.remaining).toBe(0);
    });
  });
});
