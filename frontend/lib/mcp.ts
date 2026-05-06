import { api } from './api';

export interface MCPConnection {
  id: string;
  name: string;
  url: string;
  transport: string;
  is_active: boolean;
  created_at: string;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}

export async function fetchConnections(token: string): Promise<MCPConnection[]> {
  const res = await api.get('/api/mcp/connections', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.connections;
}

export async function addConnection(
  token: string,
  data: { name: string; url: string; transport: string; authConfig?: Record<string, any> }
): Promise<MCPConnection> {
  const res = await api.post('/api/mcp/connections', data, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.connection;
}

export async function deleteConnection(token: string, id: string): Promise<void> {
  await api.delete(`/api/mcp/connections/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function testConnection(
  token: string,
  id: string
): Promise<{ ok: boolean; toolCount?: number; error?: string }> {
  const res = await api.post(`/api/mcp/connections/${id}/test`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function fetchTools(token: string, id: string): Promise<MCPTool[]> {
  const res = await api.get(`/api/mcp/connections/${id}/tools`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.tools;
}

export async function callTool(
  token: string,
  id: string,
  toolName: string,
  toolInput: Record<string, any> = {}
): Promise<any> {
  const res = await api.post(`/api/mcp/connections/${id}/call`, { toolName, toolInput }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.result;
}
