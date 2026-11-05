import { runTransaction, doc, serverTimestamp, Transaction } from 'firebase/firestore';
import { db } from '../services/firebase';
import { outbox, OutboxOp, OpType, isNonRetryableError } from './outbox';
import { executors, ExecutorFn } from './executors';
import { useNetworkStore } from './network';
import { withTimeout } from './cacheRepo';
import { useStore } from '../store/useStore';

export type TransactionRunner = <T>(fn: (tx: Transaction) => Promise<T>) => Promise<T>;

export class SyncEngine {
  private isFlushing = false;
  private syncTimeoutMs = 15000;
  private customRunner?: TransactionRunner;

  constructor(customRunner?: TransactionRunner) {
    this.customRunner = customRunner;
  }

  setCustomRunner(runner?: TransactionRunner) {
    this.customRunner = runner;
  }

  async init(uid: string): Promise<void> {
    if (!uid) return;
    // Reset any op left in 'syncing' to 'pending' (e.g. if app was killed mid-sync)
    await outbox.resetSyncingToPending(uid);
    await this.updateStoreCounts(uid);
  }

  async updateStoreCounts(uid: string): Promise<void> {
    if (!uid) return;
    try {
      const all = await outbox.getAllOps(uid);
      const pending = all.filter(o => o.status === 'pending' || o.status === 'syncing');
      const failed = all.filter(o => o.status === 'failed');
      useNetworkStore.getState().setSyncCounts({
        pendingCount: pending.length,
        failedCount: failed.length,
      });
      // Reflect pending outbox operations reactively in the UI
      useStore.getState().setOutboxOps(pending);
    } catch (e) {
      // Ignore count errors
    }
  }

  async flush(uid: string): Promise<void> {
    if (this.isFlushing || !uid) return;
    if (!useNetworkStore.getState().isOnline) return;

    this.isFlushing = true;
    useNetworkStore.getState().setSyncCounts({ syncing: true });

    try {
      const pendingOps = await outbox.getPendingOps(uid);
      const failedEntityIds = new Set<string>();

      for (const op of pendingOps) {
        // If an earlier op touching the same document failed, block later ops touching this doc
        if (op.entityId && failedEntityIds.has(op.entityId)) {
          continue;
        }

        // Respect exponential backoff schedule
        if (op.nextAttemptAt > Date.now()) {
          continue;
        }

        await outbox.markSyncing(op.opId);

        try {
          const executor: ExecutorFn = executors[op.type];
          if (!executor) {
            throw new Error(`Unknown executor type: ${op.type}`);
          }

          if (op.type === 'uploadReceipt' || op.type === 'uploadProfileImage') {
            await withTimeout(
              executor({} as any, op),
              this.syncTimeoutMs * 2, // 30s timeout for media uploads
              `Attachment upload ${op.opId} timed out`
            );
          } else {
            const runner: TransactionRunner = this.customRunner || ((fn) => runTransaction(db, fn));

            // Run transaction with 15s timeout
            await withTimeout(
              runner(async (tx) => {
                // 1. Idempotency marker check
                const markerRef = doc(db, 'syncOps', op.opId);
                const markerSnap = await tx.get(markerRef);
                if (markerSnap.exists()) {
                  // Op was already committed on server previously
                  return;
                }

                // 2. Execute business writes
                await executor(tx, op);

                // 3. Write marker doc
                tx.set(markerRef, {
                  opId: op.opId,
                  uid: op.uid,
                  teamId: op.teamId,
                  type: op.type,
                  appliedAt: serverTimestamp(),
                });
              }),
              this.syncTimeoutMs,
              `Sync operation ${op.opId} (${op.type}) timed out after 15s`
            );
          }

          // Success: remove op from outbox
          await outbox.markDone(op.opId);
        } catch (err: any) {
          console.warn(`[SyncEngine] Op ${op.opId} (${op.type}) failed:`, err?.message || err);

          if (op.entityId) {
            failedEntityIds.add(op.entityId);
          }

          if (isNonRetryableError(err)) {
            await outbox.markPermanentlyFailed(op.opId, err?.message || String(err));
          } else {
            await outbox.markFailed(op.opId, err?.message || String(err), op.attempts + 1);
          }
        }
      }
    } finally {
      this.isFlushing = false;
      const now = Date.now();
      useNetworkStore.getState().setSyncCounts({ syncing: false, lastSyncedAt: now });
      await this.updateStoreCounts(uid);
    }
  }
}

export const syncEngine = new SyncEngine();

/**
 * High-level helper to enqueue a write, update optimistic UI state,
 * and trigger a background flush if online.
 */
export async function enqueueWrite(params: {
  uid: string;
  teamId?: string;
  entityId: string;
  type: OpType;
  payload: any;
}): Promise<string> {
  const op = await outbox.enqueue({
    ...params,
    teamId: params.teamId || '',
  });
  await syncEngine.updateStoreCounts(params.uid);
  if (useNetworkStore.getState().isOnline) {
    syncEngine.flush(params.uid).catch((err) => {
      console.warn('[SyncEngine] background flush error:', err);
    });
  }
  return op.opId;
}
