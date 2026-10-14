import "dotenv/config";

import { connectDatabase, disconnectDatabase } from "../config/database.js";
import LeaveBalance from "../modules/leave/leaveBalance.model.js";
import { accrueMonthlyLeaveBalance } from "../modules/leave/leaveBalance.service.js";

const balanceId = "6accb5decdd58de257eedb54";

const run = async () => {
  if (process.env.ENABLE_BACKGROUND_JOBS !== "false") {
    throw new Error("Background jobs must be disabled.");
  }

  await connectDatabase();

  try {
    const before = await LeaveBalance.findById(balanceId).lean();

    if (!before || before.allocationMethod !== "MONTHLY_ACCRUAL") {
      throw new Error("Expected monthly accrual test balance not found.");
    }

    const september = before.monthlyBalances.find(
      (bucket) => bucket.periodKey === "2026-09",
    );

    if (!september?.isAccrued || september.creditedDays !== 1) {
      throw new Error("September test accrual is not in the expected state.");
    }

    const operationResult = {};

    const after = await accrueMonthlyLeaveBalance({
      companyId: before.companyId,
      balanceId: before._id,
      periodDate: new Date("2026-09-01T00:00:00.000Z"),
      requesterContext: { userId: null },
      operationResult,
    });

    const passed =
      operationResult.status === "ALREADY_ACCRUED" &&
      after.accruedDays === before.accruedDays &&
      after.lapsedDays === before.lapsedDays;

    console.log(
      JSON.stringify(
        {
          test: "Duplicate September Accrual",
          operationStatus: operationResult.status,
          accruedBefore: before.accruedDays,
          accruedAfter: after.accruedDays,
          lapsedBefore: before.lapsedDays,
          lapsedAfter: after.lapsedDays,
          result: passed ? "PASS" : "FAIL",
        },
        null,
        2,
      ),
    );

    if (!passed) {
      process.exitCode = 1;
    }
  } finally {
    await disconnectDatabase();
  }
};

run().catch((error) => {
  console.error("Idempotency test failed:", error.message);
  process.exitCode = 1;
});
