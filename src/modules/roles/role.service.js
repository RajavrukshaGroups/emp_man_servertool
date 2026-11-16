import Company from "../companies/company.model.js";
import Permission from "../permissions/permission.model.js";
import { ApiError } from "../../utils/ApiError.js";
import Role from "./role.model.js";

import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  getPermissionApplicability,
  PERMISSION_APPLICABILITY,
} from "../../constants/permissionApplicability.constants.js";

/**
 * Prevent users from modifying their own assigned role.
 * Applies to both system and custom roles.
 */
const ensureNotOwnRole = (roleId, actorRoleId) => {
  if (!actorRoleId) {
    throw new ApiError(403, "Authenticated role context is required.");
  }

  if (roleId.toString() === actorRoleId.toString()) {
    throw new ApiError(403, "You cannot modify your own assigned role.");
  }
};

/**
 * Allow a narrowly scoped exception for an administrator
 * managing permissions of their own protected company role.
 *
 * Never use an actor-supplied role name as authorization.
 */
const canManageOwnProtectedCompanyAdminPermissions = (
  role,
  actorRoleId,
  actorContext,
) => {
  if (!role || !actorRoleId) {
    return false;
  }

  const actorPermissions = new Set(actorContext?.permissionCodes ?? []);

  return (
    role._id.toString() === actorRoleId.toString() &&
    role.code === "COMPANY_ADMIN" &&
    role.isSystemRole === true &&
    role.scopeType === "COMPANY" &&
    actorContext?.roleScopeType === "COMPANY" &&
    actorPermissions.has(PERMISSIONS.ROLE_UPDATE) &&
    actorPermissions.has(PERMISSIONS.ROLE_PERMISSION_DELEGATE)
  );
};

/**
 * Permissions that must remain assigned to the protected
 * Company Administrator role to prevent administrative lockout.
 */
const REQUIRED_COMPANY_ADMIN_PERMISSION_CODES = Object.freeze([
  PERMISSIONS.ROLE_READ,
  PERMISSIONS.ROLE_UPDATE,
  PERMISSIONS.ROLE_PERMISSION_DELEGATE,
  PERMISSIONS.PERMISSION_READ,
]);

const ensureCompanyAdminPermissionsRetained = async (permissionIds) => {
  const permissions = await Permission.find({
    _id: { $in: permissionIds },
    status: "ACTIVE",
  })
    .select("code")
    .lean();

  const selectedCodes = new Set(
    permissions.map((permission) => permission.code),
  );

  const missingRequiredCodes = REQUIRED_COMPANY_ADMIN_PERMISSION_CODES.filter(
    (code) => !selectedCodes.has(code),
  );

  if (missingRequiredCodes.length > 0) {
    throw new ApiError(
      403,
      `Required Company Administrator permissions cannot be removed: ${missingRequiredCodes.join(", ")}.`,
    );
  }
};

/**
 * Check whether the company exists and is available.
 */
const ensureCompanyExists = async (companyId) => {
  const company = await Company.findOne({
    _id: companyId,
    isDeleted: false,
  })
    .select("_id name code status")
    .lean();

  if (!company) {
    throw new ApiError(404, "Company not found.");
  }

  if (company.status !== "ACTIVE") {
    throw new ApiError(400, "Roles cannot be managed for an inactive company.");
  }

  return company;
};

/**
 * Ensure all supplied permission IDs exist and are active.
 */
const validatePermissionIds = async (permissionIds = []) => {
  const uniquePermissionIds = [
    ...new Set(permissionIds.map((id) => id.toString())),
  ];

  if (uniquePermissionIds.length === 0) {
    return [];
  }

  const permissions = await Permission.find({
    _id: {
      $in: uniquePermissionIds,
    },
    status: "ACTIVE",
  })
    .select("_id")
    .lean();

  if (permissions.length !== uniquePermissionIds.length) {
    const existingIds = new Set(
      permissions.map((permission) => permission._id.toString()),
    );

    const invalidPermissionIds = uniquePermissionIds.filter(
      (permissionId) => !existingIds.has(permissionId),
    );

    throw new ApiError(
      400,
      "One or more permission IDs are invalid or inactive.",
      {
        invalidPermissionIds,
      },
    );
  }

  return uniquePermissionIds;
};

/**
 * Prevent platform-only permissions from being assigned
 * to company-bound roles.
 *
 * Delegation authority must never bypass this restriction.
 */
