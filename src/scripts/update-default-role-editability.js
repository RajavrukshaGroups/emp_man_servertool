import "dotenv/config";

import mongoose from "mongoose";

import Role from "../modules/roles/role.model.js";

async function run() {
  const mongoUri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL;

  if (!mongoUri) {
    throw new Error("MongoDB connection string is missing.");
  }

  await mongoose.connect(mongoUri);

  console.log("MongoDB connected.");

  const companyAdminResult = await Role.updateMany(
    {
      code: "COMPANY_ADMIN",
      isSystemRole: true,
      isDeleted: false,
    },
    {
      $set: {
        scopeType: "COMPANY",
        isEditable: false,
        isPermissionEditable: false,
      },
    },
  );

  const teamLeadResult = await Role.updateMany(
    {
      code: "TEAM_LEAD",
      isSystemRole: true,
      isDeleted: false,
    },
    {
      $set: {
        scopeType: "TEAM",
        isEditable: false,
        isPermissionEditable: true,
      },
    },
  );

  const employeeResult = await Role.updateMany(
    {
      code: "EMPLOYEE",
      isSystemRole: true,
      isDeleted: false,
    },
    {
      $set: {
        scopeType: "TEAM",
        isEditable: false,
        isPermissionEditable: true,
      },
    },
  );

  console.log("COMPANY_ADMIN:", companyAdminResult);
  console.log("TEAM_LEAD:", teamLeadResult);
  console.log("EMPLOYEE:", employeeResult);

  const roles = await Role.find({
    code: {
      $in: ["COMPANY_ADMIN", "TEAM_LEAD", "EMPLOYEE"],
    },
    isDeleted: false,
  })
    .select(
      "companyId name code scopeType isSystemRole isEditable isPermissionEditable",
    )
    .lean();

  console.table(
    roles.map((role) => ({
      companyId: role.companyId?.toString(),
      name: role.name,
      code: role.code,
      scopeType: role.scopeType,
      isSystemRole: role.isSystemRole,
      isEditable: role.isEditable,
      isPermissionEditable: role.isPermissionEditable,
    })),
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log("MongoDB disconnected.");
  });
