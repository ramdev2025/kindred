-- Migration 003: Project files for persistent cloud storage
-- Run with: psql $DATABASE_URL -f src/db/migrations/003_project_files.sql

CREATE TABLE IF NOT EXISTS project_files (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id),
    filename    VARCHAR(255) NOT NULL,
    mime_type   VARCHAR(127) NOT NULL,
    size_bytes  INTEGER     NOT NULL,
    blob_url    TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by project
CREATE INDEX IF NOT EXISTS idx_project_files_project
    ON project_files(project_id, created_at DESC);

-- Per-user storage quota calculation
CREATE INDEX IF NOT EXISTS idx_project_files_user
    ON project_files(user_id);
