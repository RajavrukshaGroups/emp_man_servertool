import mongoose from "mongoose";
import dotenv from "dotenv";

import AttendancePolicy from "../../modules/attendance/attendancePolicy.model.js";

dotenv.config();

const backfillAttendanceCompensationPolicy = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB connected.");

    // ---------------------------------------------------------
    // 1. scheduleCompensationEnabled
    // ---------------------------------------------------------
    const scheduleResult = await AttendancePolicy.updateMany(
      {
        scheduleCompensationEnabled: { $exists: false },
      },
      {
        $set: {
          scheduleCompensationEnabled: true,
        },
      },
    );

    // ---------------------------------------------------------
    // 2. allowPostShiftWorkForLateArrival
    // ---------------------------------------------------------
    const postShiftResult = await AttendancePolicy.updateMany(
      {
        allowPostShiftWorkForLateArrival: { $exists: false },
      },
      {
        $set: {
          allowPostShiftWorkForLateArrival: true,
        },
      },
    );

    // ---------------------------------------------------------
    // 3. allowPreShiftWorkForEarlyCheckout
    // ---------------------------------------------------------
    const preShiftResult = await AttendancePolicy.updateMany(
      {
        allowPreShiftWorkForEarlyCheckout: { $exists: false },
      },
      {
        $set: {
          allowPreShiftWorkForEarlyCheckout: true,
        },
      },
    );

    // ---------------------------------------------------------
    // 4. maximumCompensationMinutes
    // ---------------------------------------------------------
    const maximumResult = await AttendancePolicy.updateMany(
      {
        maximumCompensationMinutes: { $exists: false },
      },
      {
        $set: {
          maximumCompensationMinutes: 120,
        },
      },
    );

    console.log("\nAttendance compensation policy backfill completed.");

    console.log({
      scheduleCompensationEnabled: {
        matched: scheduleResult.matchedCount,
        modified: scheduleResult.modifiedCount,
      },

      allowPostShiftWorkForLateArrival: {
        matched: postShiftResult.matchedCount,
        modified: postShiftResult.modifiedCount,
      },

      allowPreShiftWorkForEarlyCheckout: {
        matched: preShiftResult.matchedCount,
        modified: preShiftResult.modifiedCount,
      },

      maximumCompensationMinutes: {
        matched: maximumResult.matchedCount,
        modified: maximumResult.modifiedCount,
      },
    });

    // ---------------------------------------------------------
    // VERIFY
    // ---------------------------------------------------------
    const policies = await AttendancePolicy.find({})
      .select(
        "name code scheduleCompensationEnabled allowPostShiftWorkForLateArrival allowPreShiftWorkForEarlyCheckout maximumCompensationMinutes",
      )
      .lean();

    console.log("\nAttendance policies after migration:");

    console.table(
      policies.map((policy) => ({
        name: policy.name,
        code: policy.code,

        scheduleCompensationEnabled: policy.scheduleCompensationEnabled,

        postShiftForLate: policy.allowPostShiftWorkForLateArrival,

        preShiftForEarlyCheckout: policy.allowPreShiftWorkForEarlyCheckout,

        maximumCompensationMinutes: policy.maximumCompensationMinutes,
      })),
    );
  } catch (error) {
    console.error("Attendance compensation policy backfill failed:", error);

    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

backfillAttendanceCompensationPolicy();
