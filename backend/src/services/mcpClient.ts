/**
 * MCP (Model Context Protocol) HTTP client
 * Supports the MCP HTTP transport spec: POST /tools/list and POST /tools/call
 */

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{ type: 'text' | 'image' | 'resource'; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

export interface MCPConnectionConfig {
  url: string;
  transport?: 'http' | 'stdio';
  authConfig?: {
    bearerToken?: string;
    apiKey?: string;
    headerName?: string;
  };
}

function buildHeaders(authConfig?: MCPConnectionConfig['authConfig']): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authConfig?.bearerToken) {
    headers['Authorization'] = `Bearer ${authConfig.bearerToken}`;
  }
  if (authConfig?.apiKey && authConfig?.headerName) {
    headers[authConfig.headerName] = authConfig.apiKey;
  }
  return headers;
}

/**
 * List all tools exposed by an MCP server
 */
export async function fetchMCPTools(config: MCPConnectionConfig): Promise<MCPTool[]> {
  const response = await fetch(`${config.url}/tools/list`, {
    method: 'POST',
    headers: buildHeaders(config.authConfig),
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`MCP server returned ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as { tools?: MCPTool[] };
  return data.tools ?? [];
}

/**
 * Invoke a tool on an MCP server and return the result
 */
export async function callMCPTool(
  config: MCPConnectionConfig,
  toolName: string,
  toolInput: Record<string, any> = {},
): Promise<MCPToolResult> {
  const response = await fetch(`${config.url}/tools/call`, {
    method: 'POST',
    headers: buildHeaders(config.authConfig),
    body: JSON.stringify({ name: toolName, arguments: toolInput }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`MCP tool call failed (${response.status}): ${body.slice(0, 200)}`);
  }

  return response.json() as Promise<MCPToolResult>;
}

/**
 * Ping an MCP server and return basic health info
 */
export async function testMCPConnection(
  config: MCPConnectionConfig,
): Promise<{ ok: boolean; toolCount: number; error?: string }> {
  try {
    const tools = await fetchMCPTools(config);
    return { ok: true, toolCount: tools.length };
  } catch (err: any) {
    return { ok: false, toolCount: 0, error: err.message };
  }
}

/**
 * Build a tool-use system prompt fragment from MCP tools.
 * Injected into the model router so the AI knows what tools are available.
 */
export function buildMCPToolPrompt(tools: MCPTool[]): string {
  if (!tools.length) return '';
  const lines = tools.map(
    (t) => `  - ${t.name}: ${t.description ?? 'no description'}`,
  );
  return `\nAvailable MCP Tools (call via /api/mcp/connections/{id}/call):\n${lines.join('\n')}\n`;
}
