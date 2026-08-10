import {
  connectDatabase,
  disconnectDatabase,
} from "../config/database.js";

import Company from "../modules/companies/company.model.js";

import { provisionDefaultCompanyRoles } from "../modules/roles/defaultCompanyRoles.service.js";

const run = async () => {
  try {
    await connectDatabase();

    const companies = await Company.find({
      isDeleted: false,
    })
      .select("_id name code")
      .lean();

    console.log(
      `Found ${companies.length} companies.`,
    );

    for (const company of companies) {
      await provisionDefaultCompanyRoles({
        companyId: company._id,
        actorId: null,
      });

      console.log(
        `Default roles provisioned for ${company.name} (${company.code}).`,
      );
    }

    console.log(
      "Default company role backfill completed successfully.",
    );
  } catch (error) {
    console.error(
      "Company role backfill failed:",
      error,
    );

    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

run();