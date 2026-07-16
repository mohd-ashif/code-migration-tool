import { AuthService, HttpError } from "../auth.service";
import { UserRepository } from "../../repositories/user.repository";
import { RefreshTokenRepository } from "../../repositories/refresh-token.repository";
import { EmailVerificationTokenRepository } from "../../repositories/email-verification-token.repository";
import { PasswordResetTokenRepository } from "../../repositories/password-reset-token.repository";
import { LoginHistoryRepository } from "../../repositories/login-history.repository";
import { EmailService } from "../email.service";
import { verifyPassword } from "../../utils/crypto";

jest.mock("../../repositories/user.repository");
jest.mock("../../repositories/refresh-token.repository");
jest.mock("../../repositories/email-verification-token.repository");
jest.mock("../../repositories/password-reset-token.repository");
jest.mock("../../repositories/login-history.repository");
jest.mock("../email.service");
jest.mock("../../utils/crypto", () => ({
  hashPassword: (p: string) => `hashed_${p}`,
  verifyPassword: jest.fn(),
}));

describe("AuthService Unit Tests", () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService();
  });

  describe("register", () => {
    it("should create user and verification token, and send email", async () => {
      const email = "user@example.com";
      const pass = "Password123!";
      const mockCreatedUser = {
        id: "u-id-123",
        email,
        passwordHash: "hashed_Password123!",
        isEmailVerified: false,
        createdAt: new Date(),
      };

      (UserRepository.prototype.findByEmail as jest.Mock).mockResolvedValueOnce(null);
      (UserRepository.prototype.create as jest.Mock).mockResolvedValueOnce(mockCreatedUser);
      (EmailVerificationTokenRepository.prototype.create as jest.Mock).mockResolvedValueOnce({});
      (EmailService.prototype.sendVerificationEmail as jest.Mock).mockResolvedValueOnce(undefined);

      const res = await authService.register(email, pass);

      expect(UserRepository.prototype.findByEmail).toHaveBeenCalledWith(email);
      expect(UserRepository.prototype.create).toHaveBeenCalledWith({
        email,
        passwordHash: "hashed_Password123!",
        isEmailVerified: false,
      });
      expect(EmailVerificationTokenRepository.prototype.create).toHaveBeenCalled();
      expect(EmailService.prototype.sendVerificationEmail).toHaveBeenCalled();
      expect(res.email).toBe(email);
    });

    it("should throw bad request if user already exists", async () => {
      (UserRepository.prototype.findByEmail as jest.Mock).mockResolvedValueOnce({ id: "1" });

      await expect(authService.register("user@example.com", "Password123!")).rejects.toThrow(
        new HttpError(400, "Email is already registered.")
      );
    });
  });

  describe("login", () => {
    it("should successfully log in and return tokens if credentials are correct and email verified", async () => {
      const email = "user@example.com";
      const pass = "Password123!";
      const mockUser = {
        id: "u-123",
        email,
        passwordHash: "hashed_pass",
        isEmailVerified: true,
      };

      (UserRepository.prototype.findByEmail as jest.Mock).mockResolvedValueOnce(mockUser);
      (verifyPassword as jest.Mock).mockReturnValueOnce(true);
      (RefreshTokenRepository.prototype.create as jest.Mock).mockResolvedValueOnce({});
      (LoginHistoryRepository.prototype.create as jest.Mock).mockResolvedValueOnce({});

      const res = await authService.login(email, pass);

      expect(res.user.email).toBe(email);
      expect(res.accessToken).toBeDefined();
      expect(res.refreshToken).toBeDefined();
    });

    it("should fail login if password incorrect", async () => {
      const mockUser = {
        id: "u-123",
        email: "user@example.com",
        passwordHash: "hashed_pass",
        isEmailVerified: true,
      };

      (UserRepository.prototype.findByEmail as jest.Mock).mockResolvedValueOnce(mockUser);
      (verifyPassword as jest.Mock).mockReturnValueOnce(false);
      (LoginHistoryRepository.prototype.create as jest.Mock).mockResolvedValueOnce({});

      await expect(authService.login("user@example.com", "wrong")).rejects.toThrow(
        new HttpError(401, "Invalid email or password.")
      );
    });

    it("should fail login if email is not verified", async () => {
      const mockUser = {
        id: "u-123",
        email: "user@example.com",
        passwordHash: "hashed_pass",
        isEmailVerified: false,
      };

      (UserRepository.prototype.findByEmail as jest.Mock).mockResolvedValueOnce(mockUser);
      (verifyPassword as jest.Mock).mockReturnValueOnce(true);
      (LoginHistoryRepository.prototype.create as jest.Mock).mockResolvedValueOnce({});

      await expect(authService.login("user@example.com", "Password123!")).rejects.toThrow(
        new HttpError(403, "Please verify your email before logging in.")
      );
    });
  });

  describe("verifyEmail", () => {
    it("should verify user email and mark token as used", async () => {
      const token = "v-token";
      const mockVerToken = {
        userId: "u-123",
        token,
        isUsed: false,
        expiresAt: new Date(Date.now() + 10000),
      };

      (EmailVerificationTokenRepository.prototype.findByToken as jest.Mock).mockResolvedValueOnce(
        mockVerToken
      );
      (EmailVerificationTokenRepository.prototype.markAsUsed as jest.Mock).mockResolvedValueOnce(true);
      (UserRepository.prototype.update as jest.Mock).mockResolvedValueOnce({});

      await authService.verifyEmail(token);

      expect(EmailVerificationTokenRepository.prototype.markAsUsed).toHaveBeenCalledWith(token);
      expect(UserRepository.prototype.update).toHaveBeenCalledWith("u-123", {
        isEmailVerified: true,
      });
    });
  });
});
