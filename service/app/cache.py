"""
Simple async cache for completed research results.
Key is derived from the research prompt so identical questions
return instantly without re-running the full ADK agent.
"""

from __future__ import annotations

import hashlib
import json
from typing import Optional


class InMemoryCache:
    """
    Lightweight in-process cache — resets on service restart.
    Sufficient for a hackathon; swap for Redis in production.
    """

    def __init__(self, max_size: int = 200, ttl_seconds: int = 3600) -> None:
        self._store: dict[str, dict] = {}
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds

    def _key(self, prompt: str, context: Optional[str] = None) -> str:
        raw = f"{prompt}:{context or ''}"
        return f"research:cache:{hashlib.md5(raw.encode()).hexdigest()}"

    def get(self, prompt: str, context: Optional[str] = None) -> Optional[str]:
        import time
        entry = self._store.get(self._key(prompt, context))
        if entry and time.time() - entry["ts"] < self.ttl_seconds:
            return entry["value"]
        return None

    def set(self, prompt: str, response: str, context: Optional[str] = None) -> None:
        import time
        if len(self._store) >= self.max_size:
            # Evict the oldest entry
            oldest = min(self._store, key=lambda k: self._store[k]["ts"])
            del self._store[oldest]
        self._store[self._key(prompt, context)] = {
            "value": response,
            "ts": time.time(),
        }

    def invalidate(self, prompt: str, context: Optional[str] = None) -> None:
        self._store.pop(self._key(prompt, context), None)

    def stats(self) -> dict:
        return {"size": len(self._store), "max_size": self.max_size}


# Module-level singleton
cache = InMemoryCache()
