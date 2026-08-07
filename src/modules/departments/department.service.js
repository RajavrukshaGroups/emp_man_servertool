import mongoose from "mongoose";

import { ApiError } from "../../utils/ApiError.js";

import Company from "../companies/company.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";
import Department from "./department.model.js";
import Employee from "../employees/employee.model.js";

const departmentPopulate = [
  {
    path: "departmentHeadId",
    select:
      "userId employeeCode designation employmentType status departmentId teamId",
    populate: {
      path: "userId",
      select:
        "firstName middleName lastName displayName email mobile profilePhoto status",
    },
  },
  {
    path: "parentDepartmentId",
    select: "name code status",
  },
  {
    path: "createdBy",
    select: "firstName lastName displayName email",
  },
  {
    path: "updatedBy",
    select: "firstName lastName displayName email",
  },
];

const normalizeDepartmentName = (name) => name.replace(/\s+/g, " ").trim();

const normalizeDepartmentCode = (code) =>
  code
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toUpperCase()
    .trim();

/**
 * Ensure the company exists and is available.
 */
const validateCompany = async (companyId, { requireActive = true } = {}) => {
  const company = await Company.findOne({
    _id: companyId,
    isDeleted: false,
  })
    .select("_id name code status")
    .lean();

  if (!company) {
    throw new ApiError(404, "Company not found.");
  }

  if (requireActive && company.status !== "ACTIVE") {
    throw new ApiError(
      403,
      "Department operations are not allowed for an inactive company.",
    );
  }

  return company;
};

/**
 * Ensure a department exists inside the selected company.
 */
const findDepartmentOrFail = async (
  companyId,
  departmentId,
  { populate = false, lean = false } = {},
) => {
  let query = Department.findOne({
    _id: departmentId,
    companyId,
    isDeleted: false,
  });

  if (populate) {
    query = query.populate(departmentPopulate);
  }

  if (lean) {
    query = query.lean();
  }

  const department = await query;

  if (!department) {
    throw new ApiError(404, "Department not found.");
  }

  return department;
};

/**
 * Check duplicate department name and code inside a company.
 */
const validateDepartmentUniqueness = async ({
  companyId,
  name,
  code,
  excludeDepartmentId = null,
}) => {
  const conditions = [];

  if (name) {
    conditions.push({
      name: normalizeDepartmentName(name),
    });
  }

  if (code) {
    conditions.push({
      code: normalizeDepartmentCode(code),
    });
  }

  if (conditions.length === 0) {
    return;
  }

  const filter = {
    companyId,
    isDeleted: false,
    $or: conditions,
  };

  if (excludeDepartmentId) {
    filter._id = {
      $ne: excludeDepartmentId,
    };
  }

  const duplicateDepartment = await Department.findOne(filter)
    .select("_id name code")
    .lean();

  if (!duplicateDepartment) {
    return;
  }

  if (
    name &&
    duplicateDepartment.name.toLowerCase() ===
      normalizeDepartmentName(name).toLowerCase()
  ) {
    throw new ApiError(
      409,
      "A department with this name already exists in the company.",
    );
  }

  if (code && duplicateDepartment.code === normalizeDepartmentCode(code)) {
    throw new ApiError(
      409,
      "A department with this code already exists in the company.",
    );
  }

  throw new ApiError(
    409,
    "A department with the provided name or code already exists.",
  );
};

/**
 * Validate that the department head is an active CompanyAccess
 * record belonging to the same company.
 */
const validateDepartmentHead = async ({ companyId, departmentHeadId }) => {
  if (!departmentHeadId) {
    return null;
  }

  const departmentHead = await CompanyAccess.findOne({
    _id: departmentHeadId,
    companyId,
    isDeleted: false,
    status: "ACTIVE",
  })
    .select("_id userId companyId employeeCode designation status departmentId")
    .lean();

  if (!departmentHead) {
    throw new ApiError(
      400,
      "Department head must be an active company access record belonging to the same company.",
    );
  }

  return departmentHead;
};

/**
 * Validate parent department and prevent self-parenting.
 */
