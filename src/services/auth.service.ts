import { UserRepository } from "../repositories/user.repository";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";
import { PasswordResetTokenRepository } from "../repositories/password-reset-token.repository";
import { EmailVerificationTokenRepository } from "../repositories/email-verification-token.repository";
import { LoginHistoryRepository } from "../repositories/login-history.repository";
import { AuthProviderRepository } from "../repositories/auth-provider.repository";
import { EmailService } from "./email.service";
import { hashPassword, verifyPassword } from "../utils/crypto";
import { signJwt } from "../utils/jwt";
import { config } from "../config";
import { randomBytes } from "crypto";
import { UserDto, AuthResponseData } from "../types/auth.types";
import { queryDatabase } from "../lib/database";

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export class AuthService {
  private userRepo = new UserRepository();
  private refreshTokenRepo = new RefreshTokenRepository();
  private passwordResetTokenRepo = new PasswordResetTokenRepository();
  private emailVerificationTokenRepo = new EmailVerificationTokenRepository();
  private loginHistoryRepo = new LoginHistoryRepository();
  private authProviderRepo = new AuthProviderRepository();
  private emailService = new EmailService();

  private toUserDto(user: any): UserDto {
    return {
      id: user.id,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
    };
  }

  private generateToken(length = 32): string {
    return randomBytes(length).toString("hex");
  }

  async register(email: string, pass: string): Promise<UserDto> {
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw new HttpError(400, "Email is already registered.");
    }

    const hashed = hashPassword(pass);
    const user = await this.userRepo.create({
      email,
      passwordHash: hashed,
      isEmailVerified: false,
    });

    await this.createUserWorkspace(user.id, user.email);

    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await this.emailVerificationTokenRepo.create({
      userId: user.id,
      token,
      expiresAt,
    });

    await this.emailService.sendVerificationEmail(user.email, token);

    return this.toUserDto(user);
  }

  async login(
    email: string,
    pass: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<AuthResponseData> {
    const user = await this.userRepo.findByEmail(email);
    if (!user || !user.passwordHash) {
      await this.loginHistoryRepo.create({
        ipAddress,
        userAgent,
        loginStatus: "failed_password",
        failureReason: "User not found or no password set.",
      });
      throw new HttpError(401, "Invalid email or password.");
    }

    const isValid = verifyPassword(pass, user.passwordHash);
    if (!isValid) {
      await this.loginHistoryRepo.create({
        userId: user.id,
        ipAddress,
        userAgent,
        loginStatus: "failed_password",
        failureReason: "Incorrect password.",
      });
      throw new HttpError(401, "Invalid email or password.");
    }

    if (!user.isEmailVerified) {
      await this.loginHistoryRepo.create({
        userId: user.id,
        ipAddress,
        userAgent,
        loginStatus: "failed_unverified_email",
        failureReason: "Email not verified.",
      });
      throw new HttpError(403, "Please verify your email before logging in.");
    }

    // Sign tokens
    const accessToken = signJwt(
      { userId: user.id, email: user.email },
      config.JWT_SECRET,
      15 * 60 // 15 minutes
    );

    const refreshToken = this.generateToken(64);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await this.refreshTokenRepo.create({
      userId: user.id,
      token: refreshToken,
      expiresAt,
    });

    await this.loginHistoryRepo.create({
      userId: user.id,
      ipAddress,
      userAgent,
      loginStatus: "success",
    });

    return {
      user: this.toUserDto(user),
      accessToken,
      refreshToken,
    };
  }

  async refresh(token: string): Promise<AuthResponseData> {
    const storedToken = await this.refreshTokenRepo.findByToken(token);
    if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
      throw new HttpError(401, "Invalid or expired refresh token.");
    }

    const user = await this.userRepo.findById(storedToken.userId);
    if (!user) {
      throw new HttpError(401, "User not found.");
    }

    // Revoke old refresh token
    await this.refreshTokenRepo.revoke(token);

    // Generate new pair
    const accessToken = signJwt(
      { userId: user.id, email: user.email },
      config.JWT_SECRET,
      15 * 60 // 15 mins
    );

    const newRefreshToken = this.generateToken(64);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await this.refreshTokenRepo.create({
      userId: user.id,
      token: newRefreshToken,
      expiresAt,
    });

    return {
      user: this.toUserDto(user),
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(token: string): Promise<void> {
    await this.refreshTokenRepo.revoke(token);
  }

  async verifyEmail(token: string): Promise<void> {
    const storedToken = await this.emailVerificationTokenRepo.findByToken(token);
    if (!storedToken || storedToken.isUsed || storedToken.expiresAt < new Date()) {
      throw new HttpError(400, "Invalid or expired verification link.");
    }

    await this.emailVerificationTokenRepo.markAsUsed(token);
    await this.userRepo.update(storedToken.userId, { isEmailVerified: true });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      // Return successfully to avoid email enumeration
      return;
    }

    await this.passwordResetTokenRepo.invalidateAllForUser(user.id);

    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour
    await this.passwordResetTokenRepo.create({
      userId: user.id,
      token,
      expiresAt,
    });

    await this.emailService.sendPasswordResetEmail(user.email, token);
  }

  async resetPassword(token: string, pass: string): Promise<void> {
    const storedToken = await this.passwordResetTokenRepo.findByToken(token);
    if (!storedToken || storedToken.isUsed || storedToken.expiresAt < new Date()) {
      throw new HttpError(400, "Invalid or expired reset token.");
    }

    await this.passwordResetTokenRepo.markAsUsed(token);

    const hashed = hashPassword(pass);
    await this.userRepo.update(storedToken.userId, { passwordHash: hashed });

    // Revoke all refresh tokens for security
    await this.refreshTokenRepo.revokeAllForUser(storedToken.userId);
  }

  async handleGoogleCallback(email: string, sub: string): Promise<AuthResponseData> {
    const existingProvider = await this.authProviderRepo.findByProvider("google", sub);

    let user: any;

    if (existingProvider) {
      user = await this.userRepo.findById(existingProvider.userId);
      if (!user) {
        throw new HttpError(401, "Linked user account not found.");
      }
    } else {
      // Check if user already exists by email
      user = await this.userRepo.findByEmail(email);

      if (user) {
        // Link the Google account to the existing email account
        await this.authProviderRepo.create({
          userId: user.id,
          providerName: "google",
          providerUserId: sub,
        });
      } else {
        // Create new user (automatically verified as Google validates email)
        user = await this.userRepo.create({
          email,
          isEmailVerified: true,
        });

        // Link the provider
        await this.authProviderRepo.create({
          userId: user.id,
          providerName: "google",
          providerUserId: sub,
        });

        // Create personal workspace
        await this.createUserWorkspace(user.id, user.email);
      }
    }

    // Sign JWT tokens
    const accessToken = signJwt(
      { userId: user.id, email: user.email },
      config.JWT_SECRET,
      15 * 60 // 15 minutes
    );

    const refreshToken = this.generateToken(64);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await this.refreshTokenRepo.create({
      userId: user.id,
      token: refreshToken,
      expiresAt,
    });

    return {
      user: this.toUserDto(user),
      accessToken,
      refreshToken,
    };
  }

  async handleGithubCallback(email: string, githubId: string): Promise<AuthResponseData> {
    const existingProvider = await this.authProviderRepo.findByProvider("github", githubId);

    let user: any;

    if (existingProvider) {
      user = await this.userRepo.findById(existingProvider.userId);
      if (!user) {
        throw new HttpError(401, "Linked user account not found.");
      }
    } else {
      // Check if user already exists by email
      user = await this.userRepo.findByEmail(email);

      if (user) {
        // Link the GitHub account to the existing email account
        await this.authProviderRepo.create({
          userId: user.id,
          providerName: "github",
          providerUserId: githubId,
        });
      } else {
        // Create new user (automatically verified as GitHub validates email)
        user = await this.userRepo.create({
          email,
          isEmailVerified: true,
        });

        // Link the provider
        await this.authProviderRepo.create({
          userId: user.id,
          providerName: "github",
          providerUserId: githubId,
        });

        // Create personal workspace
        await this.createUserWorkspace(user.id, user.email);
      }
    }

    // Sign JWT tokens
    const accessToken = signJwt(
      { userId: user.id, email: user.email },
      config.JWT_SECRET,
      15 * 60 // 15 minutes
    );

    const refreshToken = this.generateToken(64);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await this.refreshTokenRepo.create({
      userId: user.id,
      token: refreshToken,
      expiresAt,
    });

    return {
      user: this.toUserDto(user),
      accessToken,
      refreshToken,
    };
  }

  async getUserById(userId: string): Promise<UserDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new HttpError(404, "User not found.");
    }
    return this.toUserDto(user);
  }

  async createUserWorkspace(userId: string, email: string): Promise<string> {
    const workspaceName = `${email.split("@")[0]}'s Workspace`;
    const [workspace] = await queryDatabase(
      "INSERT INTO workspaces (name, owner_id) VALUES ($1::varchar, $2::uuid) RETURNING id",
      [workspaceName, userId]
    );
    const workspaceId = workspace.id;

    await queryDatabase(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1::uuid, $2::uuid, 'owner')",
      [workspaceId, userId]
    );

    return workspaceId;
  }

  async ensureUserWorkspace(userId: string, email: string): Promise<string> {
    const members = await queryDatabase(
      "SELECT workspace_id FROM workspace_members WHERE user_id = $1::uuid LIMIT 1",
      [userId]
    );
    if (members && members.length > 0) {
      return members[0].workspace_id;
    }
    return this.createUserWorkspace(userId, email);
  }
}
