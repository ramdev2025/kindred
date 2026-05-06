from typing import Optional
import hashlib

import redis.asyncio as aioredis


class RedisCache:
    def __init__(self, redis: aioredis.Redis):
        self.redis = redis
        self.default_ttl = 3600  # 1 hour

    def _key(self, prompt: str, context: Optional[str] = None) -> str:
        raw = f"{prompt}:{context or ''}"
        return f"hermes:cache:{hashlib.md5(raw.encode()).hexdigest()}"

    async def get(self, prompt: str, context: Optional[str] = None) -> Optional[str]:
        return await self.redis.get(self._key(prompt, context))

    async def set(self, prompt: str, response: str, context: Optional[str] = None, ttl: int = 0):
        await self.redis.set(
            self._key(prompt, context),
            response,
            ex=ttl or self.default_ttl,
        )
