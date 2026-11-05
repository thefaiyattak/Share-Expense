import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cacheRepo, getUserScope, getTeamScope, withTimeout } from './cacheRepo';
import { localDb, MemoryDatabaseDriver } from './localDb';

describe('cacheRepo', () => {
  beforeEach(() => {
    localDb.setDriver(new MemoryDatabaseDriver());
  });

  describe('fromCache-empty guard (shouldIgnoreSnapshot)', () => {
    it('ignores an empty snapshot from cache when we already hold cached items', () => {
      const snap = {
        metadata: { fromCache: true },
        docs: [],
        empty: true,
      };
      // We already hold 15 expenses in memory
      const shouldIgnore = cacheRepo.shouldIgnoreSnapshot(snap, 15);
      expect(shouldIgnore).toBe(true);
    });

    it('does NOT ignore an empty snapshot from cache if we hold 0 items (fresh load)', () => {
      const snap = {
        metadata: { fromCache: true },
        docs: [],
        empty: true,
      };
      const shouldIgnore = cacheRepo.shouldIgnoreSnapshot(snap, 0);
      expect(shouldIgnore).toBe(false);
    });

    it('does NOT ignore a snapshot from the server even if empty (real server deletion)', () => {
      const snap = {
        metadata: { fromCache: false },
        docs: [],
        empty: true,
      };
      const shouldIgnore = cacheRepo.shouldIgnoreSnapshot(snap, 10);
      expect(shouldIgnore).toBe(false);
    });

    it('does NOT ignore a snapshot from cache if it contains docs', () => {
      const snap = {
        metadata: { fromCache: true },
        docs: [{ id: 'doc_1' }],
        empty: false,
      };
      const shouldIgnore = cacheRepo.shouldIgnoreSnapshot(snap, 10);
      expect(shouldIgnore).toBe(false);
    });
  });

  describe('cache round trip with dates and timestamps', () => {
    it('saves and loads snapshots restoring Date objects', async () => {
      const scope = getTeamScope('u1', 'team1');
      const items = [
        {
          id: 'exp_1',
          name: 'Lunch',
          price: 650,
          date: new Date('2026-11-05T12:00:00.000Z'),
          createdAt: new Date('2026-11-05T12:01:00.000Z'),
        },
      ];

      await cacheRepo.saveSnapshot(scope, 'expenses', items, 0);
      const loaded = await cacheRepo.loadSnapshot<typeof items>(scope, 'expenses');

      expect(loaded).toHaveLength(1);
      expect(loaded![0].id).toBe('exp_1');
      expect(loaded![0].date).toBeInstanceOf(Date);
      expect(loaded![0].date.toISOString()).toBe('2026-11-05T12:00:00.000Z');
      expect(loaded![0].createdAt).toBeInstanceOf(Date);
    });
  });

  describe('getCacheFirst & withTimeout', () => {
    it('returns fresh data when server succeeds and updates cache', async () => {
      const scope = getUserScope('u1');
      const fetcher = vi.fn().mockResolvedValue({ id: 'u1', name: 'Munir' });

      const res = await cacheRepo.getCacheFirst(scope, 'profile', fetcher, 1000);
      expect(res).toEqual({ id: 'u1', name: 'Munir' });
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Verify cached
      const cached = await cacheRepo.loadSnapshot(scope, 'profile');
      expect(cached).toEqual({ id: 'u1', name: 'Munir' });
    });

    it('falls back to cache when server request rejects', async () => {
      const scope = getUserScope('u2');
      // Prepopulate cache
      await cacheRepo.saveSnapshot(scope, 'profile', { id: 'u2', name: 'Cached Name' }, 0);

      const failingFetcher = vi.fn().mockRejectedValue(new Error('Network error (offline)'));

      const res = await cacheRepo.getCacheFirst(scope, 'profile', failingFetcher, 1000);
      expect(res).toEqual({ id: 'u2', name: 'Cached Name' });
    });

    it('falls back to cache when server request times out', async () => {
      const scope = getUserScope('u3');
      await cacheRepo.saveSnapshot(scope, 'profile', { id: 'u3', name: 'Cached On Timeout' }, 0);

      // Simulate a hanging network request
      const hangingFetcher = () => new Promise<any>((resolve) => setTimeout(resolve, 5000));

      const res = await cacheRepo.getCacheFirst(scope, 'profile', hangingFetcher, 50);
      expect(res).toEqual({ id: 'u3', name: 'Cached On Timeout' });
    });

    it('throws error when server fails and cache is empty', async () => {
      const scope = getUserScope('u4');
      const failingFetcher = vi.fn().mockRejectedValue(new Error('Server unavailable'));

      await expect(cacheRepo.getCacheFirst(scope, 'profile', failingFetcher, 500)).rejects.toThrow('Server unavailable');
    });
  });

  describe('hydrate-then-listener ordering', () => {
    it('hydrates store from cache before snapshot listener emits', async () => {
      const scope = getTeamScope('u1', 'team1');
      await cacheRepo.saveSnapshot(scope, 'expenses', [{ id: 'cached_1', price: 100 }], 0);

      const storeState: any[] = [];
      const setExpenses = (items: any[]) => {
        storeState.length = 0;
        storeState.push(...items);
      };

      // 1. Hydrate from cache FIRST
      const initial = await cacheRepo.loadSnapshot<any[]>(scope, 'expenses');
      if (initial) {
        setExpenses(initial);
      }
      expect(storeState).toEqual([{ id: 'cached_1', price: 100 }]);

      // 2. Incoming empty cache snapshot is ignored
      const snapFromCacheEmpty = { metadata: { fromCache: true }, docs: [] };
      if (!cacheRepo.shouldIgnoreSnapshot(snapFromCacheEmpty, storeState.length)) {
        setExpenses([]);
      }
      // Data remains intact!
      expect(storeState).toEqual([{ id: 'cached_1', price: 100 }]);

      // 3. Incoming fresh server snapshot updates store
      const snapFromServer = { metadata: { fromCache: false }, docs: [{ id: 'server_1', price: 200 }] };
      if (!cacheRepo.shouldIgnoreSnapshot(snapFromServer, storeState.length)) {
        setExpenses([{ id: 'server_1', price: 200 }]);
      }
      expect(storeState).toEqual([{ id: 'server_1', price: 200 }]);
    });
  });
});
