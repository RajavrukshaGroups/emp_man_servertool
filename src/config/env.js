import dotenv from "dotenv";

dotenv.config();

const requiredEnvironmentVariables = [
  "MONGODB_URI",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
];

const missingVariables = requiredEnvironmentVariables.filter(
  (variable) => !process.env[variable],
);

if (missingVariables.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVariables.join(", ")}`,
  );
}

const parseNumber = (value, fallbackValue) => {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : fallbackValue;
};

export const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseNumber(process.env.PORT, 5000),

  MONGODB_URI: process.env.MONGODB_URI,

  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || "15m",

  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "7d",

  BCRYPT_SALT_ROUNDS: parseNumber(process.env.BCRYPT_SALT_ROUNDS, 12),

  COOKIE_NAME: process.env.COOKIE_NAME || "ems_refresh_token",
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
  COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE || "lax",

  RATE_LIMIT_WINDOW_MS: parseNumber(
    process.env.RATE_LIMIT_WINDOW_MS,
    15 * 60 * 1000,
  ),

  RATE_LIMIT_MAX: parseNumber(process.env.RATE_LIMIT_MAX, 100),

  LOGIN_RATE_LIMIT_MAX: parseNumber(process.env.LOGIN_RATE_LIMIT_MAX, 10),

  IS_PRODUCTION: process.env.NODE_ENV === "production",
});
