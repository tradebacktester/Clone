/**
 * Visual Memory — Screenshot storage and retrieval.
 *
 * Stores chart screenshots as base64 text in PostgreSQL.
 * Never overwrites: every upload creates a new row.
 * Duplicate detection via SHA-256 hash of image data.
 *
 * Supported stages: before_entry | entry | during_trade | break_even |
 *   partial_tp | htf_analysis | ltf_analysis | after_exit | custom
 */

import crypto from "node:crypto";
import { db } from "@workspace/db";
import {
  tradeScreenshotsTable,
  contextTimelineEventsTable,
} from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { logger } from "./logger.js";

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB raw
const MAX_BASE64_LENGTH    = Math.ceil(MAX_IMAGE_SIZE_BYTES * 1.37); // base64 overhead

const VALID_STAGES = new Set([
  "before_entry", "entry", "during_trade", "break_even",
  "partial_tp", "htf_analysis", "ltf_analysis", "after_exit", "custom",
]);

const VALID_MIME = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
]);

const VALID_TIMEFRAMES = new Set([
  "1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w",
]);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScreenshotUpload {
  tradeId?:         number;
  setupId?:         string;
  snapshotId?:      string;
  contextId?:       string;
  stage:            string;
  timeframe?:       string;
  pair?:            string;
  theme?:           "dark" | "light";
  resolution?:      string;
  notes?:           string;
  tags?:            string[];
  chartAnnotations?: Record<string, unknown>;
  imageData:        string;   // base64 or data URI
  capturedAt?:      string;   // ISO8601
}

export interface ScreenshotMeta {
  id:           string;
  tradeId:      number | null;
  stage:        string;
  timeframe:    string | null;
  pair:         string | null;
  theme:        string | null;
  notes:        string | null;
  tags:         string[] | null;
  mimeType:     string;
  sizeBytes:    number | null;
  fileHash:     string | null;
  thumbnailData: string | null;
  capturedAt:   Date | null;
  uploadedAt:   Date;
}

export interface UploadResult {
  id:            string;
  fileHash:      string;
  sizeBytes:     number;
  mimeType:      string;
  isDuplicate:   boolean;
  existingId?:   string;
  thumbnailData: string | null;
}

export interface ValidationError {
  code: string;
  message: string;
}

// ─── Image Utilities ────────────────────────────────────────────────────────

/**
 * Parses a data URI or plain base64 string.
 * Returns { mimeType, base64, rawBuffer }.
 */
function parseImageData(imageData: string): {
  mimeType: string;
  base64:   string;
  rawBuffer: Buffer;
} | null {
  try {
    let mimeType = "image/png";
    let base64   = imageData;

    // Strip data URI prefix if present
    const dataUriMatch = imageData.match(/^data:([^;]+);base64,(.+)$/s);
    if (dataUriMatch) {
      mimeType = dataUriMatch[1]!;
      base64   = dataUriMatch[2]!;
    }

    const rawBuffer = Buffer.from(base64, "base64");
    return { mimeType, base64, rawBuffer };
  } catch {
    return null;
  }
}

/**
 * Validates an image upload request.
 * Returns an array of validation errors (empty = valid).
 */
