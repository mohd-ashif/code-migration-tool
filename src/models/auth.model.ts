export interface User {
  id: string;
  email: string;
  passwordHash?: string | null;
  isEmailVerified: boolean;
  fullName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  company?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface AuthProvider {
  id: string;
  userId: string;
  providerName: string; // e.g., 'google', 'github'
  providerUserId: string; // The unique user ID from the provider
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  isRevoked: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface LoginHistory {
  id: string;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  loginStatus: 'success' | 'failed_password' | 'failed_unverified_email' | string;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface EmailVerificationToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface UserActivity {
  id: string;
  userId: string;
  action: string;
  metadata?: any | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  prefix: string;
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  workspaceId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

