import { Pool, QueryResult } from 'pg';
import { initSQLite, sqliteQuery, SQLiteQueryResult } from './sqlite';

let pool: Pool | null = null;
let pgAvailable = false;
let useSQLite = true; // Default to SQLite for users

export async function initDatabase(): Promise<void> {
  // Always initialize SQLite first — it's our primary store now
  try {
    initSQLite();
    useSQLite = true;
    console.log('[DB] SQLite initialized as primary user store');
  } catch (err: any) {
    console.error('[DB] SQLite initialization failed:', err.message);
    useSQLite = false;
  }

  // Optionally connect to PostgreSQL if DATABASE_URL is provided (for advanced features)
  if (process.env.DATABASE_URL) {
    try {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      const client = await pool.connect();
      try {
        await client.query('SELECT NOW()');
        pgAvailable = true;
        console.log('[DB] PostgreSQL connected (available for advanced queries)');
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.warn('[DB] PostgreSQL not available:', err.message);
      pgAvailable = false;
      pool = null;
    }
  }
}

export function isDatabaseAvailable(): boolean {
  return useSQLite || pgAvailable;
}

export function isPostgresAvailable(): boolean {
  return pgAvailable;
}

export function isSQLiteAvailable(): boolean {
  return useSQLite;
}

/**
 * Execute a query. Routes to SQLite (primary) or PostgreSQL (if available).
 * SQLite is used for users, projects, chat, and all core tables.
 * PostgreSQL is used only if explicitly available and needed.
 */
export function query(text: string, params?: any[]): Promise<QueryResult> {
  if (useSQLite) {
    // Route through SQLite
    try {
      const result = sqliteQuery(text, params);
      return Promise.resolve({
        rows: result.rows,
        rowCount: result.rowCount,
        command: result.command,
        oid: 0,
        fields: [],
      } as any);
    } catch (err: any) {
      // If SQLite query fails (e.g. unsupported syntax), try PostgreSQL or reject
      if (pgAvailable && pool) {
        return pool.query(text, params);
      }
      return Promise.reject(err);
    }
  }

  if (pgAvailable && pool) {
    return pool.query(text, params);
  }

  // Fallback: empty result
  return Promise.resolve({
    rows: [],
    rowCount: 0,
    command: 'SELECT',
    oid: 0,
    fields: [],
  } as any);
}

export function getPool(): Pool | null {
  return pool;
}
