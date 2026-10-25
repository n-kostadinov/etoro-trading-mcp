import { createHash } from "node:crypto";
import type { RateLimitDescriptor } from "../generator/manifest-types.js";

interface RateLimitState {
  remaining: number | null;
  resetAt: number;
}

export interface AcquireResult {
  allowed: boolean;
  retryAfterMs: number;
}

export class SharedRateLimiter {
  private readonly states = new Map<string, RateLimitState>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  groupKey(rateLimit: RateLimitDescriptor, operationIdentity: string): string {
    if (rateLimit.defaultPool) {
      return createHash("sha256")
        .update(
          JSON.stringify({ pool: "default", limit: rateLimit.limit, window: rateLimit.window }),
        )
        .digest("hex");
    }
    const identities = [...new Set([operationIdentity, ...rateLimit.sharedWith])].sort();
    return createHash("sha256")
      .update(JSON.stringify({ identities, limit: rateLimit.limit, window: rateLimit.window }))
      .digest("hex");
  }

  acquire(rateLimit: RateLimitDescriptor, operationIdentity: string): AcquireResult {
    const key = this.groupKey(rateLimit, operationIdentity);
    const state = this.states.get(key);
    const currentTime = this.now();
    if (state === undefined) {
      this.states.set(key, { remaining: null, resetAt: 0 });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (state.remaining === null) {
      return { allowed: true, retryAfterMs: 0 };
    }
    if (state.resetAt <= currentTime) {
      this.states.set(key, { remaining: null, resetAt: 0 });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (state.remaining > 0) {
      this.states.set(key, { ...state, remaining: state.remaining - 1 });
      return { allowed: true, retryAfterMs: 0 };
    }
    return { allowed: false, retryAfterMs: state.resetAt - currentTime };
  }

  update(
    rateLimit: RateLimitDescriptor,
    operationIdentity: string,
    snapshot: { remaining?: number | null; resetSeconds?: number | null },
  ): void {
    if (snapshot.remaining === undefined || snapshot.remaining === null) {
      return;
    }
    const key = this.groupKey(rateLimit, operationIdentity);
    const resetSeconds =
      snapshot.resetSeconds !== undefined && snapshot.resetSeconds !== null
        ? snapshot.resetSeconds
        : rateLimit.window;
    this.states.set(key, {
      remaining: snapshot.remaining,
      resetAt: this.now() + resetSeconds * 1000,
    });
  }

  localRetryAfterMs(rateLimit: RateLimitDescriptor, operationIdentity: string): number {
    const key = this.groupKey(rateLimit, operationIdentity);
    const state = this.states.get(key);
    if (state === undefined || state.remaining === null || state.remaining > 0) {
      return 0;
    }
    return Math.max(0, state.resetAt - this.now());
  }
}
