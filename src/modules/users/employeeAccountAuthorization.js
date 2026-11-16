import { ApiError } from "../../utils/ApiError.js";
import { PERMISSIONS } from "../../constants/permissions.constants.js";

import CompanyAccess from "../company-access/companyAccess.model.js";
import PlatformAccess from "../platform-access/platformAccess.model.js";
import Employee from "../employees/employee.model.js";

const ADMINISTRATIVE_PERMISSIONS = new Set([
  PERMISSIONS.ADMIN_CREATE,
  PERMISSIONS.ADMIN_UPDATE,
  PERMISSIONS.ADMIN_DEACTIVATE,
]);

const getActivePermissionCodes = (role) =>
  new Set(
    (role?.permissionIds ?? [])
      .filter((permission) => permission?.status === "ACTIVE")
      .map((permission) => permission.code),
  );

/**
 * Protect privileged accounts from employee-account operations.
 *
 * This helper does not replace the existing scope checks.
 */
export const ensureEmployeeAccountActionAllowed = async ({
  targetUserId,
  context,
  action,
}) => {
  const actorPermissions = new Set(context.permissionCodes ?? []);

  const broadPermissionByAction = {
    UPDATE: PERMISSIONS.ADMIN_UPDATE,
    RESET_PASSWORD: PERMISSIONS.ADMIN_UPDATE,
    STATUS_MANAGE: PERMISSIONS.ADMIN_DEACTIVATE,
  };

  const dedicatedPermissionByAction = {
    UPDATE: PERMISSIONS.USER_EMPLOYEE_ACCOUNT_UPDATE,
    RESET_PASSWORD: PERMISSIONS.USER_EMPLOYEE_ACCOUNT_RESET_PASSWORD,
    STATUS_MANAGE: PERMISSIONS.USER_EMPLOYEE_ACCOUNT_STATUS_MANAGE,
  };

  const broadPermission = broadPermissionByAction[action];
  const dedicatedPermission = dedicatedPermissionByAction[action];

  if (!broadPermission || !dedicatedPermission) {
    throw new ApiError(403, "Unsupported account management action.");
  }

  const hasBroadPermission = actorPermissions.has(broadPermission);
  const hasDedicatedPermission = actorPermissions.has(dedicatedPermission);

  if (!hasBroadPermission && !hasDedicatedPermission) {
    throw new ApiError(403, "Insufficient account management permissions.");
  }

  if (
    action === "STATUS_MANAGE" &&
    String(targetUserId) === String(context.actorId)
  ) {
    throw new ApiError(403, "You cannot change your own account status.");
  }

  // Existing broad administrator authorization is retained.
  if (hasBroadPermission) {
    return;
  }

  // Dedicated employee-account permissions require
  // an authenticated company context.
  if (!context.companyId || context.roleScopeType === "GLOBAL") {
    throw new ApiError(
      403,
      "Active company context is required for employee-account management.",
    );
  }

  // Dedicated employee-account permissions must not manage
  // users who hold platform-level access.
  const platformAccess = await PlatformAccess.exists({
    userId: targetUserId,
    isDeleted: false,
  });

  if (platformAccess) {
    throw new ApiError(
      403,
      "This account cannot be managed using employee-account permissions.",
    );
  }

  // Check the target's company roles and their active permissions.
  const companyAccessRecords = await CompanyAccess.find({
    userId: targetUserId,
    isDeleted: false,
    status: { $in: ["ONBOARDING", "ACTIVE", "INACTIVE"] },
  })
    .populate({
      path: "roleId",
      select: "permissionIds status",
      populate: {
        path: "permissionIds",
        select: "code status",
      },
    })
    .lean();

  if (companyAccessRecords.length === 0) {
    throw new ApiError(403, "An eligible company account is required.");
  }

  // Dedicated employee-account permissions require an actual
  // employee profile in the actor's company.
  const employee = await Employee.exists({
    userId: targetUserId,
    companyId: context.companyId,
    isDeleted: false,
  });

  if (!employee) {
    throw new ApiError(
      403,
      "Employee-account permissions can only manage employee accounts.",
    );
  }

  for (const access of companyAccessRecords) {
    if (!access.roleId || access.roleId.status !== "ACTIVE") {
      continue;
    }

    const targetPermissions = getActivePermissionCodes(access.roleId);

    const isPrivileged = [...targetPermissions].some((permission) =>
      permission.startsWith("admin."),
    );

    if (isPrivileged) {
      throw new ApiError(
        403,
        "This account has protected administrative capabilities.",
      );
    }
  }
};
