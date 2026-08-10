import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import {
  authorize,
  authorizeRoles,
} from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import {
  createCompanyAdministrator,
  getCompanyAdministrator,
  updateCompanyAdministrator,
  resetCompanyAdministratorPassword,
  updateCompanyAdministratorStatus,
} from "./companyAdministrator.controller.js";

import {
  companyAdministratorCompanyIdSchema,
  createCompanyAdministratorSchema,
  updateCompanyAdministratorSchema,
  resetCompanyAdministratorPasswordSchema,
  updateCompanyAdministratorStatusSchema,
} from "./companyAdministrator.validation.js";

const router = Router({
  mergeParams: true,
});

/**
 * Every company administrator route
 * requires authentication.
 */
router.use(authenticate);

/**
 * Get the current Company Administrator.
 *
 * GET /companies/:companyId/administrators
 */
router.get(
  "/",
  authorizeRoles("SUPER_ADMIN"),
  authorize("admin.read"),
  validate(companyAdministratorCompanyIdSchema),
  getCompanyAdministrator,
);

/**
 * Create the one and only Company Administrator.
 *
 * POST /companies/:companyId/administrators
 */
router.post(
  "/",
  authorizeRoles("SUPER_ADMIN"),
  authorize("admin.create"),
  validate(createCompanyAdministratorSchema),
  createCompanyAdministrator,
);

/**
 * Update the existing Company Administrator.
 *
 * PATCH /companies/:companyId/administrators
 */
router.patch(
  "/",
  authorizeRoles("SUPER_ADMIN"),
  authorize("admin.update"),
  validate(updateCompanyAdministratorSchema),
  updateCompanyAdministrator,
);

/**
 * Reset Company Administrator password.
 *
 * PATCH /companies/:companyId/administrators/reset-password
 */
router.patch(
  "/reset-password",
  authorizeRoles("SUPER_ADMIN"),
  authorize("admin.update"),
  validate(resetCompanyAdministratorPasswordSchema),
  resetCompanyAdministratorPassword,
);

/**
 * Activate / deactivate Company Administrator.
 *
 * PATCH /companies/:companyId/administrators/status
 */
router.patch(
  "/status",
  authorizeRoles("SUPER_ADMIN"),
  authorize("admin.deactivate"),
  validate(updateCompanyAdministratorStatusSchema),
  updateCompanyAdministratorStatus,
);

export default router;
