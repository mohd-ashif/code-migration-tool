import { ParsedFile } from "../types/parser.types";

export function validateParseRequest(body: any): body is { projectFiles?: ParsedFile[] } {
  if (!body) return false;
  if (body.projectFiles && !Array.isArray(body.projectFiles)) return false;
  return true;
}
