import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { requireCompanyScope } from "../../middlewares/companyScope.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  createWorkCategory,
  deleteWorkCategory,
  getWorkCategoryById,
  listWorkCategories,
  updateWorkCategory,
  updateWorkCategoryStatus,
} from "./workCategory.controller.js";

import {
  createWorkCategorySchema,
  updateWorkCategorySchema,
  updateWorkCategoryStatusSchema,
  workCategoryIdParamSchema,
  listWorkCategoriesSchema,
} from "./workCategory.validation.js";

const router = Router({
  mergeParams: true,
});

router.use(authenticate);
router.use(requireCompanyScope);

/**
 * ============================================================
 * CREATE WORK CATEGORY
 *
 * POST /companies/:companyId/work-categories
 * ============================================================
 */
router.post(
  "/",
  authorize(PERMISSIONS.WORK_CATEGORY_CREATE),
  validate(createWorkCategorySchema),
  createWorkCategory,
);

/**
 * ============================================================
 * LIST WORK CATEGORIES
 *
 * GET /companies/:companyId/work-categories
 * ============================================================
 */
router.get(
  "/",
  authorize(PERMISSIONS.WORK_CATEGORY_READ),
  validate(listWorkCategoriesSchema),
  listWorkCategories,
);

/**
 * ============================================================
 * GET WORK CATEGORY BY ID
 *
 * GET /companies/:companyId/work-categories/:workCategoryId
 * ============================================================
 */
router.get(
  "/:workCategoryId",
  authorize(PERMISSIONS.WORK_CATEGORY_READ),
  validate(workCategoryIdParamSchema),
  getWorkCategoryById,
);

/**
 * ============================================================
 * UPDATE WORK CATEGORY
 *
 * PATCH /companies/:companyId/work-categories/:workCategoryId
 * ============================================================
 */
router.patch(
  "/:workCategoryId",
  authorize(PERMISSIONS.WORK_CATEGORY_UPDATE),
  validate(updateWorkCategorySchema),
  updateWorkCategory,
);

/**
 * ============================================================
 * UPDATE STATUS
 *
 * PATCH /companies/:companyId/work-categories/:workCategoryId/status
 * ============================================================
 */
router.patch(
  "/:workCategoryId/status",
  authorize(PERMISSIONS.WORK_CATEGORY_UPDATE),
  validate(updateWorkCategoryStatusSchema),
  updateWorkCategoryStatus,
);

/**
 * ============================================================
 * DELETE WORK CATEGORY
 *
 * Soft delete.
 *
 * DELETE /companies/:companyId/work-categories/:workCategoryId
 * ============================================================
 */
router.delete(
  "/:workCategoryId",
  authorize(PERMISSIONS.WORK_CATEGORY_DELETE),
  validate(workCategoryIdParamSchema),
  deleteWorkCategory,
);

export default router;
