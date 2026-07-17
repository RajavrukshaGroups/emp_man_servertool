import { Router } from "express";

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

router.post("/", validate(createCompanySchema), createCompany);

router.get("/", validate(listCompaniesSchema), listCompanies);

router.get("/:companyId", validate(companyIdParamSchema), getCompanyById);

router.patch("/:companyId", validate(updateCompanySchema), updateCompany);

router.patch(
  "/:companyId/status",
  validate(companyStatusSchema),
  updateCompanyStatus,
);

router.delete("/:companyId", validate(companyIdParamSchema), deleteCompany);

export default router;
