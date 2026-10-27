import { rateLimit } from "express-rate-limit";

const createPasswordRecoveryLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,

    limit: 5,

    standardHeaders: "draft-8",

    legacyHeaders: false,

    message: {
      success: false,
      statusCode: 429,
      message:
        "Too many password recovery attempts. Please try again after 15 minutes.",
      data: null,
    },
  });

export const forgotPasswordLimiter = createPasswordRecoveryLimiter();

export const resetPasswordLimiter = createPasswordRecoveryLimiter();
