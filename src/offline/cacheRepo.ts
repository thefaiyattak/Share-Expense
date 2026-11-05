import { localDb } from './localDb';
import { serialize, deserialize } from './serialize';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 8-second default network timeout for server fetch operations
 */
export const DEFAULT_SERVER_TIMEOUT_MS = 8000;

export function getUserScope(uid: string): string {
  return `user_${uid}`;
}

export function getTeamScope(uid: string, teamId: string): string {
  return `team_${uid}_${teamId}`;
}

/**
 * Wraps a promise with a timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_SERVER_TIMEOUT_MS,
  label: string = 'Server request timed out'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: any = setTimeout(() => {
      timer = null;
      reject(new Error(label));
    }, timeoutMs);

    promise
      .then(res => {
        if (timer) {
          clearTimeout(timer);
          resolve(res);
        }
      })
      .catch(err => {
        if (timer) {
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

class CacheRepository {
  private debounceTimers = new Map<string, any>();
  private migrated = false;

  /**
   * Saves a data snapshot into SQLite cache, with debouncing for high-frequency updates.
   */
  async saveSnapshot<T>(
    scope: string,
    key: string,
    data: T,
    debounceMs: number = 200
  ): Promise<void> {
    const cacheKey = `${scope}:${key}`;

    if (debounceMs <= 0) {
      const json = serialize(data);
      await localDb.setCache(scope, key, json);
      return;
    }

    if (this.debounceTimers.has(cacheKey)) {
      clearTimeout(this.debounceTimers.get(cacheKey));
    }

    return new Promise<void>((resolve) => {
      const timer = setTimeout(async () => {
        this.debounceTimers.delete(cacheKey);
        try {
          const json = serialize(data);
          await localDb.setCache(scope, key, json);
        } catch (e) {
          console.warn(`[CacheRepo] Failed to save snapshot for ${cacheKey}:`, e);
        }
        resolve();
      }, debounceMs);

      this.debounceTimers.set(cacheKey, timer);
    });
  }

  /**
   * Loads a cached data snapshot from SQLite, restoring Dates and Timestamps.
   */
  async loadSnapshot<T>(scope: string, key: string): Promise<T | null> {
    try {
      const row = await localDb.getCache(scope, key);
      if (!row || !row.json) return null;
      return deserialize<T>(row.json);
    } catch (e) {
      console.warn(`[CacheRepo] Failed to load snapshot for ${scope}:${key}:`, e);
      return null;
    }
  }

  /**
   * Tries to fetch fresh data from server with an 8s timeout.
   * On failure or timeout, falls back to the local SQLite cache.
   */
  async getCacheFirst<T>(
    scope: string,
    key: string,
    fetcher: () => Promise<T>,
    timeoutMs: number = DEFAULT_SERVER_TIMEOUT_MS
  ): Promise<T> {
    try {
      const freshData = await withTimeout(fetcher(), timeoutMs);
      // Asynchronously update cache
      this.saveSnapshot(scope, key, freshData, 0).catch(() => {});
      return freshData;
    } catch (networkError) {
      // Fallback to cache
      const cached = await this.loadSnapshot<T>(scope, key);
      if (cached !== null && cached !== undefined) {
        return cached;
      }
      throw networkError;
    }
  }

  /**
   * Migrates legacy AsyncStorage keys (@cached_app_user_*, @cached_user_teams_*, @personal_loans_*)
   * into localDb cache once.
   */
  async migrateLegacyAsyncStorage(uid: string, email?: string): Promise<void> {
    if (this.migrated || !uid) return;
    this.migrated = true;

    try {
      // 1. User profile cache
      if (email) {
        const legacyUserKey = `@cached_app_user_${email.toLowerCase().trim()}`;
        const rawUser = await AsyncStorage.getItem(legacyUserKey);
        if (rawUser) {
          const parsed = JSON.parse(rawUser);
          await this.saveSnapshot(getUserScope(uid), 'app_user', parsed, 0);
          await AsyncStorage.removeItem(legacyUserKey).catch(() => {});
        }
      }

      // 2. User teams cache
      if (email) {
        const legacyTeamsKey = `@cached_user_teams_${email.toLowerCase().trim()}`;
        const rawTeams = await AsyncStorage.getItem(legacyTeamsKey);
        if (rawTeams) {
          const parsed = JSON.parse(rawTeams);
          await this.saveSnapshot(getUserScope(uid), 'user_teams', parsed, 0);
          await AsyncStorage.removeItem(legacyTeamsKey).catch(() => {});
        }
      }

      // 3. Loans cache
      const legacyLoansKey = `@personal_loans_${uid}`;
      const rawLoans = await AsyncStorage.getItem(legacyLoansKey);
      if (rawLoans) {
        const parsed = JSON.parse(rawLoans);
        await this.saveSnapshot(getUserScope(uid), 'loans', parsed, 0);
        await AsyncStorage.removeItem(legacyLoansKey).catch(() => {});
      }
    } catch (e) {
      console.warn('[CacheRepo] Migration of legacy AsyncStorage data failed:', e);
    }
  }

  /**
   * Checks whether an incoming onSnapshot should be ignored.
   * Protects against empty cache snapshots wiping the UI when offline.
   */
  shouldIgnoreSnapshot(snapshot: any, currentItemCount: number): boolean {
    const isFromCache = Boolean(snapshot?.metadata?.fromCache);
    const isEmpty = snapshot?.empty || (Array.isArray(snapshot?.docs) && snapshot.docs.length === 0);
    // If incoming snapshot is from local cache, has 0 docs, but we already have items in store/cache:
    // IGNORE IT to avoid wiping the user's screen!
    if (isFromCache && isEmpty && currentItemCount > 0) {
      return true;
    }
    return false;
  }
}

export const cacheRepo = new CacheRepository();
