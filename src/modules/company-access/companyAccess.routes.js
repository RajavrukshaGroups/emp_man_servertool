import { Router } from "express";

import { enforceCompanyContext } from "../../middlewares/enforceCompanyContext.middleware.js";
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
  enforceCompanyContext,
  createCompanyAccess,
);

companyAccessRouter.get(
  "/",
  validate(listCompanyAccessSchema),
  enforceCompanyContext,
  listCompanyAccess,
);

companyAccessRouter.get(
  "/:accessId",
  validate(companyAccessIdParamSchema),
  enforceCompanyContext,
  getCompanyAccessById,
);

companyAccessRouter.patch(
  "/:accessId",
  validate(updateCompanyAccessSchema),
  enforceCompanyContext,
  updateCompanyAccess,
);

companyAccessRouter.patch(
  "/:accessId/status",
  validate(updateCompanyAccessStatusSchema),
  enforceCompanyContext,
  updateCompanyAccessStatus,
);

companyAccessRouter.patch(
  "/:accessId/role",
  validate(updateCompanyAccessRoleSchema),
  enforceCompanyContext,
  updateCompanyAccessRole,
);

companyAccessRouter.patch(
  "/:accessId/reporting-manager",
  validate(updateReportingManagerSchema),
  enforceCompanyContext,
  updateReportingManager,
);

companyAccessRouter.delete(
  "/:accessId",
  validate(companyAccessIdParamSchema),
  enforceCompanyContext,
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
