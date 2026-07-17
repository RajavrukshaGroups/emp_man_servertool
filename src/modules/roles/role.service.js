import Company from "../companies/company.model.js";
import Permission from "../permissions/permission.model.js";
import { ApiError } from "../../utils/ApiError.js";
import Role from "./role.model.js";

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

  if (scopeType === "COMPANY") {
    filter.companyId = companyId;
  } else {
    filter.companyId = null;
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
 * Create a company-specific role.
 */
export const createRole = async (companyId, roleData, actorId = null) => {
  await ensureCompanyExists(companyId);

  const normalizedCode = roleData.code.toUpperCase();

  await ensureRoleCodeIsUnique({
    companyId,
    code: normalizedCode,
    scopeType: "COMPANY",
  });

  const permissionIds = await validatePermissionIds(roleData.permissionIds);

  const role = await Role.create({
    name: roleData.name,
    code: normalizedCode,
    description: roleData.description ?? "",
    permissionIds,
    companyId,
    scopeType: "COMPANY",
    isSystemRole: roleData.isSystemRole ?? false,
    isEditable: roleData.isEditable ?? true,
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
) => {
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

  if (updateData.permissionIds !== undefined) {
    normalizedUpdateData.permissionIds = await validatePermissionIds(
      updateData.permissionIds,
    );
  }

  delete normalizedUpdateData.companyId;
  delete normalizedUpdateData.scopeType;
  delete normalizedUpdateData.isSystemRole;
  delete normalizedUpdateData.isEditable;
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
 * Replace all permissions assigned to a role.
 */
export const updateRolePermissions = async (
  companyId,
  roleId,
  permissionIds,
  actorId = null,
) => {
  await ensureCompanyExists(companyId);

  const role = await Role.findOne({
    _id: roleId,
    companyId,
    isDeleted: false,
  })
    .select("_id isEditable")
    .lean();

  if (!role) {
    throw new ApiError(404, "Role not found.");
  }

  if (!role.isEditable) {
    throw new ApiError(
      403,
      "Permissions of this protected role cannot be changed.",
    );
  }

  const validatedPermissionIds = await validatePermissionIds(permissionIds);

  const updatedRole = await Role.findOneAndUpdate(
    {
      _id: roleId,
      companyId,
      isDeleted: false,
    },
    {
      $set: {
        permissionIds: validatedPermissionIds,
        updatedBy: actorId,
      },
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
 * Activate or deactivate a role.
 */
export const updateRoleStatus = async (
  companyId,
  roleId,
  status,
  actorId = null,
) => {
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

  role.status = status;
  role.updatedBy = actorId;

  await role.save();

  return role;
};

/**
 * Soft-delete a custom role.
 */
export const softDeleteRole = async (companyId, roleId, actorId = null) => {
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

  role.isDeleted = true;
  role.status = "INACTIVE";
  role.deletedAt = new Date();
  role.deletedBy = actorId;
  role.updatedBy = actorId;

  await role.save();

  return role;
};
