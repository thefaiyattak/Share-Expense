import { AppUser, Expense, Attendance, PersonalLoan } from '../models/types';
import { OutboxOp } from './outbox';

export interface PendingFlag {
  _pending?: boolean;
}

export type DisplayExpense = Expense & PendingFlag;
export type DisplayLoan = PersonalLoan & PendingFlag;

/**
 * Applies pending outbox operations over the server expenses snapshot.
 */
export function applyExpenseOverlay(
  serverExpenses: Expense[],
  outboxOps: OutboxOp[]
): DisplayExpense[] {
  let result: DisplayExpense[] = serverExpenses.map(e => ({ ...e }));

  for (const op of outboxOps) {
    if (op.status === 'failed') continue;

    switch (op.type) {
      case 'addExpense': {
        const item: Expense = op.payload;
        // Avoid duplicates if already in server list
        if (!result.some(e => e.id === item.id)) {
          result.unshift({ ...item, _pending: true });
        }
        break;
      }

      case 'addExpenses': {
        const items: Expense[] = Array.isArray(op.payload) ? op.payload : op.payload.expenses || [];
        items.forEach(item => {
          if (!result.some(e => e.id === item.id)) {
            result.unshift({ ...item, _pending: true });
          }
        });
        break;
      }

      case 'updateExpense': {
        const updateData = op.payload;
        const id = updateData.id;
        const idx = result.findIndex(e => e.id === id);
        if (idx !== -1) {
          result[idx] = {
            ...result[idx],
            ...updateData,
            _pending: true,
          };
        }
        break;
      }

      case 'deleteExpense': {
        const id = typeof op.payload === 'string' ? op.payload : op.payload.id;
        result = result.filter(e => e.id !== id);
        break;
      }
    }
  }

  // Sort by date descending
  return result.sort((a, b) => {
    const da = a.date ? (a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime()) : 0;
    const db = b.date ? (b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime()) : 0;
    return db - da;
  });
}

/**
 * Applies pending outbox operations over the server members snapshot
 * (wallet adjustments, settlement payments, carry-forward, role updates).
 */
