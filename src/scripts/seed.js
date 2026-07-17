import { connectDatabase, disconnectDatabase } from "../config/database.js";

import { PERMISSION_LIST } from "../constants/permissions.constants.js";

import Permission from "../modules/permissions/permission.model.js";

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

const runSeed = async () => {
  try {
    await connectDatabase();

    await seedPermissions();

    console.log("Database seeding completed successfully.");
  } catch (error) {
    console.error("Database seeding failed:", error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

runSeed();
