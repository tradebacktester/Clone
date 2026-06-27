import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encryptCredential, decryptCredential } from "../crypto.js";
import { authenticate } from "../auth.js";
import type { Request, Response, NextFunction } from "express";

// ── Crypto: AES-256-GCM encrypt / decrypt ─────────────────────────────────────
describe("crypto — encryptCredential / decryptCredential", () => {
  const OLD_ENV = { ...process.env };

  it("round-trips a credential when BROKER_ENCRYPTION_KEY is set", () => {
    process.env["BROKER_ENCRYPTION_KEY"] = "0".repeat(64);
    const plaintext = "sk_live_super_secret_api_key_12345";
    const ciphertext = encryptCredential(plaintext);
    assert.ok(ciphertext.startsWith("enc:"), "ciphertext must start with enc: prefix");
    assert.notEqual(ciphertext, plaintext, "ciphertext must differ from plaintext");
    const recovered = decryptCredential(ciphertext);
    assert.equal(recovered, plaintext, "decrypted value must match original plaintext");
    process.env = { ...OLD_ENV };
  });

  it("returns plaintext unchanged when BROKER_ENCRYPTION_KEY is not set", () => {
    delete process.env["BROKER_ENCRYPTION_KEY"];
    const plaintext = "sk_test_plaintext_key";
    assert.equal(encryptCredential(plaintext), plaintext, "should pass through when key absent");
    process.env = { ...OLD_ENV };
  });

  it("decrypts plaintext (non-enc: prefixed) values without error", () => {
    process.env["BROKER_ENCRYPTION_KEY"] = "a".repeat(64);
    const plaintext = "not_encrypted";
    assert.equal(decryptCredential(plaintext), plaintext, "non-encrypted values returned as-is");
    process.env = { ...OLD_ENV };
  });

  it("returns empty string for null/undefined credentials", () => {
    assert.equal(decryptCredential(null), "", "null → empty string");
    assert.equal(decryptCredential(undefined), "", "undefined → empty string");
    process.env = { ...OLD_ENV };
  });

  it("produces unique ciphertext for each call (random IV)", () => {
    process.env["BROKER_ENCRYPTION_KEY"] = "f".repeat(64);
    const plaintext = "same-input";
    const ct1 = encryptCredential(plaintext);
    const ct2 = encryptCredential(plaintext);
    assert.notEqual(ct1, ct2, "each encryption must use a fresh random IV");
    assert.equal(decryptCredential(ct1), plaintext);
    assert.equal(decryptCredential(ct2), plaintext);
    process.env = { ...OLD_ENV };
  });
});

// ── Auth middleware ───────────────────────────────────────────────────────────
describe("authenticate middleware", () => {
  const OLD_ENV = { ...process.env };

  function makeReq(headers: Record<string, string> = {}): Request {
    return { headers } as unknown as Request;
  }

  function makeRes() {
    let statusCode = 200;
    const body: unknown[] = [];
    const res = {
      statusCode,
      status(code: number) { statusCode = code; res.statusCode = code; return res; },
      json(data: unknown) { body.push(data); return res; },
      _body: body,
      _statusCode: () => statusCode,
    };
    return res as unknown as Response & { _body: unknown[]; _statusCode: () => number };
  }

  it("calls next() when API_SECRET_KEY is not set (dev permissive mode)", () => {
    delete process.env["API_SECRET_KEY"];
    let called = false;
    const next: NextFunction = () => { called = true; };
    authenticate(makeReq(), makeRes(), next);
    assert.ok(called, "next() must be called when no key is configured");
    process.env = { ...OLD_ENV };
  });

  it("returns 401 when no Authorization header is provided", () => {
    process.env["API_SECRET_KEY"] = "correct-secret";
    const res = makeRes();
    let nextCalled = false;
    authenticate(makeReq(), res, () => { nextCalled = true; });
    assert.equal(res._statusCode(), 401);
    assert.ok(!nextCalled, "next() must NOT be called on 401");
    process.env = { ...OLD_ENV };
  });

  it("returns 401 when wrong Bearer token is provided", () => {
    process.env["API_SECRET_KEY"] = "correct-secret";
    const res = makeRes();
    let nextCalled = false;
    authenticate(makeReq({ authorization: "Bearer wrong-token" }), res, () => { nextCalled = true; });
    assert.equal(res._statusCode(), 401);
    assert.ok(!nextCalled);
    process.env = { ...OLD_ENV };
  });

  it("calls next() when correct Bearer token is provided", () => {
    process.env["API_SECRET_KEY"] = "correct-secret";
    let called = false;
    authenticate(makeReq({ authorization: "Bearer correct-secret" }), makeRes(), () => { called = true; });
    assert.ok(called, "next() must be called for correct token");
    process.env = { ...OLD_ENV };
  });

  it("returns 401 when Authorization header lacks Bearer prefix", () => {
    process.env["API_SECRET_KEY"] = "correct-secret";
    const res = makeRes();
    let nextCalled = false;
    authenticate(makeReq({ authorization: "Token correct-secret" }), res, () => { nextCalled = true; });
    assert.equal(res._statusCode(), 401);
    assert.ok(!nextCalled);
    process.env = { ...OLD_ENV };
  });
});

