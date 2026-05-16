"""
Pydantic models for the Deep Research ADK service.
"""

from pydantic import BaseModel, Field
from typing import Optional


class ResearchRequest(BaseModel):
    message: str = Field(..., description="The developer's research question or task.")
    user_id: str = Field(..., description="Clerk user ID — used to scope sessions.")
    context: Optional[str] = Field(
        None,
        description="Optional project context (tech stack, existing code, constraints).",
    )


class ResearchResponse(BaseModel):
    session_id: str
    status: str  # streaming | awaiting_input | complete | error
    message: str = "Research session started. Connect to the SSE stream."


class HumanInputRequest(BaseModel):
    answer: str = Field(..., description="The developer's answer to the agent's question.")


class HumanInputResponse(BaseModel):
    session_id: str
    status: str
    message: str


class SessionStatusResponse(BaseModel):
    session_id: str
    status: str
    pending_question: Optional[str] = None
    created_at: str
