import { signJwt, verifyJwt } from "../jwt";

describe("JWT Helper Utility Unit Tests", () => {
  const secret = "super-secret-key-123456";

  it("should sign a token and verify it successfully", () => {
    const payload = { userId: "user-123", email: "test@example.com" };
    const token = signJwt(payload, secret, 60);

    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);

    const decoded = verifyJwt(token, secret);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.exp).toBeDefined();
  });

  it("should throw error if token is expired", () => {
    const payload = { userId: "user-123" };
    // Sign with negative expiry time (already expired)
    const token = signJwt(payload, secret, -10);

    expect(() => verifyJwt(token, secret)).toThrow(/expired/i);
  });

  it("should throw error if signature is invalid", () => {
    const payload = { userId: "user-123" };
    const token = signJwt(payload, secret, 60);
    const tampered = token.replace(/.$/, "x"); // tamper the last character

    expect(() => verifyJwt(tampered, secret)).toThrow(/signature/i);
  });

  it("should throw error if format is invalid", () => {
    expect(() => verifyJwt("invalid-token-string", secret)).toThrow(/format/i);
  });
});
