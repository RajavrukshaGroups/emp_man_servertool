import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  createCompanyAdministrator as createCompanyAdministratorService,
  getCompanyAdministrator as getCompanyAdministratorService,
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
