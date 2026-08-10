import mongoose from "mongoose";

import { ApiError } from "../../utils/ApiError.js";

import Company from "../companies/company.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";
import Role from "../roles/role.model.js";
import User from "../users/user.model.js";

/**
 * Normalize optional mobile number.
 */
const normalizeMobile = (mobile) => {
  if (mobile === undefined || mobile === null) {
    return null;
  }

  const normalizedMobile = mobile.trim();

  return normalizedMobile || null;
};

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
 * Ensure the target company exists and is active.
 */
const getActiveCompany = async (companyId) => {
  const company = await Company.findOne({
    _id: companyId,
    isDeleted: false,
  })
    .select("_id name code slug status")
    .lean();

  if (!company) {
    throw new ApiError(404, "Company not found.");
  }

  if (company.status !== "ACTIVE") {
    throw new ApiError(
      400,
      "Company administrator cannot be created for an inactive company.",
    );
  }

  return company;
};

/**
 * Find the protected COMPANY_ADMIN role belonging to the company.
 */
const getCompanyAdministratorRole = async (companyId) => {
  const role = await Role.findOne({
    companyId,
    code: "COMPANY_ADMIN",
    scopeType: "COMPANY",
    status: "ACTIVE",
    isDeleted: false,
  })
    .select(
      "_id companyId name code scopeType status permissionIds isSystemRole",
    )
    .lean();

  if (!role) {
    throw new ApiError(
      404,
      "Company Administrator role is not configured for this company.",
    );
  }

  return role;
};

export const getCompanyAdministrator = async (companyId) => {
  await getActiveCompany(companyId);

  const companyAdministratorRole = await getCompanyAdministratorRole(companyId);

  const access = await CompanyAccess.findOne({
    companyId,
    roleId: companyAdministratorRole._id,
    isDeleted: false,
    status: {
      $in: ["ONBOARDING", "ACTIVE", "INACTIVE"],
    },
  })
    .populate({
      path: "userId",
      select:
        "firstName middleName lastName displayName email mobile profilePhoto gender dateOfBirth status emailVerified mobileVerified onboardingStatus onboardingCompletedAt createdAt updatedAt",
    })
    .populate({
      path: "roleId",
      select: "name code description scopeType status",
    })
    .lean();

  if (!access) {
    return {
      administrator: null,
    };
  }

  return {
    administrator: {
      user: access.userId,

      companyAccess: {
        _id: access._id,
        employeeCode: access.employeeCode,
        designation: access.designation,
        employmentType: access.employmentType,
        joiningDate: access.joiningDate,
        workLocationType: access.workLocationType,
        workLocationName: access.workLocationName,
        isPrimaryCompany: access.isPrimaryCompany,
        status: access.status,
        notes: access.notes,
        createdAt: access.createdAt,
        updatedAt: access.updatedAt,
      },

      role: access.roleId,
    },
  };
};

/**
 * Ensure email is globally unique.
 *
 * User email belongs to the global User account,
 * not to one individual company.
 */
const ensureEmailIsUnique = async (email) => {
  const existingUser = await User.findOne({
    email: email.toLowerCase(),
    isDeleted: false,
  })
    .select("_id email")
    .lean();

  if (existingUser) {
    throw new ApiError(409, "A user with this email address already exists.");
  }
};

/**
 * Ensure mobile number is globally unique when provided.
 */
const ensureMobileIsUnique = async (mobile) => {
  const normalizedMobile = normalizeMobile(mobile);

  if (!normalizedMobile) {
    return;
  }

  const existingUser = await User.findOne({
    mobile: normalizedMobile,
    isDeleted: false,
  })
    .select("_id mobile")
    .lean();

  if (existingUser) {
    throw new ApiError(409, "A user with this mobile number already exists.");
  }
};

/**
 * Employee code is unique only inside the selected company.
 */
