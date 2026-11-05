/**
 * SQLite Local Database Wrapper for Offline Storage & Sync Queue
 *
 * Tables:
 * 1. cache(scope TEXT, key TEXT, json TEXT, updatedAt INTEGER, PRIMARY KEY(scope, key))
 * 2. outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, opId TEXT UNIQUE, uid TEXT, teamId TEXT,
 *           type TEXT, payload TEXT, status TEXT, attempts INTEGER, nextAttemptAt INTEGER,
 *           lastError TEXT, createdAt INTEGER)
 *
 * Migration Version: 1
 */

export interface CacheRow {
  scope: string;
  key: string;
  json: string;
  updatedAt: number;
}

export type OutboxStatus = 'pending' | 'syncing' | 'failed' | 'done';

export interface OutboxRow {
  seq?: number;
  opId: string;
  uid: string;
  teamId: string;
  type: string;
  payload: string; // JSON serialized
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string | null;
  createdAt: number;
}

export interface IDatabaseDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: any[]): Promise<{ lastInsertRowId?: number; changes?: number }>;
  getAll<T = any>(sql: string, params?: any[]): Promise<T[]>;
  getFirst<T = any>(sql: string, params?: any[]): Promise<T | null>;
}

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Memory SQLite driver for testing or environments where native SQLite is unavailable.
 */
export class MemoryDatabaseDriver implements IDatabaseDriver {
  private cache = new Map<string, CacheRow>();
  private outbox: OutboxRow[] = [];
  private seqCounter = 1;

  async exec(sql: string): Promise<void> {
    // No-op for in-memory tables
  }

  async run(sql: string, params: any[] = []): Promise<{ lastInsertRowId?: number; changes?: number }> {
    const s = sql.trim().toUpperCase();

    if (s.startsWith('INSERT OR REPLACE INTO CACHE') || s.startsWith('INSERT INTO CACHE')) {
      const [scope, key, json, updatedAt] = params;
      this.cache.set(`${scope}:${key}`, { scope, key, json, updatedAt });
      return { changes: 1 };
    }

    if (s.startsWith('DELETE FROM CACHE')) {
      if (params.length === 2) {
        const [scope, key] = params;
        this.cache.delete(`${scope}:${key}`);
      } else if (params.length === 1) {
        const [scope] = params;
        for (const k of Array.from(this.cache.keys())) {
          if (k.startsWith(`${scope}:`)) this.cache.delete(k);
        }
      }
      return { changes: 1 };
    }

    if (s.startsWith('INSERT INTO OUTBOX')) {
      const [opId, uid, teamId, type, payload, status, attempts, nextAttemptAt, lastError, createdAt] = params;
      const seq = this.seqCounter++;
      this.outbox.push({
        seq,
        opId,
        uid,
        teamId,
        type,
        payload,
        status,
        attempts,
        nextAttemptAt,
        lastError,
        createdAt,
      });
      return { lastInsertRowId: seq, changes: 1 };
    }

    if (s.startsWith('UPDATE OUTBOX')) {
      if (s.includes("SET STATUS = 'PENDING'")) {
        for (const row of this.outbox) {
          if (row.status === 'syncing') {
            if (params.length === 1) {
              if (row.uid === params[0]) row.status = 'pending';
            } else {
              row.status = 'pending';
            }
          }
        }
        return { changes: 1 };
      }

      if (s.includes('STATUS = ?')) {
        const opId = params[params.length - 1];
        const row = this.outbox.find(r => r.opId === opId);
        if (row) {
          row.status = params[0];
          if (params.length > 2 && typeof params[1] === 'number') {
            row.attempts = params[1];
          }
          if (params.length > 3 && typeof params[2] === 'number') {
            row.nextAttemptAt = params[2];
          }
          if (params.length > 4) {
            row.lastError = params[3];
          }
        }
      }
      return { changes: 1 };
    }

    if (s.startsWith('DELETE FROM OUTBOX')) {
      if (params.length === 1 && s.includes('OPID = ?')) {
        const [opId] = params;
        this.outbox = this.outbox.filter(r => r.opId !== opId);
      } else if (params.length === 1 && s.includes('UID = ?')) {
        const [uid] = params;
        this.outbox = this.outbox.filter(r => r.uid !== uid);
      }
      return { changes: 1 };
    }

    return { changes: 0 };
  }

