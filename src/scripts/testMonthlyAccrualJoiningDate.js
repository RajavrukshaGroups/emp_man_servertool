import "dotenv/config";
import mongoose from "mongoose";

import { connectDatabase, disconnectDatabase } from "../config/database.js";

import CompanyAccess from "../modules/company-access/companyAccess.model.js";
import LeaveBalance from "../modules/leave/leaveBalance.model.js";

import { accrueMonthlyLeaveBalance } from "../modules/leave/leaveBalance.service.js";

const balanceId = "6accb5decdd58de257eedb54";
const companyAccessId = "6accb5decdd58de257eedb50";

const run = async () => {
  if (process.env.ENABLE_BACKGROUND_JOBS !== "false") {
    throw new Error("Background jobs must be disabled.");
  }

  await connectDatabase();

  const session = await mongoose.startSession();

  try {
    const before = await LeaveBalance.findById(balanceId).lean();

    if (!before || before.companyAccessId.toString() !== companyAccessId) {
      throw new Error("Unexpected test balance.");
    }

    const originalAccess = await CompanyAccess.findById(companyAccessId).lean();

    if (
      !originalAccess ||
      originalAccess.employeeCode !== "ACCTEST_9F456CFD3B"
    ) {
      throw new Error("Unexpected test company access.");
    }

    let rejected = false;
    let errorMessage = "";

    // The entire transaction is deliberately aborted.
    // No joining-date modification is committed.
    try {
      await session.withTransaction(async () => {
        await CompanyAccess.updateOne(
          { _id: companyAccessId },
          {
            $set: {
              joiningDate: new Date("2026-10-15T00:00:00.000Z"),
            },
          },
          { session },
        );

        try {
          await accrueMonthlyLeaveBalance({
            companyId: before.companyId,
            balanceId: before._id,
            periodDate: new Date("2026-08-01T00:00:00.000Z"),
            requesterContext: { userId: null },
            session,
          });
        } catch (error) {
          rejected =
            error.statusCode === 409 && error.message.includes("joining date");

          errorMessage = error.message;
        }

        // Always abort, even if the service unexpectedly succeeds.
        throw new Error("TEST_ROLLBACK");
      });
    } catch (error) {
      if (error.message !== "TEST_ROLLBACK") {
        throw error;
      }
    }

    const [after, restoredAccess] = await Promise.all([
      LeaveBalance.findById(balanceId).lean(),
      CompanyAccess.findById(companyAccessId).lean(),
    ]);

    const unchanged =
      after.accruedDays === before.accruedDays &&
      after.lapsedDays === before.lapsedDays &&
      JSON.stringify(after.monthlyBalances) ===
        JSON.stringify(before.monthlyBalances);

    const joiningDateRestored =
      new Date(restoredAccess.joiningDate).getTime() ===
      new Date(originalAccess.joiningDate).getTime();

    const passed = rejected && unchanged && joiningDateRestored;

    console.log(
      JSON.stringify(
        {
          test: "Joining Date Eligibility",
          requestedPeriod: "2026-08",
          simulatedJoiningDate: "2026-10-15",
          rejected,
          errorMessage,
          balanceUnchanged: unchanged,
          joiningDateRestored,
          result: passed ? "PASS" : "FAIL",
        },
        null,
        2,
      ),
    );

    if (!passed) process.exitCode = 1;
  } finally {
    await session.endSession();
    await disconnectDatabase();
  }
};

run().catch((error) => {
  console.error("Joining-date test failed:", error.message);
  process.exitCode = 1;
});
