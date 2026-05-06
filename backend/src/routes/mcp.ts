import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import * as db from '../db/queries';
import {
  fetchMCPTools,
  callMCPTool,
  testMCPConnection,
  MCPConnectionConfig,
} from '../services/mcpClient';

export const mcpRouter = Router();
mcpRouter.use(requireAuth as any);

/** Map a DB row to the config shape expected by mcpClient */
function rowToConfig(row: any): MCPConnectionConfig {
  return {
    url: row.url,
    transport: row.transport ?? 'http',
    authConfig: row.auth_config ?? {},
  };
}

// ── GET /api/mcp/connections ─────────────────────────────────────────────────
/** List all active MCP connections for the current user */
mcpRouter.get('/connections', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const connections = await db.getMCPConnections(user.id);
    res.json({ connections });
  } catch (err: any) {
    console.error('[MCP] list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/mcp/connections ────────────────────────────────────────────────
/** Register a new MCP server connection */
mcpRouter.post('/connections', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, url, transport = 'http', authConfig = {} } = req.body as {
      name: string;
      url: string;
      transport?: string;
      authConfig?: Record<string, any>;
    };

    if (!name?.trim() || !url?.trim()) {
      return res.status(400).json({ error: 'name and url are required' });
    }

    const user = await db.getUserByClerkId(req.clerkId!);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const connection = await db.createMCPConnection(user.id, {
      name,
      url,
      transport,
      authConfig,
    });
    res.status(201).json({ connection });
  } catch (err: any) {
    console.error('[MCP] create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/mcp/connections/:id ─────────────────────────────────────────
/** Remove an MCP connection (scoped to the current user) */
mcpRouter.delete('/connections/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.getUserByClerkId(req.clerkId!);
    if (!user) return res.status(401).json({ error: 'User not found' });

    await db.deleteMCPConnection(req.params.id!, user.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[MCP] delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/mcp/connections/:id/test ──────────────────────────────────────
/** Ping the MCP server and report tool count */
mcpRouter.post('/connections/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await db.getMCPConnectionById(req.params.id!);
    if (!row) return res.status(404).json({ error: 'Connection not found' });

    const result = await testMCPConnection(rowToConfig(row));
    res.json(result);
  } catch (err: any) {
    console.error('[MCP] test error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/mcp/connections/:id/tools ──────────────────────────────────────
/** List all tools exposed by a registered MCP server */
mcpRouter.get('/connections/:id/tools', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await db.getMCPConnectionById(req.params.id!);
    if (!row) return res.status(404).json({ error: 'Connection not found' });

    const tools = await fetchMCPTools(rowToConfig(row));
    res.json({ tools });
  } catch (err: any) {
    console.error('[MCP] tools error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/mcp/connections/:id/call ──────────────────────────────────────
/** Proxy a tool call to the registered MCP server */
mcpRouter.post('/connections/:id/call', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { toolName, toolInput = {} } = req.body as {
      toolName: string;
      toolInput?: Record<string, any>;
    };

    if (!toolName) return res.status(400).json({ error: 'toolName is required' });

    const row = await db.getMCPConnectionById(req.params.id!);
    if (!row) return res.status(404).json({ error: 'Connection not found' });

    const result = await callMCPTool(rowToConfig(row), toolName, toolInput);
    res.json({ result });
  } catch (err: any) {
    console.error('[MCP] call error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
