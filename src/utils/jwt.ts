import { createHmac } from "crypto";

function base64url(buf: Buffer): string {
  return buf.toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function signJwt(payload: any, secret: string, expiresInSeconds: number): string {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };
  
  const encodedHeader = base64url(Buffer.from(JSON.stringify(header)));
  const encodedPayload = base64url(Buffer.from(JSON.stringify(fullPayload)));
  
  const signature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  
  const encodedSignature = base64url(signature);
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

export function verifyJwt(token: string, secret: string): any {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT token format");
  }
  
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  
  const signature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  
  const expectedSignature = base64url(signature);
  if (encodedSignature !== expectedSignature) {
    throw new Error("Invalid JWT signature");
  }
  
  const payloadStr = Buffer.from(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const payload = JSON.parse(payloadStr);
  
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error("JWT token expired");
  }
  
  return payload;
}
