export const REFRESH_TOKEN_COOKIE_NAME =
  process.env.COOKIE_NAME ?? "ems_refresh_token";

export const getRefreshTokenCookieOptions = (expiresAt) => ({
  httpOnly: true,

  secure:
    process.env.COOKIE_SECURE === "true" ||
    process.env.NODE_ENV === "production",

  sameSite: process.env.COOKIE_SAME_SITE ?? "lax",

  expires: expiresAt,

  path: "/api/v1/auth",
});

export const getClearRefreshTokenCookieOptions = () => ({
  httpOnly: true,

  secure:
    process.env.COOKIE_SECURE === "true" ||
    process.env.NODE_ENV === "production",

  sameSite: process.env.COOKIE_SAME_SITE ?? "lax",

  path: "/api/v1/auth",
});