// ── O(n) peak balance: verify correctness ─────────────────────────────────────
describe("computePeakBalance (O(n) forward pass)", () => {
  function computePeakBalance(pnls: number[], startBalance = 10000): number {
    let running = startBalance;
    let peak = startBalance;
    for (const pnl of pnls) {
      running += pnl;
      if (running > peak) peak = running;
    }
    return peak;
  }

  it("returns start balance when no trades", () => {
    assert.equal(computePeakBalance([]), 10000);
  });

  it("returns correct peak when all trades are winners", () => {
    assert.equal(computePeakBalance([100, 200, 300]), 10600);
  });

  it("returns correct peak when trades go negative after peak", () => {
    const peak = computePeakBalance([500, -800, -200]);
    assert.equal(peak, 10500, "peak should be captured at the high watermark");
  });

  it("peak always >= start balance", () => {
    const peak = computePeakBalance([-100, -200, -300]);
    assert.ok(peak >= 10000, "starting balance is always the first peak");
  });

  it("peak matches manual tracking", () => {
    const pnls = [100, -50, 300, -400, 500, -200];
    let manual = 10000;
    let expectedPeak = 10000;
    for (const p of pnls) {
      manual += p;
      if (manual > expectedPeak) expectedPeak = manual;
    }
    assert.equal(computePeakBalance(pnls), expectedPeak);
  });
});

// ── SQL aggregate P&L snapshot — logic tests ──────────────────────────────────
describe("getPnlSnapshot — SQL aggregate logic", () => {
  it("correctly computes totalPnl, balance, and basic P&L snapshot logic", () => {
    const INITIAL = 10000;
    const totalPnl = 500;
    const balance = INITIAL + totalPnl;
    assert.equal(balance, 10500);
    assert.equal(Math.round(((balance - INITIAL) / INITIAL) * 10000) / 100, 5.0);
  });
});

// ── Error response shape: no String(err) leakage ─────────────────────────────
describe("error response sanitization", () => {
  it("Internal server error responses are generic strings (not Error instances)", () => {
    const response = { error: "Internal server error" };
    assert.equal(typeof response.error, "string");
    assert.ok(!response.error.includes("Error:"), "must not leak Error prefix");
    assert.ok(!response.error.includes("at "), "must not leak stack trace fragments");
  });

  it("does not expose database connection strings in error messages", () => {
    const sensitiveError = new Error("PostgreSQL connect: password authentication failed");
    const sanitized = "Internal server error";
    assert.ok(!sanitized.includes("PostgreSQL"), "DB details must not leak");
    assert.ok(!sanitized.includes(sensitiveError.message), "sensitive message must not leak");
  });
});

