import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { PERMISSIONS } from "../constants/permissions.constants.js";
import Permission from "../modules/permissions/permission.model.js";
import Role from "../modules/roles/role.model.js";

const REQUIRED_PERMISSION_CODES = [
  PERMISSIONS.ROLE_PERMISSION_DELEGATE,
  PERMISSIONS.COMPANY_ACCESS_ROLE_ASSIGN,
  PERMISSIONS.USER_EMPLOYEE_ACCOUNT_READ,
  PERMISSIONS.USER_EMPLOYEE_ACCOUNT_UPDATE,
  PERMISSIONS.USER_EMPLOYEE_ACCOUNT_RESET_PASSWORD,
  PERMISSIONS.USER_EMPLOYEE_ACCOUNT_STATUS_MANAGE,
  PERMISSIONS.LEAVE_APPLY,
];

const runMigration = async () => {
  try {
    await connectDatabase();

    const permissions = await Permission.find({
      code: { $in: REQUIRED_PERMISSION_CODES },
      status: "ACTIVE",
    })
      .select("_id code")
      .lean();

    const foundCodes = new Set(permissions.map((permission) => permission.code));

    const missingCodes = REQUIRED_PERMISSION_CODES.filter(
      (code) => !foundCodes.has(code),
    );

    if (missingCodes.length > 0) {
      throw new Error(
        `Missing active permissions: ${missingCodes.join(", ")}`,
      );
    }

    const permissionIds = permissions.map((permission) => permission._id);

    const result = await Role.updateMany(
      {
        code: "COMPANY_ADMIN",
        scopeType: "COMPANY",
        companyId: { $type: "objectId" },
        isDeleted: false,
      },
      {
        $addToSet: {
          permissionIds: { $each: permissionIds },
        },
      },
    );

    console.log("Company Administrator permission migration completed.");
    console.log({
      permissionCodes: REQUIRED_PERMISSION_CODES,
      matchedCompanyAdminRoles: result.matchedCount,
      updatedCompanyAdminRoles: result.modifiedCount,
    });
  } catch (error) {
    console.error("Company Administrator permission migration failed:", error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

runMigration();
