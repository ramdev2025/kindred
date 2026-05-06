import { query } from './index';

// --- Users ---
export async function findOrCreateUser(clerkId: string, email: string, displayName?: string) {
  const existing = await query('SELECT * FROM users WHERE clerk_id = $1', [clerkId]);
  if (existing.rows.length > 0) return existing.rows[0];

  const result = await query(
    'INSERT INTO users (clerk_id, email, display_name) VALUES ($1, $2, $3) RETURNING *',
    [clerkId, email, displayName || email.split('@')[0]]
  );
  return result.rows[0];
}

export async function getUserByClerkId(clerkId: string) {
  const result = await query('SELECT * FROM users WHERE clerk_id = $1', [clerkId]);
  return result.rows[0] || null;
}

// --- Projects ---
export async function createProject(userId: string, name: string, description?: string) {
  const result = await query(
    'INSERT INTO projects (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
    [userId, name, description]
  );
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

  const result = await query(
    `UPDATE projects SET ${setClause} WHERE id = $1 RETURNING *`,
    [projectId, ...values]
  );
  return result.rows[0];
}

export async function deleteProject(projectId: string) {
  await query('DELETE FROM projects WHERE id = $1', [projectId]);
}

// --- Chat Sessions ---
export async function createChatSession(projectId: string, userId: string) {
  const result = await query(
    'INSERT INTO chat_sessions (project_id, user_id) VALUES ($1, $2) RETURNING *',
    [projectId, userId]
  );
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
export async function addMessage(sessionId: string, role: string, content: string, modelUsed?: string, tokensUsed?: number) {
  const result = await query(
    'INSERT INTO chat_messages (session_id, role, content, model_used, tokens_used) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [sessionId, role, content, modelUsed, tokensUsed || 0]
  );
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
    'SELECT id, name, url, transport, is_active, created_at FROM mcp_connections WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
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
  const result = await query(
    `INSERT INTO mcp_connections (user_id, name, url, transport, auth_config)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, url, transport, is_active, created_at`,
    [userId, data.name, data.url, data.transport, JSON.stringify(data.authConfig)],
  );
  return result.rows[0];
}

export async function deleteMCPConnection(connId: string, userId: string) {
  await query(
    'DELETE FROM mcp_connections WHERE id = $1 AND user_id = $2',
    [connId, userId],
  );
}

// --- Usage Stats ---
export async function recordUsage(userId: string, model: string, tokensInput: number, tokensOutput: number, requestType: string) {
  await query(
    'INSERT INTO usage_stats (user_id, model, tokens_input, tokens_output, request_type) VALUES ($1, $2, $3, $4, $5)',
    [userId, model, tokensInput, tokensOutput, requestType]
  );
}
