import { localDb, OutboxRow, OutboxStatus } from './localDb';
import { serialize, deserialize } from './serialize';

export type OpType =
  | 'addExpense'
  | 'addExpenses'
  | 'updateExpense'
  | 'deleteExpense'
  | 'setAttendance'
  | 'markAttendance'
  | 'updateWallet'
  | 'recordSettlement'
  | 'carryForward'
  | 'undoCarry'
  | 'addLoan'
  | 'updateLoan'
  | 'settleLoan'
  | 'deleteLoan'
  | 'updateProfile'
  | 'uploadReceipt'
  | 'uploadProfileImage';

export interface OutboxOp<T = any> {
  seq?: number;
  opId: string;
  uid: string;
  teamId: string;
  type: OpType;
  payload: T;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string | null;
  createdAt: number;
  entityId?: string;
}

export const BACKOFF_SCHEDULE = [2000, 5000, 15000, 60000, 300000];

export function calculateBackoffMs(attempts: number): number {
  const idx = Math.min(Math.max(0, attempts - 1), BACKOFF_SCHEDULE.length - 1);
  return BACKOFF_SCHEDULE[idx];
}

export const MAX_RETRY_ATTEMPTS = 5;

export function isNonRetryableError(error: any): boolean {
  const msg = (error?.message || error?.code || String(error)).toLowerCase();
  return (
    msg.includes('permission-denied') ||
    msg.includes('permission_denied') ||
    msg.includes('storage/unauthorized') ||
    msg.includes('storage/canceled') ||
    msg.includes('storage/invalid-argument') ||
    msg.includes('storage/project-not-found') ||
    msg.includes('storage/bucket-not-found') ||
    msg.includes('invalid-argument') ||
    msg.includes('invalid_argument') ||
    msg.includes('not-found') ||
    msg.includes('not_found')
  );
}

export function generateOpId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `op_${Date.now()}_${rand}`;
}

export const outbox = {
  /**
   * Enqueue a new mutation into persistent outbox SQLite table and return immediately.
   */
  enqueue: async <T = any>(params: {
    uid: string;
    teamId: string;
    type: OpType;
    payload: T;
    entityId?: string;
    opId?: string;
  }): Promise<OutboxOp<T>> => {
    const opId = params.opId || generateOpId();
    const createdAt = Date.now();

    const op: OutboxOp<T> = {
      opId,
      uid: params.uid,
      teamId: params.teamId,
      type: params.type,
      payload: params.payload,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      createdAt,
      entityId: params.entityId,
    };

    const row: Omit<OutboxRow, 'seq'> = {
      opId,
      uid: params.uid,
      teamId: params.teamId,
      type: params.type,
      payload: serialize(params.payload),
      status: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
      createdAt,
    };

    const seq = await localDb.insertOutbox(row);
    op.seq = seq;
    return op;
  },

  /**
   * List all pending or syncing operations for a user in FIFO order.
   */
  getPendingOps: async (uid: string): Promise<OutboxOp[]> => {
    const rows = await localDb.getPendingOutbox(uid);
    return rows.map(r => {
      let payload: any = {};
      try {
        payload = deserialize(r.payload);
      } catch (e) {
        payload = {};
      }
      return {
        seq: r.seq,
        opId: r.opId,
        uid: r.uid,
        teamId: r.teamId,
        type: r.type as OpType,
        payload,
        status: r.status,
        attempts: r.attempts,
        nextAttemptAt: r.nextAttemptAt,
        lastError: r.lastError,
        createdAt: r.createdAt,
        entityId: payload?.id || payload?.entityId || payload?.userId,
      };
    });
  },

  /**
   * List all operations (including failed) for a user.
   */
  getAllOps: async (uid: string): Promise<OutboxOp[]> => {
    const rows = await localDb.getAllOutbox(uid);
    return rows.map(r => {
      let payload: any = {};
      try {
        payload = deserialize(r.payload);
      } catch (e) {
        payload = {};
      }
      return {
        seq: r.seq,
        opId: r.opId,
        uid: r.uid,
        teamId: r.teamId,
        type: r.type as OpType,
        payload,
        status: r.status,
        attempts: r.attempts,
        nextAttemptAt: r.nextAttemptAt,
        lastError: r.lastError,
        createdAt: r.createdAt,
        entityId: payload?.id || payload?.entityId || payload?.userId,
      };
    });
  },

  markSyncing: async (opId: string): Promise<void> => {
    await localDb.updateOutboxStatus(opId, 'syncing');
  },

  markDone: async (opId: string): Promise<void> => {
    // Delete from outbox once synced
    await localDb.deleteOutbox(opId);
  },

  markFailed: async (opId: string, errorMsg: string, attempts: number): Promise<void> => {
    const backoff = calculateBackoffMs(attempts);
    const nextAttemptAt = Date.now() + backoff;
    await localDb.updateOutboxStatus(opId, 'pending', {
      attempts,
      nextAttemptAt,
      lastError: errorMsg,
    });
  },

  markPermanentlyFailed: async (opId: string, errorMsg: string): Promise<void> => {
    await localDb.updateOutboxStatus(opId, 'failed', {
      lastError: errorMsg,
    });
  },

  retry: async (opId: string): Promise<void> => {
    await localDb.updateOutboxStatus(opId, 'pending', {
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
    });
  },

  discard: async (opId: string): Promise<void> => {
    await localDb.deleteOutbox(opId);
  },

  resetSyncingToPending: async (uid?: string): Promise<void> => {
    await localDb.resetSyncingToPending(uid);
  },
};
