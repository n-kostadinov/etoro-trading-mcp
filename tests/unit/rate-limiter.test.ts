import { describe, expect, it } from "vitest";
import { SharedRateLimiter } from "../../src/transport/rate-limiter.js";
import type { RateLimitDescriptor } from "../../src/generator/manifest-types.js";

const descriptor: RateLimitDescriptor = {
  limit: 2,
  window: 60,
  shared: true,
  defaultPool: false,
  sharedWith: ["GET /api/v1/other", "GET /api/v2/market-data/rates"],
};

describe("shared rate limiting", () => {
  it("uses response snapshots to exhaust a shared pool once", () => {
    let currentTime = 1_000;
    const limiter = new SharedRateLimiter(() => currentTime);
    expect(limiter.acquire(descriptor, "GET /api/v2/market-data/rates")).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    limiter.update(descriptor, "GET /api/v2/market-data/rates", { remaining: 1, resetSeconds: 60 });
    expect(limiter.acquire(descriptor, "GET /api/v1/other").allowed).toBe(true);
    limiter.update(descriptor, "GET /api/v1/other", { remaining: 0, resetSeconds: 60 });
    const blocked = limiter.acquire(descriptor, "GET /api/v2/market-data/rates");
    expect(blocked).toEqual({ allowed: false, retryAfterMs: 60_000 });
    currentTime += 60_001;
    expect(limiter.acquire(descriptor, "GET /api/v2/market-data/rates").allowed).toBe(true);
  });

  it("keeps group identity stable when sharedWith ordering changes", () => {
    const limiter = new SharedRateLimiter();
    const reversed: RateLimitDescriptor = {
      ...descriptor,
      sharedWith: [...descriptor.sharedWith].reverse(),
    };
    const first = limiter.groupKey(descriptor, "GET /api/v2/market-data/rates");
    const second = limiter.groupKey(reversed, "GET /api/v2/market-data/rates");
    expect(second).toBe(first);
  });

  it("does not count an unknown pool until a response snapshot arrives", () => {
    const limiter = new SharedRateLimiter();
    for (let index = 0; index < 5; index += 1) {
      expect(limiter.acquire(descriptor, "GET /api/v2/market-data/rates").allowed).toBe(true);
    }
  });
});
