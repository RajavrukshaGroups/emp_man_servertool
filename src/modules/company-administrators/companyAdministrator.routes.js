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
} from "./companyAdministrator.controller.js";

import { companyAdministratorCompanyIdSchema, createCompanyAdministratorSchema } from "./companyAdministrator.validation.js";

const router = Router({
  mergeParams: true,
});

/**
 * Every company administrator provisioning route
 * requires authentication.
 */
router.use(authenticate);

/**
 * Create the one and only Company Administrator
 * for a selected company.
 *
 * This is a platform-level onboarding operation.
 *
 * Mounted at:
 * POST /companies/:companyId/administrators
 */

router.get(
  "/",
  authorizeRoles("SUPER_ADMIN"),
  authorize("admin.read"),
  validate(companyAdministratorCompanyIdSchema),
  getCompanyAdministrator,
);

router.post(
  "/",
  authorizeRoles("SUPER_ADMIN"),
  authorize("admin.create"),
  validate(createCompanyAdministratorSchema),
  createCompanyAdministrator,
);

export default router;
