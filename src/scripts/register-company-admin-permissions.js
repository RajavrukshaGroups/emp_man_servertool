import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { PERMISSIONS } from "../constants/permissions.constants.js";
import Permission from "../modules/permissions/permission.model.js";

const definitions = [
  {
    code: PERMISSIONS.ROLE_PERMISSION_DELEGATE,
    module: "role",
    action: "permission_delegate",
    name: "Role - Permission Delegate",
    description: "Allows authorized company users to delegate permissions within their permitted scope.",
  },
  {
    code: PERMISSIONS.COMPANY_ACCESS_ROLE_ASSIGN,
    module: "company_access",
    action: "role_assign",
    name: "Company Access - Role Assign",
    description: "Allows authorized company users to assign eligible roles within their permitted scope.",
  },
];

const run = async () => {
  try {
    await connectDatabase();

    for (const definition of definitions) {
      await Permission.findOneAndUpdate(
        { code: definition.code },
        {
          $set: {
            ...definition,
            isSystem: true,
            status: "ACTIVE",
          },
        },
        {
          upsert: true,
          runValidators: true,
          returnDocument: "after",
        },
      );

      console.log(`Registered: ${definition.code}`);
    }

    console.log("Permission registration completed.");
    console.log("No role assignments were modified.");
  } catch (error) {
    console.error("Permission registration failed:", error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

run();
