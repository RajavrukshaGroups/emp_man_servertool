import "dotenv/config";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";

import { connectDatabase, disconnectDatabase } from "../config/database.js";

import User from "../modules/users/user.model.js";
import CompanyAccess from "../modules/company-access/companyAccess.model.js";
import Employee from "../modules/employees/employee.model.js";
import LeaveType from "../modules/leave/leaveType.model.js";
import LeaveBalance from "../modules/leave/leaveBalance.model.js";

const companyId = new mongoose.Types.ObjectId("6a8bde022c1fde6ec526fce6");

const roleId = new mongoose.Types.ObjectId("6a8bde0211f17dcaabfd8793");

const leavePolicyId = new mongoose.Types.ObjectId("6abe1e0a7b114d1131b077f0");

const run = async () => {
  if (process.env.ENABLE_BACKGROUND_JOBS !== "false") {
    throw new Error("Set ENABLE_BACKGROUND_JOBS=false.");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Fixture creation is forbidden in production.");
  }

  if (process.env.TEST_FIXTURE_CREATE !== "true") {
    throw new Error("Set TEST_FIXTURE_CREATE=true to create fixtures.");
  }

  await connectDatabase();

  try {
    const session = await mongoose.startSession();

    try {
      let result;

      await session.withTransaction(async () => {
        const suffix = randomBytes(5).toString("hex").toUpperCase();

        const [user] = await User.create(
          [
            {
              firstName: "Accrual",
              lastName: "Test",
              email: `accrual.test.${suffix.toLowerCase()}@example.invalid`,
              password: randomBytes(24).toString("hex"),
              status: "ACTIVE",
              onboardingStatus: "COMPLETED",
              onboardingCompanyId: companyId,
              onboardingCompletedAt: new Date(),
            },
          ],
          { session, ordered: true },
        );

        const [access] = await CompanyAccess.create(
          [
            {
              userId: user._id,
              companyId,
              roleId,
              employeeCode: `ACCTEST_${suffix}`,
              designation: "Accrual Test Employee",
              joiningDate: new Date("2026-01-01T00:00:00.000Z"),
              status: "ACTIVE",
              notes: "TEST FIXTURE - monthly leave accrual",
            },
          ],
          { session, ordered: true },
        );

        const [employee] = await Employee.create(
          [
            {
              companyId,
              companyAccessId: access._id,
              userId: user._id,
              status: "ACTIVE",
            },
          ],
          { session, ordered: true },
        );

        const leaveTypeConfigs = [
          {
            name: "Accrual Test Non Accumulating",
            code: `TNA_${suffix}`,
            monthlyEntitlementDays: 1,
            allowMonthlyAccumulation: false,
          },
          {
            name: "Accrual Test Accumulating",
            code: `TAC_${suffix}`,
            monthlyEntitlementDays: 2,
            allowMonthlyAccumulation: true,
          },
        ];

        const leaveTypes = await LeaveType.create(
          leaveTypeConfigs.map((config) => ({
            companyId,
            ...config,
            paymentType: "PAID",
            requiresBalance: true,
            allocationMethod: "MONTHLY_ACCRUAL",
            effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
            status: "ACTIVE",
          })),
          { session, ordered: true },
        );

        const balances = await LeaveBalance.create(
          leaveTypes.map((leaveType) => ({
            companyId,
            employeeId: employee._id,
            companyAccessId: access._id,
            leaveTypeId: leaveType._id,
            leavePolicyId,
            leaveYearStart: new Date("2026-01-01T00:00:00.000Z"),
            leaveYearEnd: new Date("2026-12-31T23:59:59.999Z"),
            leaveYearLabel: "2026",
            allocationMethod: "MONTHLY_ACCRUAL",
            status: "ACTIVE",
          })),
          { session, ordered: true },
        );

        result = {
          fixtureCode: suffix,
          companyId: companyId.toString(),
          userId: user._id.toString(),
          companyAccessId: access._id.toString(),
          employeeId: employee._id.toString(),
          leaveTypes: leaveTypes.map((leaveType) => ({
            id: leaveType._id.toString(),
            name: leaveType.name,
            monthlyEntitlementDays: leaveType.monthlyEntitlementDays,
            allowMonthlyAccumulation: leaveType.allowMonthlyAccumulation,
          })),
          balances: balances.map((balance) => ({
            id: balance._id.toString(),
            leaveTypeId: balance.leaveTypeId.toString(),
          })),
        };
      });

      console.log("\n========== TEST FIXTURES CREATED ==========");
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await session.endSession();
    }
  } finally {
    await disconnectDatabase();
  }
};

run().catch((error) => {
  console.error("Fixture setup failed:", error.message);
  process.exitCode = 1;
});
