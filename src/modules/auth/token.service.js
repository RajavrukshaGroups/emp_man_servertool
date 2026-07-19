import crypto from "crypto";
import jwt from "jsonwebtoken";

import { ApiError } from "../../utils/ApiError.js";

const getRequiredEnvironmentVariable = (name) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const JWT_ACCESS_SECRET = getRequiredEnvironmentVariable("JWT_ACCESS_SECRET");

const JWT_REFRESH_SECRET = getRequiredEnvironmentVariable("JWT_REFRESH_SECRET");

const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN ?? "15m";

const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? "7d";
const JWT_SESSION_REFRESH_EXPIRES_IN =
  process.env.JWT_SESSION_REFRESH_EXPIRES_IN ?? "1d";

/**
 * Create the short-lived access token.
 */
export const generateAccessToken = ({
  userId,
  companyAccessId,
  companyId,
  roleId,
  employeeCode,
}) => {
  return jwt.sign(
    {
      sub: userId.toString(),
      accessId: companyAccessId.toString(),
      companyId: companyId.toString(),
      roleId: roleId.toString(),
      employeeCode: employeeCode ?? null,
      tokenType: "ACCESS",
    },
    JWT_ACCESS_SECRET,
    {
      expiresIn: JWT_ACCESS_EXPIRES_IN,
      issuer: "employee-management-api",
      audience: "employee-management-client",
    },
  );
};

/**
 * Create the refresh token.
 *
 * jti uniquely identifies the stored token record.
 */
export const generateRefreshToken = ({
  userId,
  companyAccessId,
  tokenId,
  rememberMe = false,
}) => {
  const expiresIn = rememberMe
    ? JWT_REFRESH_EXPIRES_IN
    : JWT_SESSION_REFRESH_EXPIRES_IN;

  return jwt.sign(
    {
      sub: userId.toString(),
      accessId: companyAccessId.toString(),
      jti: tokenId.toString(),
      tokenType: "REFRESH",
    },
    JWT_REFRESH_SECRET,
    {
      expiresIn,
      issuer: "employee-management-api",
      audience: "employee-management-client",
    },
  );
};

/**
 * Verify an access token.
 */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, JWT_ACCESS_SECRET, {
      issuer: "employee-management-api",
      audience: "employee-management-client",
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new ApiError(401, "Access token has expired.");
    }

    throw new ApiError(401, "Invalid access token.");
  }
};

/**
 * Verify a refresh token.
 */
export const verifyRefreshToken = (token) => {
  try {
    const payload = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: "employee-management-api",
      audience: "employee-management-client",
    });

    if (payload.tokenType !== "REFRESH") {
      throw new ApiError(401, "Invalid refresh token type.");
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error.name === "TokenExpiredError") {
      throw new ApiError(401, "Refresh token has expired.");
    }

    throw new ApiError(401, "Invalid refresh token.");
  }
};

/**
 * Store only a hash of the refresh token.
 *
 * If the database is compromised, raw refresh tokens
 * cannot be used directly.
 */
export const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Generate a temporary random token identifier.
 */
export const generateTokenIdentifier = () => {
  return crypto.randomBytes(24).toString("hex");
};

/**
 * Read token expiry as a JavaScript Date.
 */
export const getTokenExpiryDate = (token) => {
  const decoded = jwt.decode(token);

  if (!decoded?.exp) {
    throw new ApiError(500, "Unable to determine token expiration.");
  }

  return new Date(decoded.exp * 1000);
};
