import { query } from './index';
import { v4 as uuidv4 } from 'uuid';

// --- Users ---
export async function findOrCreateUser(clerkId: string, email: string, displayName?: string) {
  const existing = await query('SELECT * FROM users WHERE clerk_id = $1', [clerkId]);
  if (existing.rows.length > 0) return existing.rows[0];

  const id = uuidv4();
  const name = displayName || email.split('@')[0];
  const now = new Date().toISOString();
  await query(
    'INSERT INTO users (id, clerk_id, email, display_name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, clerkId, email, name, now, now]
  );

  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
}

export async function getUserByClerkId(clerkId: string) {
  const result = await query('SELECT * FROM users WHERE clerk_id = $1', [clerkId]);
  return result.rows[0] || null;
}

// --- Projects ---
export async function createProject(userId: string, name: string, description?: string) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await query(
    'INSERT INTO projects (id, user_id, name, description, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, userId, name, description || '', 'active', now, now]
  );
  const result = await query('SELECT * FROM projects WHERE id = $1', [id]);
  return result.rows[0];
}

export async function getProjectsByUser(userId: string) {
  const result = await query(
    'SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC',
    [userId]
  );
  return result.rows;
}

export async function getProjectById(projectId: string) {
  const result = await query('SELECT * FROM projects WHERE id = $1', [projectId]);
  return result.rows[0] || null;
}

export async function updateProject(projectId: string, updates: Record<string, any>) {
  const keys = Object.keys(updates);
  const values = Object.values(updates);
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');

  await query(
    `UPDATE projects SET ${setClause}, updated_at = $${keys.length + 2} WHERE id = $1`,
    [projectId, ...values, new Date().toISOString()]
  );
  const result = await query('SELECT * FROM projects WHERE id = $1', [projectId]);
  return result.rows[0];
}

export async function deleteProject(projectId: string) {
  await query('DELETE FROM projects WHERE id = $1', [projectId]);
}

// --- Chat Sessions ---
export async function createChatSession(projectId: string, userId: string) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await query(
    'INSERT INTO chat_sessions (id, project_id, user_id, title, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, projectId, userId, 'New Chat', now, now]
  );
  const result = await query('SELECT * FROM chat_sessions WHERE id = $1', [id]);
  return result.rows[0];
}

export async function getChatSession(projectId: string) {
  const result = await query(
    'SELECT * FROM chat_sessions WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
    [projectId]
  );
  return result.rows[0] || null;
}

// --- Chat Messages ---
export async function addMessage(
  sessionId: string,
  role: string,
  content: string,
  modelUsed?: string,
  tokensUsed?: number,
  metadata?: Record<string, any>,
) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await query(
    'INSERT INTO chat_messages (id, session_id, role, content, model_used, tokens_used, metadata, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [id, sessionId, role, content, modelUsed || null, tokensUsed || 0, JSON.stringify(metadata ?? {}), now]
  );
  const result = await query('SELECT * FROM chat_messages WHERE id = $1', [id]);
  return result.rows[0];
}

export async function getMessages(sessionId: string, limit = 50) {
  const result = await query(
    'SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT $2',
    [sessionId, limit]
  );
  return result.rows;
}

// --- MCP Connections ---
export async function getMCPConnections(userId: string) {
  const result = await query(
    'SELECT id, name, url, transport, is_active, created_at FROM mcp_connections WHERE user_id = $1 AND is_active = 1 ORDER BY created_at DESC',
    [userId],
  );
  return result.rows;
}

export async function getMCPConnectionById(connId: string) {
  const result = await query('SELECT * FROM mcp_connections WHERE id = $1', [connId]);
  return result.rows[0] ?? null;
}

export async function createMCPConnection(
  userId: string,
  data: { name: string; url: string; transport: string; authConfig: Record<string, any> },
) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO mcp_connections (id, user_id, name, url, transport, auth_config, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8)`,
    [id, userId, data.name, data.url, data.transport, JSON.stringify(data.authConfig), now, now],
  );
  const result = await query('SELECT id, name, url, transport, is_active, created_at FROM mcp_connections WHERE id = $1', [id]);
  return result.rows[0];
}

export async function deleteMCPConnection(connId: string, userId: string) {
  await query(
    'DELETE FROM mcp_connections WHERE id = $1 AND user_id = $2',
    [connId, userId],
  );
}

// --- OAuth Tokens ---

export async function upsertOAuthToken(
  userId: string,
  provider: string,
  data: {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: Date | null;
    scopes?: string[];
    rawResponse?: Record<string, any>;
  },
) {
  const now = new Date().toISOString();
  const existing = await query(
    'SELECT * FROM oauth_tokens WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  );

  if (existing.rows.length > 0) {
    await query(
      `UPDATE oauth_tokens SET
        access_token = $3,
        refresh_token = COALESCE($4, refresh_token),
        expires_at = $5,
        scopes = $6,
        raw_response = $7,
        updated_at = $8
       WHERE user_id = $1 AND provider = $2`,
      [
        userId, provider,
        data.accessToken,
        data.refreshToken ?? null,
        data.expiresAt?.toISOString() ?? null,
        JSON.stringify(data.scopes ?? []),
        JSON.stringify(data.rawResponse ?? {}),
        now,
      ],
    );
  } else {
    const id = uuidv4();
    await query(
      `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expires_at, scopes, raw_response, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id, userId, provider,
        data.accessToken,
        data.refreshToken ?? null,
        data.expiresAt?.toISOString() ?? null,
        JSON.stringify(data.scopes ?? []),
        JSON.stringify(data.rawResponse ?? {}),
        now, now,
      ],
    );
  }

  const result = await query(
    'SELECT * FROM oauth_tokens WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  );
  return result.rows[0];
}

