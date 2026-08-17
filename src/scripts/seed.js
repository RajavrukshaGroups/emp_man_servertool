import { connectDatabase, disconnectDatabase } from "../config/database.js";

import { PERMISSION_LIST } from "../constants/permissions.constants.js";

import Company from "../modules/companies/company.model.js";
import Permission from "../modules/permissions/permission.model.js";
import Role from "../modules/roles/role.model.js";

import { provisionDefaultCompanyRoles } from "../modules/roles/defaultCompanyRoles.service.js";

/**
 * Old task permissions from the previous workflow.
 *
 * These are replaced by:
 *
 * task.complete
 * task.reopen
 */
const DEPRECATED_PERMISSION_CODES = [
  "task.review",
  "task.approve",
  "task.rework",
];

const getPermissionName = (code) => {
  return code
    .split(".")
    .map((part) =>
      part
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
    )
    .join(" - ");
};

/**
 * ============================================================
 * SEED CURRENT PERMISSIONS
 * ============================================================
 */
const seedPermissions = async () => {
  const permissionOperations = PERMISSION_LIST.map((code) => {
    const [module, action] = code.split(".");

    return {
      updateOne: {
        filter: {
          code,
        },

        update: {
          $set: {
            module,
            action,

            name: getPermissionName(code),

            description: `Allows ${action.replaceAll(
              "_",
              " ",
            )} access for ${module}.`,

            isSystem: true,

            status: "ACTIVE",
          },
        },

        upsert: true,
      },
    };
  });

  const result = await Permission.bulkWrite(permissionOperations);

  console.log("Permissions seeded successfully.");

  console.log({
    inserted: result.upsertedCount,

    modified: result.modifiedCount,

    matched: result.matchedCount,
  });
};

/**
 * ============================================================
 * DEACTIVATE OLD TASK PERMISSIONS
 * ============================================================
 *
 * Old workflow:
 *
 * task.review
 * task.approve
 * task.rework
 *
 * New Jira-style workflow:
 *
 * task.complete
 * task.reopen
 */
const deactivateDeprecatedPermissions = async () => {
  const deprecatedPermissions = await Permission.find({
    code: {
      $in: DEPRECATED_PERMISSION_CODES,
    },
  })
    .select("_id code")
    .lean();

  if (deprecatedPermissions.length === 0) {
    console.log("No deprecated task permissions found.");

    return;
  }

  const deprecatedPermissionIds = deprecatedPermissions.map(
    (permission) => permission._id,
  );

  /**
   * Do not hard-delete them.
   *
   * Keeping them inactive is safer for
   * historical database references.
   */
  await Permission.updateMany(
    {
      _id: {
        $in: deprecatedPermissionIds,
      },
    },
    {
      $set: {
        status: "INACTIVE",
      },
    },
  );

  /**
   * Remove obsolete permission IDs
   * from every Role document.
   *
   * This also protects custom roles
   * that may still reference them.
   */
  await Role.updateMany(
    {
      permissionIds: {
        $in: deprecatedPermissionIds,
      },
    },
    {
      $pull: {
        permissionIds: {
          $in: deprecatedPermissionIds,
        },
      },
    },
  );

  console.log(
    "Deprecated task permissions deactivated and removed from roles.",
  );

  console.log({
    deprecated: deprecatedPermissions.map((permission) => permission.code),
  });
};

/**
 * ============================================================
 * SUPER ADMIN
 * ============================================================
 */
const seedGlobalRoles = async () => {
  const permissions = await Permission.find({
    code: {
      $in: PERMISSION_LIST,
    },

    status: "ACTIVE",
  })
    .select("_id")
    .lean();

  const permissionIds = permissions.map((permission) => permission._id);

  await Role.findOneAndUpdate(
    {
      code: "SUPER_ADMIN",
      scopeType: "GLOBAL",
      isDeleted: false,
    },
    {
      $set: {
        companyId: null,

        name: "Super Administrator",

        description:
          "Platform administrator with full access across all companies and platform operations.",

        permissionIds,

        scopeType: "GLOBAL",

        isSystemRole: true,

        isEditable: false,

        status: "ACTIVE",
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
    },
  );

  console.log("Global roles seeded successfully.");
};

/**
 * ============================================================
 * REPROVISION DEFAULT ROLES FOR EXISTING COMPANIES
 * ============================================================
 *
 * This is required because merely changing
 * DEFAULT_COMPANY_ROLES in source code does not update
 * roles already stored in MongoDB.
 *
 * It will update:
 *
 * COMPANY_ADMIN
 * TEAM_LEAD
 * EMPLOYEE
 *
 * including EMPLOYEE scopeType TEAM.
 */
const seedCompanyRoles = async () => {
  const companies = await Company.find({
    isDeleted: false,
  })
    .select("_id name code")
    .lean();

  for (const company of companies) {
    await provisionDefaultCompanyRoles({
      companyId: company._id,

      actorId: null,
    });

    console.log(`Default roles updated for ${company.name} (${company.code}).`);
  }

  console.log(
    `Default company roles provisioned for ${companies.length} company(s).`,
  );
};

/**
 * ============================================================
 * RUN
 * ============================================================
 */
const runSeed = async () => {
  try {
    await connectDatabase();

    /**
     * Order matters.
     */
    await seedPermissions();

    await deactivateDeprecatedPermissions();

    await seedGlobalRoles();

    await seedCompanyRoles();

    console.log("Database seeding completed successfully.");
  } catch (error) {
    console.error("Database seeding failed:", error);

    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

runSeed();
