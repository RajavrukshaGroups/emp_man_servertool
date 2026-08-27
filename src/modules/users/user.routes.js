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
 * ============================================================
 * CREATE USER AUTHORIZATION
 * ============================================================
 *
 * There are two different creation flows:
 *
 * 1. Employee onboarding
 *    -> requires employee.create
 *
 * 2. Administrative user creation
 *    -> requires admin.create
 */
const authorizeUserCreation = (req, res, next) => {
  const isEmployeeOnboarding = req.body?.forEmployeeOnboarding === true;

  if (isEmployeeOnboarding) {
    return authorize("employee.create")(req, res, next);
  }

  return authorize("admin.create")(req, res, next);
};

/**
 * Create user.
 */
router.post("/", authorizeUserCreation, validate(createUserSchema), createUser);

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
 * Normal users should be allowed to change
 * their own password.
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
