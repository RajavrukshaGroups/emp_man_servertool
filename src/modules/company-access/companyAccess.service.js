import mongoose from "mongoose";

import { ApiError } from "../../utils/ApiError.js";

import Company from "../companies/company.model.js";
import Role from "../roles/role.model.js";
import User from "../users/user.model.js";

import CompanyAccess from "./companyAccess.model.js";

/**
 * Common population configuration.
 */
const companyAccessPopulate = [
  {
    path: "userId",
    select:
      "firstName middleName lastName displayName email mobile profilePhoto status onboardingStatus onboardingCompletedAt",
  },
  {
    path: "companyId",
    select: "name slug code logo status",
  },
  {
    path: "roleId",
    select: "name code description scopeType status permissionIds",
    populate: {
      path: "permissionIds",
      select: "name code module action description status",
    },
  },
  {
    path: "reportingManagerId",
    select: "userId employeeCode designation departmentId teamId status",
    populate: {
      path: "userId",
      select:
        "firstName middleName lastName displayName email mobile profilePhoto",
    },
  },
];

/**
 * Normalize employee code.
 */
const normalizeEmployeeCode = (employeeCode) => {
  if (
    employeeCode === undefined ||
    employeeCode === null ||
    employeeCode.trim() === ""
  ) {
    return null;
  }

  return employeeCode.trim().toUpperCase();
};

/**
 * Check whether company exists.
 */
const ensureCompanyExists = async (companyId) => {
  const company = await Company.findOne({
    _id: companyId,
    isDeleted: false,
  })
    .select("_id name status")
    .lean();

  if (!company) {
    throw new ApiError(404, "Company not found.");
  }

  if (company.status === "INACTIVE") {
    throw new ApiError(
      400,
      "Company access cannot be managed for an inactive company.",
    );
  }

  return company;
};

/**
 * Check whether user exists.
 */
const ensureUserExists = async (userId) => {
  const user = await User.findOne({
    _id: userId,
    isDeleted: false,
  })
    .select("_id displayName email status")
    .lean();

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  if (user.status !== "ACTIVE") {
    throw new ApiError(
      400,
      "Only active users can be assigned company access.",
    );
  }

  return user;
};

/**
 * Ensure role belongs to the requested company.
 */
const ensureRoleBelongsToCompany = async (roleId, companyId) => {
  const role = await Role.findOne({
    _id: roleId,
    companyId,
    scopeType: "COMPANY",
    status: "ACTIVE",
    isDeleted: false,
  })
    .select("_id name code companyId status")
    .lean();

  if (!role) {
    throw new ApiError(
      400,
      "The selected role does not exist or does not belong to this company.",
    );
  }

  return role;
};

/**
 * Ensure user does not already have company access.
 */
const ensureUserAccessIsUnique = async (
  companyId,
  userId,
  excludeAccessId = null,
) => {
  const filter = {
    companyId,
    userId,
    isDeleted: false,
  };

  if (excludeAccessId) {
    filter._id = {
      $ne: excludeAccessId,
    };
  }

  const existingAccess = await CompanyAccess.findOne(filter)
    .select("_id userId companyId")
    .lean();

  if (existingAccess) {
    throw new ApiError(
      409,
      "This user already has access to the selected company.",
    );
  }
};

/**
 * Ensure employee code is unique inside the company.
 */
const ensureEmployeeCodeIsUnique = async (
  companyId,
  employeeCode,
  excludeAccessId = null,
) => {
  const normalizedEmployeeCode = normalizeEmployeeCode(employeeCode);

  if (!normalizedEmployeeCode) {
    return;
  }

  const filter = {
    companyId,
    employeeCode: normalizedEmployeeCode,
    isDeleted: false,
  };

  if (excludeAccessId) {
    filter._id = {
      $ne: excludeAccessId,
    };
  }

  const existingAccess = await CompanyAccess.findOne(filter)
    .select("_id employeeCode")
    .lean();

  if (existingAccess) {
    throw new ApiError(
      409,
      "This employee code is already assigned within the company.",
    );
  }
};

