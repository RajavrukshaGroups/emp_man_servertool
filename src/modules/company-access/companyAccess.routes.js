import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import {
  createCompanyAccess,
  deleteCompanyAccess,
  getCompanyAccessById,
  getUserCompanyAccess,
  listCompanyAccess,
  updateCompanyAccess,
  updateCompanyAccessRole,
  updateCompanyAccessStatus,
  updateReportingManager,
} from "./companyAccess.controller.js";

import {
  companyAccessIdParamSchema,
  createCompanyAccessSchema,
  getUserCompanyAccessSchema,
  listCompanyAccessSchema,
  updateCompanyAccessRoleSchema,
  updateCompanyAccessSchema,
  updateCompanyAccessStatusSchema,
  updateReportingManagerSchema,
} from "./companyAccess.validation.js";

/**
 * Mounted at:
 *
 * /companies/:companyId/access
 */
const companyAccessRouter = Router({
  mergeParams: true,
});
companyAccessRouter.use(authenticate);

companyAccessRouter.post(
  "/",
  validate(createCompanyAccessSchema),
  createCompanyAccess,
);

companyAccessRouter.get(
  "/",
  validate(listCompanyAccessSchema),
  listCompanyAccess,
);

companyAccessRouter.get(
  "/:accessId",
  validate(companyAccessIdParamSchema),
  getCompanyAccessById,
);

companyAccessRouter.patch(
  "/:accessId",
  validate(updateCompanyAccessSchema),
  updateCompanyAccess,
);

companyAccessRouter.patch(
  "/:accessId/status",
  validate(updateCompanyAccessStatusSchema),
  updateCompanyAccessStatus,
);

companyAccessRouter.patch(
  "/:accessId/role",
  validate(updateCompanyAccessRoleSchema),
  updateCompanyAccessRole,
);

companyAccessRouter.patch(
  "/:accessId/reporting-manager",
  validate(updateReportingManagerSchema),
  updateReportingManager,
);

companyAccessRouter.delete(
  "/:accessId",
  validate(companyAccessIdParamSchema),
  deleteCompanyAccess,
);

/**
 * Mounted at:
 *
 * /users/:userId/company-access
 */
const userCompanyAccessRouter = Router({
  mergeParams: true,
});
userCompanyAccessRouter.use(authenticate);

userCompanyAccessRouter.get(
  "/",
  validate(getUserCompanyAccessSchema),
  getUserCompanyAccess,
);

export { companyAccessRouter, userCompanyAccessRouter };

export default companyAccessRouter;
