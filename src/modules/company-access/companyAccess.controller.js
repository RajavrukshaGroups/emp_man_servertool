import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  createCompanyAccess as createCompanyAccessService,
  getCompanyAccessById as getCompanyAccessByIdService,
  getUserCompanyAccess as getUserCompanyAccessService,
  listCompanyAccess as listCompanyAccessService,
  softDeleteCompanyAccess as softDeleteCompanyAccessService,
  updateCompanyAccess as updateCompanyAccessService,
  updateCompanyAccessRole as updateCompanyAccessRoleService,
  updateCompanyAccessStatus as updateCompanyAccessStatusService,
  updateReportingManager as updateReportingManagerService,
} from "./companyAccess.service.js";

/**
 * Create company access.
 */
export const createCompanyAccess = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;
  const actorId = req.user?.userId ?? null;

  const access = await createCompanyAccessService(
    companyId,
    req.validated.body,
    actorId,
  );

  return res
    .status(201)
    .json(new ApiResponse(201, access, "Company access created successfully."));
});

/**
 * List company access records.
 */
export const listCompanyAccess = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;

  const result = await listCompanyAccessService(companyId, req.validated.query);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Company access records retrieved successfully.",
      ),
    );
});

/**
 * Get one company access record.
 */
export const getCompanyAccessById = asyncHandler(async (req, res) => {
  const { companyId, accessId } = req.validated.params;

  const access = await getCompanyAccessByIdService(companyId, accessId);

  return res
    .status(200)
    .json(
      new ApiResponse(200, access, "Company access retrieved successfully."),
    );
});

/**
 * Update company access.
 */
export const updateCompanyAccess = asyncHandler(async (req, res) => {
  const { companyId, accessId } = req.validated.params;

  const access = await updateCompanyAccessService(
    companyId,
    accessId,
    req.validated.body,
    req.user?.userId ?? null,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, access, "Company access updated successfully."));
});

/**
 * Update company access status.
 */
export const updateCompanyAccessStatus = asyncHandler(async (req, res) => {
  const { companyId, accessId } = req.validated.params;

  const access = await updateCompanyAccessStatusService(
    companyId,
    accessId,
    req.validated.body,
    req.user?.userId ?? null,
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        access,
        "Company access status updated successfully.",
      ),
    );
});

/**
 * Update company access role.
 */
export const updateCompanyAccessRole = asyncHandler(async (req, res) => {
  const { companyId, accessId } = req.validated.params;

  const { roleId } = req.validated.body;

  const access = await updateCompanyAccessRoleService(
    companyId,
    accessId,
    roleId,
    req.user?.userId ?? null,
  );

  return res
    .status(200)
    .json(
      new ApiResponse(200, access, "Company access role updated successfully."),
    );
});

/**
 * Update reporting manager.
 */
export const updateReportingManager = asyncHandler(async (req, res) => {
  const { companyId, accessId } = req.validated.params;

  const { reportingManagerId } = req.validated.body;

  const access = await updateReportingManagerService(
    companyId,
    accessId,
    reportingManagerId,
    req.user?.userId ?? null,
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        access,
        reportingManagerId
          ? "Reporting manager updated successfully."
          : "Reporting manager removed successfully.",
      ),
    );
});

/**
 * Delete company access.
 */
export const deleteCompanyAccess = asyncHandler(async (req, res) => {
  const { companyId, accessId } = req.validated.params;

  await softDeleteCompanyAccessService(
    companyId,
    accessId,
    req.user?.userId ?? null,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Company access deleted successfully."));
});

/**
 * Get all companies available to one user.
 */
export const getUserCompanyAccess = asyncHandler(async (req, res) => {
  const { userId } = req.validated.params;

  const accessRecords = await getUserCompanyAccessService(
    userId,
    req.validated.query,
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        accessRecords,
        "User company access retrieved successfully.",
      ),
    );
});