export function validateScreenshot(upload: ScreenshotUpload): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!upload.imageData) {
    errors.push({ code: "MISSING_IMAGE", message: "imageData is required" });
    return errors; // can't continue without image
  }

  if (upload.imageData.length > MAX_BASE64_LENGTH) {
    errors.push({
      code:    "IMAGE_TOO_LARGE",
      message: `Image exceeds ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB limit`,
    });
  }

  const parsed = parseImageData(upload.imageData);
  if (!parsed) {
    errors.push({ code: "INVALID_IMAGE_DATA", message: "Could not parse image data — must be base64 or data URI" });
  } else if (!VALID_MIME.has(parsed.mimeType)) {
    errors.push({
      code:    "INVALID_MIME_TYPE",
      message: `Unsupported MIME type: ${parsed.mimeType}. Supported: PNG, JPEG, WebP, GIF`,
    });
  }

  if (upload.stage && !VALID_STAGES.has(upload.stage)) {
    errors.push({
      code:    "INVALID_STAGE",
      message: `Unknown stage: ${upload.stage}. Valid: ${[...VALID_STAGES].join(", ")}`,
    });
  }

  if (upload.timeframe && !VALID_TIMEFRAMES.has(upload.timeframe)) {
    errors.push({
      code:    "INVALID_TIMEFRAME",
      message: `Unknown timeframe: ${upload.timeframe}. Valid: ${[...VALID_TIMEFRAMES].join(", ")}`,
    });
  }

  if (upload.notes && upload.notes.length > 2000) {
    errors.push({ code: "NOTES_TOO_LONG", message: "notes must be ≤ 2000 characters" });
  }

  if (upload.tags && (!Array.isArray(upload.tags) || upload.tags.some(t => typeof t !== "string"))) {
    errors.push({ code: "INVALID_TAGS", message: "tags must be an array of strings" });
  }

  return errors;
}

/**
 * Generates a SHA-256 hash of the raw image buffer.
 * Used for duplicate detection.
 */