const ensureCompanyPermissionApplicability = async (permissionIds = []) => {
  if (permissionIds.length === 0) {
    return;
  }

  const permissions = await Permission.find({
    _id: { $in: permissionIds },
    status: "ACTIVE",
  })
    .select("code applicability")
    .lean();

  const invalidPermissions = permissions
    .filter(
      (permission) =>
        getPermissionApplicability(permission.code) ===
          PERMISSION_APPLICABILITY.GLOBAL ||
        permission.applicability === PERMISSION_APPLICABILITY.GLOBAL,
    )
    .map((permission) => permission.code);

  if (invalidPermissions.length > 0) {
    throw new ApiError(
      403,
      `Platform-only permissions cannot be assigned to company roles: ${invalidPermissions.join(", ")}.`,
    );
  }
};

/**
 * Ensure the authenticated actor can grant the requested permissions.
 *
 * Regular role managers may grant only permissions they possess.
 * Explicit delegation authority permits broader grants.
 *
 * Role scope is validated separately.
 */
const ensurePermissionsCanBeGranted = async (permissionIds, actorContext) => {
  if (!actorContext?.roleScopeType) {
    throw new ApiError(403, "Authenticated role scope is required.");
  }

  if (!Array.isArray(actorContext.permissionCodes)) {
    throw new ApiError(403, "Authenticated permissions are required.");
  }

  const actorPermissions = new Set(actorContext.permissionCodes);

  if (actorPermissions.has(PERMISSIONS.ROLE_PERMISSION_DELEGATE)) {
    return;
  }

  if (permissionIds.length === 0) {
    return;
  }

  const permissions = await Permission.find({
    _id: { $in: permissionIds },
    status: "ACTIVE",
  })
    .select("code")
    .lean();

  const unauthorizedPermissions = permissions
    .filter((permission) => !actorPermissions.has(permission.code))
    .map((permission) => permission.code);

  if (unauthorizedPermissions.length > 0) {
    throw new ApiError(
      403,
      `You cannot grant permissions you do not possess: ${unauthorizedPermissions.join(", ")}.`,
    );
  }
};

/**
 * Prevent actors from managing roles broader than their own scope.
 * Delegation permission does not override scope restrictions.
 */
const ensureRoleScopeCanBeManaged = (targetScopeType, actorContext) => {
  const scopeLevels = {
    TEAM: 1,
    DEPARTMENT: 2,
    COMPANY: 3,
  };

  const actorLevel = scopeLevels[actorContext?.roleScopeType];
  const targetLevel = scopeLevels[targetScopeType];

  if (!actorLevel || !targetLevel || targetLevel > actorLevel) {
    throw new ApiError(
      403,
      "You cannot manage a role outside your authorized scope.",
    );
  }
};

/**
 * Ensure role code is unique within its applicable scope.
 */
const ensureRoleCodeIsUnique = async ({
  companyId = null,
  code,
  scopeType = "COMPANY",
  excludeRoleId = null,
}) => {
  const filter = {
    code: code.toUpperCase(),
    scopeType,
    isDeleted: false,
  };

  if (scopeType === "GLOBAL") {
    filter.companyId = null;
  } else {
    filter.companyId = companyId;
  }

  if (excludeRoleId) {
    filter._id = {
      $ne: excludeRoleId,
    };
  }

  const existingRole = await Role.findOne(filter).select("_id code").lean();

  if (existingRole) {
    throw new ApiError(
      409,
      scopeType === "GLOBAL"
        ? `A global role with code '${code.toUpperCase()}' already exists.`
        : `A role with code '${code.toUpperCase()}' already exists in this company.`,
    );
  }
};

/**
 * Create a company-bound role.
 *
 * Supported scopes:
 * COMPANY
 * DEPARTMENT
 * TEAM
 */
export const createRole = async (
  companyId,
  roleData,
  actorId = null,
  actorContext = null,
) => {
  await ensureCompanyExists(companyId);

  const normalizedCode = roleData.code.toUpperCase();

  const scopeType = roleData.scopeType ?? "COMPANY";

  ensureRoleScopeCanBeManaged(scopeType, actorContext);

  await ensureRoleCodeIsUnique({
    companyId,
    code: normalizedCode,
    scopeType,
  });
  const permissionIds = await validatePermissionIds(roleData.permissionIds);

  // Company-bound roles must never receive GLOBAL-only permissions.
  await ensureCompanyPermissionApplicability(permissionIds);

  // Delegation authority is checked separately.
  await ensurePermissionsCanBeGranted(permissionIds, actorContext);
  const role = await Role.create({
    name: roleData.name,
    code: normalizedCode,
    description: roleData.description ?? "",
    permissionIds,

    companyId,
    scopeType,

    isSystemRole: false,
    isEditable: true,
    isPermissionEditable: true,

    status: roleData.status ?? "ACTIVE",

    createdBy: actorId,
    updatedBy: actorId,
  });

  return Role.findById(role._id)
    .populate({
      path: "permissionIds",
      select: "code name module action status",
    })
    .lean();
};

