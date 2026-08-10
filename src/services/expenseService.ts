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

export const expenseService = {
  addExpense: async (e: Omit<Expense, 'id'>): Promise<string> => {
    const cleanObject = (obj: Record<string, any>) => {
      const result: Record<string, any> = {};
      Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined && obj[key] !== null) {
          result[key] = obj[key];
        } else if (obj[key] === null) {
          result[key] = null;
        }
      });
      return result;
    };

    const batch = writeBatch(db);
    const docRef = doc(collection(db, 'expenses'));

    const data = cleanObject({
      ...e,
      receiptImageUrl: e.receiptImageUrl || null,
      date: Timestamp.fromDate(e.date),
      createdAt: Timestamp.fromDate(e.createdAt || new Date()),
      lastEditedAt: e.lastEditedAt ? Timestamp.fromDate(e.lastEditedAt) : null,
    });
    batch.set(docRef, data);

    // Audit log
    const historyRef = doc(collection(db, 'editHistory'));
    batch.set(historyRef, {
      teamId: e.teamId || '',
      entityId: docRef.id,
      entityType: 'expense',
      action: 'created',
      itemName: e.itemName,
      userId: e.userId,
      userName: e.userName,
      previousData: {},
      newData: {
        itemName: e.itemName,
        price: e.price,
        quantity: e.quantity,
        category: e.category,
      },
      timestamp: Timestamp.now()
    });

    await batch.commit();

    if (e.teamId) {
      await notificationService.notify(
        e.teamId,
        'New Expense Added',
        `${e.userName} added ${e.itemName} (${(e as any).currency || 'PKR'} ${e.price})`,
        'newExpense'
      ).catch(err => console.error('Failed to notify expense addition:', err));
    }

    return docRef.id;
  },

  addExpenses: async (list: Omit<Expense, 'id'>[]): Promise<void> => {
    const cleanObject = (obj: Record<string, any>) => {
      const result: Record<string, any> = {};
      Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined) {
          result[key] = obj[key];
        }
      });
      return result;
    };

    const batch = writeBatch(db);
    list.forEach((e) => {
      const docRef = doc(collection(db, 'expenses'));
      const data = cleanObject({
        ...e,
        receiptImageUrl: e.receiptImageUrl || null,
        date: Timestamp.fromDate(e.date),
        createdAt: Timestamp.fromDate(e.createdAt || new Date()),
        lastEditedAt: e.lastEditedAt ? Timestamp.fromDate(e.lastEditedAt) : null,
      });
      batch.set(docRef, data);

      // Audit log for each
      const historyRef = doc(collection(db, 'editHistory'));
      batch.set(historyRef, {
        teamId: e.teamId || '',
        entityId: docRef.id,
        entityType: 'expense',
        action: 'created',
        itemName: e.itemName,
        userId: e.userId,
        userName: e.userName,
        previousData: {},
        newData: {
          itemName: e.itemName,
          price: e.price,
          quantity: e.quantity,
          category: e.category,
        },
        timestamp: Timestamp.now()
      });
    });

    await batch.commit();

    if (list.length > 0 && list[0].teamId) {
      const first = list[0];
      const totalAmount = list.reduce((sum, item) => sum + item.price, 0);
      const itemsSummary = list.map(i => i.itemName).join(', ');
      await notificationService.notify(
        first.teamId,
        'New Expense Added',
        `${first.userName} added ${list.length} item(s): ${itemsSummary} (Total: ${(first as any).currency || 'Rs.'} ${totalAmount})`,
        'newExpense'
      ).catch(err => console.error('Failed to notify bulk expenses:', err));
    }
  },

  updateExpense: async (
    id: string, 
    newData: Partial<Expense>, 
    userId: string, 
    userName: string, 
    prev: Record<string, any>
  ): Promise<void> => {
    const cleanObject = (obj: Record<string, any>) => {
      const result: Record<string, any> = {};
      Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined) {
          result[key] = obj[key];
        }
      });
      return result;
    };

    const updatedData: Record<string, any> = cleanObject({
      ...newData,
      isEdited: true,
      lastEditedBy: userName,
      lastEditedAt: Timestamp.now(),
    });
    if (newData.date) {
      updatedData.date = Timestamp.fromDate(newData.date);
    }

    const batch = writeBatch(db);
    batch.update(doc(db, 'expenses', id), updatedData);

    const targetTeamId = prev.teamId || (newData as any).teamId || '';
    const itemTitle = newData.itemName || prev.itemName || 'Expense';

    const fullNewData = cleanObject({
      itemName: prev.itemName,
      price: prev.price,
      quantity: prev.quantity,
      category: prev.category,
      splitUserIds: prev.splitUserIds,
      ...newData,
      ...updatedData,
    });

    const historyRef = doc(collection(db, 'editHistory'));
    const history: Omit<EditHistory, 'id'> = {
      teamId: targetTeamId,
      entityId: id,
      entityType: 'expense',
      action: 'updated',
      itemName: itemTitle,
      userId,
      userName,
      previousData: cleanObject(prev),
      newData: fullNewData,
      timestamp: new Date()
    };
    batch.set(historyRef, {
      ...history,
      timestamp: Timestamp.fromDate(history.timestamp)
    });

    await batch.commit();

    if (targetTeamId) {
      await notificationService.notify(
        targetTeamId,
        'Expense Modified',
        `${userName} updated "${itemTitle}"`,
        'editExpense'
      ).catch(err => console.error('Failed to notify expense update:', err));
    }
  },

  deleteExpense: async (id: string, prevData?: Record<string, any>, userId?: string, userName?: string): Promise<void> => {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'expenses', id));

    if (userId && userName && prevData) {
      const historyRef = doc(collection(db, 'editHistory'));
      batch.set(historyRef, {
        teamId: prevData.teamId || '',
        entityId: id,
        entityType: 'expense',
        action: 'deleted',
        itemName: prevData.itemName || 'Expense',
        userId,
        userName,
        previousData: prevData,
        newData: {},
        timestamp: Timestamp.now()
      });
    }

    await batch.commit();

    if (userId && userName && prevData && prevData.teamId) {
      await notificationService.notify(
        prevData.teamId,
        'Expense Deleted',
        `${userName} deleted "${prevData.itemName || 'Expense'}"`,
        'editExpense'
      ).catch(err => console.error('Failed to notify expense deletion:', err));
    }
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
      where('entityId', '==', entityId)
    );
    return onSnapshot(q, (snap) => {
      const history = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          timestamp: data.timestamp ? (typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate() : new Date(data.timestamp)) : new Date()
        } as EditHistory;
      });
      history.sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
      callback(history);
    }, (err) => {
      console.warn('getEditHistory listener error:', err);
      callback([]);
    });
  },

  getTeamEditHistory: (teamId: string, callback: (history: EditHistory[]) => void) => {
    const q = query(
      collection(db, 'editHistory'), 
      where('teamId', '==', teamId)
    );
    return onSnapshot(q, (snap) => {
      const history = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          timestamp: data.timestamp ? (typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate() : new Date(data.timestamp)) : new Date()
        } as EditHistory;
      });
      history.sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
      callback(history);
    }, (err) => {
      console.warn('getTeamEditHistory listener error:', err);
      callback([]);
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

    const batch = writeBatch(db);
    batch.set(doc(db, 'attendance', docId), attendanceData, { merge: true });

    if (params.userName) {
      const historyRef = doc(collection(db, 'editHistory'));
      batch.set(historyRef, {
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

    await batch.commit();
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