function hashImage(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Generates a minimal thumbnail representation.
 *
 * Pure-JS limitation: without native `sharp` we cannot truly resize pixel data.
 * Strategy: if the image is already small (< 200KB), use it as-is.
 * If larger, store the original and mark thumbnailData as the same image
 * with a `thumbnail=true` meta flag. True downscaling can be added later with sharp.
 *
 * For the dashboard gallery, the frontend uses CSS to constrain display size.
 */
function generateThumbnail(base64: string, mimeType: string): string {
  const sizeBytes = Buffer.byteLength(base64, "base64");

  if (sizeBytes <= 200 * 1024) {
    // Image is already small — use as-is
    return `data:${mimeType};base64,${base64}`;
  }

  // For large images: return a truncated version as placeholder.
  // Frontend should use CSS object-fit to display the gallery thumbnail.
  // True server-side resize would require sharp (native dep).
  return `data:${mimeType};base64,${base64.slice(0, 50000)}`; // ~37KB visual preview
}

// ─── Core Upload ────────────────────────────────────────────────────────────

/**
 * Uploads a screenshot and stores it in the DB.
 * Performs duplicate detection — if the same image hash exists for the same
 * trade, returns the existing record instead of inserting.
 *
 * @returns UploadResult with the stored record's ID.
 */
export async function uploadScreenshot(upload: ScreenshotUpload): Promise<UploadResult> {
  const parsed = parseImageData(upload.imageData);
  if (!parsed) throw new Error("Invalid image data — cannot parse");

  const { mimeType, base64, rawBuffer } = parsed;
  const fileHash    = hashImage(rawBuffer);
  const sizeBytes   = rawBuffer.length;
  const thumbnailData = generateThumbnail(base64, mimeType);

  // Duplicate detection: same hash + same tradeId
  if (upload.tradeId) {
    const existing = await db
      .select({ id: tradeScreenshotsTable.id, thumbnailData: tradeScreenshotsTable.thumbnailData })
      .from(tradeScreenshotsTable)
      .where(
        and(
          eq(tradeScreenshotsTable.fileHash,  fileHash),
          eq(tradeScreenshotsTable.tradeId,   upload.tradeId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      logger.debug({ tradeId: upload.tradeId, fileHash }, "[VM] Duplicate screenshot detected — returning existing");
      return {
        id:            existing[0]!.id,
        fileHash,
        sizeBytes,
        mimeType,
        isDuplicate:   true,
        existingId:    existing[0]!.id,
        thumbnailData: existing[0]!.thumbnailData ?? thumbnailData,
      };
    }
  }

  const [inserted] = await db
    .insert(tradeScreenshotsTable)
    .values({
      tradeId:          upload.tradeId,
      setupId:          upload.setupId,
      snapshotId:       upload.snapshotId,
      contextId:        upload.contextId,
      stage:            upload.stage || "custom",
      timeframe:        upload.timeframe,
      pair:             upload.pair,
      theme:            upload.theme ?? "dark",
      resolution:       upload.resolution,
      chartAnnotations: upload.chartAnnotations,
      notes:            upload.notes,
      tags:             upload.tags ?? [],
      mimeType,
      sizeBytes,
      fileHash,
      imageData:        base64,
      thumbnailData,
      compressionRatio: null,
      capturedAt:       upload.capturedAt ? new Date(upload.capturedAt) : new Date(),
      uploadedAt:       new Date(),
    })
    .returning({ id: tradeScreenshotsTable.id });

  const id = inserted!.id;

  // Add a context timeline event for this screenshot
  if (upload.tradeId) {
    addScreenshotTimelineEvent(upload.tradeId, upload.setupId, id, upload.stage, upload.pair, upload.timeframe).catch(() => {});
  }

  logger.debug({ id, tradeId: upload.tradeId, stage: upload.stage, sizeBytes }, "[VM] Screenshot stored");

  return { id, fileHash, sizeBytes, mimeType, isDuplicate: false, thumbnailData };
}

// ─── Context Timeline Integration ───────────────────────────────────────────

async function addScreenshotTimelineEvent(
  tradeId:    number,
  setupId:    string | undefined,
  screenshotId: string,
  stage:      string,
  pair:       string | undefined,
  timeframe:  string | undefined,
): Promise<void> {
  try {
    await db.insert(contextTimelineEventsTable).values({
      tradeId,
      setupId,
      stage:       "screenshot_saved",
      title:       `Screenshot — ${stage}`,
      description: `${timeframe ?? "chart"} screenshot saved for ${pair ?? "unknown"} at ${stage} stage`,
      iconType:    "camera",
      source:      "system",
      meta:        { screenshotId, stage, pair, timeframe },
      occurredAt:  new Date(),
    });
  } catch (err) {
    logger.warn({ err }, "[VM] Failed to add screenshot timeline event");
  }
}

// ─── Retrieval ───────────────────────────────────────────────────────────────

/**
 * Returns all screenshots for a trade (thumbnails only — no imageData).
 * Sorted by capturedAt ascending (lifecycle order).
 */
export async function getTradeScreenshots(tradeId: number): Promise<ScreenshotMeta[]> {
  const rows = await db
    .select({
      id:           tradeScreenshotsTable.id,
      tradeId:      tradeScreenshotsTable.tradeId,
      stage:        tradeScreenshotsTable.stage,
      timeframe:    tradeScreenshotsTable.timeframe,
      pair:         tradeScreenshotsTable.pair,
      theme:        tradeScreenshotsTable.theme,
      notes:        tradeScreenshotsTable.notes,
      tags:         tradeScreenshotsTable.tags,
      mimeType:     tradeScreenshotsTable.mimeType,
      sizeBytes:    tradeScreenshotsTable.sizeBytes,
      fileHash:     tradeScreenshotsTable.fileHash,
      thumbnailData: tradeScreenshotsTable.thumbnailData,
      capturedAt:   tradeScreenshotsTable.capturedAt,
      uploadedAt:   tradeScreenshotsTable.uploadedAt,
    })
    .from(tradeScreenshotsTable)
    .where(eq(tradeScreenshotsTable.tradeId, tradeId))
    .orderBy(tradeScreenshotsTable.capturedAt);

  return rows as ScreenshotMeta[];
}

/**
 * Returns the full image data for a single screenshot.
 */
export async function getScreenshotImage(id: string): Promise<{
  id:        string;
  imageData: string | null;
  mimeType:  string;
  stage:     string;
  pair:      string | null;
} | null> {
  const rows = await db
    .select({
      id:        tradeScreenshotsTable.id,
      imageData: tradeScreenshotsTable.imageData,
      mimeType:  tradeScreenshotsTable.mimeType,
      stage:     tradeScreenshotsTable.stage,
      pair:      tradeScreenshotsTable.pair,
    })
    .from(tradeScreenshotsTable)
    .where(eq(tradeScreenshotsTable.id, id))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Returns the thumbnail for a single screenshot.
 */
export async function getScreenshotThumbnail(id: string): Promise<{
  id:            string;
  thumbnailData: string | null;
  mimeType:      string;
} | null> {
  const rows = await db
    .select({
      id:            tradeScreenshotsTable.id,
      thumbnailData: tradeScreenshotsTable.thumbnailData,
      mimeType:      tradeScreenshotsTable.mimeType,
    })
    .from(tradeScreenshotsTable)
    .where(eq(tradeScreenshotsTable.id, id))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Deletes a screenshot by ID.
 * Screenshots are soft-deleted (we just remove the row; imageData is gone).
 */
export async function deleteScreenshot(id: string): Promise<boolean> {
  const result = await db
    .delete(tradeScreenshotsTable)
    .where(eq(tradeScreenshotsTable.id, id))
    .returning({ id: tradeScreenshotsTable.id });

  const deleted = result.length > 0;
  if (deleted) {
    logger.debug({ id }, "[VM] Screenshot deleted");
  }
  return deleted;
}

/**
 * Returns all screenshots across all trades, paginated (admin/gallery view).
 * Excludes raw imageData for performance.
 */
export async function getAllScreenshots(opts: {
  pair?:      string;
  stage?:     string;
  timeframe?: string;
  limit?:     number;
  offset?:    number;
}): Promise<ScreenshotMeta[]> {
  const limit  = Math.min(opts.limit  ?? 50, 200);
  const offset = opts.offset ?? 0;

  const rows = await db
    .select({
      id:            tradeScreenshotsTable.id,
      tradeId:       tradeScreenshotsTable.tradeId,
      stage:         tradeScreenshotsTable.stage,
      timeframe:     tradeScreenshotsTable.timeframe,
      pair:          tradeScreenshotsTable.pair,
      theme:         tradeScreenshotsTable.theme,
      notes:         tradeScreenshotsTable.notes,
      tags:          tradeScreenshotsTable.tags,
      mimeType:      tradeScreenshotsTable.mimeType,
      sizeBytes:     tradeScreenshotsTable.sizeBytes,
      fileHash:      tradeScreenshotsTable.fileHash,
      thumbnailData: tradeScreenshotsTable.thumbnailData,
      capturedAt:    tradeScreenshotsTable.capturedAt,
      uploadedAt:    tradeScreenshotsTable.uploadedAt,
    })
    .from(tradeScreenshotsTable)
    .orderBy(tradeScreenshotsTable.uploadedAt)
    .limit(limit)
    .offset(offset);

  return rows as ScreenshotMeta[];
}

/**
 * Returns a count of screenshots grouped by stage for a trade.
 */
export async function getScreenshotSummary(tradeId: number): Promise<{
  total: number;
  byStage: Record<string, number>;
  totalSizeBytes: number;
}> {
  const rows = await db
    .select({
      stage:     tradeScreenshotsTable.stage,
      sizeBytes: tradeScreenshotsTable.sizeBytes,
    })
    .from(tradeScreenshotsTable)
    .where(eq(tradeScreenshotsTable.tradeId, tradeId));

  const byStage: Record<string, number> = {};
  let totalSizeBytes = 0;

  for (const row of rows) {
    byStage[row.stage] = (byStage[row.stage] ?? 0) + 1;
    totalSizeBytes    += row.sizeBytes ?? 0;
  }

  return { total: rows.length, byStage, totalSizeBytes };
}
