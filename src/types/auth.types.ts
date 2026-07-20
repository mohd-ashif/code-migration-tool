import { Request } from "express";

export interface UserDto {
  id: string;
  email: string;
  isEmailVerified: boolean;
  fullName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  company?: string | null;
  createdAt: Date;
}

export interface AuthResponseData {
  user: UserDto;
  accessToken: string;
  refreshToken: string;
}

export interface DecodedAccessTokenPayload {
  userId: string;
  email: string;
  exp: number;
}

export interface DecodedRefreshTokenPayload {
  userId: string;
  token: string;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}
