import os
import json
from typing import AsyncGenerator

from fastapi import Request
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types

from app.models import ReasonRequest, ReasonResponse

# ---------------------------------------------------------------------------
# Google ADK / Vertex AI client
# GOOGLE_GENAI_USE_VERTEXAI=TRUE in .env routes all calls through Vertex AI
# instead of AI Studio, so no API key is needed — ADC handles auth.
# ---------------------------------------------------------------------------
_genai_client: genai.Client | None = None


def get_genai_client() -> genai.Client:
    global _genai_client
    if _genai_client is None:
        use_vertex = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").upper() == "TRUE"
        if use_vertex:
            _genai_client = genai.Client(
                vertexai=True,
                project=os.getenv("GOOGLE_CLOUD_PROJECT"),
                location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"),
            )
            print("[ADK] Using Vertex AI backend")
        else:
            # Fallback: AI Studio key (if someone sets it)
            _genai_client = genai.Client(
                api_key=os.getenv("GOOGLE_GEMINI_API_KEY", "")
            )
            print("[ADK] Using AI Studio backend")
    return _genai_client


MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

SYSTEM_PROMPT = """You are Hermes, a deep reasoning AI agent powered by Google Gemini. Your role is to:
1. Break down complex problems into logical steps
2. Consider edge cases and trade-offs
3. Provide thorough, well-reasoned responses
4. Think step-by-step before giving a final answer

When asked about code architecture or complex problems, always show your reasoning process.

IMPORTANT — when generating code files, annotate EVERY code block with its file path:
```typescript
// filepath: src/components/App.tsx
...code...
```
This enables automatic file deployment to the live sandbox. Use relative paths from the project root."""


def _build_contents(body: ReasonRequest) -> list:
    """Build the message list for the Gemini API."""
    contents = []
    if body.context:
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part(text=f"Context:\n{body.context}")],
            )
        )
        contents.append(
            types.Content(
                role="model",
                parts=[types.Part(text="I understand the context. What would you like me to reason about?")],
            )
        )
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part(text=body.prompt)],
        )
    )
    return contents


async def reason_endpoint(request: Request, body: ReasonRequest) -> ReasonResponse:
    """Synchronous deep reasoning endpoint via Vertex AI / Gemini."""
    cache = request.app.state.cache

    # Check cache
    cached = await cache.get(body.prompt, body.context)
    if cached:
        data = json.loads(cached)
        return ReasonResponse(**data)

    client = get_genai_client()
    contents = _build_contents(body)

    response = client.models.generate_content(
        model=MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            max_output_tokens=body.max_tokens,
            temperature=body.temperature,
        ),
    )

    content = response.text or ""
    tokens = response.usage_metadata.total_token_count if response.usage_metadata else 0

    # Extract reasoning steps (numbered lines)
    steps = [
        line.strip()
        for line in content.split("\n")
        if line.strip() and line.strip()[0].isdigit()
    ]

    result = ReasonResponse(
        response=content,
        tokens_used=tokens,
        model=f"gemini-vertex/{MODEL}",
        reasoning_steps=steps[:10],
    )

    # Cache for 30 min
    await cache.set(body.prompt, json.dumps(result.model_dump()), body.context, ttl=1800)
    return result


async def stream_reason_endpoint(request: Request, body: ReasonRequest) -> StreamingResponse:
    """Streaming deep reasoning endpoint via Vertex AI / Gemini."""
    client = get_genai_client()
    contents = _build_contents(body)

    async def generate() -> AsyncGenerator[str, None]:
        for chunk in client.models.generate_content_stream(
            model=MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                max_output_tokens=body.max_tokens,
                temperature=body.temperature,
            ),
        ):
            if chunk.text:
                yield f"data: {json.dumps({'content': chunk.text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
