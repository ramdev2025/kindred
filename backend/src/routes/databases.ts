import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import * as db from '../db/queries';
import {
  createDatabaseConnection,
  getDatabaseConnections,
  deleteDatabaseConnection,
  getDatabaseConnectionById,
} from '../db/sqlite';
import crypto from 'crypto';

export const databasesRouter = Router();
databasesRouter.use(requireAuth as any);

// Simple AES-256-CBC encryption
const ALGORITHM = 'aes-256-cbc';
function getEncryptionKey(): Buffer {
  const key = process.env.DB_ENCRYPTION_KEY || 'default-32-char-key-for-dev-only';
  return crypto.scryptSync(key, 'salt', 32);
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ── POST /api/databases/connect ──────────────────────────────────────────────
databasesRouter.post('/connect', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, provider, host, port, database_name, username, password, ssl_enabled = false } = req.body as {
      name: string; provider: string; host: string; port: number; database_name: string; username: string; password: string; ssl_enabled?: boolean;
    };

    if (!name || !provider || !host || !port || !database_name || !username || !password) {
      return res.status(400).json({ error: 'All connection fields are required' });
    }

    const user = await db.getUserByClerkId(req.clerkId!);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Test connection based on provider
    if (provider === 'postgres' || provider === 'supabase') {
      try {
        const { Pool } = await import('pg');
        const testPool = new Pool({
          host, port, database: database_name, user: username, password,
          ssl: ssl_enabled ? { rejectUnauthorized: false } : false,
          connectionTimeoutMillis: 5000,
        });
        const client = await testPool.connect();
        await client.query('SELECT 1');
        client.release();
        await testPool.end();
      } catch (connErr: any) {
        return res.status(400).json({ error: `Connection test failed: ${connErr.message}` });
      }
    } else if (provider === 'mysql') {
      // Basic TCP connectivity test for MySQL
      try {
        const net = await import('net');
        await new Promise<void>((resolve, reject) => {
          const socket = new net.Socket();
          socket.setTimeout(5000);
          socket.on('connect', () => { socket.destroy(); resolve(); });
          socket.on('timeout', () => { socket.destroy(); reject(new Error('Connection timeout')); });
          socket.on('error', (err) => { reject(err); });
          socket.connect(port, host);
        });
      } catch (connErr: any) {
        return res.status(400).json({ error: `Connection test failed: ${connErr.message}` });
      }
    } else if (provider === 'sqlite') {
      // For SQLite, verify the file path is accessible
      try {
        const BetterSqlite = (await import('better-sqlite3')).default;
        const testDb = new BetterSqlite(database_name, { readonly: true, fileMustExist: true });
        testDb.close();
      } catch (connErr: any) {
        // If file doesn't exist, that's okay — it'll be created on first use
        if (connErr.code !== 'SQLITE_CANTOPEN') {
          return res.status(400).json({ error: `SQLite connection test failed: ${connErr.message}` });
        }
      }
    }

    // Save connection to SQLite (persisted)
    const encryptedPassword = encrypt(password);
    const connection = createDatabaseConnection({
      userId: user.id,
      name,
      provider,
      host: provider === 'sqlite' ? 'local' : host,
      port: provider === 'sqlite' ? 0 : port,
      databaseName: database_name,
      username: provider === 'sqlite' ? 'sqlite' : username,
      encryptedPassword,
      sslEnabled: ssl_enabled,
    });

    // Return without password
    const { encrypted_password, ...safeConn } = connection as any;
    res.status(201).json({ connection: safeConn });
  } catch (err: any) {
    console.error('[Databases] connect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/databases ───────────────────────────────────────────────────────
databasesRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const conns = getDatabaseConnections(user.id)
      .map(({ encrypted_password, ...safe }: any) => safe);

    res.json({ connections: conns });
  } catch (err: any) {
    console.error('[Databases] list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/databases/:id ────────────────────────────────────────────────
databasesRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    if (!user) return res.status(401).json({ error: 'User not found' });

    deleteDatabaseConnection(req.params.id as string, user.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[Databases] delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/databases/:id/query ────────────────────────────────────────────
databasesRouter.post('/:id/query', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sql } = req.body as { sql: string };
    if (!sql) return res.status(400).json({ error: 'sql is required' });

    // Validate query starts with SELECT
    if (!sql.trim().toUpperCase().startsWith('SELECT')) {
      return res.status(400).json({ error: 'Only SELECT queries are allowed' });
    }

    const user = await db.getUserByClerkId(req.clerkId!);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const conn = getDatabaseConnectionById(req.params.id as string) as any;
    if (!conn || conn.user_id !== user.id) return res.status(404).json({ error: 'Connection not found' });

    const password = decrypt(conn.encrypted_password);

    if (conn.provider === 'postgres' || conn.provider === 'supabase') {
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: conn.host, port: conn.port, database: conn.database_name,
        user: conn.username, password,
        ssl: conn.ssl_enabled ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 10000,
      });

      const result = await pool.query(sql);
      await pool.end();

      res.json({ rows: result.rows, fields: result.fields.map((f) => f.name) });
    } else if (conn.provider === 'sqlite') {
      // Query the user's SQLite database file
      const BetterSqlite = (await import('better-sqlite3')).default;
      const userDb = new BetterSqlite(conn.database_name, { readonly: true });
      const stmt = userDb.prepare(sql);
      const rows = stmt.all();
      const columns = stmt.columns().map((c: any) => c.name);
      userDb.close();

      res.json({ rows, fields: columns });
    } else {
      return res.status(400).json({ error: `Query execution not supported for ${conn.provider}` });
    }
  } catch (err: any) {
    console.error('[Databases] query error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/databases/:id/schema ────────────────────────────────────────────
databasesRouter.get('/:id/schema', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const conn = getDatabaseConnectionById(req.params.id as string) as any;
    if (!conn || conn.user_id !== user.id) return res.status(404).json({ error: 'Connection not found' });

    const password = decrypt(conn.encrypted_password);

    if (conn.provider === 'postgres' || conn.provider === 'supabase') {
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: conn.host, port: conn.port, database: conn.database_name,
        user: conn.username, password,
        ssl: conn.ssl_enabled ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 10000,
      });

      const tablesResult = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
      );

      const tables = [];
      for (const row of tablesResult.rows) {
        const colsResult = await pool.query(
          "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
          [row.table_name]
        );
        tables.push({ table_name: row.table_name, columns: colsResult.rows });
      }

      await pool.end();
      res.json({ tables });
    } else if (conn.provider === 'sqlite') {
      // Introspect SQLite schema
      const BetterSqlite = (await import('better-sqlite3')).default;
      const userDb = new BetterSqlite(conn.database_name, { readonly: true });

      const tableRows = userDb.prepare(
        "SELECT name AS table_name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).all() as any[];

      const tables = [];
      for (const row of tableRows) {
        const colRows = userDb.prepare(`PRAGMA table_info('${row.table_name}')`).all() as any[];
        tables.push({
          table_name: row.table_name,
          columns: colRows.map((c: any) => ({
            column_name: c.name,
            data_type: c.type || 'TEXT',
            is_nullable: c.notnull ? 'NO' : 'YES',
          })),
        });
      }

      userDb.close();
      res.json({ tables });
    } else {
      return res.status(400).json({ error: `Schema introspection not supported for ${conn.provider}` });
    }
  } catch (err: any) {
    console.error('[Databases] schema error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
