import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger.js";

if (!process.env["API_SECRET_KEY"]) {
  logger.warn(
    "API_SECRET_KEY environment variable is not set. " +
    "All /api endpoints are publicly accessible. " +
    "Set API_SECRET_KEY before any production deployment.",
  );
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const apiSecretKey = process.env["API_SECRET_KEY"];

  if (!apiSecretKey) {
    next();
    return;
  }

  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== apiSecretKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
