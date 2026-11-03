import { connectDatabase, disconnectDatabase } from "../config/database.js";
import Permission from "../modules/permissions/permission.model.js";
import Role from "../modules/roles/role.model.js";

const PERMISSION_CODE = "attendance.photo_view";

const TARGET_ROLE_CODES = ["COMPANY_ADMIN", "TEAM_LEAD", "EMPLOYEE"];

const runMigration = async () => {
  try {
    await connectDatabase();

    // Create or reactivate the permission.
    const permission = await Permission.findOneAndUpdate(
      { code: PERMISSION_CODE },
      {
        $set: {
          module: "attendance",
          action: "photo_view",
          name: "Attendance - Photo View",
          description: "Allows viewing authorized attendance photo evidence.",
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

    // Add the permission without replacing existing permissions.
    const result = await Role.updateMany(
      {
        code: { $in: TARGET_ROLE_CODES },
        companyId: { $type: "objectId" },
        scopeType: { $in: ["COMPANY", "DEPARTMENT", "TEAM"] },
        isDeleted: false,
      },
      {
        $addToSet: {
          permissionIds: permission._id,
        },
      },
    );

    console.log("Attendance photo-view permission migration completed.");
    console.log({
      permissionCode: PERMISSION_CODE,
      matchedRoles: result.matchedCount,
      modifiedRoles: result.modifiedCount,
    });
  } catch (error) {
    console.error("Attendance photo-view permission migration failed:", error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

runMigration();
