import os
import json
from typing import AsyncGenerator

from fastapi import Request
from fastapi.responses import StreamingResponse
import openai

from app.models import ReasonRequest, ReasonResponse

# Use OpenAI as the cloud backend for "Hermes" reasoning
client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))

SYSTEM_PROMPT = """You are Hermes, a deep reasoning AI agent. Your role is to:
1. Break down complex problems into logical steps
2. Consider edge cases and trade-offs
3. Provide thorough, well-reasoned responses
4. Think step-by-step before giving a final answer

When asked about code architecture or complex problems, always show your reasoning process."""


async def reason_endpoint(request: Request, body: ReasonRequest) -> ReasonResponse:
    """Synchronous deep reasoning endpoint"""
    cache = request.app.state.cache

    # Check cache
    cached = await cache.get(body.prompt, body.context)
    if cached:
        data = json.loads(cached)
        return ReasonResponse(**data)

    # Build messages
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if body.context:
        messages.append({"role": "user", "content": f"Context:\n{body.context}"})
        messages.append({"role": "assistant", "content": "I understand the context. What would you like me to reason about?"})
    messages.append({"role": "user", "content": body.prompt})

    # Call OpenAI
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        max_tokens=body.max_tokens,
        temperature=body.temperature,
    )

    content = response.choices[0].message.content or ""
    tokens = response.usage.total_tokens if response.usage else 0

    # Extract reasoning steps (lines starting with numbered items)
    steps = [line.strip() for line in content.split("\n") if line.strip() and line.strip()[0].isdigit()]

    result = ReasonResponse(
        response=content,
        tokens_used=tokens,
        model="hermes-cloud",
        reasoning_steps=steps[:10],
    )

    # Cache result
    await cache.set(body.prompt, json.dumps(result.model_dump()), body.context, ttl=1800)

    return result


async def stream_reason_endpoint(request: Request, body: ReasonRequest) -> StreamingResponse:
    """Streaming deep reasoning endpoint"""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if body.context:
        messages.append({"role": "user", "content": f"Context:\n{body.context}"})
        messages.append({"role": "assistant", "content": "I understand the context."})
    messages.append({"role": "user", "content": body.prompt})

    async def generate() -> AsyncGenerator[str, None]:
        stream = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=body.max_tokens,
            temperature=body.temperature,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield f"data: {json.dumps({'content': chunk.choices[0].delta.content})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
