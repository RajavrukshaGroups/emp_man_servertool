import mongoose from "mongoose";

import { ApiError } from "../utils/ApiError.js";

/**
 * Ensures the authenticated company access matches
 * the companyId supplied in the route.
 *
 * Must run after authenticate middleware.
 */
export const requireCompanyScope = (req, _res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication is required."));
  }

  const requestedCompanyId = req.params.companyId;
  const authenticatedCompanyId = req.user.companyId;

  if (!requestedCompanyId) {
    return next(new ApiError(400, "Company ID is required."));
  }

  if (!mongoose.Types.ObjectId.isValid(requestedCompanyId)) {
    return next(new ApiError(400, "Invalid company ID."));
  }

  if (!authenticatedCompanyId) {
    return next(
      new ApiError(403, "Authenticated company access is unavailable."),
    );
  }

  const belongsToRequestedCompany =
    authenticatedCompanyId.toString() === requestedCompanyId.toString();

  if (!belongsToRequestedCompany) {
    return next(
      new ApiError(403, "You do not have access to this company."),
    );
  }

  return next();
};

export default requireCompanyScope;