import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";

let rateLimiter: Ratelimit | null = null;
let redisClient: Redis | null = null;

export function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("API rate limiting is not configured. Set the Upstash REST URL and token.");
  }
  if (!redisClient) redisClient = new Redis({ url, token });
  return redisClient;
}

export function getRateLimiter(): Ratelimit {
  const redis = getRedis();
  if (!rateLimiter) {
    rateLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        Math.max(1, Number(process.env.MICROSCOPE_API_RATE_LIMIT) || 30),
        "1 h"
      ),
      prefix: "biovision:ratelimit",
      analytics: false
    });
  }
  return rateLimiter;
}

export function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
