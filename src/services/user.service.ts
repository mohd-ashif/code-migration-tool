import { UserRepository } from "../repositories/user.repository";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";
import { AuthProviderRepository } from "../repositories/auth-provider.repository";
import { ApiKeyRepository } from "../repositories/api-key.repository";
import { UserActivityRepository } from "../repositories/user-activity.repository";
import { LoginHistoryRepository } from "../repositories/login-history.repository";
import { hashPassword, verifyPassword } from "../utils/crypto";
import { HttpError } from "../middleware/error.middleware";
import { randomBytes, createHash } from "crypto";
import { queryDatabase } from "../lib/database";
import { UserDto } from "../types/auth.types";

export class UserService {
  private userRepo = new UserRepository();
  private refreshTokenRepo = new RefreshTokenRepository();
  private authProviderRepo = new AuthProviderRepository();
  private apiKeyRepo = new ApiKeyRepository();
  private userActivityRepo = new UserActivityRepository();
  private loginHistoryRepo = new LoginHistoryRepository();

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

  async updateProfile(
    userId: string,
    data: { fullName?: string | null; avatarUrl?: string | null; bio?: string | null; company?: string | null },
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<UserDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new HttpError(404, "User not found.");
    }

    const updated = await this.userRepo.update(userId, data);
    if (!updated) {
      throw new HttpError(500, "Failed to update profile.");
    }

    await this.userActivityRepo.create({
      userId,
      action: "profile_updated",
      metadata: { changed: Object.keys(data) },
      ipAddress,
      userAgent,
    });