/**
 * Validate reporting manager.
 *
 * reportingManagerId references another CompanyAccess record.
 */
const ensureReportingManagerIsValid = async ({
  reportingManagerId,
  companyId,
  accessId = null,
}) => {
  if (!reportingManagerId) {
    return null;
  }

  if (accessId && reportingManagerId.toString() === accessId.toString()) {
    throw new ApiError(400, "A company access record cannot report to itself.");
  }

  const managerAccess = await CompanyAccess.findOne({
    _id: reportingManagerId,
    companyId,
    isDeleted: false,
    status: {
      $in: ["ACTIVE", "ONBOARDING"],
    },
  })
    .select("_id userId companyId employeeCode designation status")
    .lean();

  if (!managerAccess) {
    throw new ApiError(
      400,
      "Reporting manager does not exist or does not belong to this company.",
    );
  }

  return managerAccess;
};

/**
 * Remove another primary-company assignment for the same user.
 */
const clearExistingPrimaryCompany = async ({
  userId,
  excludeAccessId = null,
  actorId = null,
  session = null,
}) => {
  const filter = {
    userId,
    isPrimaryCompany: true,
    isDeleted: false,
  };

  if (excludeAccessId) {
    filter._id = {
      $ne: excludeAccessId,
    };
  }

  await CompanyAccess.updateMany(
    filter,
    {
      $set: {
        isPrimaryCompany: false,
        updatedBy: actorId,
      },
    },
    {
      session,
    },
  );
};

/**
 * Fetch one company access document.
 */
const findCompanyAccessDocument = async (companyId, accessId) => {
  const access = await CompanyAccess.findOne({
    _id: accessId,
    companyId,
    isDeleted: false,
  });

  if (!access) {
    throw new ApiError(404, "Company access not found.");
  }

  return access;
};

/**
 * Create company access.
 */
/**
 * Create company access.
 */
