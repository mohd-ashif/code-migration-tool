import { Request, Response, NextFunction } from "express";

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction) {
  const message = error instanceof Error ? error.message : "Internal server error";
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  console.error(error);
  res.status(statusCode).json({ success: false, message });
}