export function applyMemberOverlay(
  serverMembers: AppUser[],
  outboxOps: OutboxOp[]
): AppUser[] {
  const result: AppUser[] = serverMembers.map(m => ({
    ...m,
    monthlyWallets: { ...(m.monthlyWallets || {}) },
    monthlySettlements: { ...(m.monthlySettlements || {}) },
    monthlyCarryIn: { ...(m.monthlyCarryIn || {}) },
    monthlyCarriedOut: { ...(m.monthlyCarriedOut || {}) },
  }));

  for (const op of outboxOps) {
    if (op.status === 'failed') continue;

    switch (op.type) {
      case 'updateWallet': {
        const { userId, monthKey, delta } = op.payload;
        const member = result.find(m => m.id === userId);
        if (member && monthKey) {
          member.monthlyWallets = member.monthlyWallets || {};
          const current = member.monthlyWallets[monthKey] || 0;
          member.monthlyWallets[monthKey] = Math.max(0, current + delta);
        }
        break;
      }

      case 'recordSettlement': {
        const { userId, monthKey, delta } = op.payload;
        const member = result.find(m => m.id === userId);
        if (member && monthKey) {
          member.monthlySettlements = member.monthlySettlements || {};
          member.monthlySettlements[monthKey] = (member.monthlySettlements[monthKey] || 0) + delta;
        }
        break;
      }

      case 'carryForward': {
        const { userId, fromMonthKey, toMonthKey, amount } = op.payload;
        const member = result.find(m => m.id === userId);
        if (member) {
          member.monthlyCarriedOut = member.monthlyCarriedOut || {};
          member.monthlyCarryIn = member.monthlyCarryIn || {};
          member.monthlyCarriedOut[fromMonthKey] = (member.monthlyCarriedOut[fromMonthKey] || 0) + amount;
          member.monthlyCarryIn[toMonthKey] = (member.monthlyCarryIn[toMonthKey] || 0) + amount;
        }
        break;
      }

      case 'undoCarry': {
        const { userId, fromMonthKey, toMonthKey, amount } = op.payload;
        const member = result.find(m => m.id === userId);
        if (member) {
          member.monthlyCarriedOut = member.monthlyCarriedOut || {};
          member.monthlyCarryIn = member.monthlyCarryIn || {};
          member.monthlyCarriedOut[fromMonthKey] = (member.monthlyCarriedOut[fromMonthKey] || 0) - amount;
          member.monthlyCarryIn[toMonthKey] = (member.monthlyCarryIn[toMonthKey] || 0) - amount;
        }
        break;
      }

      case 'updateProfile': {
        const { userId, updates } = op.payload;
        const member = result.find(m => m.id === userId);
        if (member && updates) {
          Object.assign(member, updates);
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Applies pending outbox operations over the server attendance snapshot.
 */
export function applyAttendanceOverlay(
  serverAttendance: Attendance[],
  outboxOps: OutboxOp[]
): Attendance[] {
  const result = serverAttendance.map(a => ({ ...a }));

  for (const op of outboxOps) {
    if (op.status === 'failed') continue;

    if (op.type === 'setAttendance') {
      const item: Attendance = op.payload;
      const idx = result.findIndex(
        a => a.userId === item.userId && a.date.toISOString().slice(0, 10) === (item.date instanceof Date ? item.date.toISOString().slice(0, 10) : String(item.date).slice(0, 10))
      );
      if (idx !== -1) {
        result[idx] = { ...result[idx], ...item };
      } else {
        result.push({ ...item });
      }
    } else if (op.type === 'markAttendance') {
      const { userId, date, isPresent, meals, teamId } = op.payload;
      const dateObj = date instanceof Date ? date : new Date(date);
      const dateStr = dateObj.toISOString().slice(0, 10);
      const idx = result.findIndex(
        a => a.userId === userId && a.date.toISOString().slice(0, 10) === dateStr
      );
      const item: Attendance = {
        id: `${userId}_${dateStr}`,
        userId,
        teamId: teamId || '',
        date: dateObj,
        isPresent,
        attendedBreakfast: Array.isArray(meals) && meals.includes('breakfast'),
        attendedLunch: Array.isArray(meals) && meals.includes('lunch'),
        attendedDinner: Array.isArray(meals) && meals.includes('dinner'),
      };
      if (idx !== -1) {
        result[idx] = { ...result[idx], ...item };
      } else {
        result.push(item);
      }
    }
  }

  return result;
}

/**
 * Applies pending outbox operations over the server loans snapshot.
 */
export function applyLoanOverlay(
  serverLoans: PersonalLoan[],
  outboxOps: OutboxOp[]
): DisplayLoan[] {
  let result: DisplayLoan[] = serverLoans.map(l => ({ ...l }));

  for (const op of outboxOps) {
    if (op.status === 'failed') continue;

    switch (op.type) {
      case 'addLoan': {
        const item: PersonalLoan = op.payload;
        if (!result.some(l => l.id === item.id)) {
          result.unshift({ ...item, _pending: true });
        }
        break;
      }

      case 'settleLoan': {
        const id = typeof op.payload === 'string' ? op.payload : (op.payload.loanId || op.payload.id);
        const status = (typeof op.payload === 'object' && op.payload.status) ? op.payload.status : 'SETTLED';
        const idx = result.findIndex(l => l.id === id);
        if (idx !== -1) {
          result[idx] = {
            ...result[idx],
            status,
            _pending: true,
          };
        }
        break;
      }

      case 'deleteLoan': {
        const id = typeof op.payload === 'string' ? op.payload : (op.payload.loanId || op.payload.id);
        result = result.filter(l => l.id !== id);
        break;
      }

      case 'updateLoan': {
        const updateData = op.payload;
        const id = updateData.id;
        const idx = result.findIndex(l => l.id === id);
        if (idx !== -1) {
          result[idx] = {
            ...result[idx],
            ...updateData,
            _pending: true,
          };
        }
        break;
      }
    }
  }

  return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
