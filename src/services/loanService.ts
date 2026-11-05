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
import { cacheRepo, getUserScope, DEFAULT_SERVER_TIMEOUT_MS } from '../offline/cacheRepo';
import { enqueueWrite } from '../offline/syncEngine';
import { generateDocId } from '../offline/executors';
import { notificationService } from './notificationService';

const appStorage = (AsyncStorage as any)?.default || AsyncStorage;
const LOCAL_LOANS_KEY = '@personal_loans_cache';

export const loanService = {
  /**
   * Fetch all loans for a team where the specified userId is either the lender or borrower.
   * This guarantees strict privacy between the two involved users.
   */
  getLoans: async (teamId: string, currentUserId: string): Promise<PersonalLoan[]> => {
    if (!teamId || !currentUserId) return [];

    const scope = getUserScope(currentUserId);
    const key = `loans_${teamId}`;

    try {
      return await cacheRepo.getCacheFirst(
        scope,
        key,
        async () => {
          const lenderQuery = query(
            collection(db, 'personal_loans'),
            where('teamId', '==', teamId),
            where('lenderId', '==', currentUserId)
          );
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

          return Array.from(map.values()).sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );
        },
        DEFAULT_SERVER_TIMEOUT_MS
      );
    } catch (e) {
      console.warn('[loanService] getLoans failed both remote and cache:', e);
      return [];
    }
  },

  /**
   * Add a new personal loan transaction (Give / Lent or Borrow).
   */
  addLoan: async (loanData: Omit<PersonalLoan, 'id' | 'createdAt'>): Promise<PersonalLoan> => {
    const loanId = generateDocId('personal_loans');
    const newLoan: PersonalLoan = {
      ...loanData,
      id: loanId,
      createdAt: new Date().toISOString(),
    };

    await enqueueWrite({
      uid: loanData.lenderId,
      teamId: loanData.teamId || '',
      entityId: loanId,
      type: 'addLoan',
      payload: newLoan,
    });

    return newLoan;
  },

  settleLoan: async (loanId: string, status: 'PENDING' | 'SETTLED' = 'SETTLED', loanData?: PersonalLoan): Promise<void> => {
    await enqueueWrite({
      uid: loanData?.lenderId || 'unknown',
      teamId: loanData?.teamId || '',
      entityId: loanId,
      type: 'settleLoan',
      payload: { loanId, status, loanData },
    });
  },

  deleteLoan: async (loanId: string, loanData?: PersonalLoan): Promise<void> => {
    await enqueueWrite({
      uid: loanData?.lenderId || 'unknown',
      teamId: loanData?.teamId || '',
      entityId: loanId,
      type: 'deleteLoan',
      payload: { loanId, loanData },
    });
  },

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
    const memberBalances: Record<string, number> = {};

    loans.forEach(l => {
      if (l.status === 'SETTLED') return;
      const otherId = l.lenderId === currentUserId ? l.borrowerId : l.borrowerId === currentUserId ? l.lenderId : null;
      if (!otherId) return;

      if (!memberBalances[otherId]) memberBalances[otherId] = 0;
      if (l.lenderId === currentUserId) {
        memberBalances[otherId] += l.amount;
      } else {
        memberBalances[otherId] -= l.amount;
      }
    });

    let toCollect = 0;
    let toPay = 0;

    Object.values(memberBalances).forEach(net => {
      if (net > 0) {
        toCollect += net;
      } else if (net < 0) {
        toPay += Math.abs(net);
      }
    });

    return {
      toCollect,
      toPay,
      netBalance: toCollect - toPay,
    };
  },
};
