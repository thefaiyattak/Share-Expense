import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDatabase, MemoryDatabaseDriver } from './localDb';

describe('LocalDatabase', () => {
  let db: LocalDatabase;

  beforeEach(() => {
    db = new LocalDatabase(new MemoryDatabaseDriver());
  });

  describe('Cache Table', () => {
    it('sets and retrieves cache entries by scope and key', async () => {
      await db.setCache('expenses_team1', 'list', JSON.stringify([{ id: 'exp_1', amount: 500 }]));
      const entry = await db.getCache('expenses_team1', 'list');

      expect(entry).not.toBeNull();
      expect(entry?.scope).toBe('expenses_team1');
      expect(entry?.key).toBe('list');
      expect(JSON.parse(entry!.json)).toEqual([{ id: 'exp_1', amount: 500 }]);
      expect(entry?.updatedAt).toBeGreaterThan(0);
    });

    it('returns null for missing cache entries', async () => {
      const entry = await db.getCache('unknown_scope', 'key');
      expect(entry).toBeNull();
    });

    it('overwrites existing cache entries with setCache', async () => {
      await db.setCache('user_1', 'profile', JSON.stringify({ name: 'Old' }));
      await db.setCache('user_1', 'profile', JSON.stringify({ name: 'New' }));

      const entry = await db.getCache('user_1', 'profile');
      expect(JSON.parse(entry!.json)).toEqual({ name: 'New' });
    });

    it('deletes specific cache key or entire scope', async () => {
      await db.setCache('scopeA', 'key1', '1');
      await db.setCache('scopeA', 'key2', '2');

      await db.deleteCache('scopeA', 'key1');
      expect(await db.getCache('scopeA', 'key1')).toBeNull();
      expect(await db.getCache('scopeA', 'key2')).not.toBeNull();

      await db.deleteCache('scopeA');
      expect(await db.getCache('scopeA', 'key2')).toBeNull();
    });
  });

  describe('Outbox Table', () => {
    it('inserts, lists, and updates outbox ops', async () => {
      const id1 = await db.insertOutbox({
        opId: 'op_1',
        uid: 'user_A',
        teamId: 'team_1',
        type: 'addExpense',
        payload: JSON.stringify({ name: 'Lunch' }),
        status: 'pending',
        attempts: 0,
        nextAttemptAt: 0,
        createdAt: Date.now(),
      });
      expect(id1).toBeGreaterThan(0);

      const pending = await db.getPendingOutbox('user_A');
      expect(pending).toHaveLength(1);
      expect(pending[0].opId).toBe('op_1');
      expect(pending[0].status).toBe('pending');

      await db.updateOutboxStatus('op_1', 'syncing', { attempts: 1 });
      const pendingAfter = await db.getPendingOutbox('user_A');
      expect(pendingAfter[0].status).toBe('syncing');

      await db.deleteOutbox('op_1');
      const emptyPending = await db.getPendingOutbox('user_A');
      expect(emptyPending).toHaveLength(0);
    });

    it('scopes outbox rows by uid', async () => {
      await db.insertOutbox({
        opId: 'op_A',
        uid: 'user_A',
        teamId: 'team_1',
        type: 'addExpense',
        payload: '{}',
        status: 'pending',
        attempts: 0,
        nextAttemptAt: 0,
        createdAt: Date.now(),
      });

      await db.insertOutbox({
        opId: 'op_B',
        uid: 'user_B',
        teamId: 'team_1',
        type: 'addExpense',
        payload: '{}',
        status: 'pending',
        attempts: 0,
        nextAttemptAt: 0,
        createdAt: Date.now(),
      });

      const userAOps = await db.getAllOutbox('user_A');
      const userBOps = await db.getAllOutbox('user_B');

      expect(userAOps).toHaveLength(1);
      expect(userAOps[0].opId).toBe('op_A');

      expect(userBOps).toHaveLength(1);
      expect(userBOps[0].opId).toBe('op_B');

      await db.clearOutboxForUser('user_A');
      expect(await db.getAllOutbox('user_A')).toHaveLength(0);
      expect(await db.getAllOutbox('user_B')).toHaveLength(1);
    });
  });
});
