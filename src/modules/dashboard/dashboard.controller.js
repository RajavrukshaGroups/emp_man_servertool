import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import { getDashboardSummary as getDashboardSummaryService } from "./dashboard.service.js";

/**
 * Get company dashboard summary.
 */
export const getDashboardSummary = asyncHandler(async (req, res) => {
  const summary = await getDashboardSummaryService({
    companyId: req.validated.params.companyId,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        summary,
        "Dashboard summary retrieved successfully.",
      ),
    );
});