export const createCompanyAccess = async (
  companyId,
  accessData,
  actorId = null,
) => {
  await Promise.all([
    ensureCompanyExists(companyId),
    ensureUserExists(accessData.userId),
    ensureRoleBelongsToCompany(accessData.roleId, companyId),
    ensureUserAccessIsUnique(companyId, accessData.userId),
    ensureEmployeeCodeIsUnique(companyId, accessData.employeeCode),
    ensureReportingManagerIsValid({
      reportingManagerId: accessData.reportingManagerId,
      companyId,
    }),
  ]);

  const session = await mongoose.startSession();

  try {
    let createdAccessId;

    await session.withTransaction(async () => {
      if (accessData.isPrimaryCompany) {
        await clearExistingPrimaryCompany({
          userId: accessData.userId,
          actorId,
          session,
        });
      }

      const [createdAccess] = await CompanyAccess.create(
        [
          {
            userId: accessData.userId,
            companyId,
            roleId: accessData.roleId,

            employeeCode: normalizeEmployeeCode(accessData.employeeCode),

            designation: accessData.designation ?? "",

            employmentType: accessData.employmentType ?? "FULL_TIME",

            departmentId: accessData.departmentId ?? null,

            teamId: accessData.teamId ?? null,

            reportingManagerId: accessData.reportingManagerId ?? null,

            joiningDate: accessData.joiningDate ?? null,

            probationEndDate: accessData.probationEndDate ?? null,

            lastWorkingDate: accessData.lastWorkingDate ?? null,

            workLocationType: accessData.workLocationType ?? "HEAD_OFFICE",

            workLocationName: accessData.workLocationName ?? "",

            isPrimaryCompany: accessData.isPrimaryCompany ?? false,

            status: accessData.status ?? "ONBOARDING",

            notes: accessData.notes ?? "",

            createdBy: actorId,
            updatedBy: actorId,
          },
        ],
        {
          session,
        },
      );

      createdAccessId = createdAccess._id;

      const updatedUser = await User.findOneAndUpdate(
        {
          _id: accessData.userId,
          isDeleted: false,
        },
        {
          $set: {
            onboardingStatus: "COMPANY_ACCESS_CREATED",
            onboardingCompletedAt: null,
            updatedBy: actorId,
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        },
      );

      if (!updatedUser) {
        throw new ApiError(
          404,
          "User could not be updated after company access creation.",
        );
      }
    });

    return CompanyAccess.findById(createdAccessId)
      .populate(companyAccessPopulate)
      .lean();
  } finally {
    await session.endSession();
  }
};

/**
 * List company access records.
 */
export const listCompanyAccess = async (
  companyId,
  {
    page = 1,
    limit = 10,
    search,
    roleId,
    departmentId,
    teamId,
    reportingManagerId,
    employmentType,
    workLocationType,
    status,
    isPrimaryCompany,
    joiningDateFrom,
    joiningDateTo,
    sortBy = "createdAt",
    sortOrder = "desc",
  },
) => {
  await ensureCompanyExists(companyId);

  const filter = {
    companyId,
    isDeleted: false,
  };

  if (roleId) {
    filter.roleId = roleId;
  }

  if (departmentId) {
    filter.departmentId = departmentId;
  }

  if (teamId) {
    filter.teamId = teamId;
  }

  if (reportingManagerId) {
    filter.reportingManagerId = reportingManagerId;
  }

  if (employmentType) {
    filter.employmentType = employmentType;
  }

  if (workLocationType) {
    filter.workLocationType = workLocationType;
  }

  if (status) {
    filter.status = status;
  }

  if (typeof isPrimaryCompany === "boolean") {
    filter.isPrimaryCompany = isPrimaryCompany;
  }

  if (joiningDateFrom || joiningDateTo) {
    filter.joiningDate = {};

    if (joiningDateFrom) {
      filter.joiningDate.$gte = joiningDateFrom;
    }

    if (joiningDateTo) {
      const endDate = new Date(joiningDateTo);
      endDate.setHours(23, 59, 59, 999);

      filter.joiningDate.$lte = endDate;
    }
  }

  /**
   * Search both CompanyAccess fields and User fields.
   */
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const searchRegex = new RegExp(escapedSearch, "i");

    const matchedUsers = await User.find({
      isDeleted: false,
      $or: [
        { firstName: searchRegex },
        { middleName: searchRegex },
        { lastName: searchRegex },
        { displayName: searchRegex },
        { email: searchRegex },
        { mobile: searchRegex },
      ],
    })
      .select("_id")
      .lean();

    const matchedUserIds = matchedUsers.map((user) => user._id);

    filter.$or = [
      { employeeCode: searchRegex },
      { designation: searchRegex },
      { workLocationName: searchRegex },
      { userId: { $in: matchedUserIds } },
    ];
  }

  const skip = (page - 1) * limit;

  const sort = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,
  };

  const [records, totalRecords] = await Promise.all([
    CompanyAccess.find(filter)
      .populate(companyAccessPopulate)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),

    CompanyAccess.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalRecords / limit);

  return {
    records,
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
 * Get access by ID.
 */
export const getCompanyAccessById = async (companyId, accessId) => {
  const access = await CompanyAccess.findOne({
    _id: accessId,
    companyId,
    isDeleted: false,
  })
    .populate(companyAccessPopulate)
    .lean();

  if (!access) {
    throw new ApiError(404, "Company access not found.");
  }

  return access;
};

/**
 * Update company access.
 */
export const updateCompanyAccess = async (
  companyId,
  accessId,
  updateData,
  actorId = null,
) => {
  const access = await findCompanyAccessDocument(companyId, accessId);

  if (updateData.roleId !== undefined) {
    await ensureRoleBelongsToCompany(updateData.roleId, companyId);
  }

  if (updateData.employeeCode !== undefined) {
    await ensureEmployeeCodeIsUnique(
      companyId,
      updateData.employeeCode,
      accessId,
    );
  }

  if (updateData.reportingManagerId !== undefined) {
    await ensureReportingManagerIsValid({
      reportingManagerId: updateData.reportingManagerId,
      companyId,
      accessId,
    });
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      if (updateData.isPrimaryCompany === true) {
        await clearExistingPrimaryCompany({
          userId: access.userId,
          excludeAccessId: accessId,
          actorId,
          session,
        });
      }

      const allowedFields = [
        "roleId",
        "employeeCode",
        "designation",
        "employmentType",
        "departmentId",
        "teamId",
        "reportingManagerId",
        "joiningDate",
        "probationEndDate",
        "workLocationType",
        "workLocationName",
        "isPrimaryCompany",
        "notes",
      ];

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          access[field] = updateData[field];
        }
      }

      if (updateData.employeeCode !== undefined) {
        access.employeeCode = normalizeEmployeeCode(updateData.employeeCode);
      }

      access.updatedBy = actorId;

      await access.save({
        session,
      });
    });

    return CompanyAccess.findById(accessId)
      .populate(companyAccessPopulate)
      .lean();
  } finally {
    await session.endSession();
  }
};

