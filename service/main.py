import os
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.reasoning import reason_endpoint, stream_reason_endpoint
from app.cache import RedisCache


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    app.state.redis = aioredis.from_url(redis_url, decode_responses=True)
    app.state.cache = RedisCache(app.state.redis)
    print("[Hermes] Worker started")
    yield
    # Shutdown
    await app.state.redis.close()
    print("[Hermes] Worker stopped")


app = FastAPI(
    title="Hermes Worker API",
    description="Deep reasoning worker with cloud LLM backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "hermes-worker"}


app.post("/reason")(reason_endpoint)
app.post("/reason/stream")(stream_reason_endpoint)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
