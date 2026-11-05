import { AppUser } from '../models/types';

/**
 * Returns formatted month key YYYY-MM
 */
export function toMonthKey(date: Date | string): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Returns next month key YYYY-MM
 */
export function getNextMonthKey(monthKey: string): string {
  const parts = monthKey.split('-');
  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month)) return '';
  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Returns previous month key YYYY-MM
 */
export function getPrevMonthKey(monthKey: string): string {
  const parts = monthKey.split('-');
  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month)) return '';
  month -= 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Gets a member's wallet deposit for a given month, with legacy 2026-08 fallback.
 */
export function getMemberMonthDeposit(member: AppUser | undefined | null, monthKey: string): number {
  if (!member) return 0;
  if (member.monthlyWallets && member.monthlyWallets[monthKey] !== undefined) {
    return member.monthlyWallets[monthKey];
  }
  // Legacy 2026-08 fallback before monthlyWallets existed (retired in Step 8)
  if (monthKey === '2026-08' && (!member.monthlyWallets || Object.keys(member.monthlyWallets).length === 0)) {
    return member.walletBalance || 0;
  }
  return 0;
}

/**
 * Gets a member's total settled amount for a given month.
 * Signed: +N paid out to member (who was owed), -N paid in by member (who owed).
 */
export function getMemberMonthSettled(member: AppUser | undefined | null, monthKey: string): number {
  if (!member || !member.monthlySettlements) return 0;
  return member.monthlySettlements[monthKey] || 0;
}

/**
 * Gets a member's carry-in balance brought forward into a given month.
 * Signed: +N credit carried from prior month, -N deficit carried from prior month.
 */
export function getMemberMonthCarryIn(member: AppUser | undefined | null, monthKey: string): number {
  if (!member || !member.monthlyCarryIn) return 0;
  return member.monthlyCarryIn[monthKey] || 0;
}

/**
 * Gets a member's balance carried out of a given month into the next month.
 * Signed: +N credit moved forward, -N deficit moved forward.
 */
export function getMemberMonthCarriedOut(member: AppUser | undefined | null, monthKey: string): number {
  if (!member || !member.monthlyCarriedOut) return 0;
  return member.monthlyCarriedOut[monthKey] || 0;
}

export interface MemberMonthParams {
  member: AppUser;
  monthKey: string;
  spent: number;
  share: number;
}

export interface MemberMonthResult {
  deposit: number;
  spent: number;
  share: number;
  carryIn: number;
  carriedOut: number;
  net: number;
  settled: number;
  remaining: number;
  isReceiving: boolean;
  isSettled: boolean;
}

/**
 * Computes month financial summary for a member:
 * net = round((deposit + carryIn + spent) - share)
 * remaining = net - settled - carriedOut
 * isSettled = remaining === 0 and the month had activity
 */
export function computeMemberMonth({
  member,
  monthKey,
  spent,
  share,
}: MemberMonthParams): MemberMonthResult {
  const deposit = getMemberMonthDeposit(member, monthKey);
  const settled = getMemberMonthSettled(member, monthKey);
  const carryIn = getMemberMonthCarryIn(member, monthKey);
  const carriedOut = getMemberMonthCarriedOut(member, monthKey);

  const net = Math.round((deposit + carryIn + spent) - share);
  const remaining = net - settled - carriedOut;
  const hasActivity = deposit !== 0 || spent !== 0 || share !== 0 || settled !== 0 || carryIn !== 0 || carriedOut !== 0;
  const isSettled = remaining === 0 && hasActivity;
  const isReceiving = remaining > 0;

  return {
    deposit,
    spent: Math.round(spent),
    share: Math.round(share),
    carryIn,
    carriedOut,
    net,
    settled,
    remaining,
    isReceiving,
    isSettled,
  };
}

export interface ValidateSettlementParams {
  net: number;
  settled: number;
  delta: number;
}

/**
 * Validates a settlement payment delta against current net and settled amounts.
 * delta is signed (+ paid to member, - paid by member).
 * New settled total must stay between 0 and net with the same sign as net.
 */
export function validateSettlement({
  net,
  settled,
  delta,
}: ValidateSettlementParams): string | null {
  if (delta === 0) {
    return 'Please enter a valid non-zero amount';
  }

  const remaining = net - settled;

  if (net === 0 && settled === 0) {
    return 'Nothing is pending for this month';
  }

  if (remaining === 0) {
    if ((net > 0 && delta > 0) || (net < 0 && delta < 0)) {
      return 'Already settled for this month';
    }
  }

  if (net > 0) {
    if (delta < 0 && settled <= 0) {
      return 'This member is owed money - use + Paid to member';
    }
  } else if (net < 0) {
    if (delta > 0 && settled >= 0) {
      return 'This member owes money - use - Paid by member';
    }
  }

  const nextSettled = settled + delta;

  if (net > 0) {
    if (nextSettled < 0) {
      return 'Reversal amount cannot exceed what has been settled';
    }
    if (nextSettled > net) {
      return `Amount is more than what is pending (max ${net - settled})`;
    }
  } else if (net < 0) {
    if (nextSettled > 0) {
      return 'Reversal amount cannot exceed what has been settled';
    }
    if (nextSettled < net) {
      return `Amount is more than what is pending (max ${Math.abs(net - settled)})`;
    }
  }

  return null;
}
