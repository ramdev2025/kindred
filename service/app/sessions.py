"""
In-memory session registry for the Deep Research ADK agent.
Each research session gets its own asyncio queues for HITL and SSE streaming.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class ResearchSession:
    session_id: str
    user_id: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    # Events flow OUT to the SSE stream
    output_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    # Human answers flow IN when the agent is paused
    input_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    # Lifecycle
    status: str = "running"       # running | awaiting_input | complete | error
    pending_question: Optional[str] = None
    error: Optional[str] = None


# ── Global registry (process-scoped, reset on restart) ───────────────────────

_sessions: dict[str, ResearchSession] = {}


def new_session(user_id: str) -> ResearchSession:
    session_id = str(uuid.uuid4())
    session = ResearchSession(session_id=session_id, user_id=user_id)
    _sessions[session_id] = session
    return session


def get_session(session_id: str) -> Optional[ResearchSession]:
    return _sessions.get(session_id)


def remove_session(session_id: str) -> None:
    _sessions.pop(session_id, None)


def list_sessions(user_id: str) -> list[dict]:
    return [
        {
            "session_id": s.session_id,
            "status": s.status,
            "created_at": s.created_at.isoformat(),
            "pending_question": s.pending_question,
        }
        for s in _sessions.values()
        if s.user_id == user_id
    ]
