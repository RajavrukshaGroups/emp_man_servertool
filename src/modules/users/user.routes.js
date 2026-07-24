import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import {
  changePassword,
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  resetPassword,
  updateUser,
  updateUserStatus,
} from "./user.controller.js";

import {
  changePasswordSchema,
  createUserSchema,
  listUsersSchema,
  resetPasswordSchema,
  updateUserSchema,
  updateUserStatusSchema,
  userIdParamSchema,
} from "./user.validation.js";

const router = Router();

/**
 * Every users route requires authentication.
 */
router.use(authenticate);

/**
 * Create user.
 */
router.post(
  "/",
  authorize("admin.create"),
  validate(createUserSchema),
  createUser,
);

/**
 * List users.
 */
router.get("/", authorize("admin.read"), validate(listUsersSchema), listUsers);

/**
 * Get one user.
 */
router.get(
  "/:userId",
  authorize("admin.read"),
  validate(userIdParamSchema),
  getUserById,
);

/**
 * Update user.
 */
router.patch(
  "/:userId",
  authorize("admin.update"),
  validate(updateUserSchema),
  updateUser,
);

/**
 * Change user status.
 */
router.patch(
  "/:userId/status",
  authorize("admin.deactivate"),
  validate(updateUserStatusSchema),
  updateUserStatus,
);

/**
 * Change own password.
 *
 * Do not use admin permission here if normal users should
 * be allowed to change their own password.
 */
router.patch(
  "/:userId/change-password",
  validate(changePasswordSchema),
  changePassword,
);

/**
 * Administrative password reset.
 */
router.patch(
  "/:userId/reset-password",
  authorize("admin.update"),
  validate(resetPasswordSchema),
  resetPassword,
);

/**
 * Soft-delete user.
 */
router.delete(
  "/:userId",
  authorize("admin.deactivate"),
  validate(userIdParamSchema),
  deleteUser,
);

export default router;
