import { describe, it, expect, vi } from 'vitest';
import { resolveDisplayImage, persistAttachment } from './attachments';
import { outbox } from './outbox';
import { MemoryDatabaseDriver, localDb } from './localDb';

describe('Attachments & Media Offline Handling', () => {
  it('resolveDisplayImage prioritizes local URI over remote URL', () => {
    const local = 'file:///data/user/0/app/attachments/attach_123.jpg';
    const remote = 'https://firebasestorage.googleapis.com/v0/b/app/receipts/123.jpg';

    // Local present
    expect(resolveDisplayImage(local, remote)).toBe(local);
    // Only remote
    expect(resolveDisplayImage(null, remote)).toBe(remote);
    expect(resolveDisplayImage(undefined, remote)).toBe(remote);
    // Neither
    expect(resolveDisplayImage(null, null)).toBeNull();
  });

  it('persistAttachment ignores existing remote URLs or already-persisted files', async () => {
    const remote = 'https://example.com/photo.jpg';
    const kept = await persistAttachment(remote);
    expect(kept).toBe(remote);

    const alreadyPersisted = 'file:///data/app/attachments/attach_abc.jpg';
    const keptLocal = await persistAttachment(alreadyPersisted);
    expect(keptLocal).toBe(alreadyPersisted);
  });

  it('queues uploadReceipt in the outbox and tracks retry count on failure', async () => {
    localDb.setDriver(new MemoryDatabaseDriver());

    const op = await outbox.enqueue({
      uid: 'user_1',
      teamId: 'team_1',
      entityId: 'exp_1',
      type: 'uploadReceipt',
      payload: {
        expenseId: 'exp_1',
        localUri: 'file:///mock/attachments/receipt.jpg',
        storagePath: 'receipts/exp_1.jpg',
      },
    });

    expect(op.type).toBe('uploadReceipt');
    expect(op.status).toBe('pending');
    expect(op.attempts).toBe(0);

    // Simulate transient failure during upload
    await outbox.markFailed(op.opId, 'Network error during upload', 1);

    const pending = await outbox.getPendingOps('user_1');
    expect(pending[0].attempts).toBe(1);
    expect(pending[0].lastError).toBe('Network error during upload');
    expect(pending[0].nextAttemptAt).toBeGreaterThan(Date.now());
  });

  it('queues uploadProfileImage in the outbox', async () => {
    localDb.setDriver(new MemoryDatabaseDriver());

    const op = await outbox.enqueue({
      uid: 'user_2',
      teamId: 'team_1',
      entityId: 'user_2',
      type: 'uploadProfileImage',
      payload: {
        userId: 'user_2',
        localUri: 'file:///mock/attachments/avatar.jpg',
        storagePath: 'profiles/user_2.jpg',
      },
    });

    expect(op.type).toBe('uploadProfileImage');
    expect(op.entityId).toBe('user_2');

    // Mark done when upload completes
    await outbox.markDone(op.opId);
    const all = await outbox.getAllOps('user_2');
    expect(all).toHaveLength(0);
  });
});
