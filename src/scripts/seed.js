import { connectDatabase, disconnectDatabase } from "../config/database.js";

import { PERMISSION_LIST } from "../constants/permissions.constants.js";

import Permission from "../modules/permissions/permission.model.js";
import Role from "../modules/roles/role.model.js";

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

const seedPermissions = async () => {
  const permissionOperations = PERMISSION_LIST.map((code) => {
    const [module, action] = code.split(".");

    return {
      updateOne: {
        filter: { code },
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

const runSeed = async () => {
  try {
    await connectDatabase();

    await seedPermissions();
    await seedGlobalRoles();

    console.log("Database seeding completed successfully.");
  } catch (error) {
    console.error("Database seeding failed:", error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

runSeed();
