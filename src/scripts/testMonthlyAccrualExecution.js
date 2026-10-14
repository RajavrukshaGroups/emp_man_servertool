import "dotenv/config";
import mongoose from "mongoose";

import { connectDatabase, disconnectDatabase } from "../config/database.js";
import LeaveBalance from "../modules/leave/leaveBalance.model.js";
import LeaveType from "../modules/leave/leaveType.model.js";
import CompanyAccess from "../modules/company-access/companyAccess.model.js";
import Employee from "../modules/employees/employee.model.js";
import { accrueMonthlyLeaveBalance } from "../modules/leave/leaveBalance.service.js";

const balanceId = process.env.TEST_LEAVE_BALANCE_ID;
const periodKey = process.env.TEST_ACCRUAL_PERIOD;
const execute = process.env.TEST_ACCRUAL_EXECUTE === "true";

const run = async () => {
  if (!balanceId || !mongoose.isValidObjectId(balanceId)) {
    throw new Error("Set a valid TEST_LEAVE_BALANCE_ID.");
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey ?? "")) {
    throw new Error("Set TEST_ACCRUAL_PERIOD in YYYY-MM format.");
  }

  if (process.env.ENABLE_BACKGROUND_JOBS !== "false") {
    throw new Error("Set ENABLE_BACKGROUND_JOBS=false before testing.");
  }

  await connectDatabase();

  try {
    const balance = await LeaveBalance.findOne({
      _id: balanceId,
      isDeleted: false,
      allocationMethod: "MONTHLY_ACCRUAL",
      status: "ACTIVE",
    }).lean();

    if (!balance) {
      throw new Error("Active monthly-accrual leave balance not found.");
    }

    const [leaveType, employee, companyAccess] = await Promise.all([
      LeaveType.findById(balance.leaveTypeId).lean(),
      Employee.findById(balance.employeeId).lean(),
      CompanyAccess.findById(balance.companyAccessId).lean(),
    ]);

    if (!leaveType || !employee || !companyAccess) {
      throw new Error("Missing linked leave type, employee or company access.");
    }

    const existingBucket = balance.monthlyBalances?.find(
      (bucket) => bucket.periodKey === periodKey,
    );

    const inspection = {
      database: mongoose.connection.name,
      companyId: balance.companyId.toString(),
      balanceId: balance._id.toString(),
      employeeId: employee._id.toString(),
      employeeStatus: employee.status,
      companyAccessStatus: companyAccess.status,
      joiningDate: companyAccess.joiningDate,
      leaveType: leaveType.name,
      monthlyEntitlementDays: leaveType.monthlyEntitlementDays,
      allowMonthlyAccumulation: leaveType.allowMonthlyAccumulation,
      periodKey,
      existingBucket: existingBucket ?? null,
      currentAccruedDays: balance.accruedDays,
      currentLapsedDays: balance.lapsedDays,
      execute,
    };

    console.log("\n========== ACCRUAL INSPECTION ==========");
    console.log(JSON.stringify(inspection, null, 2));

    if (!execute) {
      console.log("\n========== IDEMPOTENCY CHECK ==========");

      if (
        existingBucket?.isAccrued === true ||
        Number(existingBucket?.creditedDays || 0) > 0
      ) {
        console.log("PASS: October 2026 is already accrued.");
        console.log("Expected behavior: Skip duplicate accrual.");
      } else {
        console.log("Selected month has not yet been accrued.");
      }

      console.log("\nREAD-ONLY MODE: No database changes made.");
      return;
    }

    if (process.env.TEST_ACCRUAL_CONFIRM !== balanceId) {
      throw new Error(
        "Write test blocked. TEST_ACCRUAL_CONFIRM must match TEST_LEAVE_BALANCE_ID.",
      );
    }

    const periodDate = new Date(`${periodKey}-01T00:00:00.000Z`);

    if (periodDate > new Date()) {
      throw new Error("Future-period accrual is blocked.");
    }

    if (
      existingBucket?.isAccrued ||
      Number(existingBucket?.creditedDays || 0) > 0
    ) {
      throw new Error(
        "Selected period is already accrued. Choose a test record.",
      );
    }

    // This is a real database write. Only enable for a dedicated test record.
    const updatedBalance = await accrueMonthlyLeaveBalance({
      companyId: balance.companyId,
      balanceId: balance._id,
      periodDate,
      requesterContext: { userId: null },
    });

    const updatedBucket = updatedBalance.monthlyBalances.find(
      (bucket) => bucket.periodKey === periodKey,
    );

    console.log("\n========== ACCRUAL RESULT ==========");
    console.log(
      JSON.stringify(
        {
          periodKey,
          accruedDays: updatedBalance.accruedDays,
          lapsedDays: updatedBalance.lapsedDays,
          updatedBucket,
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
  console.error("Accrual test failed:", error.message);
  process.exitCode = 1;
});
