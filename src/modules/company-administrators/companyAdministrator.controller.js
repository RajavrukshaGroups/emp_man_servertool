import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  createCompanyAdministrator as createCompanyAdministratorService,
  getCompanyAdministrator as getCompanyAdministratorService,
  updateCompanyAdministrator as updateCompanyAdministratorService,
  resetCompanyAdministratorPassword as resetCompanyAdministratorPasswordService,
  updateCompanyAdministratorStatus as updateCompanyAdministratorStatusService,
} from "./companyAdministrator.service.js";
/**
 * Create the initial Company Administrator.
 *
 * Intended for GLOBAL Super Admin onboarding flow.
 */
export const createCompanyAdministrator = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;

  const actorId = req.user?.userId ?? null;

  const result = await createCompanyAdministratorService(
    companyId,
    req.validated.body,
    actorId,
  );

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        result,
        "Company administrator created successfully.",
      ),
    );
});

/**
 * Get the current Company Administrator.
 */
export const getCompanyAdministrator = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;

  const result = await getCompanyAdministratorService(companyId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        result.administrator
          ? "Company administrator retrieved successfully."
          : "No company administrator is assigned to this company.",
      ),
    );
});

/**
 * Update the existing Company Administrator.
 *
 * Password and status are handled through separate APIs.
 */
export const updateCompanyAdministrator = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;

  const actorId = req.user?.userId ?? null;

  const result = await updateCompanyAdministratorService(
    companyId,
    req.validated.body,
    actorId,
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Company administrator updated successfully.",
      ),
    );
});

/**
 * Reset Company Administrator password.
 *
 * Intended for GLOBAL Super Admin management flow.
 */
export const resetCompanyAdministratorPassword = asyncHandler(
  async (req, res) => {
    const { companyId } = req.validated.params;

    const { newPassword } = req.validated.body;

    const actorId = req.user?.userId ?? null;

    await resetCompanyAdministratorPasswordService(
      companyId,
      newPassword,
      actorId,
    );

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          null,
          "Company administrator password reset successfully.",
        ),
      );
  },
);

/**
 * Activate or deactivate Company Administrator.
 *
 * Intended for GLOBAL Super Admin management.
 */
export const updateCompanyAdministratorStatus = asyncHandler(
  async (req, res) => {
    const { companyId } = req.validated.params;

    const { status } = req.validated.body;

    const actorId = req.user?.userId ?? null;

    const result = await updateCompanyAdministratorStatusService(
      companyId,
      status,
      actorId,
    );

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          status === "ACTIVE"
            ? "Company administrator activated successfully."
            : "Company administrator deactivated successfully.",
        ),
      );
  },
);
