import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  getOnboardingByUserId as getOnboardingByUserIdService,
  listPendingOnboarding as listPendingOnboardingService,
} from "./onboarding.service.js";

const getRequestContext = (req) => ({
  actorId: req.user?.userId ?? null,
  companyId: req.user?.companyId ?? null,
  roleId: req.user?.roleId ?? null,
  roleScopeType: req.user?.roleScopeType ?? null,
});

/**
 * List pending employee onboarding records.
 */
export const listPendingOnboarding = asyncHandler(async (req, res) => {
  const context = getRequestContext(req);

  const result = await listPendingOnboardingService(
    req.validated.query,
    context,
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Pending onboarding records retrieved successfully.",
      ),
    );
});

/**
 * Retrieve one onboarding record by user ID.
 */
export const getOnboardingByUserId = asyncHandler(async (req, res) => {
  const { userId } = req.validated.params;

  const context = getRequestContext(req);

  const result = await getOnboardingByUserIdService(userId, context);

  return res
    .status(200)
    .json(
      new ApiResponse(200, result, "Onboarding record retrieved successfully."),
    );
});
