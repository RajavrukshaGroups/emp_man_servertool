import { connectDatabase, disconnectDatabase } from "../config/database.js";

import Permission from "../modules/permissions/permission.model.js";
import Role from "../modules/roles/role.model.js";

const PERMISSION_CODE = "admin.invitation_send";

const runMigration = async () => {
  try {
    await connectDatabase();

    // Create or activate the invitation permission.
    const permission = await Permission.findOneAndUpdate(
      { code: PERMISSION_CODE },
      {
        $set: {
          module: "admin",
          action: "invitation_send",
          name: "Admin - Invitation Send",
          description:
            "Allows authorized users to send employee login invitations.",
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

    // Grant only to existing Company Administrator roles.
    const result = await Role.updateMany(
      {
        code: "COMPANY_ADMIN",
        scopeType: "COMPANY",
        companyId: { $type: "objectId" },
        isDeleted: false,
      },
      {
        $addToSet: {
          permissionIds: permission._id,
        },
      },
    );

    console.log("Invitation permission migration completed.");
    console.log({
      permissionCode: permission.code,
      matchedCompanyAdminRoles: result.matchedCount,
      updatedCompanyAdminRoles: result.modifiedCount,
    });
  } catch (error) {
    console.error("Invitation permission migration failed:", error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

runMigration();