const validateParentDepartment = async ({
  companyId,
  departmentId = null,
  parentDepartmentId,
}) => {
  if (!parentDepartmentId) {
    return null;
  }

  if (
    departmentId &&
    departmentId.toString() === parentDepartmentId.toString()
  ) {
    throw new ApiError(400, "A department cannot be its own parent.");
  }

  const parentDepartment = await Department.findOne({
    _id: parentDepartmentId,
    companyId,
    isDeleted: false,
  })
    .select("_id name code parentDepartmentId status")
    .lean();

  if (!parentDepartment) {
    throw new ApiError(
      400,
      "Parent department does not exist in the selected company.",
    );
  }

  if (parentDepartment.status !== "ACTIVE") {
    throw new ApiError(
      400,
      "An inactive department cannot be assigned as the parent department.",
    );
  }

  return parentDepartment;
};

/**
 * Prevent circular department hierarchy.
 *
 * Example prevented:
 *
 * Engineering
 *   ↓
 * Software
 *   ↓
 * Engineering
 */
const validateNoCircularHierarchy = async ({
  companyId,
  departmentId,
  parentDepartmentId,
}) => {
  if (!departmentId || !parentDepartmentId) {
    return;
  }

  let currentParentId = parentDepartmentId;
  const visitedDepartmentIds = new Set();

  while (currentParentId) {
    const currentId = currentParentId.toString();

    if (currentId === departmentId.toString()) {
      throw new ApiError(400, "Circular department hierarchy is not allowed.");
    }

    if (visitedDepartmentIds.has(currentId)) {
      throw new ApiError(
        400,
        "An existing circular department hierarchy was detected.",
      );
    }

    visitedDepartmentIds.add(currentId);

    const currentDepartment = await Department.findOne({
      _id: currentParentId,
      companyId,
      isDeleted: false,
    })
      .select("_id parentDepartmentId")
      .lean();

    if (!currentDepartment) {
      break;
    }

    currentParentId = currentDepartment.parentDepartmentId;
  }
};

/**
 * Create department.
 */
export const createDepartment = async ({
  companyId,
  payload,
  actorUserId = null,
}) => {
  await validateCompany(companyId);

  const normalizedName = normalizeDepartmentName(payload.name);
  const normalizedCode = normalizeDepartmentCode(payload.code);

  await validateDepartmentUniqueness({
    companyId,
    name: normalizedName,
    code: normalizedCode,
  });

  await Promise.all([
    validateDepartmentHead({
      companyId,
      departmentHeadId: payload.departmentHeadId,
    }),

    validateParentDepartment({
      companyId,
      parentDepartmentId: payload.parentDepartmentId,
    }),
  ]);

  const department = await Department.create({
    companyId,
    name: normalizedName,
    code: normalizedCode,
    description: payload.description ?? "",
    departmentHeadId: payload.departmentHeadId ?? null,
    parentDepartmentId: payload.parentDepartmentId ?? null,
    status: payload.status ?? "ACTIVE",
    createdBy: actorUserId,
    updatedBy: actorUserId,
  });

  return Department.findById(department._id)
    .populate(departmentPopulate)
    .lean();
};

/**
 * List departments.
 */
