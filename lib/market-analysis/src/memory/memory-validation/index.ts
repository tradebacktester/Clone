// ─── Memory Validation ─────────────────────────────────────────────────────
// Validates memory records before they are written or updated.
// Returns structured ValidationResult objects — never throws on bad data.

import crypto from "crypto";
import type {
  InsertSetupMemory,
  InsertSkippedSetupMemory,
  InsertMarketSnapshotMemory,
  InsertMemoryMetadata,
} from "@workspace/db";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface HashInput {
  table: string;
  recordId: string;
  payload: Record<string, unknown>;
}

// ─── Generic Helpers ───────────────────────────────────────────────────────

function isValidPair(pair: string): boolean {
  return ["EURUSD", "GBPUSD", "USDJPY"].includes(pair.toUpperCase().replace("/", ""));
}

function isValidDirection(direction: string): boolean {
  return ["long", "short", "buy", "sell"].includes(direction.toLowerCase());
}

function isValidSession(session: string): boolean {
  return ["london", "new_york", "asian", "overlap", "unknown"].includes(session.toLowerCase());
}

function isFiniteNumeric(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const n = Number(value);
  return Number.isFinite(n);
}

// ─── Setup Memory Validation ───────────────────────────────────────────────

export function validateSetupMemory(data: Partial<InsertSetupMemory>): ValidationResult {
  const errors: string[] = [];

  if (!data.pair) {
    errors.push("pair is required");
  } else if (!isValidPair(data.pair)) {
    errors.push(`invalid pair: ${data.pair}`);
  }

  if (!data.direction) {
    errors.push("direction is required");
  } else if (!isValidDirection(data.direction)) {
    errors.push(`invalid direction: ${data.direction}`);
  }

  if (!data.session) {
    errors.push("session is required");
  } else if (!isValidSession(data.session)) {
    errors.push(`invalid session: ${data.session}`);
  }

  const scores = [
    "zoneScore", "liquidityScore", "amdScore", "confirmationScore", "confidence",
  ] as const;

  for (const field of scores) {
    const val = data[field];
    if (val !== undefined && val !== null) {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        errors.push(`${field} must be between 0 and 100, got: ${val}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Skipped Setup Validation ──────────────────────────────────────────────

export function validateSkippedSetupMemory(data: Partial<InsertSkippedSetupMemory>): ValidationResult {
  const errors: string[] = [];

  if (!data.pair) errors.push("pair is required");
  if (!data.direction) errors.push("direction is required");
  if (!data.session) errors.push("session is required");

  if (!data.skipReason || data.skipReason.trim() === "") {
    errors.push("skipReason is required");
  }

  if (!data.rejectingRule || data.rejectingRule.trim() === "") {
    errors.push("rejectingRule is required");
  }

  if (!data.rejectingModule || data.rejectingModule.trim() === "") {
    errors.push("rejectingModule is required");
  }

  if (!isFiniteNumeric(data.priceAtSkip)) {
    errors.push("priceAtSkip must be a valid number");
  }

  return { valid: errors.length === 0, errors };
}

// ─── Market Snapshot Validation ────────────────────────────────────────────

export function validateMarketSnapshot(data: Partial<InsertMarketSnapshotMemory>): ValidationResult {
  const errors: string[] = [];

  if (!data.pair) {
    errors.push("pair is required");
  } else if (!isValidPair(data.pair)) {
    errors.push(`invalid pair: ${data.pair}`);
  }

  if (!data.session) errors.push("session is required");

  const priceFields = ["priceOpen", "priceHigh", "priceLow", "priceClose"] as const;
  for (const field of priceFields) {
    if (!isFiniteNumeric(data[field])) {
      errors.push(`${field} must be a valid finite number`);
    }
  }

  if (
    data.priceHigh !== undefined && data.priceLow !== undefined &&
    data.priceHigh !== null && data.priceLow !== null
  ) {
    if (Number(data.priceHigh) < Number(data.priceLow)) {
      errors.push("priceHigh must be >= priceLow");
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Metadata Validation ───────────────────────────────────────────────────

export function validateMemoryMetadata(data: Partial<InsertMemoryMetadata>): ValidationResult {
  const errors: string[] = [];

  if (!data.recordId || data.recordId.trim() === "") {
    errors.push("recordId is required");
  }

  if (!data.recordTable || data.recordTable.trim() === "") {
    errors.push("recordTable is required");
  }

  if (!data.dataHash || data.dataHash.trim() === "") {
    errors.push("dataHash is required");
  }

  if (!data.sourceModule || data.sourceModule.trim() === "") {
    errors.push("sourceModule is required");
  }

  return { valid: errors.length === 0, errors };
}

// ─── Timestamp Validation ──────────────────────────────────────────────────

export function validateTimestamps(
  createdAt?: Date | null,
  updatedAt?: Date | null,
): ValidationResult {
  const errors: string[] = [];

  if (createdAt && isNaN(createdAt.getTime())) {
    errors.push("createdAt is an invalid date");
  }

  if (updatedAt && isNaN(updatedAt.getTime())) {
    errors.push("updatedAt is an invalid date");
  }

  if (createdAt && updatedAt && updatedAt < createdAt) {
    errors.push("updatedAt must be >= createdAt");
  }

  return { valid: errors.length === 0, errors };
}

// ─── Data Integrity Hash ───────────────────────────────────────────────────

export function computeDataHash(input: HashInput): string {
  const payload = JSON.stringify({
    table:    input.table,
    recordId: input.recordId,
    data:     input.payload,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function verifyDataHash(input: HashInput, expectedHash: string): boolean {
  return computeDataHash(input) === expectedHash;
}
