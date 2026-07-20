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
import { logger } from "../utils/logger";
import { HttpError } from "../middleware/error.middleware";


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
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      company: user.company,
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
      ipAddress,
      userAgent,
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

  async refresh(
    token: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<AuthResponseData> {
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
      ipAddress,
      userAgent,
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

  async handleGoogleCallback(
    email: string,
    sub: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<AuthResponseData> {
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
      ipAddress,
      userAgent,
    });

    return {
      user: this.toUserDto(user),
      accessToken,
      refreshToken,
    };
  }

  async handleGithubCallback(
    email: string,
    githubId: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<AuthResponseData> {
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
      ipAddress,
      userAgent,
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
    const slugBase = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
    const slug = `${slugBase}-workspace-${Math.random().toString(36).substring(2, 6)}`;
    const [workspace] = await queryDatabase(
      "INSERT INTO workspaces (name, owner_id, slug) VALUES ($1::varchar, $2::uuid, $3::varchar) RETURNING id",
      [workspaceName, userId, slug]
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

  async sendMagicLink(email: string, ipAddress?: string | null, userAgent?: string | null): Promise<void> {
    let user = await this.userRepo.findByEmail(email);
    if (!user) {
      user = await this.userRepo.create({
        email,
        isEmailVerified: false,
      });
      await this.createUserWorkspace(user.id, user.email);
    }

    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    await this.emailVerificationTokenRepo.create({
      userId: user.id,
      token,
      expiresAt,
    });

    await this.loginHistoryRepo.create({
      userId: user.id,
      ipAddress,
      userAgent,
      loginStatus: "magic_link_requested",
    });

    const magicLink = `http://localhost:3000/?mode=magic-link&token=${token}`;
    const subject = "Your Magic Login Link";
    const html = `
      <div style="font-family: sans-serif; max-width: 500px; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #0B0B12; color: #ffffff;">
        <h2 style="color: #7C6CFF;">Magic Login Link</h2>
        <p style="color: #cccccc;">Click the button below to sign in instantly without a password:</p>
        <a href="${magicLink}" style="display: inline-block; padding: 12px 24px; color: white; background-color: #7C6CFF; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 15px 0;">Sign In</a>
        <p style="color: #888; font-size: 11px;">If the button above does not work, copy and paste this URL into your browser:</p>
        <p style="color: #888; font-size: 11px; word-break: break-all;">${magicLink}</p>
      </div>
    `;
    const text = `Sign in by copying and pasting this link in your browser: ${magicLink}`;

    logger.info(`[EmailService] Generated Magic Link for ${email}: ${magicLink}`);

    if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS) {
      const { sendEmail } = require("./mail.service");
      await sendEmail({ to: email, subject, html, text });
    }
  }

  async verifyMagicLink(token: string, ipAddress?: string | null, userAgent?: string | null): Promise<AuthResponseData> {
    const storedToken = await this.emailVerificationTokenRepo.findByToken(token);
    if (!storedToken || storedToken.isUsed || storedToken.expiresAt < new Date()) {
      throw new HttpError(400, "Invalid or expired magic link.");
    }

    await this.emailVerificationTokenRepo.markAsUsed(token);

    const user = await this.userRepo.findById(storedToken.userId);
    if (!user) {
      throw new HttpError(404, "User not found.");
    }

    if (!user.isEmailVerified) {
      await this.userRepo.update(user.id, { isEmailVerified: true });
      user.isEmailVerified = true;
    }

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
      ipAddress,
      userAgent,
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
}
