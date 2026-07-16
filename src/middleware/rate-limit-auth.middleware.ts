import { Request, Response, NextFunction } from "express";

const limitStore = new Map<string, { count: number; resetTime: number }>();

export function createAuthRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "unknown";
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    const record = limitStore.get(key);

    if (!record) {
      limitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      limitStore.set(key, record);
      return next();
    }

    record.count += 1;
    limitStore.set(key, record);

    if (record.count > maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({
        success: false,
        message: `Too many requests. Please try again in ${retryAfter} seconds.`,
      });
    }

    next();
  };
}
