import { Request, Response, NextFunction } from "express";
import { validateParseRequest } from "../validators/parse.schema";
import { validateMigrationRequest } from "../validators/migrate.schema";
import { validateReportRequest } from "../validators/report.schema";

export function validateParsePayload(req: Request, res: Response, next: NextFunction) {
  const valid = validateParseRequest(req.body);
  if (!valid) {
    return res.status(400).json({ success: false, message: "Invalid parse payload." });
  }
  next();
}

export function validateMigrationPayload(req: Request, res: Response, next: NextFunction) {
  const valid = validateMigrationRequest(req.body);
  if (!valid) {
    return res.status(400).json({ success: false, message: "Invalid migration payload." });
  }
  next();
}

export function validateReportPayload(req: Request, res: Response, next: NextFunction) {
  const valid = validateReportRequest(req.body);
  if (!valid) {
    return res.status(400).json({ success: false, message: "Invalid report payload." });
  }
  next();
}
