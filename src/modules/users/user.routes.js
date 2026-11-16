import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import {
  authorize,
  authorizeAny,
} from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import {
  changePassword,
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  resetPassword,
  sendLoginInvitation,
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

  const isInvitationBased = req.body?.accountSetupMethod === "EMAIL_INVITATION";

  if (isInvitationBased) {
    return authorize("employee.create", "admin.invitation_send")(
      req,
      res,
      next,
    );
  }

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
router.get(
  "/",
  authorizeAny("admin.read", "user.employee_account_read"),
  validate(listUsersSchema),
  listUsers,
);
/**
 * Get one user.
 */
router.get(
  "/:userId",
  authorizeAny("admin.read", "user.employee_account_read"),
  validate(userIdParamSchema),
  getUserById,
);

/**
 * Send employee login invitation.
 *
 * Only authenticated users with admin.invitation_send
 * permission can trigger this action.
 *
 * The invitation service additionally validates
 * company ownership and employee eligibility.
 */
router.post(
  "/:userId/send-invitation",
  authorize("admin.invitation_send"),
  validate(userIdParamSchema),
  sendLoginInvitation,
);

/**
 * Update user.
 */
/**
 * Update user.
 */
router.patch(
  "/:userId",
  authorizeAny("admin.update", "user.employee_account_update"),
  validate(updateUserSchema),
  updateUser,
);

/**
 * Change user status.
 */
router.patch(
  "/:userId/status",
  authorizeAny("admin.deactivate", "user.employee_account_status_manage"),
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
  authorizeAny("admin.update", "user.employee_account_reset_password"),
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
