import { Router } from "express";

import { validate } from "../../middlewares/validate.middleware.js";
import { authenticate } from "../../middlewares/authenticate.middleware.js";

import {
  forgotPasswordLimiter,
  resetPasswordLimiter,
} from "../../middlewares/password-reset-rate-limit.middleware.js";

import {
  changePassword,
  forgotPassword,
  getMe,
  login,
  logout,
  logoutAll,
  refreshToken,
  resetPassword,
} from "./auth.controller.js";

import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  resetPasswordSchema,
} from "./auth.validation.js";

const router = Router();

/**
 * Public routes
 */
router.post("/login", validate(loginSchema), login);

router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validate(forgotPasswordSchema),
  forgotPassword,
);

router.post(
  "/reset-password",
  resetPasswordLimiter,
  validate(resetPasswordSchema),
  resetPassword,
);

router.post("/refresh-token", validate(refreshTokenSchema), refreshToken);

/**
 * Logout is kept public because an expired access token
 * should not prevent the refresh cookie from being revoked.
 */
router.post("/logout", validate(logoutSchema), logout);

/**
 * Protected routes
 */
router.get("/me", authenticate, getMe);

router.post("/logout-all", authenticate, logoutAll);

router.patch(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  changePassword,
);

export default router;