const ensureEmployeeCodeIsUnique = async (companyId, employeeCode) => {
  const normalizedEmployeeCode = normalizeEmployeeCode(employeeCode);

  if (!normalizedEmployeeCode) {
    return;
  }

  const existingAccess = await CompanyAccess.findOne({
    companyId,
    employeeCode: normalizedEmployeeCode,
    isDeleted: false,
  })
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
 * Ensure this company does not already have a Company Administrator.
 *
 * For the initial platform onboarding flow we allow one primary
 * COMPANY_ADMIN. Additional company administrators can later be
 * handled through normal company administration flows if required.
 */
const ensurePrimaryAdministratorDoesNotExist = async (companyId, roleId) => {
  const existingAdministrator = await CompanyAccess.findOne({
    companyId,
    roleId,
    isDeleted: false,
    status: {
      $in: ["ONBOARDING", "ACTIVE", "INACTIVE"],
    },
  })
    .populate({
      path: "userId",
      select: "displayName email mobile",
    })
    .select("_id userId employeeCode designation status")
    .lean();

  if (existingAdministrator) {
    throw new ApiError(
      409,
      "A Company Administrator is already assigned to this company.",
      {
        companyAccessId: existingAdministrator._id,

        userId:
          existingAdministrator.userId?._id ?? existingAdministrator.userId,

        displayName: existingAdministrator.userId?.displayName ?? null,

        email: existingAdministrator.userId?.email ?? null,

        employeeCode: existingAdministrator.employeeCode ?? null,
      },
    );
  }
};

/**
 * Create the initial administrator for a company.
 *
 * This method owns one transaction covering both:
 *
 * 1. User creation
 * 2. CompanyAccess creation
 *
 * This prevents orphan users if CompanyAccess creation fails.
 */
export const createCompanyAdministrator = async (
  companyId,
  administratorData,
  actorId = null,
) => {
  const normalizedEmail = administratorData.email.trim().toLowerCase();

  const normalizedMobile = normalizeMobile(administratorData.mobile);

  const normalizedEmployeeCode = normalizeEmployeeCode(
    administratorData.employeeCode,
  );

  /**
   * Perform safe read-only validation before opening
   * the transaction.
   */
  const [company, companyAdministratorRole] = await Promise.all([
    getActiveCompany(companyId),
    getCompanyAdministratorRole(companyId),
  ]);

  await Promise.all([
    ensureEmailIsUnique(normalizedEmail),

    ensureMobileIsUnique(normalizedMobile),

    ensureEmployeeCodeIsUnique(companyId, normalizedEmployeeCode),

    ensurePrimaryAdministratorDoesNotExist(
      companyId,
      companyAdministratorRole._id,
    ),
  ]);

  const session = await mongoose.startSession();

  try {
    let createdUserId;
    let createdAccessId;

    await session.withTransaction(async () => {
      /**
       * Re-check uniqueness inside the transaction.
       *
       * Database unique indexes remain the final source
       * of truth for concurrency safety.
       */
      const existingUserByEmail = await User.findOne({
        email: normalizedEmail,
        isDeleted: false,
      })
        .session(session)
        .select("_id")
        .lean();

      if (existingUserByEmail) {
        throw new ApiError(
          409,
          "A user with this email address already exists.",
        );
      }

      if (normalizedMobile) {
        const existingUserByMobile = await User.findOne({
          mobile: normalizedMobile,
          isDeleted: false,
        })
          .session(session)
          .select("_id")
          .lean();

        if (existingUserByMobile) {
          throw new ApiError(
            409,
            "A user with this mobile number already exists.",
          );
        }
      }

      const existingEmployeeCode = await CompanyAccess.findOne({
        companyId,
        employeeCode: normalizedEmployeeCode,
        isDeleted: false,
      })
        .session(session)
        .select("_id")
        .lean();

      if (existingEmployeeCode) {
        throw new ApiError(
          409,
          "This employee code is already assigned within the company.",
        );
      }

      const existingCompanyAdministrator = await CompanyAccess.findOne({
        companyId,
        roleId: companyAdministratorRole._id,
        isDeleted: false,
        status: {
          $in: ["ONBOARDING", "ACTIVE", "INACTIVE"],
        },
      })
        .session(session)
        .select("_id")
        .lean();

      if (existingCompanyAdministrator) {
        throw new ApiError(
          409,
          "A Company Administrator is already assigned to this company.",
        );
      }

      /**
       * User model should hash password through its
       * existing pre-save middleware.
       */
      const [createdUser] = await User.create(
        [
          {
            firstName: administratorData.firstName,

            middleName: administratorData.middleName ?? "",

            lastName: administratorData.lastName,

            displayName: administratorData.displayName ?? "",

            email: normalizedEmail,

            mobile: normalizedMobile,

            password: administratorData.password,

            gender: administratorData.gender ?? "PREFER_NOT_TO_SAY",

            dateOfBirth: administratorData.dateOfBirth ?? null,

            status: "ACTIVE",

            emailVerified: administratorData.emailVerified ?? false,

            mobileVerified: administratorData.mobileVerified ?? false,

            onboardingStatus: "COMPANY_ACCESS_CREATED",

            onboardingCompanyId: companyId,

            onboardingCompletedAt: new Date(),

            createdBy: actorId,

            updatedBy: actorId,
          },
        ],
        {
          session,
        },
      );

      createdUserId = createdUser._id;

      /**
       * This initial administrator is always:
       *
       * - assigned to COMPANY_ADMIN
       * - ACTIVE
       * - primary for the company
       */
      const [createdAccess] = await CompanyAccess.create(
        [
          {
            userId: createdUser._id,

            companyId,

            roleId: companyAdministratorRole._id,

            employeeCode: normalizedEmployeeCode,

            designation:
              administratorData.designation || "Company Administrator",

            employmentType: administratorData.employmentType ?? "FULL_TIME",

            departmentId: null,

            teamId: null,

            reportingManagerId: null,

            joiningDate: administratorData.joiningDate ?? null,

            probationEndDate: null,

            lastWorkingDate: null,

            workLocationType:
              administratorData.workLocationType ?? "HEAD_OFFICE",

            workLocationName: administratorData.workLocationName ?? "",

            isPrimaryCompany: true,

            status: "ACTIVE",

            notes: administratorData.notes ?? "",

            createdBy: actorId,

            updatedBy: actorId,
          },
        ],
        {
          session,
        },
      );

      createdAccessId = createdAccess._id;
    });

    /**
     * Return the final populated administrator information
     * after successful commit.
     */
    const access = await CompanyAccess.findById(createdAccessId)
      .populate({
        path: "userId",
        select:
          "firstName middleName lastName displayName email mobile profilePhoto gender dateOfBirth status emailVerified mobileVerified onboardingStatus onboardingCompanyId onboardingCompletedAt createdAt updatedAt",
      })
      .populate({
        path: "companyId",
        select: "name legalName code slug logo email phone status",
      })
      .populate({
        path: "roleId",
        select: "name code description scopeType status",
      })
      .lean();

    if (!access) {
      throw new ApiError(
        500,
        "Company administrator was created but could not be retrieved.",
      );
    }

    return {
      company,

      administrator: access.userId,

      companyAccess: {
        _id: access._id,

        employeeCode: access.employeeCode,

        designation: access.designation,

        employmentType: access.employmentType,

        departmentId: access.departmentId,

        teamId: access.teamId,

        reportingManagerId: access.reportingManagerId,

        joiningDate: access.joiningDate,

        workLocationType: access.workLocationType,

        workLocationName: access.workLocationName,

        isPrimaryCompany: access.isPrimaryCompany,

        status: access.status,

        notes: access.notes,

        createdAt: access.createdAt,

        updatedAt: access.updatedAt,
      },

      role: access.roleId,
    };
  } catch (error) {
    /**
     * Convert MongoDB duplicate-key errors into
     * user-friendly API errors.
     */
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern ?? {})[0];

      if (duplicateField === "email") {
        throw new ApiError(
          409,
          "A user with this email address already exists.",
        );
      }

      if (duplicateField === "mobile") {
        throw new ApiError(
          409,
          "A user with this mobile number already exists.",
        );
      }

      if (duplicateField === "employeeCode") {
        throw new ApiError(
          409,
          "This employee code is already assigned within the company.",
        );
      }

      throw new ApiError(
        409,
        "A conflicting administrator record already exists.",
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }
};
