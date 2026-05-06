from pydantic import BaseModel
from typing import Optional


class ReasonRequest(BaseModel):
    prompt: str
    context: Optional[str] = None
    session_id: Optional[str] = None
    max_tokens: int = 4096
    temperature: float = 0.3


class ReasonResponse(BaseModel):
    response: str
    tokens_used: int
    model: str
    reasoning_steps: list[str] = []