/**
 * Update access status.
 */
export const updateCompanyAccessStatus = async (
  companyId,
  accessId,
  { status, lastWorkingDate = null, reason = "" },
  actorId = null,
) => {
  const access = await findCompanyAccessDocument(companyId, accessId);

  access.status = status;
  access.updatedBy = actorId;

  if (["RESIGNED", "TERMINATED"].includes(status)) {
    access.lastWorkingDate = lastWorkingDate;
    access.isPrimaryCompany = false;
  } else {
    access.lastWorkingDate = null;
  }

  if (reason) {
    const statusNote = `[${status}] ${reason}`;

    access.notes = access.notes ? `${access.notes}\n${statusNote}` : statusNote;
  }

  await access.save();

  return CompanyAccess.findById(accessId)
    .populate(companyAccessPopulate)
    .lean();
};

/**
 * Update role separately.
 */
export const updateCompanyAccessRole = async (
  companyId,
  accessId,
  roleId,
  actorId = null,
) => {
  await Promise.all([
    findCompanyAccessDocument(companyId, accessId),
    ensureRoleBelongsToCompany(roleId, companyId),
  ]);

  const updatedAccess = await CompanyAccess.findOneAndUpdate(
    {
      _id: accessId,
      companyId,
      isDeleted: false,
    },
    {
      $set: {
        roleId,
        updatedBy: actorId,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  )
    .populate(companyAccessPopulate)
    .lean();

  return updatedAccess;
};

/**
 * Update reporting manager.
 */
export const updateReportingManager = async (
  companyId,
  accessId,
  reportingManagerId,
  actorId = null,
) => {
  await findCompanyAccessDocument(companyId, accessId);

  await ensureReportingManagerIsValid({
    reportingManagerId,
    companyId,
    accessId,
  });

  const updatedAccess = await CompanyAccess.findOneAndUpdate(
    {
      _id: accessId,
      companyId,
      isDeleted: false,
    },
    {
      $set: {
        reportingManagerId: reportingManagerId ?? null,
        updatedBy: actorId,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  )
    .populate(companyAccessPopulate)
    .lean();

  return updatedAccess;
};

/**
 * Soft-delete company access.
 */
export const softDeleteCompanyAccess = async (
  companyId,
  accessId,
  actorId = null,
) => {
  const access = await findCompanyAccessDocument(companyId, accessId);

  access.isDeleted = true;
  access.status = "INACTIVE";
  access.isPrimaryCompany = false;
  access.deletedAt = new Date();
  access.deletedBy = actorId;
  access.updatedBy = actorId;

  await access.save();

  return true;
};

/**
 * List all company access records belonging to one user.
 */
export const getUserCompanyAccess = async (userId, { status } = {}) => {
  await ensureUserExists(userId);

  const filter = {
    userId,
    isDeleted: false,
  };

  if (status) {
    filter.status = status;
  }

  return CompanyAccess.find(filter)
    .populate([
      {
        path: "companyId",
        select: "name slug code logo status",
      },
      {
        path: "roleId",
        select: "name code description status permissionIds",
        populate: {
          path: "permissionIds",
          select: "name code module action description status",
        },
      },
    ])
    .sort({
      isPrimaryCompany: -1,
      createdAt: -1,
    })
    .lean();
};