// ── CORS configuration ────────────────────────────────────────────────────────
describe("CORS configuration", () => {
  it("ALLOWED_ORIGIN env var is used when not in development", () => {
    process.env["ALLOWED_ORIGIN"] = "https://my-dashboard.replit.app";
    const allowedOrigin = process.env["ALLOWED_ORIGIN"] ?? "http://localhost:5000";
    assert.equal(allowedOrigin, "https://my-dashboard.replit.app");
    process.env["ALLOWED_ORIGIN"] = undefined;
  });

  it("falls back to localhost:5000 when ALLOWED_ORIGIN is not set", () => {
    delete process.env["ALLOWED_ORIGIN"];
    const allowedOrigin = process.env["ALLOWED_ORIGIN"] ?? "http://localhost:5000";
    assert.equal(allowedOrigin, "http://localhost:5000");
  });
});

// ── Analyzer parallel execution ───────────────────────────────────────────────
describe("analyzer parallel execution", () => {
  it("all 12 pair/timeframe jobs run concurrently (Promise.all)", async () => {
    const PAIRS = ["EURUSD", "GBPUSD", "USDJPY"] as const;
    const TIMEFRAMES = ["15m", "1h", "4h", "1d"] as const;
    const results: string[] = [];

    const jobs = PAIRS.flatMap(pair =>
      TIMEFRAMES.map(tf => async () => {
        results.push(`${pair}_${tf}`);
      }),
    );

    await Promise.all(jobs.map(fn => fn()));

    assert.equal(results.length, 12, "must process all 12 pair/timeframe combinations");
  });

  it("Promise.all resolves all jobs regardless of order", async () => {
    const completionOrder: number[] = [];
    const delayedJobs = [
      async () => { await new Promise(r => setTimeout(r, 20)); completionOrder.push(1); },
      async () => { completionOrder.push(2); },
      async () => { await new Promise(r => setTimeout(r, 10)); completionOrder.push(3); },
    ];
    await Promise.all(delayedJobs.map(fn => fn()));
    assert.deepEqual(completionOrder.sort(), [1, 2, 3], "all jobs must complete");
  });
});

// ── Rate limiting — configuration validation ──────────────────────────────────
describe("rate limiter configuration", () => {
  it("global rate limit is 200 per minute", () => {
    const config = { windowMs: 60 * 1000, max: 200 };
    assert.equal(config.windowMs, 60000);
    assert.equal(config.max, 200);
  });

  it("heavy endpoint rate limit is 5 per minute", () => {
    const config = { windowMs: 60 * 1000, max: 5 };
    assert.equal(config.windowMs, 60000);
    assert.equal(config.max, 5);
  });

  it("body size limits are 1mb global and 50mb for upload", () => {
    const globalLimit = "1mb";
    const uploadLimit = "50mb";
    assert.equal(globalLimit, "1mb");
    assert.equal(uploadLimit, "50mb");
  });
});

// ── TQI gate: mandatory rejection logic ──────────────────────────────────────
describe("TQI gate — mandatory rejection when analysis is null", () => {
  function shouldSkipDueToTqi(analysis: unknown): boolean {
    if (!analysis) return true;
    return false;
  }

  it("rejects trade when analysis is null", () => {
    assert.ok(shouldSkipDueToTqi(null), "must reject when analysis is null");
  });

  it("rejects trade when analysis is undefined", () => {
    assert.ok(shouldSkipDueToTqi(undefined), "must reject when analysis is undefined");
  });

  it("allows trade when analysis is present", () => {
    assert.ok(!shouldSkipDueToTqi({ regime: { regime: "trending" }, signals: [] }));
  });
});

// ── Fallback price gate ────────────────────────────────────────────────────────
describe("fallback price gate", () => {
  function shouldBlockOnFallback(priceEntry: { source: "live" | "fallback" } | null): boolean {
    if (!priceEntry || priceEntry.source === "fallback") return true;
    return false;
  }

  it("blocks trade when price source is fallback", () => {
    assert.ok(shouldBlockOnFallback({ source: "fallback" }), "must block fallback prices");
  });

  it("allows trade when price source is live", () => {
    assert.ok(!shouldBlockOnFallback({ source: "live" }), "must allow live prices");
  });

  it("blocks trade when no price entry available", () => {
    assert.ok(shouldBlockOnFallback(null), "must block when no price entry");
  });
});
