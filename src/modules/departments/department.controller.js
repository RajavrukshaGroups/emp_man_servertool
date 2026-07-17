import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  createDepartment as createDepartmentService,
  deleteDepartment as deleteDepartmentService,
  getDepartmentById as getDepartmentByIdService,
  listDepartments as listDepartmentsService,
  updateDepartment as updateDepartmentService,
  updateDepartmentStatus as updateDepartmentStatusService,
} from "./department.service.js";

/**
 * Create department.
 */
export const createDepartment = asyncHandler(async (req, res) => {
  const department = await createDepartmentService({
    companyId: req.validated.params.companyId,
    payload: req.validated.body,
    actorUserId: req.user.userId,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, department, "Department created successfully."));
});

/**
 * List departments.
 */
export const listDepartments = asyncHandler(async (req, res) => {
  const result = await listDepartmentsService({
    companyId: req.validated.params.companyId,
    query: req.validated.query,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Departments retrieved successfully."));
});

/**
 * Get department by ID.
 */
export const getDepartmentById = asyncHandler(async (req, res) => {
  const department = await getDepartmentByIdService({
    companyId: req.validated.params.companyId,
    departmentId: req.validated.params.departmentId,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, department, "Department retrieved successfully."),
    );
});

/**
 * Update department.
 */
export const updateDepartment = asyncHandler(async (req, res) => {
  const department = await updateDepartmentService({
    companyId: req.validated.params.companyId,
    departmentId: req.validated.params.departmentId,
    payload: req.validated.body,
    actorUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, department, "Department updated successfully."));
});

/**
 * Update department status.
 */
export const updateDepartmentStatus = asyncHandler(async (req, res) => {
  const department = await updateDepartmentStatusService({
    companyId: req.validated.params.companyId,
    departmentId: req.validated.params.departmentId,
    status: req.validated.body.status,
    actorUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        department,
        "Department status updated successfully.",
      ),
    );
});

/**
 * Soft delete department.
 */
export const deleteDepartment = asyncHandler(async (req, res) => {
  await deleteDepartmentService({
    companyId: req.validated.params.companyId,
    departmentId: req.validated.params.departmentId,
    actorUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Department deleted successfully."));
});
