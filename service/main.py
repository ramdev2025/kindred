"""
Kindred AI Studio — Deep Research ADK Service
=============================================
Replaces the old Hermes/Gemini wrapper with a proper Google ADK agent:
  - Programmer Specialist with google_search
  - Human-in-the-loop via ask_human tool
  - SSE streaming of all agent events
  - Session management for paused HITL sessions

Endpoints
---------
  POST /research/start          Start a research session (returns session_id)
  GET  /research/{id}/stream    SSE stream of agent events
  POST /research/{id}/respond   Provide human answer to a paused session
  GET  /research/{id}/status    Check session status
  GET  /health
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from loguru import logger
from dotenv import load_dotenv

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types as genai_types

from app.agent import create_programmer_specialist, make_ask_human_tool
from app.cache import cache
from app.models import (
    HumanInputRequest,
    HumanInputResponse,
    ResearchRequest,
    ResearchResponse,
    SessionStatusResponse,
)
from app.sessions import (
    get_session,
    list_sessions,
    new_session,
    remove_session,
)

load_dotenv()

# ── Shared ADK session service (one per process) ──────────────────────────────
adk_session_service = InMemorySessionService()
APP_NAME = "kindred_research"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[Research Service] Deep Research ADK agent starting up")
    yield
    logger.info("[Research Service] Shutting down")


app = FastAPI(
    title="Kindred Research Agent",
    description="Deep Research Programmer Specialist powered by Google ADK",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── SSE helpers ───────────────────────────────────────────────────────────────

def sse(payload: dict) -> str:
    """Format a dict as a Server-Sent Event line."""
    return f"data: {json.dumps(payload)}\n\n"


# ── ADK event parser ──────────────────────────────────────────────────────────

async def run_agent_into_queue(
    session_id: str,
    user_id: str,
    message: str,
    context: str | None,
) -> None:
    """
    Runs the ADK programmer specialist agent for one research task.
    All output is pushed into the session's output_queue as dicts.
    A sentinel None is pushed when the agent finishes (or errors).
    """
    research_session = get_session(session_id)
    if not research_session:
        return

    output_queue = research_session.output_queue
    input_queue = research_session.input_queue

    async def put_event(event: dict) -> None:
        # Track HITL state on the session object
        if event.get("type") == "need_input":
            research_session.status = "awaiting_input"
            research_session.pending_question = event.get("question")
        elif event.get("type") == "input_received":
            research_session.status = "running"
            research_session.pending_question = None
        await output_queue.put(event)

    try:
        ask_human = make_ask_human_tool(put_event, input_queue)
        agent = create_programmer_specialist(ask_human_tool=ask_human)

        runner = Runner(
            agent=agent,
            app_name=APP_NAME,
            session_service=adk_session_service,
        )

        # Build the user message, optionally prepending project context
        user_content = message
        if context:
            user_content = (
                f"## Project Context\n{context}\n\n## Research Request\n{message}"
            )

        new_message = genai_types.Content(
            role="user",
            parts=[genai_types.Part(text=user_content)],
        )

        full_answer: list[str] = []

        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=new_message,
        ):
            # ── Tool calls (google_search, ask_human) ──────────────────────
            for fc in (event.get_function_calls() or []):
                if fc.name == "google_search":
                    query = (fc.args or {}).get("query", "")
                    await put_event({"type": "search_query", "content": query})
                elif fc.name == "ask_human":
                    # ask_human is handled inside the tool itself via put_event
                    pass

            # ── Tool responses ─────────────────────────────────────────────
            for fr in (event.get_function_responses() or []):
                if fr.name == "google_search":
                    # Summarise: emit first 300 chars of the raw response
                    raw = str(fr.response or "")
                    snippet = raw[:300] + ("…" if len(raw) > 300 else "")
                    await put_event({"type": "search_result", "content": snippet})

            # ── Streamed text tokens ───────────────────────────────────────
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        full_answer.append(part.text)
                        await put_event({"type": "token", "content": part.text})

        # ── Agent finished ─────────────────────────────────────────────────
        final_answer = "".join(full_answer)
        research_session.status = "complete"

        # Cache the result for identical future queries
        cache.set(message, final_answer, context)

        await put_event({"type": "done", "session_id": session_id})

    except Exception as exc:
        logger.exception(f"[Research] Agent error in session {session_id}: {exc}")
        research_session.status = "error"
        research_session.error = str(exc)
        await put_event({"type": "error", "content": str(exc)})

    finally:
        # Always push the sentinel so the SSE generator can close
        await output_queue.put(None)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "kindred-research-agent",
        "cache": cache.stats(),
    }


@app.post("/research/start", response_model=ResearchResponse)
async def start_research(req: ResearchRequest):
    """
    Start a new research session.
    Returns a session_id — connect to /research/{session_id}/stream for SSE events.

    Cache hit: if an identical (message, context) pair was recently answered,
    the cached result is returned immediately with status=complete.
    """
    cached = cache.get(req.message, req.context)
    if cached:
        logger.info("[Research] Cache hit — returning stored result")
        # Create a session that immediately completes with the cached answer
        session = new_session(req.user_id)
        session.status = "complete"
        asyncio.create_task(_push_cached(session, cached))
        return ResearchResponse(
            session_id=session.session_id,
            status="complete",
            message="Cache hit. Stream for instant replay.",
        )

    session = new_session(req.user_id)

    # Fire and forget — the SSE stream reads from session.output_queue
    asyncio.create_task(
        run_agent_into_queue(
            session_id=session.session_id,
            user_id=req.user_id,
            message=req.message,
            context=req.context,
        )
    )

    logger.info(f"[Research] Session {session.session_id} started for user {req.user_id}")
    return ResearchResponse(
        session_id=session.session_id,
        status="streaming",
        message="Research session started. Connect to the SSE stream.",
    )


async def _push_cached(session, cached_text: str) -> None:
    """Push cached text as token events then close."""
    chunk_size = 200
    for i in range(0, len(cached_text), chunk_size):
        await session.output_queue.put(
            {"type": "token", "content": cached_text[i : i + chunk_size]}
        )
    await session.output_queue.put(
        {"type": "done", "session_id": session.session_id, "cached": True}
    )
    await session.output_queue.put(None)


@app.get("/research/{session_id}/stream")
async def stream_research(session_id: str, request: Request):
    """
    SSE stream for a research session.

    Event types emitted:
      { type: "search_query",   content: "..." }   — agent is searching
      { type: "search_result",  content: "..." }   — snippet of search response
      { type: "token",          content: "..." }   — streamed answer token
      { type: "need_input",     question: "..." }  — HITL: agent needs clarification
      { type: "input_received", content: "..." }   — human answer acknowledged
      { type: "error",          content: "..." }   — agent error
      { type: "done",           session_id: "..." } — session complete
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    async def generate():
        while True:
            # Check client disconnected
            if await request.is_disconnected():
                logger.info(f"[Research] Client disconnected from session {session_id}")
                break

            try:
                item = await asyncio.wait_for(
                    session.output_queue.get(), timeout=30.0
                )
            except asyncio.TimeoutError:
                # Send a keepalive comment to prevent proxy timeout
                yield ": keepalive\n\n"
                continue

            if item is None:
                # Sentinel — agent finished
                break

            yield sse(item)

            # Stop streaming after done/error events
            if item.get("type") in ("done", "error"):
                break

        # Clean up after a grace period so /status can still be polled briefly
        await asyncio.sleep(60)
        remove_session(session_id)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.post("/research/{session_id}/respond", response_model=HumanInputResponse)
async def human_respond(session_id: str, req: HumanInputRequest):
    """
    Provide a human answer to an agent that is paused waiting for input.
    The answer is fed into the session's input_queue; the agent resumes automatically.
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "awaiting_input":
        raise HTTPException(
            status_code=409,
            detail=f"Session is not awaiting input (current status: {session.status})",
        )

    await session.input_queue.put(req.answer)
    logger.info(f"[Research] Human input delivered to session {session_id}")

    return HumanInputResponse(
        session_id=session_id,
        status="running",
        message="Answer received. Agent is resuming research.",
    )


@app.get("/research/{session_id}/status", response_model=SessionStatusResponse)
async def session_status(session_id: str):
    """Poll the current status of a research session."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionStatusResponse(
        session_id=session.session_id,
        status=session.status,
        pending_question=session.pending_question,
        created_at=session.created_at.isoformat(),
    )


@app.get("/research/sessions/{user_id}")
async def user_sessions(user_id: str):
    """List all active research sessions for a user."""
    return {"sessions": list_sessions(user_id)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("NODE_ENV") != "production",
        log_level="info",
    )
