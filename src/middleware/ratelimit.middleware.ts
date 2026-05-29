import { Request, Response, NextFunction } from "express";

const requests = new Map<string, { count: number; started: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = requests.get(key) ?? { count: 0, started: now };

  if (now - entry.started > WINDOW_MS) {
    entry.count = 0;
    entry.started = now;
  }

  entry.count += 1;
  requests.set(key, entry);

  if (entry.count > MAX_REQUESTS) {
    return res.status(429).json({ success: false, message: "Too many requests." });
  }

  next();
}
