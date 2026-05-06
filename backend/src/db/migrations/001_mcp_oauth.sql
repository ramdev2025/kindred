-- Migration 001: MCP connections + OAuth tokens
-- Run with: psql $DATABASE_URL -f src/db/migrations/001_mcp_oauth.sql

-- ── MCP server connections per user ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mcp_connections (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    url         TEXT        NOT NULL,
    transport   VARCHAR(20) NOT NULL DEFAULT 'http',   -- 'http' | 'stdio'
    auth_config JSONB       NOT NULL DEFAULT '{}',     -- { bearerToken?, apiKey?, headerName? }
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_connections_user ON mcp_connections(user_id);

-- ── OAuth tokens for Google Workspace / GitHub ───────────────────────────────
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider      VARCHAR(50) NOT NULL,          -- 'google' | 'github'
    access_token  TEXT        NOT NULL,
    refresh_token TEXT,
    expires_at    TIMESTAMPTZ,
    scopes        TEXT[]      NOT NULL DEFAULT '{}',
    raw_response  JSONB       NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_provider ON oauth_tokens(user_id, provider);
