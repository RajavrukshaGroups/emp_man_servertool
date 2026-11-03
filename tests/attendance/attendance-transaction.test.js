import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Attendance from "../../src/modules/attendance/attendance.model.js";
import { validatePreviousOpenAttendance } from "../../src/modules/attendance/attendance.service.js";

describe("Previous missing-checkout transaction behavior", () => {
  let replicaSet;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });

    await mongoose.connect(replicaSet.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();

    if (replicaSet) {
      await replicaSet.stop();
    }
  });

  const createPreviousOpenAttendance = async () => {
    const companyId = new mongoose.Types.ObjectId();
    const companyAccessId = new mongoose.Types.ObjectId();

    const attendance = await Attendance.create({
      companyId,
      companyAccessId,
      employeeId: new mongoose.Types.ObjectId(),
      attendanceDate: "2026-10-30",
      shiftId: new mongoose.Types.ObjectId(),
      attendancePolicyId: new mongoose.Types.ObjectId(),
      attendanceMode: "OFFICE",
      shiftSnapshot: {
        name: "Night Shift",
        code: "NIGHT",
        startTime: "22:00",
        endTime: "06:00",
        isOvernight: true,
        fullDayMinutes: 480,
        halfDayMinutes: 240,
      },
      workSessions: [
        {
          checkInAt: new Date("2026-10-30T16:30:00.000Z"),
          checkOutAt: null,
          status: "OPEN",
        },
      ],
    });

    return { companyId, companyAccessId, attendance };
  };

  it("commits the missing-checkout anomaly when policy allows check-in", async () => {
    const { companyId, companyAccessId, attendance } =
      await createPreviousOpenAttendance();

    await mongoose.connection.transaction(async (session) => {
      await validatePreviousOpenAttendance({
        companyId,
        companyAccessId,
        attendanceDate: "2026-10-31",
        policy: {
          allowNextDayCheckInWithPendingPreviousDay: true,
        },
        session,
      });
    });

    const updated = await Attendance.findById(attendance._id);

    expect(updated.calculationStatus).toBe("RECALCULATION_REQUIRED");
    expect(
      updated.anomalies.some((anomaly) => anomaly.type === "MISSING_CHECKOUT"),
    ).toBe(true);
    expect(updated.workSessions[0].status).toBe("OPEN");
  });

  it("rolls back the missing-checkout anomaly when policy blocks check-in", async () => {
    const { companyId, companyAccessId, attendance } =
      await createPreviousOpenAttendance();

    await expect(
      mongoose.connection.transaction(async (session) => {
        await validatePreviousOpenAttendance({
          companyId,
          companyAccessId,
          attendanceDate: "2026-10-31",
          policy: {
            allowNextDayCheckInWithPendingPreviousDay: false,
          },
          session,
        });
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    const updated = await Attendance.findById(attendance._id);

    expect(updated.calculationStatus).toBe("PENDING");
    expect(
      updated.anomalies.some((anomaly) => anomaly.type === "MISSING_CHECKOUT"),
    ).toBe(false);
    expect(updated.workSessions[0].status).toBe("OPEN");
  });
});
