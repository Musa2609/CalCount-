/**
 * Rate limiting.
 *
 * This is an in-memory fixed window, so it is per warm instance rather than
 * global: it stops a single client from hammering one instance (and burning
 * Gemini credit), but N instances allow N times the quota. Supabase also
 * applies its own per-project function limits. For a hard global cap, move the
 * counters into Postgres and increment them atomically.
 */
export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateDecision;
  size(): number;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): RateLimiter {
  const { limit, windowMs, maxKeys = 5_000 } = options;
  const hits = new Map<string, number[]>();

  return {
    check(key: string, now: number = Date.now()): RateDecision {
      const cutoff = now - windowMs;
      const recent = (hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
      if (recent.length >= limit) {
        const oldest = recent[0];
        const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
        hits.set(key, recent);
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }
      recent.push(now);
      hits.set(key, recent);

      // Keep memory bounded if many users hit this instance.
      if (hits.size > maxKeys) {
        for (const [existingKey, timestamps] of hits) {
          if (timestamps.every((timestamp) => timestamp <= cutoff)) hits.delete(existingKey);
          if (hits.size <= maxKeys) break;
        }
        if (hits.size > maxKeys) {
          const oldestKey = hits.keys().next().value;
          if (oldestKey !== undefined) hits.delete(oldestKey);
        }
      }

      return { allowed: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
    },
    size() {
      return hits.size;
    },
  };
}

/** Tracks concurrent analyses so one instance cannot be drained at once. */
export function createConcurrencyGuard(maxConcurrent: number) {
  let active = 0;
  return {
    tryAcquire(): boolean {
      if (active >= maxConcurrent) return false;
      active += 1;
      return true;
    },
    release(): void {
      active = Math.max(0, active - 1);
    },
    active(): number {
      return active;
    },
  };
}
