import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  createWorkCategory as createWorkCategoryService,
  deleteWorkCategory as deleteWorkCategoryService,
  getWorkCategoryById as getWorkCategoryByIdService,
  listWorkCategories as listWorkCategoriesService,
  updateWorkCategory as updateWorkCategoryService,
  updateWorkCategoryStatus as updateWorkCategoryStatusService,
} from "./workCategory.service.js";

/**
 * ============================================================
 * CREATE WORK CATEGORY
 *
 * POST /companies/:companyId/work-categories
 * ============================================================
 */

export const createWorkCategory = asyncHandler(async (req, res) => {
  const workCategory = await createWorkCategoryService({
    companyId: req.validated.params.companyId,

    payload: req.validated.body,

    requesterUserId: req.user.userId,
  });

  return res
    .status(201)
    .json(
      new ApiResponse(201, workCategory, "Work category created successfully."),
    );
});

/**
 * ============================================================
 * LIST WORK CATEGORIES
 *
 * GET /companies/:companyId/work-categories
 * ============================================================
 */

export const listWorkCategories = asyncHandler(async (req, res) => {
  const result = await listWorkCategoriesService({
    companyId: req.validated.params.companyId,

    query: req.validated.query,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, result, "Work categories retrieved successfully."),
    );
});

/**
 * ============================================================
 * GET WORK CATEGORY BY ID
 *
 * GET /companies/:companyId/work-categories/:workCategoryId
 * ============================================================
 */

export const getWorkCategoryById = asyncHandler(async (req, res) => {
  const workCategory = await getWorkCategoryByIdService({
    companyId: req.validated.params.companyId,

    workCategoryId: req.validated.params.workCategoryId,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        workCategory,
        "Work category retrieved successfully.",
      ),
    );
});

/**
 * ============================================================
 * UPDATE WORK CATEGORY
 *
 * PATCH /companies/:companyId/work-categories/:workCategoryId
 * ============================================================
 */

export const updateWorkCategory = asyncHandler(async (req, res) => {
  const workCategory = await updateWorkCategoryService({
    companyId: req.validated.params.companyId,

    workCategoryId: req.validated.params.workCategoryId,

    payload: req.validated.body,

    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, workCategory, "Work category updated successfully."),
    );
});

/**
 * ============================================================
 * UPDATE WORK CATEGORY STATUS
 *
 * PATCH /companies/:companyId/work-categories/:workCategoryId/status
 * ============================================================
 */

export const updateWorkCategoryStatus = asyncHandler(async (req, res) => {
  const workCategory = await updateWorkCategoryStatusService({
    companyId: req.validated.params.companyId,

    workCategoryId: req.validated.params.workCategoryId,

    status: req.validated.body.status,

    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        workCategory,
        "Work category status updated successfully.",
      ),
    );
});

/**
 * ============================================================
 * DELETE WORK CATEGORY
 *
 * Soft delete only.
 *
 * DELETE /companies/:companyId/work-categories/:workCategoryId
 * ============================================================
 */

export const deleteWorkCategory = asyncHandler(async (req, res) => {
  const result = await deleteWorkCategoryService({
    companyId: req.validated.params.companyId,

    workCategoryId: req.validated.params.workCategoryId,

    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Work category deleted successfully."));
});
