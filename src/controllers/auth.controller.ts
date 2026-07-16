import { Request, Response, NextFunction } from "express";
import { AuthService, HttpError } from "../services/auth.service";
import {
  validateRegisterRequest,
  validateLoginRequest,
  validateForgotPasswordRequest,
  validateResetPasswordRequest,
} from "../validators/auth.schema";
import { config } from "../config";
import https from "https";
import querystring from "querystring";
import { AuthenticatedRequest } from "../types/auth.types";

const authService = new AuthService();

const cookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

function handleError(error: any, res: Response, next: NextFunction) {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  next(error);
}

export async function handleRegister(req: Request, res: Response, next: NextFunction) {
  try {
    const validationErrors = validateRegisterRequest(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, errors: validationErrors });
    }

    const { email, password } = req.body;
    const user = await authService.register(email, password);

    res.status(201).json({
      success: true,
      message: "Registration successful. Please check your email to verify your account.",
      data: { user },
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const validationErrors = validateLoginRequest(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, errors: validationErrors });
    }

    const { email, password } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    const { user, accessToken, refreshToken } = await authService.login(
      email,
      password,
      ipAddress,
      userAgent
    );

    // Set HTTP-only cookies
    res.cookie("access_token", accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie("refresh_token", refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      success: true,
      message: "Login successful.",
      data: { user, accessToken },
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleRefresh(req: Request, res: Response, next: NextFunction) {
  try {
    let token = req.body.refreshToken;

    if (!token && req.cookies) {
      token = req.cookies.refresh_token;
    }

    if (!token) {
      // Direct raw cookie parsing fallback
      const rawCookie = req.headers.cookie;
      if (rawCookie) {
        const match = rawCookie.match(/refresh_token=([^;]+)/);
        if (match) {
          token = decodeURIComponent(match[1]);
        }
      }
    }

    if (!token) {
      return res.status(400).json({ success: false, message: "Refresh token is required." });
    }

    const { user, accessToken, refreshToken: newRefreshToken } = await authService.refresh(token);

    res.cookie("access_token", accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refresh_token", newRefreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      data: { user, accessToken },
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleLogout(req: Request, res: Response, next: NextFunction) {
  try {
    let token = req.body.refreshToken;

    if (!token && req.cookies) {
      token = req.cookies.refresh_token;
    }

    if (!token) {
      const rawCookie = req.headers.cookie;
      if (rawCookie) {
        const match = rawCookie.match(/refresh_token=([^;]+)/);
        if (match) {
          token = decodeURIComponent(match[1]);
        }
      }
    }

    if (token) {
      await authService.logout(token);
    }

    res.clearCookie("access_token", cookieOptions);
    res.clearCookie("refresh_token", cookieOptions);

    res.status(200).json({ success: true, message: "Logged out successfully." });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleVerifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).json({ success: false, message: "Verification token is required." });
    }

    await authService.verifyEmail(token);

    res.status(200).json({
      success: true,
      message: "Email verified successfully. You can now log in.",
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleForgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const validationErrors = validateForgotPasswordRequest(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, errors: validationErrors });
    }

    const { email } = req.body;
    await authService.forgotPassword(email);

    res.status(200).json({
      success: true,
      message: "If the email is registered, a password reset link has been sent.",
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleResetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const validationErrors = validateResetPasswordRequest(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, errors: validationErrors });
    }

    const { token, password } = req.body;
    await authService.resetPassword(token, password);

    res.status(200).json({
      success: true,
      message: "Password reset successful. You can now log in with your new password.",
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

function makeHttpsRequest(
  url: string,
  method: "GET" | "POST",
  headers: Record<string, string>,
  body?: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(parsed.error_description || parsed.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", (e) => {
      reject(e);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

export function handleGoogleRedirect(req: Request, res: Response) {
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${
    config.GOOGLE_CLIENT_ID
  }&redirect_uri=${encodeURIComponent(
    config.GOOGLE_REDIRECT_URI
  )}&response_type=code&scope=email%20profile&access_type=offline&prompt=consent`;

  res.redirect(googleAuthUrl);
}

export async function handleGoogleCallback(req: Request, res: Response, next: NextFunction) {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    return res.status(400).json({ success: false, message: "Authorization code is missing." });
  }

  try {
    // 1. Exchange authorization code for token
    const tokenRequestBody = querystring.stringify({
      code,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      redirect_uri: config.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    });

    const tokenResponse = await makeHttpsRequest(
      "https://oauth2.googleapis.com/token",
      "POST",
      {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(tokenRequestBody).toString(),
      },
      tokenRequestBody
    );

    const { access_token } = tokenResponse;
    if (!access_token) {
      throw new Error("Failed to retrieve access token from Google.");
    }

    // 2. Fetch user information using access token
    const userInfo = await makeHttpsRequest(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      "GET",
      {
        "Authorization": `Bearer ${access_token}`,
      }
    );

    const { email, sub } = userInfo;
    if (!email || !sub) {
      throw new Error("User email or ID was not returned by Google.");
    }

    // 3. Process account linking/creation in auth service
    const { user, accessToken, refreshToken } = await authService.handleGoogleCallback(email, sub);

    // 4. Set HTTP-only cookies
    res.cookie("access_token", accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refresh_token", refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // 5. Redirect back to frontend home page
    res.redirect("http://localhost:3000/");
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function handleGetMe(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const user = await authService.getUserById(authReq.user.userId);
    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export function handleGithubRedirect(req: Request, res: Response) {
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${
    config.GITHUB_CLIENT_ID
  }&redirect_uri=${encodeURIComponent(
    config.GITHUB_REDIRECT_URI
  )}&scope=user:email`;

  res.redirect(githubAuthUrl);
}

export async function handleGithubCallback(req: Request, res: Response, next: NextFunction) {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    return res.status(400).json({ success: false, message: "Authorization code is missing." });
  }

  try {
    // 1. Exchange authorization code for access token
    const tokenRequestBody = JSON.stringify({
      client_id: config.GITHUB_CLIENT_ID,
      client_secret: config.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: config.GITHUB_REDIRECT_URI,
    });

    const tokenResponse = await makeHttpsRequest(
      "https://github.com/login/oauth/access_token",
      "POST",
      {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Content-Length": Buffer.byteLength(tokenRequestBody).toString(),
      },
      tokenRequestBody
    );

    const { access_token } = tokenResponse;
    if (!access_token) {
      throw new Error("Failed to retrieve access token from GitHub.");
    }

    // 2. Fetch user profile from GitHub
    const githubProfile = await makeHttpsRequest(
      "https://api.github.com/user",
      "GET",
      {
        "Authorization": `token ${access_token}`,
        "User-Agent": "migration-tool-backend", // Required by GitHub API
      }
    );

    const githubId = String(githubProfile.id);
    let email = githubProfile.email;

    // 3. Fallback: If email is private/null, fetch user emails list
    if (!email) {
      const emailsList = await makeHttpsRequest(
        "https://api.github.com/user/emails",
        "GET",
        {
          "Authorization": `token ${access_token}`,
          "User-Agent": "migration-tool-backend",
        }
      );

      if (Array.isArray(emailsList) && emailsList.length > 0) {
        // Find primary verified email, or first verified email, or any primary email
        const primaryVerified = emailsList.find((e: any) => e.primary && e.verified);
        const verified = emailsList.find((e: any) => e.verified);
        const primary = emailsList.find((e: any) => e.primary);
        email = (primaryVerified || verified || primary || emailsList[0]).email;
      }
    }

    if (!email) {
      throw new Error("No verified email associated with this GitHub account.");
    }

    // 4. Process linking/creation in auth service
    const { user, accessToken, refreshToken } = await authService.handleGithubCallback(email, githubId);

    // 5. Set HTTP-only cookies
    res.cookie("access_token", accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refresh_token", refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // 6. Redirect back to frontend homepage
    res.redirect("http://localhost:3000/");
  } catch (error) {
    handleError(error, res, next);
  }
}
