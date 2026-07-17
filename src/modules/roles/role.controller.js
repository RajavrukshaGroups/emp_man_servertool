import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  createRole as createRoleService,
  getRoleById as getRoleByIdService,
  listRoles as listRolesService,
  softDeleteRole as softDeleteRoleService,
  updateRole as updateRoleService,
  updateRolePermissions as updateRolePermissionsService,
  updateRoleStatus as updateRoleStatusService,
} from "./role.service.js";

/**
 * Create a company role.
 */
export const createRole = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;
  const roleData = req.validated.body;

  const role = await createRoleService(
    companyId,
    roleData,
    req.user?._id ?? null,
  );

  return res
    .status(201)
    .json(new ApiResponse(201, role, "Role created successfully."));
});

/**
 * List roles belonging to a company.
 */
export const listRoles = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;
  const query = req.validated.query;

  const result = await listRolesService(companyId, query);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Roles retrieved successfully."));
});

/**
 * Get one role.
 */
export const getRoleById = asyncHandler(async (req, res) => {
  const { companyId, roleId } = req.validated.params;

  const role = await getRoleByIdService(companyId, roleId);

  return res
    .status(200)
    .json(new ApiResponse(200, role, "Role retrieved successfully."));
});

/**
 * Update role details.
 */
export const updateRole = asyncHandler(async (req, res) => {
  const { companyId, roleId } = req.validated.params;
  const updateData = req.validated.body;

  const role = await updateRoleService(
    companyId,
    roleId,
    updateData,
    req.user?._id ?? null,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, role, "Role updated successfully."));
});

/**
 * Replace the permissions assigned to a role.
 */
export const updateRolePermissions = asyncHandler(async (req, res) => {
  const { companyId, roleId } = req.validated.params;
  const { permissionIds } = req.validated.body;

  const role = await updateRolePermissionsService(
    companyId,
    roleId,
    permissionIds,
    req.user?._id ?? null,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, role, "Role permissions updated successfully."));
});

/**
 * Activate or deactivate a role.
 */
export const updateRoleStatus = asyncHandler(async (req, res) => {
  const { companyId, roleId } = req.validated.params;
  const { status } = req.validated.body;

  const role = await updateRoleStatusService(
    companyId,
    roleId,
    status,
    req.user?._id ?? null,
  );

  const message =
    status === "ACTIVE"
      ? "Role activated successfully."
      : "Role deactivated successfully.";

  return res.status(200).json(new ApiResponse(200, role, message));
});

/**
 * Soft-delete a custom role.
 */
export const deleteRole = asyncHandler(async (req, res) => {
  const { companyId, roleId } = req.validated.params;

  await softDeleteRoleService(companyId, roleId, req.user?._id ?? null);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Role deleted successfully."));
});
