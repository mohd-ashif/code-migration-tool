import { Request, Response, NextFunction } from "express";
import { UserService } from "../services/user.service";
import { HttpError } from "../middleware/error.middleware";
import { AuthenticatedRequest } from "../types/auth.types";

const userService = new UserService();

function handleError(error: any, res: Response, next: NextFunction) {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  next(error);
}

export async function handleUpdateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { fullName, avatarUrl, bio, company } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    const updatedUser = await userService.updateProfile(
      authReq.user.userId,
      { fullName, avatarUrl, bio, company },
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: { user: updatedUser },
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleChangePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters long." });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    await userService.changePassword(
      authReq.user.userId,
      oldPassword,
      newPassword,
      ipAddress,
      userAgent
    );

    res.status(200).json({
      success: true,
      message: "Password changed successfully. All other active sessions have been logged out.",
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleGetLinkedAccounts(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const providers = await userService.getLinkedAccounts(authReq.user.userId);
    res.status(200).json({
      success: true,
      data: { providers },
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleUnlinkAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { provider } = req.params;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    await userService.unlinkAccount(authReq.user.userId, provider, ipAddress, userAgent);

    res.status(200).json({
      success: true,
      message: `Unlinked ${provider} successfully.`,
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleGetActiveSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const sessions = await userService.getActiveSessions(authReq.user.userId);
    res.status(200).json({
      success: true,
      data: { sessions },
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleRevokeSession(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { id } = req.params;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    await userService.revokeSession(authReq.user.userId, id, ipAddress, userAgent);

    res.status(200).json({
      success: true,
      message: "Session terminated successfully.",
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleRevokeAllOtherSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    let currentToken = req.body.refreshToken;
    if (!currentToken && req.cookies) {
      currentToken = req.cookies.refresh_token;
    }

    if (!currentToken) {
      const rawCookie = req.headers.cookie;
      if (rawCookie) {
        const match = rawCookie.match(/refresh_token=([^;]+)/);
        if (match) {
          currentToken = decodeURIComponent(match[1]);
        }
      }
    }

    if (!currentToken) {
      return res.status(400).json({ success: false, message: "Current refresh token is required to identify active session." });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    await userService.revokeAllOtherSessions(authReq.user.userId, currentToken, ipAddress, userAgent);

    res.status(200).json({
      success: true,
      message: "Logged out from all other devices successfully.",
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleCreateApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { name, expiresInDays } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: "API key label name is required." });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];
    const workspaceId = (req as any).workspaceId;

    const { rawKey, key } = await userService.createApiKey(
      authReq.user.userId,
      name,
      expiresInDays ? Number(expiresInDays) : null,
      ipAddress,
      userAgent,
      workspaceId
    );

    res.status(201).json({
      success: true,
      message: "API key generated successfully. Please copy it now as it will not be displayed again.",
      data: { rawKey, key },
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleListApiKeys(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const workspaceId = (req as any).workspaceId;
    const keys = await userService.listApiKeys(authReq.user.userId, workspaceId);
    res.status(200).json({
      success: true,
      data: { keys },
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleRevokeApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { id } = req.params;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    await userService.revokeApiKey(authReq.user.userId, id, ipAddress, userAgent);

    res.status(200).json({
      success: true,
      message: "API Key revoked successfully.",
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleGetActivityLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const logs = await userService.getActivityLogs(authReq.user.userId);
    res.status(200).json({
      success: true,
      data: { logs },
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleGetLoginLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const logs = await userService.getLoginLogs(authReq.user.userId);
    res.status(200).json({
      success: true,
      data: { logs },
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleDeleteAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    await userService.deleteAccount(authReq.user.userId, ipAddress, userAgent);

    res.clearCookie("access_token");
    res.clearCookie("refresh_token");

    res.status(200).json({
      success: true,
      message: "Your account has been deleted successfully.",
    });
  } catch (error) {
    handleError(error, res, next);
  }
}
