import "dotenv/config";

import { connectDatabase, disconnectDatabase } from "../config/database.js";

import Company from "../modules/companies/company.model.js";
import Role from "../modules/roles/role.model.js";
import LeavePolicy from "../modules/leave/leavePolicy.model.js";

const companyId = "6a8bde022c1fde6ec526fce6";

const run = async () => {
  if (process.env.ENABLE_BACKGROUND_JOBS !== "false") {
    throw new Error("Disable background jobs before testing.");
  }

  await connectDatabase();

  try {
    const company = await Company.findById(companyId)
      .select("_id name status")
      .lean();

    const roles = await Role.find({
      companyId,
      code: "EMPLOYEE",
      isDeleted: false,
    })
      .select("_id name code status")
      .lean();

    const policies = await LeavePolicy.find({
      companyId,
      status: "ACTIVE",
      isDeleted: false,
    })
      .select("_id name code effectiveFrom effectiveTo isDefault")
      .lean();

    console.log(
      JSON.stringify(
        {
          database: "Development database",
          company,
          roles,
          policies,
        },
        null,
        2,
      ),
    );
  } finally {
    await disconnectDatabase();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
