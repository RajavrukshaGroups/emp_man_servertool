import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import {
  authorize,
  authorizeRoles,
} from "../../middlewares/authorize.middleware.js";

import { validate } from "../../middlewares/validate.middleware.js";

import {
  createCompany,
  deleteCompany,
  getCompanyById,
  listCompanies,
  updateCompany,
  updateCompanyStatus,
} from "./company.controller.js";

import {
  companyIdParamSchema,
  companyStatusSchema,
  createCompanySchema,
  listCompaniesSchema,
  updateCompanySchema,
} from "./company.validation.js";

const router = Router();

/**
 * Every company-management endpoint is platform-level.
 */
router.use(authenticate);

/**
 * Restrict this whole module to the platform Super Admin.
 *
 * Permission checks are still applied below as an additional layer.
 */
router.use(authorizeRoles("SUPER_ADMIN"));

router.post(
  "/",
  authorize("company.create"),
  validate(createCompanySchema),
  createCompany,
);

router.get(
  "/",
  authorize("company.read"),
  validate(listCompaniesSchema),
  listCompanies,
);

router.get(
  "/:companyId",
  authorize("company.read"),
  validate(companyIdParamSchema),
  getCompanyById,
);

router.patch(
  "/:companyId",
  authorize("company.update"),
  validate(updateCompanySchema),
  updateCompany,
);

router.patch(
  "/:companyId/status",
  authorize("company.deactivate"),
  validate(companyStatusSchema),
  updateCompanyStatus,
);

router.delete(
  "/:companyId",
  authorize("company.deactivate"),
  validate(companyIdParamSchema),
  deleteCompany,
);

export default router;
