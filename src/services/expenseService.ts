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

export const expenseService = {
  addExpense: async (e: Omit<Expense, 'id'>): Promise<string> => {
    const data = {
      ...e,
      date: Timestamp.fromDate(e.date),
      createdAt: Timestamp.fromDate(e.createdAt || new Date()),
      lastEditedAt: e.lastEditedAt ? Timestamp.fromDate(e.lastEditedAt) : null,
    };
    const docRef = await addDoc(collection(db, 'expenses'), data);
    return docRef.id;
  },

  addExpenses: async (list: Omit<Expense, 'id'>[]): Promise<void> => {
    const batch = writeBatch(db);
    list.forEach((e) => {
      const docRef = doc(collection(db, 'expenses'));
      const data = {
        ...e,
        date: Timestamp.fromDate(e.date),
        createdAt: Timestamp.fromDate(e.createdAt || new Date()),
        lastEditedAt: e.lastEditedAt ? Timestamp.fromDate(e.lastEditedAt) : null,
      };
      batch.set(docRef, data);
    });
    await batch.commit();
  },

  updateExpense: async (
    id: string, 
    newData: Partial<Expense>, 
    userId: string, 
    userName: string, 
    prev: Record<string, any>
  ): Promise<void> => {
    const updatedData: Record<string, any> = {
      ...newData,
      isEdited: true,
      lastEditedBy: userName,
      lastEditedAt: Timestamp.now(),
    };
    if (newData.date) {
      updatedData.date = Timestamp.fromDate(newData.date);
    }
    await updateDoc(doc(db, 'expenses', id), updatedData);

    const historyRef = doc(collection(db, 'editHistory'));
    const history: Omit<EditHistory, 'id'> = {
      entityId: id,
      entityType: 'expense',
      userId,
      userName,
      previousData: prev,
      newData: updatedData,
      timestamp: new Date()
    };
    await setDoc(historyRef, {
      ...history,
      timestamp: Timestamp.fromDate(history.timestamp)
    });
  },

  deleteExpense: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, 'expenses', id));
  },

  getTeamExpenses: (teamId: string, callback: (expenses: Expense[]) => void) => {
    const toDateSafe = (val: any) => {
      if (!val) return new Date();
      if (typeof val.toDate === 'function') return val.toDate();
      return new Date(val);
    };

    const q = query(
      collection(db, 'expenses'), 
      where('teamId', '==', teamId), 
      orderBy('date', 'desc')
    );
    return onSnapshot(q, (snap) => {
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
      callback(expenses);
    });
  },

  getUserExpenses: (teamId: string, userId: string, callback: (expenses: Expense[]) => void) => {
    const toDateSafe = (val: any) => {
      if (!val) return new Date();
      if (typeof val.toDate === 'function') return val.toDate();
      return new Date(val);
    };

    const q = query(
      collection(db, 'expenses'), 
      where('teamId', '==', teamId), 
      where('userId', '==', userId), 
      orderBy('date', 'desc')
    );
    return onSnapshot(q, (snap) => {
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
      callback(expenses);
    });
  },

  getEditHistory: (entityId: string, callback: (history: EditHistory[]) => void) => {
    const q = query(
      collection(db, 'editHistory'), 
      where('entityId', '==', entityId), 
      orderBy('timestamp', 'desc')
    );
    return onSnapshot(q, (snap) => {
      const history = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          timestamp: (data.timestamp as Timestamp).toDate()
        } as EditHistory;
      });
      callback(history);
    });
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

    const attendanceData = {
      userId: params.userId,
      date: Timestamp.fromDate(params.date),
      isPresent: params.isPresent,
      attendedBreakfast: params.meals.includes('breakfast'),
      attendedLunch: params.meals.includes('lunch'),
      attendedDinner: params.meals.includes('dinner'),
      teamId: params.teamId
    };

    await setDoc(doc(db, 'attendance', docId), attendanceData, { merge: true });

    if (params.userName) {
      const historyRef = doc(collection(db, 'editHistory'));
      await setDoc(historyRef, {
        entityId: docId,
        entityType: 'attendance',
        userId: params.userId,
        userName: params.userName,
        previousData: {
          meals: params.prevMeals || [],
          isPresent: (params.prevMeals || []).length > 0
        },
        newData: {
          meals: params.meals,
          isPresent: params.isPresent
        },
        timestamp: Timestamp.now()
      });
    }
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

      if (exp.category === 'utility') {
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
        shares[exp.userId] = (shares[exp.userId] || 0) + price;
      } else {
        const per = price / payers.length;
        payers.forEach(uid => {
          shares[uid] = (shares[uid] || 0) + per;
        });
      }
    });

    return shares;
  },

  updateReceiptImage: async (expenseId: string, url: string | null): Promise<void> => {
    await updateDoc(doc(db, 'expenses', expenseId), { receiptImageUrl: url });
  }
};