  async getAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const s = sql.trim().toUpperCase();

    if (s.startsWith('SELECT * FROM CACHE')) {
      const [scope] = params;
      const result: CacheRow[] = [];
      for (const [k, v] of this.cache.entries()) {
        if (k.startsWith(`${scope}:`)) {
          result.push(v);
        }
      }
      return result as unknown as T[];
    }

    if (s.startsWith('SELECT * FROM OUTBOX')) {
      if (params.length === 1 && s.includes('UID = ?') && !s.includes('STATUS')) {
        const [uid] = params;
        return this.outbox.filter(r => r.uid === uid) as unknown as T[];
      }
      if (s.includes('UID = ?') && s.includes('STATUS IN')) {
        const uid = params[0];
        return this.outbox
          .filter(r => r.uid === uid && (r.status === 'pending' || r.status === 'syncing'))
          .sort((a, b) => (a.seq || 0) - (b.seq || 0)) as unknown as T[];
      }
    }

    return [] as T[];
  }

  async getFirst<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const s = sql.trim().toUpperCase();

    if (s.startsWith('SELECT * FROM CACHE')) {
      const [scope, key] = params;
      const row = this.cache.get(`${scope}:${key}`);
      return (row || null) as unknown as T;
    }

    if (s.startsWith('SELECT * FROM OUTBOX WHERE OPID = ?')) {
      const [opId] = params;
      const row = this.outbox.find(r => r.opId === opId);
      return (row || null) as unknown as T;
    }

    return null;
  }
}

/**
 * Native driver backed by expo-sqlite.
 */
class ExpoSQLiteDriver implements IDatabaseDriver {
  private db: any = null;

  async getDb(): Promise<any> {
    if (!this.db) {
      // Lazy load to prevent Node test crashes
      const SQLite = await import('expo-sqlite');
      this.db = await SQLite.openDatabaseAsync('share_expense_offline.db');
    }
    return this.db;
  }

  async exec(sql: string): Promise<void> {
    const db = await this.getDb();
    await db.execAsync(sql);
  }

  async run(sql: string, params: any[] = []): Promise<{ lastInsertRowId?: number; changes?: number }> {
    const db = await this.getDb();
    const res = await db.runAsync(sql, params);
    return {
      lastInsertRowId: res?.lastInsertRowId,
      changes: res?.changes,
    };
  }

  async getAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const db = await this.getDb();
    return await db.getAllAsync(sql, params);
  }

  async getFirst<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const db = await this.getDb();
    return await db.getFirstAsync(sql, params);
  }
}

export class LocalDatabase {
  private driver: IDatabaseDriver;
  private initialized = false;

  constructor(driver?: IDatabaseDriver) {
    if (driver) {
      this.driver = driver;
    } else {
      // Default to memory driver in Node (e.g. tests), and Expo driver on devices
      const isNode = typeof process !== 'undefined' && process.versions && process.versions.node && !process.env.EXPO_OS;
      this.driver = isNode ? new MemoryDatabaseDriver() : new ExpoSQLiteDriver();
    }
  }

