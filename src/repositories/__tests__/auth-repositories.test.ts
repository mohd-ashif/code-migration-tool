import { hashPassword, verifyPassword } from "../../utils/crypto";
import { UserRepository, mapRowToUser } from "../user.repository";
import { RefreshTokenRepository } from "../refresh-token.repository";
import { EmailVerificationTokenRepository } from "../email-verification-token.repository";
import { queryDatabase } from "../../lib/database";

jest.mock("../../lib/database", () => ({
  queryDatabase: jest.fn(),
}));

describe("Authentication Utilities & Repositories", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Crypto Password Hashing", () => {
    it("should hash a password and verify it successfully", () => {
      const password = "SuperSecretPassword123!";
      const hash = hashPassword(password);
      
      expect(hash).toContain(":");
      expect(verifyPassword(password, hash)).toBe(true);
      expect(verifyPassword("WrongPassword", hash)).toBe(false);
    });

    it("should fail gracefully for malformed stored hash strings", () => {
      expect(verifyPassword("password", "bad_hash_format")).toBe(false);
    });
  });

  describe("UserRepository", () => {
    const userRepo = new UserRepository();

    it("should find an active user by ID", async () => {
      const mockRow = {
        id: "d9e847c2-7bfa-4c7b-99d8-9993e36e65ba",
        email: "test@example.com",
        password_hash: "salt:hash",
        is_email_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };

      (queryDatabase as jest.Mock).mockResolvedValueOnce([mockRow]);

      const user = await userRepo.findById(mockRow.id);

      expect(queryDatabase).toHaveBeenCalledWith(
        "SELECT * FROM users WHERE id = $1::uuid AND deleted_at IS NULL",
        [mockRow.id]
      );
      expect(user).toBeDefined();
      expect(user?.email).toBe(mockRow.email);
    });

    it("should allow finding a user including soft-deleted ones if specified", async () => {
      const id = "d9e847c2-7bfa-4c7b-99d8-9993e36e65ba";
      (queryDatabase as jest.Mock).mockResolvedValueOnce([]);

      await userRepo.findById(id, true);

      expect(queryDatabase).toHaveBeenCalledWith(
        "SELECT * FROM users WHERE id = $1::uuid",
        [id]
      );
    });

    it("should query for active emails excluding soft-deleted ones", async () => {
      const email = "user@example.com";
      (queryDatabase as jest.Mock).mockResolvedValueOnce([]);

      await userRepo.findByEmail(email);

      expect(queryDatabase).toHaveBeenCalledWith(
        "SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL",
        [email]
      );
    });

    it("should insert user with correct columns", async () => {
      const input = {
        email: "   create@example.com  ",
        passwordHash: "some_hash",
        isEmailVerified: true,
      };

      const mockRow = {
        id: "u-id-123",
        email: "create@example.com",
        password_hash: "some_hash",
        is_email_verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };

      (queryDatabase as jest.Mock).mockResolvedValueOnce([mockRow]);

      const user = await userRepo.create(input);

      expect(queryDatabase).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO users"),
        ["create@example.com", "some_hash", true]
      );
      expect(user.email).toBe("create@example.com");
    });

    it("should build dynamic UPDATE statements properly", async () => {
      const id = "some-user-id";
      const updates = {
        isEmailVerified: true,
        passwordHash: "new_hash",
      };

      const mockRow = {
        id,
        email: "update@example.com",
        password_hash: "new_hash",
        is_email_verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };

      (queryDatabase as jest.Mock).mockResolvedValueOnce([mockRow]);

      await userRepo.update(id, updates);

      expect(queryDatabase).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE\s+users\s+SET\s+password_hash\s*=\s*\$1,\s*is_email_verified\s*=\s*\$2\s+WHERE\s+id\s*=\s*\$3\s+RETURNING\s+\*/i),
        ["new_hash", true, id]
      );
    });

    it("should soft delete a user", async () => {
      const id = "some-uuid";
      (queryDatabase as jest.Mock).mockResolvedValueOnce([{ id }]);

      const result = await userRepo.deleteSoft(id);

      expect(queryDatabase).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE\s+users\s+SET\s+deleted_at\s*=\s*NOW\(\)\s+WHERE\s+id\s*=\s*\$1::uuid\s+AND\s+deleted_at\s+IS\s+NULL/i),
        [id]
      );
      expect(result).toBe(true);
    });
  });

  describe("RefreshTokenRepository", () => {
    const tokenRepo = new RefreshTokenRepository();

    it("should revoke a refresh token by setting is_revoked status to true", async () => {
      const token = "mock-token";
      (queryDatabase as jest.Mock).mockResolvedValueOnce([{ id: "token-id" }]);

      const result = await tokenRepo.revoke(token);

      expect(queryDatabase).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE\s+refresh_tokens\s+SET\s+is_revoked\s*=\s*TRUE\s+WHERE\s+token\s*=\s*\$1\s+AND\s+is_revoked\s*=\s*FALSE/i),
        [token]
      );
      expect(result).toBe(true);
    });
  });
});
