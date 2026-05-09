import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

let db: Database.Database | null = null;

/**
 * Initialize SQLite database for the users table and related lightweight data.
 * The .db file is stored alongside the backend source for simplicity.
 */
export function initSQLite(): Database.Database {
  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '..', '..', 'data', 'kindred.db');

  // Ensure the data directory exists
  const dir = path.dirname(dbPath);
  const fs = require('fs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      clerk_id TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      theme_preference TEXT DEFAULT 'dark',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      tech_stack TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active',
      e2b_sandbox_id TEXT,
      preview_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT DEFAULT 'New Chat',
      model_preference TEXT DEFAULT 'auto',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      model_used TEXT,
      tokens_used INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage_stats (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      model TEXT NOT NULL,
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      cost_cents REAL DEFAULT 0,
      request_type TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mcp_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      transport TEXT DEFAULT 'http',
      auth_config TEXT DEFAULT '{}',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TEXT,
      scopes TEXT DEFAULT '[]',
      raw_response TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, provider)
    );

    CREATE TABLE IF NOT EXISTS database_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      database_name TEXT NOT NULL,
      username TEXT NOT NULL,
      encrypted_password TEXT NOT NULL,
      ssl_enabled INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id),
      provider TEXT NOT NULL,
      url TEXT,
      status TEXT DEFAULT 'pending',
      config TEXT DEFAULT '{}',
      logs TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS session_summaries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      summary_text TEXT NOT NULL,
      summarized_up_to TEXT,
      tokens_in_summary INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER DEFAULT 0,
      blob_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_quotas (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'team', 'enterprise')),
      monthly_token_limit INTEGER DEFAULT 50000,
      monthly_tokens_used INTEGER DEFAULT 0,
      daily_sandbox_limit INTEGER DEFAULT 3,
      daily_sandboxes_used INTEGER DEFAULT 0,
      max_projects INTEGER DEFAULT 5,
      billing_cycle_start TEXT DEFAULT (datetime('now')),
      last_reset_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'general',
      tech_stack TEXT DEFAULT '[]',
      files TEXT DEFAULT '{}',
      thumbnail_url TEXT,
      author_id TEXT REFERENCES users(id),
      is_public INTEGER DEFAULT 1,
      is_builtin INTEGER DEFAULT 1,
      use_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_project_id ON chat_sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_usage_stats_user_id ON usage_stats(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_stats_created_at ON usage_stats(created_at);
    CREATE INDEX IF NOT EXISTS idx_mcp_connections_user_id ON mcp_connections(user_id);
    CREATE INDEX IF NOT EXISTS idx_database_connections_user_id ON database_connections(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_quotas_user_id ON user_quotas(user_id);
    CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
    CREATE INDEX IF NOT EXISTS idx_templates_is_public ON templates(is_public);
  `);

  console.log('[SQLite] Database initialized at', dbPath);
  return db;
}

export function getSQLite(): Database.Database {
  if (!db) {
    return initSQLite();
  }
  return db;
}

// ── Query helpers (mimics pg.Pool interface) ─────────────────────────────────

export interface SQLiteQueryResult {
  rows: any[];
  rowCount: number;
  command: string;
}

/**
 * Execute a parameterized SQL query against the SQLite database.
 * Translates PostgreSQL-style `$1, $2` placeholders to SQLite `?, ?` style,
 * and crucially reorders the params array to match sequential `?` binding order.
 * (PostgreSQL $N is positional — $1 always maps to params[0] regardless of position.
 *  SQLite ? is sequential — first ? maps to first param in the array.)
 */
export function sqliteQuery(text: string, params?: any[]): SQLiteQueryResult {
  const sqlite = getSQLite();

  // Convert PostgreSQL $N placeholders → SQLite ? placeholders
  // AND reorder params to match the order $N appears in the SQL text
  let convertedText = text;
  let reorderedParams = params;

  if (params && params.length > 0) {
    // Extract the order of $N placeholders as they appear in the SQL
    const placeholderOrder: number[] = [];
    const placeholderRegex = /\$(\d+)/g;
    let match: RegExpExecArray | null;
    while ((match = placeholderRegex.exec(text)) !== null) {
      placeholderOrder.push(parseInt(match[1], 10));
    }

    // Replace all $N with ?
    convertedText = text.replace(/\$(\d+)/g, '?');

    // Reorder params: for each ? (in order), pick params[$N - 1]
    reorderedParams = placeholderOrder.map((n) => params[n - 1]);
  }

  const trimmed = convertedText.trim().toLowerCase();

  // Handle INSERT/UPDATE/DELETE (write operations)
  if (trimmed.startsWith('insert') || trimmed.startsWith('update') || trimmed.startsWith('delete')) {
    // Check if there's a RETURNING clause
    const hasReturning = /returning\s+/i.test(convertedText);

    if (hasReturning) {
      // SQLite supports RETURNING in v3.35+, but better-sqlite3 needs .all() for it
      try {
        const stmt = sqlite.prepare(convertedText);
        const rows = stmt.all(...(reorderedParams || []));
        return { rows, rowCount: rows.length, command: trimmed.startsWith('insert') ? 'INSERT' : trimmed.startsWith('update') ? 'UPDATE' : 'DELETE' };
      } catch {
        // Fallback: strip RETURNING and use run()
        const cleanedText = convertedText.replace(/\s+RETURNING\s+.*/i, '');
        const stmt = sqlite.prepare(cleanedText);
        const info = stmt.run(...(reorderedParams || []));
        return { rows: [], rowCount: info.changes, command: trimmed.startsWith('insert') ? 'INSERT' : trimmed.startsWith('update') ? 'UPDATE' : 'DELETE' };
      }
    } else {
      const stmt = sqlite.prepare(convertedText);
      const info = stmt.run(...(reorderedParams || []));
      return { rows: [], rowCount: info.changes, command: trimmed.startsWith('insert') ? 'INSERT' : trimmed.startsWith('update') ? 'UPDATE' : 'DELETE' };
    }
  }

  // Handle SELECT and other read operations
  const stmt = sqlite.prepare(convertedText);
  const rows = stmt.all(...(reorderedParams || []));
  return { rows, rowCount: rows.length, command: 'SELECT' };
}

// ── Convenience helpers for user operations ──────────────────────────────────

export function findOrCreateUserSQLite(clerkId: string, email: string, displayName?: string) {
  const sqlite = getSQLite();

  const existing = sqlite.prepare('SELECT * FROM users WHERE clerk_id = ?').get(clerkId);
  if (existing) return existing;

  const id = uuidv4();
  const name = displayName || email.split('@')[0];
  const now = new Date().toISOString();

  sqlite.prepare(
    'INSERT INTO users (id, clerk_id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, clerkId, email, name, now, now);

  return sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function getUserByClerkIdSQLite(clerkId: string) {
  const sqlite = getSQLite();
  return sqlite.prepare('SELECT * FROM users WHERE clerk_id = ?').get(clerkId) || null;
}

export function updateUserThemeSQLite(clerkId: string, theme: string) {
  const sqlite = getSQLite();
  sqlite.prepare('UPDATE users SET theme_preference = ?, updated_at = datetime("now") WHERE clerk_id = ?').run(theme, clerkId);
}

// ── Database connections CRUD (persisted in SQLite) ──────────────────────────

export function createDatabaseConnection(data: {
  userId: string;
  name: string;
  provider: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  encryptedPassword: string;
  sslEnabled: boolean;
}) {
  const sqlite = getSQLite();
  const id = uuidv4();
  const now = new Date().toISOString();

  sqlite.prepare(`
    INSERT INTO database_connections (id, user_id, name, provider, host, port, database_name, username, encrypted_password, ssl_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.userId, data.name, data.provider, data.host, data.port, data.databaseName, data.username, data.encryptedPassword, data.sslEnabled ? 1 : 0, now, now);

  return sqlite.prepare('SELECT * FROM database_connections WHERE id = ?').get(id);
}

export function getDatabaseConnections(userId: string) {
  const sqlite = getSQLite();
  return sqlite.prepare('SELECT * FROM database_connections WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC').all(userId);
}

export function deleteDatabaseConnection(connId: string, userId: string) {
  const sqlite = getSQLite();
  sqlite.prepare('DELETE FROM database_connections WHERE id = ? AND user_id = ?').run(connId, userId);
}

export function getDatabaseConnectionById(connId: string) {
  const sqlite = getSQLite();
  return sqlite.prepare('SELECT * FROM database_connections WHERE id = ?').get(connId) || null;
}

// ── User Quotas (Phase 6.1) ─────────────────────────────────────────────────

export interface QuotaInfo {
  tier: string;
  monthly_token_limit: number;
  monthly_tokens_used: number;
  daily_sandbox_limit: number;
  daily_sandboxes_used: number;
  max_projects: number;
  billing_cycle_start: string;
  last_reset_at: string;
}

const TIER_LIMITS = {
  free:       { tokens: 50_000,   sandboxes: 3,  projects: 5  },
  pro:        { tokens: 500_000,  sandboxes: 20, projects: 50 },
  team:       { tokens: 2_000_000, sandboxes: 50, projects: 200 },
  enterprise: { tokens: -1,       sandboxes: -1, projects: -1 }, // unlimited
} as const;

export function getOrCreateQuota(userId: string): QuotaInfo {
  const sqlite = getSQLite();
  let quota = sqlite.prepare('SELECT * FROM user_quotas WHERE user_id = ?').get(userId) as any;

  if (!quota) {
    const id = uuidv4();
    const now = new Date().toISOString();
    sqlite.prepare(
      `INSERT INTO user_quotas (id, user_id, tier, monthly_token_limit, monthly_tokens_used, daily_sandbox_limit, daily_sandboxes_used, max_projects, billing_cycle_start, last_reset_at, created_at, updated_at)
       VALUES (?, ?, 'free', ?, 0, ?, 0, ?, ?, ?, ?, ?)`
    ).run(id, userId, TIER_LIMITS.free.tokens, TIER_LIMITS.free.sandboxes, TIER_LIMITS.free.projects, now, now, now, now);

    quota = sqlite.prepare('SELECT * FROM user_quotas WHERE user_id = ?').get(userId);
  }

  // Auto-reset monthly tokens if billing cycle has rolled over
  const cycleStart = new Date(quota.billing_cycle_start);
  const now = new Date();
  if (now.getMonth() !== cycleStart.getMonth() || now.getFullYear() !== cycleStart.getFullYear()) {
    sqlite.prepare(
      'UPDATE user_quotas SET monthly_tokens_used = 0, billing_cycle_start = ?, updated_at = ? WHERE user_id = ?'
    ).run(now.toISOString(), now.toISOString(), userId);
    quota.monthly_tokens_used = 0;
    quota.billing_cycle_start = now.toISOString();
  }

  // Auto-reset daily sandboxes
  const lastReset = new Date(quota.last_reset_at);
  if (now.toDateString() !== lastReset.toDateString()) {
    sqlite.prepare(
      'UPDATE user_quotas SET daily_sandboxes_used = 0, last_reset_at = ?, updated_at = ? WHERE user_id = ?'
    ).run(now.toISOString(), now.toISOString(), userId);
    quota.daily_sandboxes_used = 0;
  }

  return quota as QuotaInfo;
}

export function checkTokenQuota(userId: string, estimatedTokens: number = 0): { allowed: boolean; remaining: number; limit: number; used: number } {
  const quota = getOrCreateQuota(userId);
  if (quota.monthly_token_limit === -1) return { allowed: true, remaining: -1, limit: -1, used: quota.monthly_tokens_used }; // unlimited
  const remaining = quota.monthly_token_limit - quota.monthly_tokens_used;
  return {
    allowed: remaining >= estimatedTokens,
    remaining,
    limit: quota.monthly_token_limit,
    used: quota.monthly_tokens_used,
  };
}

export function recordTokenUsage(userId: string, tokensUsed: number) {
  const sqlite = getSQLite();
  sqlite.prepare(
    'UPDATE user_quotas SET monthly_tokens_used = monthly_tokens_used + ?, updated_at = ? WHERE user_id = ?'
  ).run(tokensUsed, new Date().toISOString(), userId);
}

export function checkSandboxQuota(userId: string): { allowed: boolean; remaining: number; limit: number } {
  const quota = getOrCreateQuota(userId);
  if (quota.daily_sandbox_limit === -1) return { allowed: true, remaining: -1, limit: -1 }; // unlimited
  const remaining = quota.daily_sandbox_limit - quota.daily_sandboxes_used;
  return { allowed: remaining > 0, remaining, limit: quota.daily_sandbox_limit };
}

export function incrementSandboxUsage(userId: string) {
  const sqlite = getSQLite();
  sqlite.prepare(
    'UPDATE user_quotas SET daily_sandboxes_used = daily_sandboxes_used + 1, updated_at = ? WHERE user_id = ?'
  ).run(new Date().toISOString(), userId);
}

export function checkProjectQuota(userId: string): { allowed: boolean; current: number; limit: number } {
  const quota = getOrCreateQuota(userId);
  const sqlite = getSQLite();
  const count = sqlite.prepare('SELECT COUNT(*) as cnt FROM projects WHERE user_id = ?').get(userId) as any;
  const current = count?.cnt || 0;
  if (quota.max_projects === -1) return { allowed: true, current, limit: -1 };
  return { allowed: current < quota.max_projects, current, limit: quota.max_projects };
}

export function getQuotaSummary(userId: string) {
  const quota = getOrCreateQuota(userId);
  const tokenCheck = checkTokenQuota(userId);
  const sandboxCheck = checkSandboxQuota(userId);
  const projectCheck = checkProjectQuota(userId);

  return {
    tier: quota.tier,
    tokens: { used: tokenCheck.used, limit: tokenCheck.limit, remaining: tokenCheck.remaining },
    sandboxes: { used: quota.daily_sandboxes_used, limit: sandboxCheck.limit, remaining: sandboxCheck.remaining },
    projects: { current: projectCheck.current, limit: projectCheck.limit },
    billingCycleStart: quota.billing_cycle_start,
  };
}

// ── Templates (Phase 6.4) ───────────────────────────────────────────────────

const BUILTIN_TEMPLATES = [
  {
    name: 'React SPA',
    description: 'Modern React single-page application with Vite, React Router, and CSS Modules',
    category: 'frontend',
    tech_stack: ['react', 'vite', 'typescript'],
    prompt: 'Create a modern React SPA with Vite, React Router for navigation, and a clean component structure. Include a Home page, About page, and a reusable Navbar component.',
  },
  {
    name: 'Node.js REST API',
    description: 'Express.js REST API with routes, middleware, and error handling',
    category: 'backend',
    tech_stack: ['node', 'express', 'typescript'],
    prompt: 'Create a Node.js REST API with Express. Include CRUD routes for a "todos" resource, error handling middleware, CORS, and a health check endpoint.',
  },
  {
    name: 'Landing Page',
    description: 'Stunning marketing landing page with hero section, features, and CTA',
    category: 'frontend',
    tech_stack: ['html', 'css', 'javascript'],
    prompt: 'Create a beautiful, modern landing page for a SaaS product. Include a hero section with gradient background, feature cards with icons, testimonials, pricing cards, and a footer. Use smooth animations and a professional color palette.',
  },
  {
    name: 'Full-Stack Dashboard',
    description: 'Admin dashboard with charts, tables, sidebar navigation, and dark theme',
    category: 'fullstack',
    tech_stack: ['react', 'node', 'chart.js'],
    prompt: 'Create a full-stack admin dashboard with a collapsible sidebar, top navigation bar, summary stat cards, a line chart showing monthly data, and a data table with pagination. Use a dark theme with vibrant accent colors.',
  },
  {
    name: 'Portfolio Site',
    description: 'Personal portfolio website with projects showcase, about section, and contact form',
    category: 'frontend',
    tech_stack: ['html', 'css', 'javascript'],
    prompt: 'Create a personal portfolio website with an animated hero section, projects grid with hover effects, skills section with progress bars, and a contact form. Make it responsive and visually impressive.',
  },
  {
    name: 'Chat Application',
    description: 'Real-time chat application with message bubbles and user list',
    category: 'fullstack',
    tech_stack: ['react', 'node', 'websocket'],
    prompt: 'Create a real-time chat application UI with a user/room list sidebar, message bubbles (sent/received), a message input with send button, and online status indicators. Style it like a modern messaging app.',
  },
];

export function seedBuiltinTemplates() {
  const sqlite = getSQLite();
  const existing = sqlite.prepare('SELECT COUNT(*) as cnt FROM templates WHERE is_builtin = 1').get() as any;
  if (existing?.cnt > 0) return; // Already seeded

  for (const tpl of BUILTIN_TEMPLATES) {
    const id = uuidv4();
    const now = new Date().toISOString();
    sqlite.prepare(
      `INSERT INTO templates (id, name, description, category, tech_stack, files, is_public, is_builtin, use_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?)`
    ).run(id, tpl.name, tpl.description, tpl.category, JSON.stringify(tpl.tech_stack), JSON.stringify({ prompt: tpl.prompt }), now, now);
  }

  console.log(`[SQLite] Seeded ${BUILTIN_TEMPLATES.length} built-in templates`);
}

export function getTemplates(category?: string) {
  const sqlite = getSQLite();
  if (category) {
    return sqlite.prepare('SELECT * FROM templates WHERE is_public = 1 AND category = ? ORDER BY use_count DESC').all(category);
  }
  return sqlite.prepare('SELECT * FROM templates WHERE is_public = 1 ORDER BY use_count DESC').all();
}

export function getTemplateById(templateId: string) {
  const sqlite = getSQLite();
  return sqlite.prepare('SELECT * FROM templates WHERE id = ?').get(templateId) || null;
}

export function incrementTemplateUseCount(templateId: string) {
  const sqlite = getSQLite();
  sqlite.prepare('UPDATE templates SET use_count = use_count + 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), templateId);
}
