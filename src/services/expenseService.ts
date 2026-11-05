import { 
  collection, 
  addDoc, 
  setDoc, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  getDocs, 
  writeBatch, 
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase';
import { Expense, Attendance, EditHistory, MealCategory } from '../models/types';
import { notificationService } from './notificationService';
import { splitEvenly } from '../utils/math';
import { cacheRepo } from '../offline/cacheRepo';
import { enqueueWrite } from '../offline/syncEngine';
import { generateDocId } from '../offline/executors';

export const expenseService = {
  addExpense: async (e: Omit<Expense, 'id'>): Promise<string> => {
    const docId = generateDocId('expenses');
    const fullExpense: Expense = {
      ...e,
      id: docId,
      receiptImageUrl: e.receiptImageUrl || undefined,
      date: e.date,
      createdAt: e.createdAt || new Date(),
    };

    await enqueueWrite({
      uid: e.userId,
      teamId: e.teamId || '',
      entityId: docId,
      type: 'addExpense',
      payload: fullExpense,
    });

    return docId;
  },

  addExpenses: async (list: Omit<Expense, 'id'>[]): Promise<void> => {
    for (const e of list) {
      const docId = generateDocId('expenses');
      const fullExpense: Expense = {
        ...e,
        id: docId,
        receiptImageUrl: e.receiptImageUrl || undefined,
        date: e.date,
        createdAt: e.createdAt || new Date(),
      };
      await enqueueWrite({
        uid: e.userId,
        teamId: e.teamId || '',
        entityId: docId,
        type: 'addExpense',
        payload: fullExpense,
      });
    }
  },

  updateExpense: async (
    id: string, 
    newData: Partial<Expense>, 
    userId: string, 
    userName: string, 
    prev: Record<string, any>
  ): Promise<void> => {
    const targetTeamId = prev.teamId || (newData as any).teamId || '';
    await enqueueWrite({
      uid: userId,
      teamId: targetTeamId,
      entityId: id,
      type: 'updateExpense',
      payload: {
        id,
        ...newData,
        userName,
        isEdited: true,
        lastEditedBy: userName,
        previousData: prev,
      },
    });
  },

  deleteExpense: async (id: string, prevData?: Record<string, any>, userId?: string, userName?: string): Promise<void> => {
    const targetTeamId = prevData?.teamId || '';
    await enqueueWrite({
      uid: userId || 'anonymous',
      teamId: targetTeamId,
      entityId: id,
      type: 'deleteExpense',
      payload: {
        id,
        teamId: targetTeamId,
        itemName: prevData?.itemName,
        userName,
        previousData: prevData || {},
      },
    });
  },

  logAuditLog: async (params: {
    teamId: string;
    entityId: string;
    entityType: string;
    action: 'created' | 'updated' | 'deleted';
    itemName?: string;
    userId: string;
    userName: string;
    previousData?: Record<string, any>;
    newData?: Record<string, any>;
  }): Promise<void> => {
    const batch = writeBatch(db);
    const historyRef = doc(collection(db, 'editHistory'));
    batch.set(historyRef, {
      teamId: params.teamId,
      entityId: params.entityId,
      entityType: params.entityType,
      action: params.action,
      itemName: params.itemName || '',
      userId: params.userId,
      userName: params.userName,
      previousData: params.previousData || {},
      newData: params.newData || {},
      timestamp: Timestamp.now()
    });

    if (params.teamId) {
      const notifType = params.entityType === 'wallet' ? 'walletUpdates' : 'editExpense';
      const notifRef = doc(collection(db, 'notifications'));
      batch.set(notifRef, {
        teamId: params.teamId,
        title: params.entityType === 'wallet' ? 'Wallet Updated' : 'Item Updated',
        desc: `${params.userName} updated ${params.itemName || params.entityType}`,
        notifType,
        createdAt: Timestamp.now()
      });
    }

    await batch.commit();
  },

  getTeamExpenses: (teamId: string, callback: (expenses: Expense[]) => void, onError?: (err: any) => void) => {
    const toDateSafe = (val: any) => {
      if (!val) return new Date();
      if (typeof val.toDate === 'function') return val.toDate();
      return new Date(val);
    };

    let prevCount = 0;
    const q = query(
      collection(db, 'expenses'), 
      where('teamId', '==', teamId), 
      orderBy('date', 'desc')
    );
    return onSnapshot(
      q,
      (snap) => {
        if (cacheRepo.shouldIgnoreSnapshot(snap, prevCount)) {
          return;
        }
        const expenses = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            date: toDateSafe(data.date),
            createdAt: toDateSafe(data.createdAt),
            lastEditedAt: data.lastEditedAt ? toDateSafe(data.lastEditedAt) : undefined
          } as Expense;
        });
        prevCount = expenses.length;
        callback(expenses);
      },
      (err) => {
        console.warn('[expenseService] getTeamExpenses listener error:', err);
        if (onError) onError(err);
      }
    );
  },

  getUserExpenses: (teamId: string, userId: string, callback: (expenses: Expense[]) => void, onError?: (err: any) => void) => {
    const toDateSafe = (val: any) => {
      if (!val) return new Date();
      if (typeof val.toDate === 'function') return val.toDate();
      return new Date(val);
    };

    let prevCount = 0;
    const q = query(
      collection(db, 'expenses'), 
      where('teamId', '==', teamId), 
      where('userId', '==', userId), 
      orderBy('date', 'desc')
    );
    return onSnapshot(
      q,
      (snap) => {
        if (cacheRepo.shouldIgnoreSnapshot(snap, prevCount)) {
          return;
        }
        const expenses = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            date: toDateSafe(data.date),
            createdAt: toDateSafe(data.createdAt),
            lastEditedAt: data.lastEditedAt ? toDateSafe(data.lastEditedAt) : undefined
          } as Expense;
        });
        prevCount = expenses.length;
        callback(expenses);
      },
      (err) => {
        console.warn('[expenseService] getUserExpenses listener error:', err);
        if (onError) onError(err);
      }
    );
  },

  getEditHistory: (entityId: string, callback: (history: EditHistory[]) => void, onError?: (err: any) => void) => {
    let prevCount = 0;
    const q = query(
      collection(db, 'editHistory'), 
      where('entityId', '==', entityId)
    );
    return onSnapshot(
      q,
      (snap) => {
        if (cacheRepo.shouldIgnoreSnapshot(snap, prevCount)) {
          return;
        }
        const history = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            timestamp: data.timestamp ? (typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate() : new Date(data.timestamp)) : new Date()
          } as EditHistory;
        });
        history.sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
        prevCount = history.length;
        callback(history);
      },
      (err) => {
        console.warn('[expenseService] getEditHistory listener error (preserving cache):', err);
        if (onError) onError(err);
      }
    );
  },

  getTeamEditHistory: (teamId: string, callback: (history: EditHistory[]) => void, onError?: (err: any) => void) => {
    let prevCount = 0;
    const q = query(
      collection(db, 'editHistory'), 
      where('teamId', '==', teamId)
    );
    return onSnapshot(
      q,
      (snap) => {
        if (cacheRepo.shouldIgnoreSnapshot(snap, prevCount)) {
          return;
        }
        const history = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            timestamp: data.timestamp ? (typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate() : new Date(data.timestamp)) : new Date()
          } as EditHistory;
        });
        history.sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
        prevCount = history.length;
        callback(history);
      },
      (err) => {
        console.warn('[expenseService] getTeamEditHistory listener error (preserving cache):', err);
        if (onError) onError(err);
      }
    );
  },

  markAttendance: async (params: {
    userId: string;
    userName?: string;
    date: Date;
    isPresent: boolean;
    meals: MealCategory[];
    teamId: string;
    prevMeals?: MealCategory[];
  }): Promise<void> => {
    const dateStr = params.date.toISOString().substring(0, 10);
    const docId = `${params.userId}_${dateStr}`;
    await enqueueWrite({
      uid: params.userId,
      teamId: params.teamId,
      entityId: docId,
      type: 'markAttendance',
      payload: params,
    });
  },

  getTeamAttendance: (teamId: string, date: Date, callback: (attendance: Attendance[]) => void) => {
    const s = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const e = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

    const q = query(
      collection(db, 'attendance'),
      where('teamId', '==', teamId),
      where('date', '>=', Timestamp.fromDate(s)),
      where('date', '<=', Timestamp.fromDate(e))
    );

    return onSnapshot(q, (snap) => {
      const attendance = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          date: (data.date as Timestamp).toDate()
        } as Attendance;
      });
      callback(attendance);
    });
  },

  getMonthAttendance: (teamId: string, date: Date, callback: (attendance: Attendance[]) => void) => {
    const s = new Date(date.getFullYear(), date.getMonth(), 1);
    const e = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

    const q = query(
      collection(db, 'attendance'),
      where('teamId', '==', teamId),
      where('date', '>=', Timestamp.fromDate(s)),
      where('date', '<=', Timestamp.fromDate(e))
    );

    return onSnapshot(q, (snap) => {
      const attendance = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          date: (data.date as Timestamp).toDate()
        } as Attendance;
      });
      callback(attendance);
    });
  },

  // Split Calculations
  calculateShares: (params: {
    expenses: Expense[];
    attendance: Attendance[];
    allIds: string[];
  }): Record<string, number> => {
    const shares: Record<string, number> = {};
    params.allIds.forEach(id => {
      shares[id] = 0;
    });

    params.expenses.forEach(exp => {
      const price = (Number(exp.price) || 0) * (Number(exp.quantity) || 1);
      let payers: string[] = [];

      const expDateStr = exp.date.toISOString().substring(0, 10);
      const dayAttendance = params.attendance.filter(a => {
        try {
          const aDateStr = a.date.toISOString().substring(0, 10);
          return aDateStr === expDateStr;
        } catch {
          return false;
        }
      });

      if (exp.splitUserIds && Array.isArray(exp.splitUserIds) && exp.splitUserIds.length > 0) {
        payers = exp.splitUserIds.filter(id => params.allIds.includes(id));
      } else if (exp.category === 'utility') {
        payers = params.allIds;
      } else if (exp.category === 'breakfast') {
        payers = dayAttendance.filter(a => a.attendedBreakfast).map(a => a.userId);
      } else if (exp.category === 'lunch') {
        payers = dayAttendance.filter(a => a.attendedLunch).map(a => a.userId);
      } else if (exp.category === 'dinner') {
        payers = dayAttendance.filter(a => a.attendedDinner).map(a => a.userId);
      } else {
        // none or uncategorized
        payers = dayAttendance.filter(a => a.isPresent).map(a => a.userId);
      }

      if (payers.length === 0) {
        // Purchaser pays it all
        shares[exp.userId] = (shares[exp.userId] || 0) + Math.round(price);
      } else {
        const splits = splitEvenly(price, payers.length);
        payers.forEach((uid, idx) => {
          shares[uid] = (shares[uid] || 0) + splits[idx];
        });
      }
    });

    return shares;
  },

  updateReceiptImage: async (expenseId: string, url: string | null): Promise<void> => {
    await updateDoc(doc(db, 'expenses', expenseId), { receiptImageUrl: url });
  }
};
