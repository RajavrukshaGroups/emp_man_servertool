import "dotenv/config";

import mongoose from "mongoose";

import User from "../modules/users/user.model.js";
import Role from "../modules/roles/role.model.js";
import Employee from "../modules/employees/employee.model.js";

import CompanyAccess from "../modules/company-access/companyAccess.model.js";
import PlatformAccess from "../modules/platform-access/platformAccess.model.js";

import RefreshToken from "../modules/auth/refreshToken.model.js";

/**
 * ============================================================
 * CONFIG
 * ============================================================
 */

const EXECUTE = process.argv.includes("--execute");

const companyArgument = process.argv.find((argument) =>
  argument.startsWith("--company="),
);

const requestedCompanyId = companyArgument
  ? companyArgument.split("=")[1]
  : null;

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function logSection(title) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(title);
  console.log("=".repeat(70));
}

function getMongoUri() {
  return (
    process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL
  );
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

async function resetEmployeesOnly() {
  const mongoUri = getMongoUri();

  if (!mongoUri) {
    throw new Error(
      "MongoDB connection string is missing. Expected MONGODB_URI, MONGO_URI or DATABASE_URL.",
    );
  }

  /**
   * ----------------------------------------------------------
   * PRODUCTION GUARD
   * ----------------------------------------------------------
   */

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "RESET BLOCKED: reset-employees-only.js cannot run when NODE_ENV=production.",
    );
  }

  logSection("CONNECTING TO DATABASE");

  await mongoose.connect(mongoUri);

  console.log("MongoDB connected.");

  /**
   * ==========================================================
   * COMPANY FILTER
   * ==========================================================
   */

  const companyFilter = {};

  if (requestedCompanyId) {
    if (!mongoose.isValidObjectId(requestedCompanyId)) {
      throw new Error(`Invalid --company ObjectId: ${requestedCompanyId}`);
    }

    companyFilter.companyId = new mongoose.Types.ObjectId(requestedCompanyId);
  }

  /**
   * ==========================================================
   * FIND COMPANY ADMIN ROLE IDS
   * ==========================================================
   */

  const companyAdminRoles = await Role.find({
    code: "COMPANY_ADMIN",
    isDeleted: false,
  })
    .select("_id companyId name code")
    .lean();

  const companyAdminRoleIds = companyAdminRoles.map((role) => role._id);

  if (companyAdminRoleIds.length === 0) {
    throw new Error(
      "No COMPANY_ADMIN roles were found. Reset cancelled for safety.",
    );
  }

  logSection("PROTECTED COMPANY ADMIN ROLES");

  for (const role of companyAdminRoles) {
    console.log(
      `- ${role.name} (${role.code}) | Company: ${role.companyId} | Role: ${role._id}`,
    );
  }

  /**
   * ==========================================================
   * FIND COMPANY ACCESS RECORDS
   * ==========================================================
   */

  const accessQuery = {
    isDeleted: false,
    ...companyFilter,
  };

  const companyAccessRecords = await CompanyAccess.find(accessQuery)
    .select("_id userId companyId roleId employeeCode designation")
    .lean();

  /**
   * Protected COMPANY_ADMIN access records.
   */

  const protectedCompanyAccess = companyAccessRecords.filter((access) =>
    companyAdminRoleIds.some(
      (roleId) => roleId.toString() === access.roleId?.toString(),
    ),
  );

  const deletableCompanyAccess = companyAccessRecords.filter(
    (access) =>
      !companyAdminRoleIds.some(
        (roleId) => roleId.toString() === access.roleId?.toString(),
      ),
  );

  const protectedCompanyAccessIds = protectedCompanyAccess.map(
    (access) => access._id,
  );

  const deletableCompanyAccessIds = deletableCompanyAccess.map(
    (access) => access._id,
  );

  const protectedCompanyAdminUserIds = new Set(
    protectedCompanyAccess
      .map((access) => access.userId?.toString())
      .filter(Boolean),
  );

  /**
   * ==========================================================
   * PLATFORM USERS ARE ALWAYS PROTECTED
   * ==========================================================
   */

  const platformAccessRecords = await PlatformAccess.find({})
    .select("userId")
    .lean();

  const protectedPlatformUserIds = new Set(
    platformAccessRecords
      .map((record) => record.userId?.toString())
      .filter(Boolean),
  );

  /**
   * ==========================================================
   * USERS CONNECTED TO NON-ADMIN ACCESS
   * ==========================================================
   */

  const candidateUserIds = [
    ...new Set(
      deletableCompanyAccess
        .map((access) => access.userId?.toString())
        .filter(Boolean),
    ),
  ];

  const deletableUserIds = [];

  for (const userId of candidateUserIds) {
    /**
     * Never delete Company Admin.
     */
    if (protectedCompanyAdminUserIds.has(userId)) {
      continue;
    }

    /**
     * Never delete Platform Admin.
     */
    if (protectedPlatformUserIds.has(userId)) {
      continue;
    }

    /**
     * If resetting one company only,
     * preserve users that still have access
     * to some other company.
     */
    if (requestedCompanyId) {
      const otherCompanyAccess = await CompanyAccess.exists({
        userId,
        companyId: {
          $ne: new mongoose.Types.ObjectId(requestedCompanyId),
        },
        isDeleted: false,
      });

      if (otherCompanyAccess) {
        continue;
      }
    }

    deletableUserIds.push(new mongoose.Types.ObjectId(userId));
  }

  /**
   * ==========================================================
   * FIND EMPLOYEE RECORDS
   * ==========================================================
   *
   * Employees belonging to protected admin access are preserved.
   *
   * Normally your company administrator may not even have an
   * Employee record, but this keeps the script safe either way.
   * ==========================================================
   */

  const employeeFilter = {};

  if (requestedCompanyId) {
    employeeFilter.companyId = new mongoose.Types.ObjectId(requestedCompanyId);
  }

  if (protectedCompanyAccessIds.length > 0) {
    employeeFilter.companyAccessId = {
      $nin: protectedCompanyAccessIds,
    };
  }

  /**
   * ==========================================================
   * REFRESH TOKENS
   * ==========================================================
   */

  const refreshTokenFilter = {
    accessType: "COMPANY",
  };

  if (deletableCompanyAccessIds.length > 0) {
    refreshTokenFilter.companyAccessId = {
      $in: deletableCompanyAccessIds,
    };
  } else {
    /**
     * Prevent accidental deletion of every company token
     * when there is nothing to delete.
     */
    refreshTokenFilter._id = {
      $in: [],
    };
  }

  /**
   * ==========================================================
   * PREVIEW
   * ==========================================================
   */

  logSection("RESET PREVIEW");

  const preview = {
    companyAccessToDelete: deletableCompanyAccessIds.length,

    companyAccessProtected: protectedCompanyAccessIds.length,

    employeesToDelete: await Employee.countDocuments(employeeFilter),

    usersToDelete: deletableUserIds.length,

    companyRefreshTokensToDelete:
      await RefreshToken.countDocuments(refreshTokenFilter),

    platformUsersProtected: protectedPlatformUserIds.size,

    companyAdminUsersProtected: protectedCompanyAdminUserIds.size,
  };

  console.table(preview);

  logSection("PROTECTED COMPANY ADMINISTRATORS");

  for (const access of protectedCompanyAccess) {
    console.log(
      `- User: ${access.userId} | Company: ${access.companyId} | Employee Code: ${
        access.employeeCode || "-"
      } | Designation: ${access.designation || "-"}`,
    );
  }

  /**
   * ==========================================================
   * DRY RUN
   * ==========================================================
   */

  if (!EXECUTE) {
    logSection("DRY RUN COMPLETE");

    console.log("No records were deleted.");

    console.log("\nThe script will preserve:");

    console.log("- Company Administrators");

    console.log("- Platform Administrators");

    console.log("- Companies");
    console.log("- Departments");
    console.log("- Teams");
    console.log("- Roles");
    console.log("- Permissions");
    console.log("- Clients");
    console.log("- Work Categories");

    console.log("\nTo execute for ALL companies:");

    console.log("node src/scripts/reset-employees-only.js --execute");

    console.log("\nTo execute for ONE company:");

    console.log(
      "node src/scripts/reset-employees-only.js --company=<COMPANY_ID> --execute",
    );

    return;
  }

  /**
   * ==========================================================
   * EXECUTE
   * ==========================================================
   */

  logSection("EXECUTING EMPLOYEE RESET");

  /**
   * ----------------------------------------------------------
   * 1. EMPLOYEES
   * ----------------------------------------------------------
   */

  const employeeResult = await Employee.deleteMany(employeeFilter);

  console.log(`Employees deleted: ${employeeResult.deletedCount}`);

  /**
   * ----------------------------------------------------------
   * 2. REFRESH TOKENS
   * ----------------------------------------------------------
   */

  const refreshTokenResult = await RefreshToken.deleteMany(refreshTokenFilter);

  console.log(
    `Company refresh tokens deleted: ${refreshTokenResult.deletedCount}`,
  );

  /**
   * ----------------------------------------------------------
   * 3. COMPANY ACCESS
   * ----------------------------------------------------------
   */

  let companyAccessResult = {
    deletedCount: 0,
  };

  if (deletableCompanyAccessIds.length > 0) {
    companyAccessResult = await CompanyAccess.deleteMany({
      _id: {
        $in: deletableCompanyAccessIds,
      },
    });
  }

  console.log(
    `Company access records deleted: ${companyAccessResult.deletedCount}`,
  );

  /**
   * ----------------------------------------------------------
   * 4. USERS
   * ----------------------------------------------------------
   */

  let userResult = {
    deletedCount: 0,
  };

  if (deletableUserIds.length > 0) {
    userResult = await User.deleteMany({
      _id: {
        $in: deletableUserIds,
      },
    });
  }

  console.log(`Employee users deleted: ${userResult.deletedCount}`);

  /**
   * ==========================================================
   * VERIFY
   * ==========================================================
   */

  logSection("POST RESET VERIFICATION");

  const remainingEmployeeFilter = {};

  if (requestedCompanyId) {
    remainingEmployeeFilter.companyId = new mongoose.Types.ObjectId(
      requestedCompanyId,
    );
  }

  const remainingCompanyAccessFilter = requestedCompanyId
    ? {
        companyId: new mongoose.Types.ObjectId(requestedCompanyId),
        isDeleted: false,
      }
    : {
        isDeleted: false,
      };

  const remainingCompanyAccess = await CompanyAccess.find(
    remainingCompanyAccessFilter,
  )
    .populate({
      path: "roleId",
      select: "name code scopeType",
    })
    .select("userId companyId employeeCode designation roleId")
    .lean();

  console.log(
    `Remaining Employee records: ${await Employee.countDocuments(
      remainingEmployeeFilter,
    )}`,
  );

  console.log(
    `Remaining CompanyAccess records: ${remainingCompanyAccess.length}`,
  );

  console.log("\nRemaining company access:");

  for (const access of remainingCompanyAccess) {
    console.log(
      `- ${access.roleId?.name || "Unknown role"} | ${
        access.roleId?.code || "-"
      } | Company: ${access.companyId} | User: ${access.userId}`,
    );
  }

  const platformAccessCount = await PlatformAccess.countDocuments({});

  console.log(`\nPlatformAccess preserved: ${platformAccessCount}`);

  logSection("RESET COMPLETED");

  console.log("Employee onboarding data reset successfully.");

  console.log("Company Administrators were preserved.");
}

/**
 * ============================================================
 * EXECUTION
 * ============================================================
 */

resetEmployeesOnly()
  .catch((error) => {
    console.error("\nRESET FAILED:");

    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();

    console.log("\nMongoDB disconnected.");
  });
