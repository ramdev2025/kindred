/**
 * SQLite-backed cache — zero-dependency replacement for Redis.
 *
 * Uses the existing SQLite database with a dedicated `cache_entries` table.
 * TTL is enforced on read (expired entries are deleted lazily).
 * A periodic sweep removes stale entries to prevent unbounded growth.
 *
 * This provides persistent caching that survives server restarts,
 * unlike the previous Redis-based approach that was effectively optional.
 */
import { getSQLite } from '../db/sqlite';

let initialized = false;

function ensureCacheTable() {
  if (initialized) return;
  const db = getSQLite();
  db.exec(`
    CREATE TABLE IF NOT EXISTS cache_entries (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_entries(expires_at);
  `);
  initialized = true;
}

// ── Periodic cleanup (every 5 minutes) ──────────────────────────────────────
let sweepInterval: ReturnType<typeof setInterval> | null = null;

export function startCacheSweep(intervalMs = 300_000) {
  if (sweepInterval) return;
  sweepInterval = setInterval(() => {
    try {
      const db = getSQLite();
      const now = Math.floor(Date.now() / 1000);
      const info = db.prepare('DELETE FROM cache_entries WHERE expires_at < ?').run(now);
      if ((info.changes as number) > 0) {
        console.log(`[Cache] Swept ${info.changes} expired entries`);
      }
    } catch { /* ignore sweep failures */ }
  }, intervalMs);
  sweepInterval.unref(); // Don't keep the process alive for cleanup
}

// ── Public API (same signatures as the old Redis-backed module) ─────────────

const DEFAULT_TTL = 3600; // 1 hour in seconds

/**
 * Initialize the cache system. Called during server startup.
 * Replaces the old `initRedis()` — always succeeds since it uses SQLite.
 */
export async function initCache(): Promise<void> {
  try {
    ensureCacheTable();
    startCacheSweep();
    console.log('[Cache] SQLite-backed cache initialized');
  } catch (err: any) {
    console.warn('[Cache] Failed to initialize:', err.message);
  }
}

export async function getCached(key: string): Promise<string | null> {
  try {
    ensureCacheTable();
    const db = getSQLite();
    const now = Math.floor(Date.now() / 1000);
    const row = db.prepare('SELECT value, expires_at FROM cache_entries WHERE key = ?').get(`cache:${key}`) as
      | { value: string; expires_at: number }
      | undefined;

    if (!row) return null;

    // Lazy expiration check
    if (row.expires_at < now) {
      db.prepare('DELETE FROM cache_entries WHERE key = ?').run(`cache:${key}`);
      return null;
    }

    return row.value;
  } catch {
    return null;
  }
}

export async function setCache(key: string, value: string, ttl = DEFAULT_TTL): Promise<void> {
  try {
    ensureCacheTable();
    const db = getSQLite();
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;
    db.prepare(
      'INSERT OR REPLACE INTO cache_entries (key, value, expires_at) VALUES (?, ?, ?)'
    ).run(`cache:${key}`, value, expiresAt);
  } catch {
    // Silently ignore cache write failures
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  try {
    ensureCacheTable();
    const db = getSQLite();
    // SQLite LIKE for simple wildcard patterns (convert Redis-style * to %)
    const likePattern = `cache:${pattern.replace(/\*/g, '%')}`;
    db.prepare('DELETE FROM cache_entries WHERE key LIKE ?').run(likePattern);
  } catch {
    // Silently ignore
  }
}

export function buildCacheKey(parts: string[]): string {
  return parts.join(':');
}

/** Backwards-compat: always returns true since SQLite is always available */
export function isRedisAvailable(): boolean {
  return true;
}
