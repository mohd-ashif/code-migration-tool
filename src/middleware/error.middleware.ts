import { Request, Response, NextFunction } from "express";

export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction) {
  const message = error instanceof Error ? error.message : "Internal server error";
  console.error(error);
  res.status(500).json({ success: false, message });
}
