import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  createPlatformAdmin as createPlatformAdminService,
  getPlatformAdminById as getPlatformAdminByIdService,
  listPlatformAdmins as listPlatformAdminsService,
  listPlatformRoles as listPlatformRolesService,
  resetPlatformAdminPassword as resetPlatformAdminPasswordService,
  updatePlatformAdmin as updatePlatformAdminService,
  updatePlatformAdminStatus as updatePlatformAdminStatusService,
} from "./platformAccess.service.js";

/**
 * Create a new Platform Administrator.
 *
 * GLOBAL Super Admin operation.
 */
export const createPlatformAdmin = asyncHandler(async (req, res) => {
  const adminData = req.validated.body;

  const actorId = req.user?.userId ?? req.user?._id ?? null;

  const platformAdmin = await createPlatformAdminService(adminData, actorId);

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        platformAdmin,
        "Platform administrator created successfully.",
      ),
    );
});

/**
 * List Platform Administrators.
 */
export const listPlatformAdmins = asyncHandler(async (req, res) => {
  const query = req.validated.query;

  const result = await listPlatformAdminsService(query);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Platform administrators retrieved successfully.",
      ),
    );
});

/**
 * Get one Platform Administrator.
 */
export const getPlatformAdminById = asyncHandler(async (req, res) => {
  const { platformAccessId } = req.validated.params;

  const platformAdmin = await getPlatformAdminByIdService(platformAccessId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        platformAdmin,
        "Platform administrator retrieved successfully.",
      ),
    );
});

/**
 * Update Platform Administrator profile / role.
 */
export const updatePlatformAdmin = asyncHandler(async (req, res) => {
  const { platformAccessId } = req.validated.params;

  const updateData = req.validated.body;

  const actorId = req.user?.userId ?? req.user?._id ?? null;

  const platformAdmin = await updatePlatformAdminService(
    platformAccessId,
    updateData,
    actorId,
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        platformAdmin,
        "Platform administrator updated successfully.",
      ),
    );
});

/**
 * Activate / deactivate / suspend a Platform Administrator.
 */
export const updatePlatformAdminStatus = asyncHandler(async (req, res) => {
  const { platformAccessId } = req.validated.params;

  const { status } = req.validated.body;

  const actorId = req.user?.userId ?? req.user?._id ?? null;

  const platformAdmin = await updatePlatformAdminStatusService(
    platformAccessId,
    status,
    actorId,
  );

  let message = "Platform administrator status updated successfully.";

  if (status === "ACTIVE") {
    message = "Platform administrator activated successfully.";
  }

  if (status === "INACTIVE") {
    message = "Platform administrator deactivated successfully.";
  }

  if (status === "SUSPENDED") {
    message = "Platform administrator suspended successfully.";
  }

  return res.status(200).json(new ApiResponse(200, platformAdmin, message));
});

/**
 * Reset Platform Administrator password.
 */
export const resetPlatformAdminPassword = asyncHandler(async (req, res) => {
  const { platformAccessId } = req.validated.params;

  const { password } = req.validated.body;

  const actorId = req.user?.userId ?? req.user?._id ?? null;

  const result = await resetPlatformAdminPasswordService(
    platformAccessId,
    password,
    actorId,
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Platform administrator password reset successfully.",
      ),
    );
});

/**
 * List active GLOBAL platform roles.
 */
export const listPlatformRoles = asyncHandler(async (req, res) => {
  const result = await listPlatformRolesService();

  return res
    .status(200)
    .json(
      new ApiResponse(200, result, "Platform roles retrieved successfully."),
    );
});
