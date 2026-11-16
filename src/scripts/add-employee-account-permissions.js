import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { PERMISSIONS } from "../constants/permissions.constants.js";
import Permission from "../modules/permissions/permission.model.js";

const permissionDefinitions = [
  {
    code: PERMISSIONS.USER_EMPLOYEE_ACCOUNT_UPDATE,
    action: "employee_account_update",
    name: "User - Employee Account Update",
    description: "Allows updating eligible employee user accounts.",
  },
  {
    code: PERMISSIONS.USER_EMPLOYEE_ACCOUNT_RESET_PASSWORD,
    action: "employee_account_reset_password",
    name: "User - Employee Account Reset Password",
    description: "Allows resetting passwords for eligible employee accounts.",
  },
  {
    code: PERMISSIONS.USER_EMPLOYEE_ACCOUNT_STATUS_MANAGE,
    action: "employee_account_status_manage",
    name: "User - Employee Account Status Manage",
    description: "Allows managing eligible employee account statuses.",
  },
];

const runMigration = async () => {
  try {
    await connectDatabase();

    for (const definition of permissionDefinitions) {
      await Permission.findOneAndUpdate(
        { code: definition.code },
        {
          $set: {
            module: "user",
            action: definition.action,
            name: definition.name,
            description: definition.description,
            isSystem: true,
            status: "ACTIVE",
          },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
        },
      );

      console.log(`Registered permission: ${definition.code}`);
    }

    console.log("Employee account permissions registered successfully.");
    console.log("Existing role assignments were not modified.");
  } catch (error) {
    console.error("Employee account permission migration failed:", error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

runMigration();
