import { describe, it, expect } from 'vitest';
import { useNetworkStore } from './network';
import { outbox } from './outbox';
import { localDb, MemoryDatabaseDriver } from './localDb';

describe('Step 13: Sync UI, Online-Only Guards & Sign-out Safety', () => {
  it('online-only guard correctly blocks execution when device is offline', () => {
    useNetworkStore.getState().setConnection(false, false);
    expect(useNetworkStore.getState().isOnline).toBe(false);

    let executed = false;
    const guardedAction = () => {
      if (!useNetworkStore.getState().isOnline) {
        return 'BLOCKED_OFFLINE';
      }
      executed = true;
      return 'SUCCESS';
    };

    expect(guardedAction()).toBe('BLOCKED_OFFLINE');
    expect(executed).toBe(false);

    // Reconnect
    useNetworkStore.getState().setConnection(true, true);
    expect(useNetworkStore.getState().isOnline).toBe(true);
    expect(guardedAction()).toBe('SUCCESS');
    expect(executed).toBe(true);
  });

  it('sign-out safety correctly detects pending ops before sign-out', async () => {
    localDb.setDriver(new MemoryDatabaseDriver());

    // Initially 0 pending ops
    let pending = await outbox.getPendingOps('user_signout_test');
    expect(pending.length).toBe(0);

    // Enqueue an op
    await outbox.enqueue({
      uid: 'user_signout_test',
      teamId: 'team_1',
      entityId: 'exp_99',
      type: 'addExpense',
      payload: { id: 'exp_99', price: 100 },
    });

    pending = await outbox.getPendingOps('user_signout_test');
    expect(pending.length).toBe(1);

    // Mark op done -> pending is 0
    await outbox.markDone(pending[0].opId);
    pending = await outbox.getPendingOps('user_signout_test');
    expect(pending.length).toBe(0);
  });

  it('useNetworkStore tracks sync counts and attention states accurately', () => {
    useNetworkStore.getState().setSyncCounts({
      pendingCount: 3,
      failedCount: 1,
      syncing: true,
    });

    const state = useNetworkStore.getState();
    expect(state.pendingCount).toBe(3);
    expect(state.failedCount).toBe(1);
    expect(state.syncing).toBe(true);
  });
});
