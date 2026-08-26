import "dotenv/config";

import mongoose from "mongoose";

/**
 * ============================================================
 * MODELS
 * ============================================================
 */

import RefreshToken from "../modules/auth/refreshToken.model.js";

import Company from "../modules/companies/company.model.js";
import User from "../modules/users/user.model.js";
import Role from "../modules/roles/role.model.js";

import CompanyAccess from "../modules/company-access/companyAccess.model.js";
import PlatformAccess from "../modules/platform-access/platformAccess.model.js";

import Department from "../modules/departments/department.model.js";
import Team from "../modules/teams/team.model.js";
import Employee from "../modules/employees/employee.model.js";

import Client from "../modules/clients/client.model.js";
import WorkCategory from "../modules/work-categories/workCategory.model.js";

import Task from "../modules/tasks/task.model.js";
import TaskActivity from "../modules/tasks/taskActivity.model.js";

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

async function countCompanyDocuments(Model, companyIds) {
  return Model.countDocuments({
    companyId: {
      $in: companyIds,
    },
  });
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

async function resetCompanyData() {
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
      "RESET BLOCKED: reset-company-data.js cannot run when NODE_ENV=production.",
    );
  }

  logSection("CONNECTING TO DATABASE");

  await mongoose.connect(mongoUri);

  console.log("MongoDB connected.");

  /**
   * ==========================================================
   * DETERMINE COMPANIES TO RESET
   * ==========================================================
   */

  let companies = [];

  if (requestedCompanyId) {
    if (!mongoose.isValidObjectId(requestedCompanyId)) {
      throw new Error(`Invalid --company ObjectId: ${requestedCompanyId}`);
    }

    const company = await Company.findOne({
      _id: requestedCompanyId,
      isDeleted: {
        $ne: true,
      },
    })
      .select("_id name code")
      .lean();

    if (!company) {
      throw new Error(`Company not found: ${requestedCompanyId}`);
    }

    companies = [company];
  } else {
    companies = await Company.find({}).select("_id name code").lean();
  }

  if (companies.length === 0) {
    console.log("No companies found. Nothing to reset.");
    return;
  }

  const companyIds = companies.map((company) => company._id);

  logSection("COMPANIES SELECTED FOR RESET");

  for (const company of companies) {
    console.log(`- ${company.name} (${company.code}) [${company._id}]`);
  }

  /**
   * ==========================================================
   * IDENTIFY PLATFORM USERS
   * ==========================================================
   *
   * These users are protected and will never be deleted.
   */

  const platformAccessRecords = await PlatformAccess.find({})
    .select("_id userId")
    .lean();

  const platformUserIds = new Set(
    platformAccessRecords
      .map((record) => record.userId?.toString())
      .filter(Boolean),
  );

  console.log(`\nProtected platform users: ${platformUserIds.size}`);

  /**
   * ==========================================================
   * IDENTIFY COMPANY USERS
   * ==========================================================
   */

  const companyAccessRecords = await CompanyAccess.find({
    companyId: {
      $in: companyIds,
    },
  })
    .select("_id userId companyId")
    .lean();

  const companyAccessIds = companyAccessRecords.map((record) => record._id);

  const companyUserIds = [
    ...new Set(
      companyAccessRecords
        .map((record) => record.userId?.toString())
        .filter(Boolean),
    ),
  ];

  /**
   * ==========================================================
   * DETERMINE USERS SAFE TO DELETE
   * ==========================================================
   *
   * Rules:
   *
   * 1. Never delete platform users.
   * 2. Do not delete users who still belong to another company.
   */

  const deletableUserIds = [];

  for (const userId of companyUserIds) {
    if (platformUserIds.has(userId)) {
      continue;
    }

    const remainingCompanyAccess = await CompanyAccess.exists({
      userId,

      companyId: {
        $nin: companyIds,
      },
    });

    if (remainingCompanyAccess) {
      continue;
    }

    deletableUserIds.push(new mongoose.Types.ObjectId(userId));
  }

  /**
   * ==========================================================
   * REFRESH TOKEN FILTER
   * ==========================================================
   *
   * Remove only COMPANY sessions belonging to the tenant
   * records being deleted.
   *
   * GLOBAL Platform Admin sessions are preserved.
   */

  const companyRefreshTokenFilter = {
    $or: [
      {
        companyAccessId: {
          $in: companyAccessIds,
        },
      },
      {
        userId: {
          $in: deletableUserIds,
        },

        accessType: "COMPANY",
      },
    ],
  };

  /**
   * ==========================================================
   * PREVIEW
   * ==========================================================
   */

  logSection("RESET PREVIEW");

  const preview = {
    companies: companies.length,

    taskActivities: await countCompanyDocuments(TaskActivity, companyIds),

    tasks: await countCompanyDocuments(Task, companyIds),

    workCategories: await countCompanyDocuments(WorkCategory, companyIds),

    clients: await countCompanyDocuments(Client, companyIds),

    employees: await countCompanyDocuments(Employee, companyIds),

    teams: await countCompanyDocuments(Team, companyIds),

    departments: await countCompanyDocuments(Department, companyIds),

    refreshTokens: await RefreshToken.countDocuments(companyRefreshTokenFilter),

    companyAccess: await countCompanyDocuments(CompanyAccess, companyIds),

    companyRoles: await Role.countDocuments({
      companyId: {
        $in: companyIds,
      },
    }),

    tenantUsers: deletableUserIds.length,
  };

  console.table(preview);

  console.log(
    `Protected PlatformAccess records: ${platformAccessRecords.length}`,
  );

  console.log("Permissions are NOT touched by this reset.");

  console.log("Global/platform roles are NOT touched by this reset.");

  console.log("GLOBAL Platform Admin refresh tokens are NOT touched.");

  /**
   * ==========================================================
   * DRY RUN
   * ==========================================================
   */

  if (!EXECUTE) {
    logSection("DRY RUN COMPLETE");

    console.log("No database records were deleted.");

    console.log("\nTo actually execute the reset, run:");

    if (requestedCompanyId) {
      console.log(
        `node src/scripts/reset-company-data.js --company=${requestedCompanyId} --execute`,
      );
    } else {
      console.log("node src/scripts/reset-company-data.js --execute");
    }

    return;
  }

  /**
   * ==========================================================
   * EXECUTE RESET
   * ==========================================================
   */

  logSection("EXECUTING RESET");

  /**
   * ----------------------------------------------------------
   * 1. TASK ACTIVITIES
   * ----------------------------------------------------------
   */

  const taskActivityResult = await TaskActivity.deleteMany({
    companyId: {
      $in: companyIds,
    },
  });

  console.log(`Task activities deleted: ${taskActivityResult.deletedCount}`);

  /**
   * ----------------------------------------------------------
   * 2. TASKS
   * ----------------------------------------------------------
   */

  const taskResult = await Task.deleteMany({
    companyId: {
      $in: companyIds,
    },
  });

  console.log(`Tasks deleted: ${taskResult.deletedCount}`);

  /**
   * ----------------------------------------------------------
   * 3. WORK CATEGORIES
   * ----------------------------------------------------------
   */

  const workCategoryResult = await WorkCategory.deleteMany({
    companyId: {
      $in: companyIds,
    },
  });

  console.log(`Work categories deleted: ${workCategoryResult.deletedCount}`);

  /**
   * ----------------------------------------------------------
   * 4. CLIENTS
   * ----------------------------------------------------------
   */

  const clientResult = await Client.deleteMany({
    companyId: {
      $in: companyIds,
    },
  });

  console.log(`Clients deleted: ${clientResult.deletedCount}`);

  /**
   * ----------------------------------------------------------
   * 5. EMPLOYEES
   * ----------------------------------------------------------
   */

  const employeeResult = await Employee.deleteMany({
    companyId: {
      $in: companyIds,
    },
  });

  console.log(`Employees deleted: ${employeeResult.deletedCount}`);

  /**
   * ----------------------------------------------------------
   * 6. TEAMS
   * ----------------------------------------------------------
   */

  const teamResult = await Team.deleteMany({
    companyId: {
      $in: companyIds,
    },
  });

  console.log(`Teams deleted: ${teamResult.deletedCount}`);

  /**
   * ----------------------------------------------------------
   * 7. DEPARTMENTS
   * ----------------------------------------------------------
   */

  const departmentResult = await Department.deleteMany({
    companyId: {
      $in: companyIds,
    },
  });

  console.log(`Departments deleted: ${departmentResult.deletedCount}`);

  /**
   * ----------------------------------------------------------
   * 8. COMPANY REFRESH TOKENS
   * ----------------------------------------------------------
   *
   * Must happen before CompanyAccess deletion.
   */

  const refreshTokenResult = await RefreshToken.deleteMany(
    companyRefreshTokenFilter,
  );

  console.log(
    `Company refresh tokens deleted: ${refreshTokenResult.deletedCount}`,
  );

  /**
   * ----------------------------------------------------------
   * 9. COMPANY ACCESS
   * ----------------------------------------------------------
   */

  const companyAccessResult = await CompanyAccess.deleteMany({
    companyId: {
      $in: companyIds,
    },
  });

  console.log(
    `Company access records deleted: ${companyAccessResult.deletedCount}`,
  );

  /**
   * ----------------------------------------------------------
   * 10. COMPANY-SCOPED ROLES
   * ----------------------------------------------------------
   */

  const roleResult = await Role.deleteMany({
    companyId: {
      $in: companyIds,
    },
  });

  console.log(`Company roles deleted: ${roleResult.deletedCount}`);

  /**
   * ----------------------------------------------------------
   * 11. TENANT USERS
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

  console.log(`Tenant users deleted: ${userResult.deletedCount}`);

  /**
   * ----------------------------------------------------------
   * 12. COMPANIES
   * ----------------------------------------------------------
   */

  const companyResult = await Company.deleteMany({
    _id: {
      $in: companyIds,
    },
  });

  console.log(`Companies deleted: ${companyResult.deletedCount}`);

  /**
   * ==========================================================
   * POST RESET VERIFICATION
   * ==========================================================
   */

  logSection("POST RESET VERIFICATION");

  const remaining = {
    companies: await Company.countDocuments({
      _id: {
        $in: companyIds,
      },
    }),

    companyAccess: await CompanyAccess.countDocuments({
      companyId: {
        $in: companyIds,
      },
    }),

    departments: await Department.countDocuments({
      companyId: {
        $in: companyIds,
      },
    }),

    teams: await Team.countDocuments({
      companyId: {
        $in: companyIds,
      },
    }),

    employees: await Employee.countDocuments({
      companyId: {
        $in: companyIds,
      },
    }),

    clients: await Client.countDocuments({
      companyId: {
        $in: companyIds,
      },
    }),

    workCategories: await WorkCategory.countDocuments({
      companyId: {
        $in: companyIds,
      },
    }),

    tasks: await Task.countDocuments({
      companyId: {
        $in: companyIds,
      },
    }),

    taskActivities: await TaskActivity.countDocuments({
      companyId: {
        $in: companyIds,
      },
    }),

    refreshTokens: await RefreshToken.countDocuments(companyRefreshTokenFilter),

    companyRoles: await Role.countDocuments({
      companyId: {
        $in: companyIds,
      },
    }),

    tenantUsers: await User.countDocuments({
      _id: {
        $in: deletableUserIds,
      },
    }),
  };

  console.table(remaining);

  /**
   * ==========================================================
   * VERIFY PLATFORM DATA
   * ==========================================================
   */

  const remainingPlatformAccess = await PlatformAccess.countDocuments({});

  const remainingProtectedUsers = await User.countDocuments({
    _id: {
      $in: Array.from(platformUserIds).map(
        (id) => new mongoose.Types.ObjectId(id),
      ),
    },
  });

  const remainingGlobalRefreshTokens = await RefreshToken.countDocuments({
    accessType: "GLOBAL",
  });

  console.log(`\nPlatformAccess records preserved: ${remainingPlatformAccess}`);

  console.log(`Protected platform users preserved: ${remainingProtectedUsers}`);

  console.log(
    `GLOBAL refresh tokens preserved: ${remainingGlobalRefreshTokens}`,
  );

  logSection("RESET COMPLETED");

  console.log("Company/tenant data has been reset successfully.");

  console.log("Platform administration data was preserved.");
}

/**
 * ============================================================
 * EXECUTION
 * ============================================================
 */

resetCompanyData()
  .catch((error) => {
    console.error("\nRESET FAILED:");

    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();

    console.log("\nMongoDB disconnected.");
  });
