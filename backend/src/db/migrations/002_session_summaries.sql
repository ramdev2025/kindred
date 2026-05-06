-- Migration 002: Session summaries for context window management
-- Run with: psql $DATABASE_URL -f src/db/migrations/002_session_summaries.sql

CREATE TABLE IF NOT EXISTS session_summaries (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id        UUID        NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    summary_text      TEXT        NOT NULL,
    -- All messages with created_at <= this timestamp are captured in the summary
    summarized_up_to  TIMESTAMPTZ NOT NULL,
    tokens_in_summary INTEGER     NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Latest summary per session is the most common lookup
CREATE INDEX IF NOT EXISTS idx_session_summaries_session
    ON session_summaries(session_id, created_at DESC);
