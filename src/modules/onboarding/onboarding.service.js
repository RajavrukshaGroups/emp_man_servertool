import mongoose from "mongoose";

import { ApiError } from "../../utils/ApiError.js";

import User from "../users/user.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";
import Employee from "../employees/employee.model.js";

const { Types } = mongoose;

const onboardingUserSelect =
  "_id firstName middleName lastName displayName email mobile profilePhoto gender dateOfBirth status onboardingStatus onboardingCompletedAt createdAt updatedAt";

const companyAccessPopulate = [
  {
    path: "companyId",
    select: "name code slug logo status",
  },
  {
    path: "roleId",
    select: "name code description scopeType status",
  },
  {
    path: "departmentId",
    select: "name code status",
  },
  {
    path: "teamId",
    select: "name code status",
  },
  {
    path: "reportingManagerId",
    select: "userId employeeCode designation status",
    populate: {
      path: "userId",
      select: "displayName email mobile profilePhoto",
    },
  },
];

const determineNextStep = ({ companyAccess, employee }) => {
  if (employee) {
    return "COMPLETED";
  }

  if (companyAccess) {
    return "EMPLOYEE_PROFILE";
  }

  return "COMPANY_ACCESS";
};

const determineActualOnboardingStatus = ({ companyAccess, employee }) => {
  if (employee) {
    return "COMPLETED";
  }

  if (companyAccess) {
    return "COMPANY_ACCESS_CREATED";
  }

  return "USER_CREATED";
};

const buildSearchFilter = (search) => {
  if (!search) {
    return {};
  }

  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const searchRegex = new RegExp(escapedSearch, "i");

  return {
    $or: [
      {
        firstName: searchRegex,
      },
      {
        middleName: searchRegex,
      },
      {
        lastName: searchRegex,
      },
      {
        displayName: searchRegex,
      },
      {
        email: searchRegex,
      },
      {
        mobile: searchRegex,
      },
    ],
  };
};

/**
 * List pending onboarding records
 * for the authenticated company.
 */
export const listPendingOnboarding = async (
  { page = 1, limit = 10, search, onboardingStatus },
  context,
) => {
  const { companyId } = context;

  if (!companyId) {
    throw new ApiError(400, "Active company context is unavailable.");
  }

  if (!Types.ObjectId.isValid(companyId)) {
    throw new ApiError(400, "Invalid active company context.");
  }

  /**
   * We intentionally start from users whose
   * onboarding is not marked completed.
   *
   * Actual CompanyAccess / Employee records
   * are still checked below before determining
   * the true next step.
   */
  const userFilter = {
    isDeleted: false,

    onboardingCompanyId: companyId,

    onboardingStatus: onboardingStatus
      ? onboardingStatus
      : {
          $in: ["USER_CREATED", "COMPANY_ACCESS_CREATED"],
        },

    ...buildSearchFilter(search),
  };

  const candidateUsers = await User.find(userFilter)
    .select(onboardingUserSelect)
    .sort({
      createdAt: -1,
    })
    .lean();

  if (candidateUsers.length === 0) {
    return {
      records: [],
      pagination: {
        page,
        limit,
        totalRecords: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }

  const userIds = candidateUsers.map((user) => user._id);

  const [companyAccessRecords, employeeRecords] = await Promise.all([
    CompanyAccess.find({
      companyId,
      userId: {
        $in: userIds,
      },
      isDeleted: false,
    })
      .populate(companyAccessPopulate)
      .lean(),

    Employee.find({
      companyId,
      userId: {
        $in: userIds,
      },
      isDeleted: false,
    })
      .select("_id companyId companyAccessId userId status createdAt updatedAt")
      .lean(),
  ]);

  const companyAccessMap = new Map(
    companyAccessRecords.map((record) => [
      String(record.userId?._id ?? record.userId),
      record,
    ]),
  );

  const employeeMap = new Map(
    employeeRecords.map((record) => [String(record.userId), record]),
  );

  const records = candidateUsers
    .map((user) => {
      const userId = String(user._id);

      const companyAccess = companyAccessMap.get(userId) ?? null;

      const employee = employeeMap.get(userId) ?? null;

      const actualStatus = determineActualOnboardingStatus({
        companyAccess,
        employee,
      });

      const nextStep = determineNextStep({
        companyAccess,
        employee,
      });

      return {
        user: {
          ...user,

          /**
           * Return the actual status determined
           * from existing records.
           */
          onboardingStatus: actualStatus,
        },

        companyAccess,

        employee,

        nextStep,
      };
    })

    /**
     * This endpoint is only for pending
     * onboarding records.
     *
     * If an Employee already exists, the record
     * is considered complete and excluded even
     * if User.onboardingStatus somehow became
     * stale.
     */
    .filter((record) => record.nextStep !== "COMPLETED");

  /**
   * Apply status filtering again using the
   * actual database state.
   */
  const filteredRecords = onboardingStatus
    ? records.filter(
        (record) => record.user.onboardingStatus === onboardingStatus,
      )
    : records;

  const totalRecords = filteredRecords.length;

  const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / limit);

  const skip = (page - 1) * limit;

  const paginatedRecords = filteredRecords.slice(skip, skip + limit);

  return {
    records: paginatedRecords,

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
 * Get onboarding state for one user.
 */
export const getOnboardingByUserId = async (userId, context) => {
  const { companyId } = context;

  if (!companyId) {
    throw new ApiError(400, "Active company context is unavailable.");
  }

  if (!Types.ObjectId.isValid(companyId)) {
    throw new ApiError(400, "Invalid active company context.");
  }

  if (!Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID.");
  }

  const user = await User.findOne({
    _id: userId,
    isDeleted: false,
  })
    .select(onboardingUserSelect)
    .lean();

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const companyAccess = await CompanyAccess.findOne({
    companyId,
    userId,
    isDeleted: false,
  })
    .populate(companyAccessPopulate)
    .lean();

  const employee = await Employee.findOne({
    companyId,
    userId,
    isDeleted: false,
  })
    .select("_id companyId companyAccessId userId status createdAt updatedAt")
    .lean();

  const actualStatus = determineActualOnboardingStatus({
    companyAccess,
    employee,
  });

  const nextStep = determineNextStep({
    companyAccess,
    employee,
  });

  return {
    user: {
      ...user,
      onboardingStatus: actualStatus,
    },

    companyAccess: companyAccess ?? null,

    employee: employee ?? null,

    nextStep,
  };
};