export const listDepartments = async ({ companyId, query }) => {
  await validateCompany(companyId, {
    requireActive: false,
  });

  const {
    page = 1,
    limit = 10,
    search,
    status,
    departmentHeadId,
    parentDepartmentId,
    hasParent,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = query;

  const filter = {
    companyId,
    isDeleted: false,
  };

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    filter.$or = [
      {
        name: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
      {
        code: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
      {
        description: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
    ];
  }

  if (status) {
    filter.status = status;
  }

  if (departmentHeadId) {
    filter.departmentHeadId = departmentHeadId;
  }

  if (parentDepartmentId) {
    filter.parentDepartmentId = parentDepartmentId;
  }

  if (typeof hasParent === "boolean") {
    filter.parentDepartmentId = hasParent
      ? {
          $ne: null,
        }
      : null;
  }

  const skip = (page - 1) * limit;

  const sort = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,
    _id: 1,
  };

  const [departments, total] = await Promise.all([
    Department.find(filter)
      .populate(departmentPopulate)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),

    Department.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    departments,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

/**
 * Get department by ID.
 */
export const getDepartmentById = async ({ companyId, departmentId }) => {
  await validateCompany(companyId, {
    requireActive: false,
  });

  const department = await findDepartmentOrFail(companyId, departmentId, {
    populate: true,
    lean: true,
  });

  const departmentAccessRecords = await CompanyAccess.find({
    companyId,
    departmentId,
    isDeleted: false,
    status: "ACTIVE",
  })
    .select("_id")
    .lean();

  const companyAccessIds = departmentAccessRecords.map((access) => access._id);

  const [childDepartmentCount, assignedEmployeeCount] = await Promise.all([
    Department.countDocuments({
      companyId,
      parentDepartmentId: departmentId,
      isDeleted: false,
    }),

    Employee.countDocuments({
      companyId,
      companyAccessId: {
        $in: companyAccessIds,
      },
      isDeleted: false,
      status: "ACTIVE",
    }),
  ]);

  return {
    ...department,
    statistics: {
      childDepartmentCount,
      assignedEmployeeCount,
    },
  };
};

/**
 * Update department.
 */
export const updateDepartment = async ({
  companyId,
  departmentId,
  payload,
  actorUserId = null,
}) => {
  await validateCompany(companyId);

  const department = await findDepartmentOrFail(companyId, departmentId);

  const normalizedName = payload.name
    ? normalizeDepartmentName(payload.name)
    : undefined;

  const normalizedCode = payload.code
    ? normalizeDepartmentCode(payload.code)
    : undefined;

  await validateDepartmentUniqueness({
    companyId,
    name: normalizedName,
    code: normalizedCode,
    excludeDepartmentId: departmentId,
  });

  if (Object.hasOwn(payload, "departmentHeadId")) {
    await validateDepartmentHead({
      companyId,
      departmentHeadId: payload.departmentHeadId,
    });
  }

  if (Object.hasOwn(payload, "parentDepartmentId")) {
    await validateParentDepartment({
      companyId,
      departmentId,
      parentDepartmentId: payload.parentDepartmentId,
    });

    await validateNoCircularHierarchy({
      companyId,
      departmentId,
      parentDepartmentId: payload.parentDepartmentId,
    });
  }

  if (normalizedName !== undefined) {
    department.name = normalizedName;
  }

  if (normalizedCode !== undefined) {
    department.code = normalizedCode;
  }

  if (payload.description !== undefined) {
    department.description = payload.description;
  }

  if (Object.hasOwn(payload, "departmentHeadId")) {
    department.departmentHeadId = payload.departmentHeadId ?? null;
  }

  if (Object.hasOwn(payload, "parentDepartmentId")) {
    department.parentDepartmentId = payload.parentDepartmentId ?? null;
  }

  department.updatedBy = actorUserId;

  await department.save();

  return Department.findById(department._id)
    .populate(departmentPopulate)
    .lean();
};

/**
 * Update department status.
 */
export const updateDepartmentStatus = async ({
  companyId,
  departmentId,
  status,
  actorUserId = null,
}) => {
  await validateCompany(companyId);

  const department = await findDepartmentOrFail(companyId, departmentId);

  if (department.status === status) {
    return Department.findById(department._id)
      .populate(departmentPopulate)
      .lean();
  }

  if (status === "INACTIVE") {
    const activeChildDepartment = await Department.findOne({
      companyId,
      parentDepartmentId: departmentId,
      status: "ACTIVE",
      isDeleted: false,
    })
      .select("_id name code")
      .lean();

    if (activeChildDepartment) {
      throw new ApiError(
        409,
        "The department cannot be deactivated while it has active child departments.",
      );
    }
  }

  department.status = status;
  department.updatedBy = actorUserId;

  await department.save();

  return Department.findById(department._id)
    .populate(departmentPopulate)
    .lean();
};

/**
 * Soft delete department.
 */
export const deleteDepartment = async ({
  companyId,
  departmentId,
  actorUserId = null,
}) => {
  await validateCompany(companyId);

  const department = await findDepartmentOrFail(companyId, departmentId);

  const [childDepartment, assignedCompanyAccess] = await Promise.all([
    Department.findOne({
      companyId,
      parentDepartmentId: departmentId,
      isDeleted: false,
    })
      .select("_id name code")
      .lean(),

    CompanyAccess.findOne({
      companyId,
      departmentId,
      isDeleted: false,
      status: {
        $in: ["ACTIVE", "ONBOARDING"],
      },
    })
      .select("_id employeeCode userId")
      .lean(),
  ]);

  if (childDepartment) {
    throw new ApiError(
      409,
      "The department cannot be deleted while child departments are assigned to it.",
    );
  }

  if (assignedCompanyAccess) {
    throw new ApiError(
      409,
      "The department cannot be deleted while active employees are assigned to it.",
    );
  }

  department.status = "INACTIVE";
  department.isDeleted = true;
  department.deletedAt = new Date();
  department.deletedBy = actorUserId;
  department.updatedBy = actorUserId;

  await department.save();

  return true;
};
