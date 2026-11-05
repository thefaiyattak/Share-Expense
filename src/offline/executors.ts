import {
  doc,
  collection,
  serverTimestamp,
  increment,
  Timestamp,
  Transaction,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { OutboxOp } from './outbox';

/**
 * Generates an offline-safe Firestore document ID using the SDK's client-side generator.
 */
export function generateDocId(collectionPath: string): string {
  try {
    return doc(collection(db, collectionPath)).id;
  } catch (e) {
    const rand = Math.random().toString(36).slice(2, 12);
    return `local_${Date.now()}_${rand}`;
  }
}

/**
 * Strips undefined properties so Firestore writes succeed.
 */
function cleanPayload<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      if (v instanceof Date) {
        result[k] = Timestamp.fromDate(v);
      } else {
        result[k] = v;
      }
    }
  }
  return result;
}

export type ExecutorFn = (tx: Transaction, op: OutboxOp) => Promise<void>;

export const executors: Record<string, ExecutorFn> = {
  addExpense: async (tx, op) => {
    const expense = op.payload;
    const docRef = doc(db, 'expenses', expense.id);
    const cleaned = cleanPayload(expense);
    cleaned.syncedAt = serverTimestamp();
    tx.set(docRef, cleaned);

    // Audit Log entry in same transaction
    const historyRef = doc(collection(db, 'editHistory'));
    tx.set(historyRef, {
      teamId: op.teamId,
      entityId: expense.id,
      entityType: 'expense',
      action: 'created',
      itemName: expense.itemName || 'Expense',
      userId: op.uid,
      userName: expense.userName || 'User',
      newData: { price: expense.price, quantity: expense.quantity, category: expense.category },
      timestamp: serverTimestamp(),
    });

    // In-app Notification doc in same transaction
    const notifRef = doc(collection(db, 'notifications'));
    tx.set(notifRef, {
      teamId: op.teamId,
      title: 'New Expense Added',
      description: `${expense.userName || 'Someone'} added "${expense.itemName}"`,
      type: 'expense_added',
      createdAt: serverTimestamp(),
      readBy: [op.uid],
    });
  },

  addExpenses: async (tx, op) => {
    const items: any[] = Array.isArray(op.payload) ? op.payload : op.payload.expenses || [];
    for (const expense of items) {
      const docRef = doc(db, 'expenses', expense.id);
      const cleaned = cleanPayload(expense);
      cleaned.syncedAt = serverTimestamp();
      tx.set(docRef, cleaned);

      const historyRef = doc(collection(db, 'editHistory'));
      tx.set(historyRef, {
        teamId: op.teamId,
        entityId: expense.id,
        entityType: 'expense',
        action: 'created',
        itemName: expense.itemName || 'Expense',
        userId: op.uid,
        userName: expense.userName || 'User',
        newData: { price: expense.price, quantity: expense.quantity, category: expense.category },
        timestamp: serverTimestamp(),
      });
    }

    if (items.length > 0) {
      const notifRef = doc(collection(db, 'notifications'));
      tx.set(notifRef, {
        teamId: op.teamId,
        title: 'Batch Expenses Added',
        description: `Added ${items.length} new items`,
        type: 'expense_added',
        createdAt: serverTimestamp(),
        readBy: [op.uid],
      });
    }
  },

  updateExpense: async (tx, op) => {
    const updateData = op.payload;
    const docRef = doc(db, 'expenses', updateData.id);
    const cleaned = cleanPayload(updateData);
    cleaned.syncedAt = serverTimestamp();
    tx.update(docRef, cleaned);

    const historyRef = doc(collection(db, 'editHistory'));
    tx.set(historyRef, {
      teamId: op.teamId,
      entityId: updateData.id,
      entityType: 'expense',
      action: 'updated',
      itemName: updateData.itemName || 'Expense',
      userId: op.uid,
      userName: updateData.userName || 'User',
      newData: cleaned,
      timestamp: serverTimestamp(),
    });
  },

  deleteExpense: async (tx, op) => {
    const id = typeof op.payload === 'string' ? op.payload : op.payload.id;
    const docRef = doc(db, 'expenses', id);
    tx.delete(docRef);

    const historyRef = doc(collection(db, 'editHistory'));
    tx.set(historyRef, {
      teamId: op.teamId,
      entityId: id,
      entityType: 'expense',
      action: 'deleted',
      itemName: op.payload?.itemName || 'Expense',
      userId: op.uid,
      userName: op.payload?.userName || 'User',
      previousData: op.payload?.previousData || {},
      timestamp: serverTimestamp(),
    });
  },

  setAttendance: async (tx, op) => {
    const attendance = op.payload;
    const docRef = doc(db, 'attendance', attendance.id);
    const cleaned = cleanPayload(attendance);
    cleaned.syncedAt = serverTimestamp();
    tx.set(docRef, cleaned, { merge: true });
  },

  markAttendance: async (tx, op) => {
    const { userId, date, isPresent, meals, teamId, userName, prevMeals } = op.payload;
    const dateObj = date instanceof Date ? date : new Date(date);
    const dateStr = dateObj.toISOString().substring(0, 10);
    const docId = op.entityId || `${userId}_${dateStr}`;
    const docRef = doc(db, 'attendance', docId);

    const attendanceData = {
      userId,
      date: Timestamp.fromDate(dateObj),
      isPresent,
      attendedBreakfast: Array.isArray(meals) && meals.includes('breakfast'),
      attendedLunch: Array.isArray(meals) && meals.includes('lunch'),
      attendedDinner: Array.isArray(meals) && meals.includes('dinner'),
      teamId: teamId || op.teamId,
      syncedAt: serverTimestamp(),
    };
    tx.set(docRef, attendanceData, { merge: true });

    if (userName) {
      const historyRef = doc(collection(db, 'editHistory'));
      tx.set(historyRef, {
        entityId: docId,
        entityType: 'attendance',
        userId,
        userName,
        previousData: {
          meals: prevMeals || [],
          isPresent: (prevMeals || []).length > 0,
        },
        newData: {
          meals,
          isPresent,
        },
        timestamp: serverTimestamp(),
      });
    }
  },

  updateWallet: async (tx, op) => {
    const { userId, monthKey, delta } = op.payload;
    const userRef = doc(db, 'users', userId);
    tx.update(userRef, {
      [`monthlyWallets.${monthKey}`]: increment(delta),
    });
  },

  recordSettlement: async (tx, op) => {
    const { userId, monthKey, delta, reason } = op.payload;
    const userRef = doc(db, 'users', userId);
    tx.update(userRef, {
      [`monthlySettlements.${monthKey}`]: increment(delta),
    });

    const historyRef = doc(collection(db, 'editHistory'));
    tx.set(historyRef, {
      teamId: op.teamId,
      entityId: userId,
      entityType: 'settlement_payment',
      action: 'updated',
      itemName: `Settlement Payment (${delta > 0 ? '+' : ''}${delta})`,
      userId: op.uid,
      userName: op.payload.userName || 'Admin',
      newData: { delta, monthKey, reason },
      timestamp: serverTimestamp(),
    });
  },

  carryForward: async (tx, op) => {
    const { userId, fromMonthKey, toMonthKey, amount } = op.payload;
    const userRef = doc(db, 'users', userId);
    // Both ledgers updated in one atomic transaction!
    tx.update(userRef, {
      [`monthlyCarriedOut.${fromMonthKey}`]: increment(amount),
      [`monthlyCarryIn.${toMonthKey}`]: increment(amount),
    });

    const historyRef = doc(collection(db, 'editHistory'));
    tx.set(historyRef, {
      teamId: op.teamId,
      entityId: userId,
      entityType: 'month_end_transfer',
      action: 'updated',
      itemName: `Balance Carried from ${fromMonthKey} to ${toMonthKey}`,
      userId: op.uid,
      userName: op.payload.userName || 'Admin',
      newData: { fromMonth: fromMonthKey, toMonth: toMonthKey, carriedAmount: amount },
      timestamp: serverTimestamp(),
    });
  },

  undoCarry: async (tx, op) => {
    const { userId, fromMonthKey, toMonthKey, amount } = op.payload;
    const userRef = doc(db, 'users', userId);
    tx.update(userRef, {
      [`monthlyCarriedOut.${fromMonthKey}`]: increment(-amount),
      [`monthlyCarryIn.${toMonthKey}`]: increment(-amount),
    });

    const historyRef = doc(collection(db, 'editHistory'));
    tx.set(historyRef, {
      teamId: op.teamId,
      entityId: userId,
      entityType: 'month_end_transfer',
      action: 'updated',
      itemName: `Undo Carry Over (${fromMonthKey} to ${toMonthKey})`,
      userId: op.uid,
      userName: op.payload.userName || 'Admin',
      newData: { fromMonth: fromMonthKey, toMonth: toMonthKey, undoneAmount: amount },
      timestamp: serverTimestamp(),
    });
  },

  addLoan: async (tx, op) => {
    const loan = op.payload;
    const docRef = doc(db, 'personal_loans', loan.id);
    const cleaned = cleanPayload(loan);
    cleaned.syncedAt = serverTimestamp();
    tx.set(docRef, cleaned);

    const notifRef = doc(collection(db, 'notifications'));
    tx.set(notifRef, {
      teamId: op.teamId,
      title: 'Personal Loan Recorded',
      description: `${loan.lenderName} gave ${loan.amount} to ${loan.borrowerName}`,
      type: 'transfers',
      createdAt: serverTimestamp(),
      readBy: [op.uid],
    });
  },

  updateLoan: async (tx, op) => {
    const { id, updates } = op.payload;
    const docRef = doc(db, 'personal_loans', id);
    const cleaned = cleanPayload(updates);
    cleaned.syncedAt = serverTimestamp();
    tx.update(docRef, cleaned);
  },

  settleLoan: async (tx, op) => {
    const id = typeof op.payload === 'string' ? op.payload : (op.payload.loanId || op.payload.id);
    const status = (typeof op.payload === 'object' && op.payload.status) ? op.payload.status : 'SETTLED';
    const docRef = doc(db, 'personal_loans', id);
    tx.update(docRef, {
      status,
      syncedAt: serverTimestamp(),
    });
  },

  deleteLoan: async (tx, op) => {
    const id = typeof op.payload === 'string' ? op.payload : (op.payload.loanId || op.payload.id);
    const docRef = doc(db, 'personal_loans', id);
    tx.delete(docRef);
  },

  updateProfile: async (tx, op) => {
    const { userId, updates } = op.payload;
    const docRef = doc(db, 'users', userId);
    const cleaned = cleanPayload(updates);
    tx.update(docRef, cleaned);
  },
};
