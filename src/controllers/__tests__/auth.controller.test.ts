import {
  handleRegister,
  handleLogin,
  handleRefresh,
  handleLogout,
  handleVerifyEmail,
  handleForgotPassword,
  handleResetPassword,
} from "../auth.controller";
import { AuthService } from "../../services/auth.service";

jest.mock("../../services/auth.service");

describe("Authentication Controller Unit Tests", () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {},
      query: {},
      headers: {},
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
      cookies: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
    next = jest.fn();
  });

  describe("Register", () => {
    it("should register a user with valid email and password", async () => {
      req.body = { email: "newuser@example.com", password: "Password123!" };
      const mockUser = {
        id: "u-123",
        email: "newuser@example.com",
        isEmailVerified: false,
        createdAt: new Date(),
      };

      (AuthService.prototype.register as jest.Mock).mockResolvedValueOnce(mockUser);

      await handleRegister(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { user: mockUser },
        })
      );
    });

    it("should return 400 validation error if registration fields are invalid", async () => {
      req.body = { email: "bad-email", password: "123" };

      await handleRegister(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errors: expect.any(Array),
        })
      );
    });
  });

  describe("Login", () => {
    it("should sign in successfully and set HTTP-only cookies", async () => {
      req.body = { email: "user@example.com", password: "Password123!" };
      const mockResult = {
        user: { id: "u-123", email: "user@example.com", isEmailVerified: true, createdAt: new Date() },
        accessToken: "access-token-123",
        refreshToken: "refresh-token-123",
      };

      (AuthService.prototype.login as jest.Mock).mockResolvedValueOnce(mockResult);

      await handleLogin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.cookie).toHaveBeenCalledWith("access_token", "access-token-123", expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith("refresh_token", "refresh-token-123", expect.any(Object));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Login successful.",
        data: {
          user: mockResult.user,
          accessToken: "access-token-123",
        },
      });
    });
  });

  describe("Refresh Token", () => {
    it("should issue a new token pair from request cookies", async () => {
      req.cookies = { refresh_token: "old-refresh-token" };
      const mockResult = {
        user: { id: "u-123", email: "user@example.com", isEmailVerified: true },
        accessToken: "new-access",
        refreshToken: "new-refresh",
      };

      (AuthService.prototype.refresh as jest.Mock).mockResolvedValueOnce(mockResult);

      await handleRefresh(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.cookie).toHaveBeenCalledWith("access_token", "new-access", expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith("refresh_token", "new-refresh", expect.any(Object));
    });

    it("should fail 400 if refresh token is completely missing", async () => {
      await handleRefresh(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: "Refresh token is required.",
        })
      );
    });
  });

  describe("Logout", () => {
    it("should clear access and refresh token cookies", async () => {
      req.cookies = { refresh_token: "active-refresh" };

      (AuthService.prototype.logout as jest.Mock).mockResolvedValueOnce(undefined);

      await handleLogout(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.clearCookie).toHaveBeenCalledWith("access_token", expect.any(Object));
      expect(res.clearCookie).toHaveBeenCalledWith("refresh_token", expect.any(Object));
    });
  });

  describe("Email Verification", () => {
    it("should verify email when valid query token is passed", async () => {
      req.query = { token: "verify-token" };

      (AuthService.prototype.verifyEmail as jest.Mock).mockResolvedValueOnce(undefined);

      await handleVerifyEmail(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Email verified successfully. You can now log in.",
      });
    });

    it("should fail 400 if verification token is missing", async () => {
      await handleVerifyEmail(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Verification token is required.",
      });
    });
  });

  describe("Forgot Password", () => {
    it("should accept forgot password requests for valid emails", async () => {
      req.body = { email: "user@example.com" };

      (AuthService.prototype.forgotPassword as jest.Mock).mockResolvedValueOnce(undefined);

      await handleForgotPassword(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "If the email is registered, a password reset link has been sent.",
      });
    });
  });

  describe("Reset Password", () => {
    it("should successfully reset password with valid token and strong password", async () => {
      req.body = { token: "reset-token", password: "NewPassword123!" };

      (AuthService.prototype.resetPassword as jest.Mock).mockResolvedValueOnce(undefined);

      await handleResetPassword(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Password reset successful. You can now log in with your new password.",
      });
    });
  });
});
