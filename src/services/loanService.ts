import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  updateDoc, 
  query, 
  where 
} from 'firebase/firestore';
import { db } from './firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PersonalLoan } from '../models/types';

const appStorage = (AsyncStorage as any)?.default || AsyncStorage;
const LOCAL_LOANS_KEY = '@personal_loans_cache';

export const loanService = {
  /**
   * Fetch all loans for a team where the specified userId is either the lender or borrower.
   * This guarantees strict privacy between the two involved users.
   */
  getLoans: async (teamId: string, currentUserId: string): Promise<PersonalLoan[]> => {
    if (!teamId || !currentUserId) return [];

    let remoteLoans: PersonalLoan[] = [];
    try {
      // Query 1: current user is lender
      const lenderQuery = query(
        collection(db, 'personal_loans'),
        where('teamId', '==', teamId),
        where('lenderId', '==', currentUserId)
      );
      // Query 2: current user is borrower
      const borrowerQuery = query(
        collection(db, 'personal_loans'),
        where('teamId', '==', teamId),
        where('borrowerId', '==', currentUserId)
      );

      const [lenderSnap, borrowerSnap] = await Promise.all([
        getDocs(lenderQuery),
        getDocs(borrowerQuery),
      ]);

      const map = new Map<string, PersonalLoan>();
      lenderSnap.docs.forEach(d => {
        map.set(d.id, { id: d.id, ...(d.data() as any) });
      });
      borrowerSnap.docs.forEach(d => {
        map.set(d.id, { id: d.id, ...(d.data() as any) });
      });

      remoteLoans = Array.from(map.values());

      // Update cache
      await appStorage.setItem(LOCAL_LOANS_KEY, JSON.stringify(remoteLoans));
      return remoteLoans.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (e) {
      console.warn('Failed to fetch remote loans, reading local cache:', e);
      // Fallback to local cache filtered strictly by current user
      try {
        const cached = await appStorage.getItem(LOCAL_LOANS_KEY);
        if (cached) {
          const list: PersonalLoan[] = JSON.parse(cached);
          return list.filter(l => 
            l.teamId === teamId && 
            (l.lenderId === currentUserId || l.borrowerId === currentUserId)
          ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }
      } catch (err) {
        console.error('Error reading cached loans:', err);
      }
      return [];
    }
  },

  /**
   * Add a new personal loan transaction (Give / Lent or Borrow).
   */
  addLoan: async (loanData: Omit<PersonalLoan, 'id' | 'createdAt'>): Promise<PersonalLoan> => {
    const loanId = 'loan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const newLoan: PersonalLoan = {
      ...loanData,
      id: loanId,
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'personal_loans', loanId), newLoan);
    } catch (e) {
      console.warn('Could not save loan to Firestore, saving locally:', e);
    }

    // Save to local cache
    try {
      const cached = await appStorage.getItem(LOCAL_LOANS_KEY);
      const list: PersonalLoan[] = cached ? JSON.parse(cached) : [];
      list.push(newLoan);
      await appStorage.setItem(LOCAL_LOANS_KEY, JSON.stringify(list));
    } catch (err) {
      console.error('Error updating cached loans:', err);
    }

    return newLoan;
  },

  /**
   * Settle or toggle status of a loan
   */
  settleLoan: async (loanId: string, status: 'PENDING' | 'SETTLED' = 'SETTLED'): Promise<void> => {
    try {
      await updateDoc(doc(db, 'personal_loans', loanId), { status });
    } catch (e) {
      console.warn('Could not update loan status in Firestore, updating locally:', e);
    }

    try {
      const cached = await appStorage.getItem(LOCAL_LOANS_KEY);
      if (cached) {
        const list: PersonalLoan[] = JSON.parse(cached);
        const updated = list.map(l => l.id === loanId ? { ...l, status } : l);
        await appStorage.setItem(LOCAL_LOANS_KEY, JSON.stringify(updated));
      }
    } catch (err) {
      console.error('Error updating cached loan status:', err);
    }
  },

  /**
   * Delete a loan
   */
  deleteLoan: async (loanId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'personal_loans', loanId));
    } catch (e) {
      console.warn('Could not delete loan in Firestore:', e);
    }

    try {
      const cached = await appStorage.getItem(LOCAL_LOANS_KEY);
      if (cached) {
        const list: PersonalLoan[] = JSON.parse(cached);
        const updated = list.filter(l => l.id !== loanId);
        await appStorage.setItem(LOCAL_LOANS_KEY, JSON.stringify(updated));
      }
    } catch (err) {
      console.error('Error deleting cached loan:', err);
    }
  },

  /**
   * Calculates net loan balance between current user and target member.
   * Positive value = target member owes current user (You gave/lent more).
   * Negative value = current user owes target member (You borrowed more).
   */
  getNetLoanBalanceBetween: (
    currentUserId: string,
    otherUserId: string,
    loans: PersonalLoan[]
  ): number => {
    let net = 0;
    loans.forEach(l => {
      if (l.status === 'SETTLED') return;
      if (l.lenderId === currentUserId && l.borrowerId === otherUserId) {
        net += l.amount; // Current user lent money -> other user owes
      } else if (l.borrowerId === currentUserId && l.lenderId === otherUserId) {
        net -= l.amount; // Other user lent money -> current user owes
      }
    });
    return net;
  },

  /**
   * Summary of all active loans for current user:
   * toCollect = money people owe to current user
   * toPay = money current user owes to others
   */
  getUserLoanSummary: (currentUserId: string, loans: PersonalLoan[]) => {
    let toCollect = 0;
    let toPay = 0;

    loans.forEach(l => {
      if (l.status === 'SETTLED') return;
      if (l.lenderId === currentUserId) {
        toCollect += l.amount;
      } else if (l.borrowerId === currentUserId) {
        toPay += l.amount;
      }
    });

    return {
      toCollect,
      toPay,
      netBalance: toCollect - toPay,
    };
  },
};
