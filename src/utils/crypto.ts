import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}


export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 2) {
    return false;
  }
  const [salt, hash] = parts;
  const verifyHash = scryptSync(password, salt, 64).toString("hex");
  
  const hashBuffer = Buffer.from(hash, "hex");
  const verifyBuffer = Buffer.from(verifyHash, "hex");
  
  if (hashBuffer.length !== verifyBuffer.length) {
    return false;
  }
  
  return timingSafeEqual(hashBuffer, verifyBuffer);
}
