import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  getClearRefreshTokenCookieOptions,
  getRefreshTokenCookieOptions,
  REFRESH_TOKEN_COOKIE_NAME,
} from "./auth.constants.js";

import {
  changeAuthenticatedUserPassword as changePasswordService,
  getAuthenticatedUser as getMeService,
  login as loginService,
  logout as logoutService,
  logoutAll as logoutAllService,
  refreshAuthenticationToken as refreshTokenService,
  requestPasswordReset as requestPasswordResetService,
  resetUserPassword as resetUserPasswordService,
} from "./auth.service.js";

const getRequestIp = (req) => {
  return req.ip || req.socket?.remoteAddress || "";
};

/**
 * Login.
 */
export const login = asyncHandler(async (req, res) => {
  const result = await loginService({
    ...req.validated.body,

    ipAddress: getRequestIp(req),

    userAgent: req.get("user-agent") ?? "",
  });

  res.cookie(
    REFRESH_TOKEN_COOKIE_NAME,
    result.refreshToken,
    getRefreshTokenCookieOptions(result.refreshTokenExpiresAt),
  );

  return res
    .status(200)
    .json(new ApiResponse(200, result.data, "Login successful."));
});

/**
 * Refresh access token and rotate refresh token.
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const currentRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

  const result = await refreshTokenService({
    refreshToken: currentRefreshToken,

    ipAddress: getRequestIp(req),

    userAgent: req.get("user-agent") ?? "",
  });

  res.cookie(
    REFRESH_TOKEN_COOKIE_NAME,
    result.refreshToken,
    getRefreshTokenCookieOptions(result.refreshTokenExpiresAt),
  );

  return res
    .status(200)
    .json(
      new ApiResponse(200, result.data, "Access token refreshed successfully."),
    );
});

/**
 * Logout current session.
 */
export const logout = asyncHandler(async (req, res) => {
  const currentRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

  await logoutService({
    refreshToken: currentRefreshToken,

    ipAddress: getRequestIp(req),
  });

  res.clearCookie(
    REFRESH_TOKEN_COOKIE_NAME,
    getClearRefreshTokenCookieOptions(),
  );

  return res.status(200).json(new ApiResponse(200, null, "Logout successful."));
});

/**
 * Logout all sessions.
 */
export const logoutAll = asyncHandler(async (req, res) => {
  await logoutAllService({
    userId: req.user.userId,

    ipAddress: getRequestIp(req),
  });

  res.clearCookie(
    REFRESH_TOKEN_COOKIE_NAME,
    getClearRefreshTokenCookieOptions(),
  );

  return res
    .status(200)
    .json(
      new ApiResponse(200, null, "Logged out from all devices successfully."),
    );
});

/**
 * Get authenticated user.
 */
export const getMe = asyncHandler(async (req, res) => {
  const result = await getMeService({
    userId: req.user.userId,

    accessType: req.user.accessType,

    companyAccessId: req.user.companyAccessId ?? null,

    platformAccessId: req.user.platformAccessId ?? null,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Authenticated user retrieved successfully.",
      ),
    );
});

/**
 * Change password.
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.validated.body;

  await changePasswordService({
    userId: req.user.userId,

    currentPassword,

    newPassword,

    ipAddress: getRequestIp(req),
  });

  res.clearCookie(
    REFRESH_TOKEN_COOKIE_NAME,
    getClearRefreshTokenCookieOptions(),
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Password changed successfully. Please log in again.",
      ),
    );
});

/**
 * Request a password reset email.
 * Public endpoint; no authentication required.
 */

/**
 * Request a password reset email.
 * Public endpoint; no authentication required.
 *
 * The service automatically identifies an eligible company
 * using the user's active company memberships.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.validated.body;

  const message = await requestPasswordResetService({
    email,
    ipAddress: getRequestIp(req),
  });

  return res.status(200).json(new ApiResponse(200, null, message));
});

/**
 * Reset password using a valid recovery token.
 * Public endpoint; no authentication required.
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.validated.body;

  await resetUserPasswordService({
    token,
    newPassword,
    ipAddress: getRequestIp(req),
  });

  res.clearCookie(
    REFRESH_TOKEN_COOKIE_NAME,
    getClearRefreshTokenCookieOptions(),
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Password reset successfully. Please log in with your new password.",
      ),
    );
});
