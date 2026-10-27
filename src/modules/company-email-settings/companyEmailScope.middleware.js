import { ApiError } from "../../utils/ApiError.js";

/**
 * Restrict company email settings to the authenticated company.
 *
 * GLOBAL sessions are not permitted.
 * COMPANY_ADMIN is required for managing SMTP settings.
 */
export const requireCompanyEmailScope = (req, _res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication is required."));
  }

  if (
    req.user.accessType !== "COMPANY" ||
    req.user.roleScopeType !== "COMPANY" ||
    req.user.roleCode !== "COMPANY_ADMIN"
  ) {
    return next(
      new ApiError(
        403,
        "Only Company Administrators can manage company email settings.",
      ),
    );
  }

  const authenticatedCompanyId = req.user.companyId?.toString();

  const requestedCompanyId = req.params.companyId;

  if (
    !authenticatedCompanyId ||
    !requestedCompanyId ||
    authenticatedCompanyId !== requestedCompanyId
  ) {
    return next(
      new ApiError(403, "You cannot access another company's email settings."),
    );
  }

  return next();
};
