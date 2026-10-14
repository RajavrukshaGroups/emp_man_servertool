import { connectDatabase, disconnectDatabase } from "../config/database.js";

import Company from "../modules/companies/company.model.js";
import LeaveBalance from "../modules/leave/leaveBalance.model.js";
import LeaveType from "../modules/leave/leaveType.model.js";

import { processMonthlyLeaveAccrual } from "../jobs/leave/monthlyAccrual.job.js";

const TEST_DATE = new Date("2026-11-02T04:30:00.000Z");
const TEST_PERIOD = "2026-11";

if (process.env.ENABLE_BACKGROUND_JOBS !== "false") {
  throw new Error("Set ENABLE_BACKGROUND_JOBS=false before running this test.");
}

const run = async () => {
  try {
    await connectDatabase();

    console.log("\n========== MONTHLY ACCRUAL INSPECTION ==========");

    const companies = await Company.find({
      status: "ACTIVE",
      isDeleted: false,
    })
      .select("_id name timezone")
      .lean();

    for (const company of companies) {
      console.log(`\nCompany: ${company.name}`);
      console.log(`Company ID: ${company._id}`);

      const leaveTypes = await LeaveType.find({
        companyId: company._id,
        status: "ACTIVE",
        isDeleted: false,
        allocationMethod: "MONTHLY_ACCRUAL",
        requiresBalance: true,
      })
        .select("_id name code monthlyEntitlementDays allowMonthlyAccumulation")
        .lean();

      console.log("Monthly accrual leave types:", leaveTypes.length);

      for (const leaveType of leaveTypes) {
        const balances = await LeaveBalance.find({
          companyId: company._id,
          leaveTypeId: leaveType._id,
          allocationMethod: "MONTHLY_ACCRUAL",
          status: "ACTIVE",
          isDeleted: false,
          leaveYearStart: {
            $lte: new Date("2026-11-30T23:59:59.999Z"),
          },
          leaveYearEnd: {
            $gte: new Date("2026-11-01T00:00:00.000Z"),
          },
        })
          .select(
            "_id employeeId companyAccessId accruedDays lastAccruedPeriodKey monthlyBalances",
          )
          .lean();

        const alreadyAccrued = balances.filter((balance) =>
          balance.monthlyBalances?.some(
            (month) =>
              month.periodKey === TEST_PERIOD &&
              (month.isAccrued === true || Number(month.creditedDays || 0) > 0),
          ),
        ).length;

        const notYetAccrued = balances.length - alreadyAccrued;

        console.log(`\n  Leave type: ${leaveType.name}`);
        console.log(
          `  Monthly entitlement: ${leaveType.monthlyEntitlementDays}`,
        );
        console.log(`  Accumulation: ${leaveType.allowMonthlyAccumulation}`);
        console.log(`  Active balances: ${balances.length}`);
        console.log(`  Already accrued for ${TEST_PERIOD}: ${alreadyAccrued}`);
        console.log(`  Not yet accrued: ${notYetAccrued}`);
      }
    }

    console.log("\n========== JOB DRY RUN ==========");

    const result = await processMonthlyLeaveAccrual({
      now: TEST_DATE,
      dryRun: true,
    });

    if (
      result.processedCompanies !== 0 ||
      result.accruedBalances !== 0 ||
      result.failedBalances !== 0 ||
      result.errors.length > 0
    ) {
      throw new Error("Monthly accrual dry-run validation failed.");
    }

    console.log("RESULT: PASS - Monthly accrual dry-run completed.");

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Monthly accrual inspection failed:", error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

run();
