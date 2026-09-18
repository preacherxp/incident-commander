import { describe, expect, test } from "bun:test";
import { canonicalHash, canonicalJsonStringify } from "@incident-commander/contracts";
import { createFallbackVoice } from "@incident-commander/ai";
import { createApp } from "../src/app";
import { loadEnv } from "../src/env";
import { SlidingWindowLimiter } from "../src/rate-limit";
import type { Database } from "@incident-commander/db";

const env = loadEnv({
  DATABASE_URL: "postgres://localhost/test",
  APP_ORIGIN: "http://localhost:5173",
  PORT: "3000",
  AI_PROVIDER: "disabled",
});

const stubDb = {
  execute: async () => [],
  select: () => {
    throw new Error("no database access expected in this test");
  },
} as unknown as Database;

describe("origin guard", () => {
  test("rejects cross-origin state-changing requests before touching the database", async () => {
    const app = createApp({ env, db: stubDb, voice: createFallbackVoice() });
    const response = await app.request("/api/v1/guest-session", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; retryable: boolean } };
    expect(body.error.code).toBe("ORIGIN_REJECTED");
    expect(body.error.retryable).toBe(false);
  });

  test("allows reads from any origin", async () => {
    const app = createApp({ env, db: stubDb, voice: createFallbackVoice() });
    const response = await app.request("/api/v1/health", {
      headers: { origin: "https://evil.example" },
    });
    expect(response.status).toBe(200);
  });
});

describe("sliding window limiter", () => {
  test("blocks beyond the limit and reports retry timing", () => {
    const limiter = new SlidingWindowLimiter(2, 1000);
    expect(limiter.check("guest", 0).allowed).toBe(true);
    expect(limiter.check("guest", 1).allowed).toBe(true);
    const blocked = limiter.check("guest", 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(limiter.check("guest", 1001).allowed).toBe(true);
    expect(limiter.check("other", 2).allowed).toBe(true);
  });
});

describe("canonical hashing", () => {
  test("is stable across key order and rejects undefined", async () => {
    const a = await canonicalHash({ b: 1, a: [2, 3], c: null });
    const b = await canonicalHash({ c: null, a: [2, 3], b: 1 });
    expect(a).toBe(b);
    expect(() => canonicalJsonStringify({ a: undefined })).toThrow();
  });
});