export async function getOAuthToken(userId: string, provider: string) {
  const result = await query(
    'SELECT * FROM oauth_tokens WHERE user_id = $1 AND provider = $2',
    [userId, provider],
  );
  return result.rows[0] ?? null;
}

export async function deleteOAuthToken(userId: string, provider: string) {
  await query(
    'DELETE FROM oauth_tokens WHERE user_id = $1 AND provider = $2',
    [userId, provider],
  );
}

// --- Session Summaries ---

export async function getLatestSummary(sessionId: string) {
  const result = await query(
    'SELECT * FROM session_summaries WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
    [sessionId],
  );
  return result.rows[0] ?? null;
}

export async function saveSessionSummary(
  sessionId: string,
  summaryText: string,
  summarizedUpTo: string,
  tokensInSummary: number,
) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO session_summaries (id, session_id, summary_text, summarized_up_to, tokens_in_summary, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, sessionId, summaryText, summarizedUpTo, tokensInSummary, now],
  );
  const result = await query('SELECT * FROM session_summaries WHERE id = $1', [id]);
  return result.rows[0];
}

export async function getSessionTokenUsage(sessionId: string): Promise<number> {
  const result = await query(
    `SELECT COALESCE(SUM(tokens_used), 0) AS total
     FROM chat_messages WHERE session_id = $1`,
    [sessionId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

// --- Usage Stats ---
// Cost estimate: returns USD cents based on public pricing
function estimateCostCents(model: string, tokensInput: number, tokensOutput: number): number {
  const m = model.toLowerCase();
  // Rates: USD per 1M tokens → multiply by 100 for cents
  const rate = m.includes('claude')
    ? { input: 3.00, output: 15.00 }    // Claude Sonnet 4
    : m.includes('2.5-pro') || m.includes('gemini-2.5')
    ? { input: 1.25, output: 10.00 }    // Gemini 2.5 Pro
    : { input: 0.075, output: 0.30 };   // Gemini 2.0 Flash (default)
  return ((tokensInput / 1_000_000) * rate.input + (tokensOutput / 1_000_000) * rate.output) * 100;
}

export async function recordUsage(userId: string, model: string, tokensInput: number, tokensOutput: number, requestType: string) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const costCents = estimateCostCents(model, tokensInput, tokensOutput);
  await query(
    'INSERT INTO usage_stats (id, user_id, model, tokens_input, tokens_output, cost_cents, request_type, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [id, userId, model, tokensInput, tokensOutput, costCents, requestType, now]
  );
}

// --- Project Files ---

export async function saveProjectFile(
  projectId: string,
  userId: string,
  filename: string,
  mimeType: string,
  sizeBytes: number,
  blobUrl: string,
) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO project_files (id, project_id, user_id, filename, mime_type, size_bytes, blob_url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, projectId, userId, filename, mimeType, sizeBytes, blobUrl, now],
  );
  const result = await query('SELECT * FROM project_files WHERE id = $1', [id]);
  return result.rows[0];
}

export async function getProjectFiles(projectId: string) {
  const result = await query(
    'SELECT * FROM project_files WHERE project_id = $1 ORDER BY created_at DESC',
    [projectId],
  );
  return result.rows;
}

export async function deleteProjectFile(fileId: string) {
  const result = await query(
    'SELECT blob_url FROM project_files WHERE id = $1',
    [fileId],
  );
  await query('DELETE FROM project_files WHERE id = $1', [fileId]);
  return result.rows[0]?.blob_url ?? null;
}

export async function getUserStorageUsage(userId: string): Promise<number> {
  const result = await query(
    `SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes
     FROM project_files WHERE user_id = $1`,
    [userId],
  );
  return Number(result.rows[0]?.total_bytes ?? 0);
}

export async function getProjectFileByBlobUrl(blobUrl: string) {
  const result = await query(
    'SELECT * FROM project_files WHERE blob_url = $1',
    [blobUrl],
  );
  return result.rows[0] ?? null;
}