/**
 * List roles belonging to a company.
 */
export const listRoles = async (
  companyId,
  {
    page = 1,
    limit = 10,
    search,
    status,
    scopeType,
    isSystemRole,
    sortBy = "createdAt",
    sortOrder = "desc",
  },
) => {
  await ensureCompanyExists(companyId);

  const filter = {
    companyId,
    isDeleted: false,
  };

  if (status) {
    filter.status = status;
  }

  if (scopeType) {
    filter.scopeType = scopeType;
  }

  if (typeof isSystemRole === "boolean") {
    filter.isSystemRole = isSystemRole;
  }

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const searchExpression = new RegExp(escapedSearch, "i");

    filter.$or = [
      { name: searchExpression },
      { code: searchExpression },
      { description: searchExpression },
    ];
  }

  const skip = (page - 1) * limit;

  const sort = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,
  };

  const [roles, totalRecords] = await Promise.all([
    Role.find(filter)
      .populate({
        path: "permissionIds",
        select: "code name module action status",
      })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),

    Role.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalRecords / limit);

  return {
    records: roles,
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

/**
 * Get a company role by ID.
 */
export const getRoleById = async (companyId, roleId) => {
  const role = await Role.findOne({
    _id: roleId,
    companyId,
    isDeleted: false,
  })
    .populate({
      path: "permissionIds",
      select: "code name module action description status",
    })
    .lean();

  if (!role) {
    throw new ApiError(404, "Role not found.");
  }

  return role;
};

/**
 * Update role details.
 */
export const updateRole = async (
  companyId,
  roleId,
  updateData,
  actorId = null,
  actorRoleId = null,
  actorContext = null,
) => {
  ensureNotOwnRole(roleId, actorRoleId);
  await ensureCompanyExists(companyId);

  const role = await Role.findOne({
    _id: roleId,
    companyId,
    isDeleted: false,
  });

  if (!role) {
    throw new ApiError(404, "Role not found.");
  }

  if (!role.isEditable) {
    throw new ApiError(403, "This role is protected and cannot be edited.");
  }

  ensureRoleScopeCanBeManaged(role.scopeType, actorContext);

  const normalizedUpdateData = {
    ...updateData,
    updatedBy: actorId,
  };

  if (updateData.code) {
    const normalizedCode = updateData.code.toUpperCase();

    await ensureRoleCodeIsUnique({
      companyId,
      code: normalizedCode,
      scopeType: role.scopeType,
      excludeRoleId: roleId,
    });

    normalizedUpdateData.code = normalizedCode;
  }

  // if (updateData.permissionIds !== undefined) {
  //   normalizedUpdateData.permissionIds = await validatePermissionIds(
  //     updateData.permissionIds,
  //   );
  // }

  delete normalizedUpdateData.permissionIds;
  delete normalizedUpdateData.companyId;
  delete normalizedUpdateData.scopeType;
  delete normalizedUpdateData.isSystemRole;
  delete normalizedUpdateData.isEditable;
  delete normalizedUpdateData.isPermissionEditable;
  delete normalizedUpdateData.isDeleted;
  delete normalizedUpdateData.deletedAt;
  delete normalizedUpdateData.deletedBy;
  delete normalizedUpdateData.createdBy;

  const updatedRole = await Role.findOneAndUpdate(
    {
      _id: roleId,
      companyId,
      isDeleted: false,
    },
    {
      $set: normalizedUpdateData,
    },
    {
      new: true,
      runValidators: true,
    },
  )
    .populate({
      path: "permissionIds",
      select: "code name module action status",
    })
    .lean();

  return updatedRole;
};

/**
 * ============================================================
 * UPDATE ROLE PERMISSIONS
 * ============================================================
 *
 * Replace all permissions assigned to a role.
 *
 * Permission editing rules:
 *
 * COMPANY_ADMIN
 *   -> protected
 *
 * TEAM_LEAD
 *   -> permissions editable
 *
 * EMPLOYEE
 *   -> permissions editable
 *
 * CUSTOM ROLE
 *   -> permissions editable
 *
 * IMPORTANT:
 *
 * Permission access does NOT override record-level scope.
 *
 * Example:
 *
 * TEAM_LEAD may have employee.read,
 * but employee.service.js must still restrict the Team Lead
 * to employees belonging to managed teams.
 */
export const updateRolePermissions = async (
  companyId,
  roleId,
  permissionIds,
  actorId = null,
  actorRoleId = null,
  actorContext = null,
) => {
  // ensureNotOwnRole(roleId, actorRoleId);

  if (!actorRoleId) {
    throw new ApiError(403, "Authenticated role context is required.");
  }

  if (
    roleId.toString() === actorRoleId.toString() &&
    !actorContext?.permissionCodes?.includes(
      PERMISSIONS.ROLE_PERMISSION_DELEGATE,
    )
  ) {
    throw new ApiError(403, "You cannot modify your own assigned role.");
  }

  await ensureCompanyExists(companyId);
  const role = await Role.findOne({
    _id: roleId,
    companyId,
    isDeleted: false,
  });

  if (!role) {
    throw new ApiError(404, "Role not found.");
  }

  const isOwnRole =
    actorRoleId && role._id.toString() === actorRoleId.toString();

  const canEditOwnProtectedAdminRole =
    canManageOwnProtectedCompanyAdminPermissions(
      role,
      actorRoleId,
      actorContext,
    );

  if (!actorRoleId) {
    throw new ApiError(403, "Authenticated role context is required.");
  }

  if (isOwnRole && !canEditOwnProtectedAdminRole) {
    throw new ApiError(403, "You cannot modify your own assigned role.");
  }

  if (!role.isPermissionEditable && !canEditOwnProtectedAdminRole) {
    throw new ApiError(
      403,
      "Permissions of this role are protected and cannot be changed.",
    );
  }

  ensureRoleScopeCanBeManaged(role.scopeType, actorContext);

  const validatedPermissionIds = await validatePermissionIds(permissionIds);

  // Validate the complete resulting permission set,
  // not just newly added permissions.
  await ensureCompanyPermissionApplicability(validatedPermissionIds);

  if (canEditOwnProtectedAdminRole) {
    await ensureCompanyAdminPermissionsRetained(validatedPermissionIds);
  }

  const existingPermissionIds = new Set(
    role.permissionIds.map((id) => id.toString()),
  );

  const newlyAddedPermissionIds = validatedPermissionIds.filter(
    (id) => !existingPermissionIds.has(id.toString()),
  );

  await ensurePermissionsCanBeGranted(newlyAddedPermissionIds, actorContext);

  role.permissionIds = validatedPermissionIds;
  role.updatedBy = actorId;

  await role.save();

  return Role.findById(role._id)
    .populate({
      path: "permissionIds",
      select: "code name module action description status",
    })
    .lean();
};

/**
 * Activate or deactivate a role.
 */
export const updateRoleStatus = async (
  companyId,
  roleId,
  status,
  actorId = null,
  actorRoleId = null,
  actorContext = null,
) => {
  ensureNotOwnRole(roleId, actorRoleId);

  await ensureCompanyExists(companyId);
  const role = await Role.findOne({
    _id: roleId,
    companyId,
    isDeleted: false,
  });

  if (!role) {
    throw new ApiError(404, "Role not found.");
  }

  if (!role.isEditable) {
    throw new ApiError(403, "This protected role's status cannot be changed.");
  }

  ensureRoleScopeCanBeManaged(role.scopeType, actorContext);

  role.status = status;
  role.updatedBy = actorId;

  await role.save();

  return role;
};

/**
 * Soft-delete a custom role.
 */
export const softDeleteRole = async (
  companyId,
  roleId,
  actorId = null,
  actorRoleId = null,
  actorContext = null,
) => {
  ensureNotOwnRole(roleId, actorRoleId);

  await ensureCompanyExists(companyId);
  const role = await Role.findOne({
    _id: roleId,
    companyId,
    isDeleted: false,
  });

  if (!role) {
    throw new ApiError(404, "Role not found.");
  }

  if (role.isSystemRole) {
    throw new ApiError(400, "System roles cannot be deleted.");
  }

  ensureRoleScopeCanBeManaged(role.scopeType, actorContext);

  role.isDeleted = true;
  role.status = "INACTIVE";
  role.deletedAt = new Date();
  role.deletedBy = actorId;
  role.updatedBy = actorId;

  await role.save();

  return role;
};
