import { ApiError } from "../utils/ApiError.js";

export const enforceCompanyContext = (req, _res, next) => {
  const routeCompanyId =
    req.validated?.params?.companyId ?? req.params?.companyId;

  const activeCompanyId = req.user?.companyId;
  const roleScopeType = req.user?.roleScopeType;

  /**
   * ORG-level users may access multiple companies.
   */
  if (roleScopeType === "ORG") {
    return next();
  }

  if (!activeCompanyId) {
    throw new ApiError(403, "Active company context is required.");
  }

  if (String(routeCompanyId) !== String(activeCompanyId)) {
    throw new ApiError(
      403,
      "You cannot access employee records belonging to another company.",
    );
  }

  return next();
};