    return this.toUserDto(updated);
  }

  async changePassword(
    userId: string,
    oldPass: string,
    newPass: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new HttpError(404, "User not found.");
    }

    // If password_hash is null, they logged in exclusively via OAuth. We can let them set a password.
    if (user.passwordHash) {
      const isValid = verifyPassword(oldPass, user.passwordHash);
      if (!isValid) {
        throw new HttpError(400, "Incorrect current password.");
      }
    }

    const hashed = hashPassword(newPass);
    await this.userRepo.update(userId, { passwordHash: hashed });

    // Revoke all device sessions for security
    await this.refreshTokenRepo.revokeAllForUser(userId);

    await this.userActivityRepo.create({
      userId,
      action: "password_changed",
      ipAddress,
      userAgent,
    });
  }

  async getLinkedAccounts(userId: string): Promise<string[]> {
    const providers = await this.authProviderRepo.findByUserId(userId);
    return providers.map((p) => p.providerName);
  }

  async unlinkAccount(
    userId: string,
    providerName: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new HttpError(404, "User not found.");
    }

    // Check safety: must have password set OR other active providers
    const linked = await this.authProviderRepo.findByUserId(userId);
    const hasPassword = !!user.passwordHash;

    if (!hasPassword && linked.length <= 1) {
      throw new HttpError(
        400,
        "Cannot unlink account. You must set a password or connect another OAuth login provider first to prevent getting locked out."
      );
    }

    const unlinked = await this.authProviderRepo.deleteByProviderAndUser(userId, providerName);
    if (!unlinked) {
      throw new HttpError(400, "Provider not linked or already removed.");
    }

    await this.userActivityRepo.create({
      userId,
      action: `provider_unlinked`,
      metadata: { provider: providerName },
      ipAddress,
      userAgent,
    });
  }

  async getActiveSessions(userId: string): Promise<any[]> {
    const sessions = await this.refreshTokenRepo.findActiveByUserId(userId);
    return sessions.map((s) => ({
      id: s.id,
      tokenMasked: s.token.substring(0, 10) + "...",
      ipAddress: s.ipAddress || "Unknown",
      userAgent: s.userAgent || "Unknown",
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    const revoked = await this.refreshTokenRepo.revokeById(sessionId, userId);
    if (!revoked) {
      throw new HttpError(404, "Active session not found.");
    }

    await this.userActivityRepo.create({
      userId,
      action: "session_revoked",
      metadata: { sessionId },
      ipAddress,
      userAgent,
    });
  }

  async revokeAllOtherSessions(
    userId: string,
    currentToken: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    await this.refreshTokenRepo.revokeAllExcept(userId, currentToken);
    await this.userActivityRepo.create({
      userId,
      action: "other_sessions_revoked",
      ipAddress,
      userAgent,
    });
  }

  async createApiKey(
    userId: string,
    name: string,
    expiresInDays?: number | null,
    ipAddress?: string | null,
    userAgent?: string | null,
    workspaceId?: string | null
  ): Promise<{ rawKey: string; key: any }> {
    const prefix = "mt_";
    const entropy = randomBytes(24).toString("hex");
    const rawKey = `${prefix}${entropy}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

    const keyRecord = await this.apiKeyRepo.create({
      userId,
      name,
      keyHash,
      prefix,
      expiresAt,
      workspaceId,
    });

    await this.userActivityRepo.create({
      userId,
      action: "api_key_created",
      metadata: { keyId: keyRecord.id, keyName: name, workspaceId },
      ipAddress,
      userAgent,
    });

    return {
      rawKey,
      key: {
        id: keyRecord.id,
        name: keyRecord.name,
        prefix: keyRecord.prefix,
        createdAt: keyRecord.createdAt,
        expiresAt: keyRecord.expiresAt,
        lastUsedAt: keyRecord.lastUsedAt,
        workspaceId: keyRecord.workspaceId,
      },
    };
  }

  async listApiKeys(userId: string, workspaceId?: string | null): Promise<any[]> {
    const keys = workspaceId 
      ? await this.apiKeyRepo.findByWorkspaceId(workspaceId)
      : await this.apiKeyRepo.findByUserId(userId);
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
      workspaceId: k.workspaceId,
    }));
  }

  async revokeApiKey(
    userId: string,
    keyId: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    const revoked = await this.apiKeyRepo.deleteSoft(keyId, userId);
    if (!revoked) {
      throw new HttpError(404, "API Key not found.");
    }

    await this.userActivityRepo.create({
      userId,
      action: "api_key_revoked",
      metadata: { keyId },
      ipAddress,
      userAgent,
    });
  }

  async getActivityLogs(userId: string, limit = 50): Promise<any[]> {
    return this.userActivityRepo.findByUserId(userId, limit);
  }

  async getLoginLogs(userId: string, limit = 50): Promise<any[]> {
    const logs = await this.loginHistoryRepo.findByUserId(userId, limit);
    return logs.map((l) => ({
      id: l.id,
      ipAddress: l.ipAddress || "Unknown",
      userAgent: l.userAgent || "Unknown",
      loginStatus: l.loginStatus,
      failureReason: l.failureReason,
      createdAt: l.createdAt,
    }));
  }

  async deleteAccount(
    userId: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new HttpError(404, "User not found.");
    }

    // Soft-delete the user
    await this.userRepo.deleteSoft(userId);

    // Soft-delete all user workspaces
    await queryDatabase(
      "UPDATE workspaces SET deleted_at = NOW() WHERE owner_id = $1::uuid AND deleted_at IS NULL",
      [userId]
    );

    // Soft-delete workspace memberships
    await queryDatabase(
      "UPDATE workspace_members SET deleted_at = NOW() WHERE user_id = $1::uuid AND deleted_at IS NULL",
      [userId]
    );

    // Revoke refresh tokens
    await this.refreshTokenRepo.revokeAllForUser(userId);

    // Revoke API keys
    await queryDatabase(
      "UPDATE api_keys SET deleted_at = NOW() WHERE user_id = $1::uuid AND deleted_at IS NULL",
      [userId]
    );

    await this.userActivityRepo.create({
      userId,
      action: "account_deleted",
      ipAddress,
      userAgent,
    });
  }
}
