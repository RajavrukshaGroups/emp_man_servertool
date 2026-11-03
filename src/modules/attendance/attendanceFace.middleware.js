import { ApiError } from "../../utils/ApiError.js";

/**
 * Require an active company-scoped employee session.
 *
 * The authenticate middleware has already validated:
 * - User status
 * - Company status
 * - CompanyAccess status
 * - Assigned role status
 *
 * The attendance router also runs enforceCompanyContext.
 */
export const requireFaceEnrollmentCompanyContext = (req, _res, next) => {
  const user = req.user;

  if (
    user?.accessType !== "COMPANY" ||
    !user.companyId ||
    !user.companyAccessId ||
    !user.userId
  ) {
    throw new ApiError(
      403,
      "An active company employee session is required for facial enrollment.",
    );
  }

  const routeCompanyId = req.params?.companyId;

  if (String(routeCompanyId) !== String(user.companyId)) {
    throw new ApiError(
      403,
      "Facial enrollment is not permitted for another company.",
    );
  }

  return next();
};
