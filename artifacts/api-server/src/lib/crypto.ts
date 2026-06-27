import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { logger } from "./logger.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const ENC_PREFIX = "enc:";

if (!process.env["BROKER_ENCRYPTION_KEY"]) {
  logger.warn(
    "BROKER_ENCRYPTION_KEY environment variable is not set. " +
    "Broker API keys will be stored in plaintext. " +
    "Set a 64-character hex string before production deployment.",
  );
}

function getKey(): Buffer | null {
  const keyHex = process.env["BROKER_ENCRYPTION_KEY"];
  if (!keyHex) return null;
  const buf = Buffer.from(keyHex, "hex");
  if (buf.length !== 32) {
    logger.warn(
      "BROKER_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). " +
      "Encryption is disabled.",
    );
    return null;
  }
  return buf;
}

export function encryptCredential(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptCredential(stored: string | null | undefined): string {
  if (!stored) return "";
  if (!stored.startsWith(ENC_PREFIX)) return stored;

  const key = getKey();
  if (!key) {
    logger.error("Cannot decrypt broker credential: BROKER_ENCRYPTION_KEY not set");
    return "";
  }

  try {
    const payload = stored.slice(ENC_PREFIX.length);
    const colonIdx1 = payload.indexOf(":");
    const colonIdx2 = payload.indexOf(":", colonIdx1 + 1);
    if (colonIdx1 === -1 || colonIdx2 === -1) throw new Error("Malformed encrypted credential");

    const iv = Buffer.from(payload.slice(0, colonIdx1), "hex");
    const tag = Buffer.from(payload.slice(colonIdx1 + 1, colonIdx2), "hex");
    const ciphertext = Buffer.from(payload.slice(colonIdx2 + 1), "hex");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (err) {
    logger.error({ err }, "Failed to decrypt broker credential");
    return "";
  }
}
