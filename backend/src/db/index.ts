import { Pool, QueryResult } from 'pg';
import { v4 as uuidv4 } from 'uuid';

let pool: Pool | null = null;
let dbAvailable = false;

// In-memory fallback store
const memoryStore: Record<string, any[]> = {
  users: [],
  projects: [],
  chat_sessions: [],
  chat_messages: [],
  usage_stats: [],
};

export async function initDatabase(): Promise<void> {
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
      dbAvailable = true;
      console.log('[DB] PostgreSQL connected');
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.warn('[DB] PostgreSQL not available, using in-memory store:', err.message);
    dbAvailable = false;
    pool = null;
  }
}

export function isDatabaseAvailable(): boolean {
  return dbAvailable;
}

export function query(text: string, params?: any[]): Promise<QueryResult> {
  if (!dbAvailable || !pool) {
    return inMemoryQuery(text, params);
  }
  return pool.query(text, params);
}

export function getPool(): Pool | null {
  return pool;
}

// Simple in-memory query handler for development without PostgreSQL
function inMemoryQuery(text: string, params?: any[]): Promise<QueryResult> {
  const lower = text.toLowerCase().trim();

  if (lower.startsWith('select') && lower.includes('from users')) {
    const clerkId = params?.[0];
    const found = memoryStore.users.filter(u => u.clerk_id === clerkId);
    return Promise.resolve({ rows: found, rowCount: found.length, command: 'SELECT', oid: 0, fields: [] } as any);
  }

  if (lower.startsWith('insert') && lower.includes('into users')) {
    const user = {
      id: uuidv4(),
      clerk_id: params?.[0],
      email: params?.[1],
      display_name: params?.[2] || 'User',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.users.push(user);
    return Promise.resolve({ rows: [user], rowCount: 1, command: 'INSERT', oid: 0, fields: [] } as any);
  }

  if (lower.startsWith('select') && lower.includes('from projects')) {
    const userId = params?.[0];
    const found = memoryStore.projects.filter(p => p.user_id === userId || p.id === userId);
    return Promise.resolve({ rows: found, rowCount: found.length, command: 'SELECT', oid: 0, fields: [] } as any);
  }

  if (lower.startsWith('insert') && lower.includes('into projects')) {
    const project = {
      id: uuidv4(),
      user_id: params?.[0],
      name: params?.[1],
      description: params?.[2] || '',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.projects.push(project);
    return Promise.resolve({ rows: [project], rowCount: 1, command: 'INSERT', oid: 0, fields: [] } as any);
  }

  if (lower.startsWith('delete') && lower.includes('from projects')) {
    const projectId = params?.[0];
    memoryStore.projects = memoryStore.projects.filter(p => p.id !== projectId);
    return Promise.resolve({ rows: [], rowCount: 1, command: 'DELETE', oid: 0, fields: [] } as any);
  }

  if (lower.startsWith('select') && lower.includes('from chat_sessions')) {
    const projectId = params?.[0];
    const found = memoryStore.chat_sessions.filter(s => s.project_id === projectId);
    return Promise.resolve({ rows: found, rowCount: found.length, command: 'SELECT', oid: 0, fields: [] } as any);
  }

  if (lower.startsWith('insert') && lower.includes('into chat_sessions')) {
    const session = {
      id: uuidv4(),
      project_id: params?.[0],
      user_id: params?.[1],
      title: 'New Chat',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryStore.chat_sessions.push(session);
    return Promise.resolve({ rows: [session], rowCount: 1, command: 'INSERT', oid: 0, fields: [] } as any);
  }

  if (lower.startsWith('select') && lower.includes('from chat_messages')) {
    const sessionId = params?.[0];
    const limit = params?.[1] || 50;
    const found = memoryStore.chat_messages.filter(m => m.session_id === sessionId).slice(-limit);
    return Promise.resolve({ rows: found, rowCount: found.length, command: 'SELECT', oid: 0, fields: [] } as any);
  }

  if (lower.startsWith('insert') && lower.includes('into chat_messages')) {
    const msg = {
      id: uuidv4(),
      session_id: params?.[0],
      role: params?.[1],
      content: params?.[2],
      model_used: params?.[3] || null,
      tokens_used: params?.[4] || 0,
      created_at: new Date().toISOString(),
    };
    memoryStore.chat_messages.push(msg);
    return Promise.resolve({ rows: [msg], rowCount: 1, command: 'INSERT', oid: 0, fields: [] } as any);
  }

  if (lower.startsWith('insert') && lower.includes('into usage_stats')) {
    // Just acknowledge, no-op for in-memory
    return Promise.resolve({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] } as any);
  }

  if (lower.startsWith('update') && lower.includes('projects')) {
    const projectId = params?.[0];
    const project = memoryStore.projects.find(p => p.id === projectId);
    if (project) {
      project.updated_at = new Date().toISOString();
    }
    return Promise.resolve({ rows: project ? [project] : [], rowCount: project ? 1 : 0, command: 'UPDATE', oid: 0, fields: [] } as any);
  }

  // Fallback: return empty result
  return Promise.resolve({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] } as any);
}
