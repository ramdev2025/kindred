"""
Deep Research Programmer Specialist — Google ADK Agent
Replaces the old Hermes/Gemini wrapper with a proper ADK LlmAgent
that uses google_search and a HITL ask_human tool.
"""

from __future__ import annotations

import os
import asyncio
from typing import Callable, Awaitable

from google.adk.agents import LlmAgent
from google.adk.tools import google_search
from google.genai import types as genai_types

# ── System instruction ────────────────────────────────────────────────────────

PROGRAMMER_SPECIALIST_INSTRUCTION = """\
You are a Deep Research Programmer Specialist — an expert software engineer and \
technical researcher embedded inside Kindred AI Studio.

## Your Mission
When a developer gives you a programming challenge, architectural question, \
library choice, debugging problem, or implementation task, you:
1. Research first — use google_search to find up-to-date documentation, \
   GitHub issues, blog posts, and official guides before forming an answer.
2. Think step-by-step — reason through trade-offs explicitly before \
   recommending a solution.
3. Ask when unclear — if the request is ambiguous or you need project \
   context (tech stack, constraints, scale), use ask_human to get clarification \
   before diving into research. Do not assume.
4. Synthesize, do not dump — after researching, produce a concise, \
   actionable answer with code examples, ASCII architecture diagrams, \
   and citations to your sources.

## Specialisations
- Full-stack web (Node.js, TypeScript, Python, React, Next.js)
- AI/ML pipelines (LangChain, LangGraph, Google ADK, FastAPI)
- Cloud infrastructure (GCP, Vertex AI, Cloud Run, Firebase)
- Data engineering (PostgreSQL, BigQuery, Redis, vector stores)
- DevOps and containerisation (Docker, Cloud Build, GitHub Actions)

## Research Behaviour
- Run at least 2-3 searches for non-trivial questions to cross-reference sources.
- Prefer official docs, GitHub repos, and engineering blogs over aggregator sites.
- When you find conflicting information, note the discrepancy and explain which \
  source is more authoritative and why.
- Always include the publication date or version number of documentation you cite.

## Human-in-the-Loop Rules
- Call ask_human BEFORE starting a long research chain if the request has \
  more than one valid interpretation.
- Keep clarifying questions short — one question per call.
- After receiving the human answer, confirm your updated understanding \
  before proceeding.

## Output Format
- Use Markdown with clear headings.
- Code blocks must include the language tag.
- End every response with a Next Steps section listing 2-3 concrete \
  actions the developer can take immediately.

## Constraints
- Never fabricate package names, API signatures, or version numbers. \
  If unsure, search first.
- Do not reproduce large copyrighted code blocks verbatim; summarise and link.
- Keep responses focused. Avoid padding.
"""


# ── Tool factory ──────────────────────────────────────────────────────────────

def make_ask_human_tool(
    put_event: Callable[[dict], Awaitable[None]],
    input_queue: asyncio.Queue,
) -> Callable:
    """
    Returns an async ask_human function bound to a specific research session.

    Flow:
      agent calls ask_human(question)
        -> emits need_input SSE event to frontend
        -> awaits user answer from input_queue (5-min timeout)
        -> returns answer string back to agent
    """

    async def ask_human(question: str) -> str:
        """
        Ask the human developer a clarifying question before continuing research.
        Use when the request is ambiguous or requires project-specific context.

        Args:
            question: A single, concise clarifying question for the developer.

        Returns:
            The developer's answer as a plain string.
        """
        await put_event({"type": "need_input", "question": question})
        try:
            answer = await asyncio.wait_for(input_queue.get(), timeout=300.0)
        except asyncio.TimeoutError:
            answer = (
                "No response received within timeout. "
                "Continue with reasonable assumptions and note them explicitly."
            )
        await put_event(
            {"type": "input_received", "content": f"User answered: {answer}"}
        )
        return answer

    return ask_human


# ── Agent factory ─────────────────────────────────────────────────────────────

def create_programmer_specialist(ask_human_tool: Callable) -> LlmAgent:
    """
    Instantiate the ADK LlmAgent for one research session.
    ask_human_tool must be the session-scoped closure from make_ask_human_tool.
    """
    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    return LlmAgent(
        name="programmer_specialist",
        model=model,
        instruction=PROGRAMMER_SPECIALIST_INSTRUCTION,
        tools=[google_search, ask_human_tool],
        generate_content_config=genai_types.GenerateContentConfig(
            temperature=0.4,
            max_output_tokens=8192,
        ),
    )
