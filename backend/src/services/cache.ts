import Redis from 'ioredis';

let redis: Redis | null = null;
let redisAvailable = false;

export async function initRedis(): Promise<void> {
  try {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      retryStrategy(times) {
        if (times > 3) {
          console.warn('[Cache] Redis unavailable, running without cache');
          return null; // stop retrying
        }
        return Math.min(times * 50, 2000);
      },
    });

    // Wait for connection or timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, 5000);

      redis!.on('connect', () => {
        clearTimeout(timeout);
        redisAvailable = true;
        console.log('[Cache] Redis connected');
        resolve();
      });

      redis!.on('error', (err) => {
        clearTimeout(timeout);
        console.warn('[Cache] Redis error:', err.message);
        reject(err);
      });
    });
  } catch (err: any) {
    console.warn('[Cache] Redis not available, running without cache:', err.message);
    redisAvailable = false;
    redis = null;
  }
}

export function getRedis(): Redis | null {
  return redis;
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

const DEFAULT_TTL = 3600; // 1 hour

export async function getCached(key: string): Promise<string | null> {
  if (!redisAvailable || !redis) return null;
  try {
    return await redis.get(`cache:${key}`);
  } catch {
    return null;
  }
}

export async function setCache(key: string, value: string, ttl = DEFAULT_TTL): Promise<void> {
  if (!redisAvailable || !redis) return;
  try {
    await redis.set(`cache:${key}`, value, 'EX', ttl);
  } catch {
    // silently ignore cache write failures
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  if (!redisAvailable || !redis) return;
  try {
    const keys = await redis.keys(`cache:${pattern}`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // silently ignore
  }
}

export function buildCacheKey(parts: string[]): string {
  return parts.join(':');
}