  setDriver(driver: IDatabaseDriver) {
    this.driver = driver;
    this.initialized = false;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    await this.driver.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS cache (
        scope TEXT NOT NULL,
        key TEXT NOT NULL,
        json TEXT NOT NULL,
        updatedAt INTEGER NOT NULL,
        PRIMARY KEY (scope, key)
      );

      CREATE TABLE IF NOT EXISTS outbox (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        opId TEXT NOT NULL UNIQUE,
        uid TEXT NOT NULL,
        teamId TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        nextAttemptAt INTEGER NOT NULL DEFAULT 0,
        lastError TEXT,
        createdAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_outbox_uid_status ON outbox(uid, status);
      CREATE INDEX IF NOT EXISTS idx_outbox_nextAttemptAt ON outbox(nextAttemptAt);
    `);

    this.initialized = true;
  }

  // CACHE METHODS
  async getCache(scope: string, key: string): Promise<CacheRow | null> {
    await this.init();
    return this.driver.getFirst<CacheRow>(
      'SELECT * FROM cache WHERE scope = ? AND key = ?',
      [scope, key]
    );
  }

  async setCache(scope: string, key: string, json: string): Promise<void> {
    await this.init();
    const now = Date.now();
    await this.driver.run(
      'INSERT OR REPLACE INTO cache (scope, key, json, updatedAt) VALUES (?, ?, ?, ?)',
      [scope, key, json, now]
    );
  }

  async deleteCache(scope: string, key?: string): Promise<void> {
    await this.init();
    if (key) {
      await this.driver.run('DELETE FROM cache WHERE scope = ? AND key = ?', [scope, key]);
    } else {
      await this.driver.run('DELETE FROM cache WHERE scope = ?', [scope]);
    }
  }

  async clearCacheForUser(uid: string): Promise<void> {
    await this.init();
    // Cache scopes for user start with user_${uid} or team data cached by this user
    await this.driver.run('DELETE FROM cache WHERE scope LIKE ?', [`%${uid}%`]);
  }

  async clearAllCache(): Promise<void> {
    await this.init();
    await this.driver.run('DELETE FROM cache');
  }

  async getCacheCount(): Promise<number> {
    await this.init();
    const rows = await this.driver.getAll('SELECT scope FROM cache');
    return rows.length;
  }

  // OUTBOX METHODS
  async insertOutbox(row: Omit<OutboxRow, 'seq'>): Promise<number> {
    await this.init();
    const res = await this.driver.run(
      `INSERT INTO outbox (opId, uid, teamId, type, payload, status, attempts, nextAttemptAt, lastError, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.opId,
        row.uid,
        row.teamId,
        row.type,
        row.payload,
        row.status,
        row.attempts,
        row.nextAttemptAt,
        row.lastError ?? null,
        row.createdAt,
      ]
    );
    return res.lastInsertRowId || 0;
  }

  async getPendingOutbox(uid: string): Promise<OutboxRow[]> {
    await this.init();
    return this.driver.getAll<OutboxRow>(
      `SELECT * FROM outbox WHERE uid = ? AND status IN ('pending', 'syncing') ORDER BY seq ASC`,
      [uid]
    );
  }

  async getAllOutbox(uid: string): Promise<OutboxRow[]> {
    await this.init();
    return this.driver.getAll<OutboxRow>(
      'SELECT * FROM outbox WHERE uid = ? ORDER BY seq ASC',
      [uid]
    );
  }

  async updateOutboxStatus(
    opId: string,
    status: OutboxStatus,
    updates: { attempts?: number; nextAttemptAt?: number; lastError?: string | null } = {}
  ): Promise<void> {
    await this.init();
    await this.driver.run(
      `UPDATE outbox SET status = ?, attempts = COALESCE(?, attempts), nextAttemptAt = COALESCE(?, nextAttemptAt), lastError = ? WHERE opId = ?`,
      [status, updates.attempts ?? null, updates.nextAttemptAt ?? null, updates.lastError ?? null, opId]
    );
  }

  async deleteOutbox(opId: string): Promise<void> {
    await this.init();
    await this.driver.run('DELETE FROM outbox WHERE opId = ?', [opId]);
  }

  async clearOutboxForUser(uid: string): Promise<void> {
    await this.init();
    await this.driver.run('DELETE FROM outbox WHERE uid = ?', [uid]);
  }

  async resetSyncingToPending(uid?: string): Promise<void> {
    await this.init();
    if (uid) {
      await this.driver.run(
        `UPDATE outbox SET status = 'pending' WHERE uid = ? AND status = 'syncing'`,
        [uid]
      );
    } else {
      await this.driver.run(
        `UPDATE outbox SET status = 'pending' WHERE status = 'syncing'`
      );
    }
  }
}

export const localDb = new LocalDatabase();
