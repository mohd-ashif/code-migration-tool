export interface User {
  id: string;
  email: string;
  passwordHash?: string | null;
  isEmailVerified: boolean;
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
