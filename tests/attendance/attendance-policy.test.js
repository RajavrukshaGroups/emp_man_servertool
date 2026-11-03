import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Attendance from "../../src/modules/attendance/attendance.model.js";
import { validatePreviousOpenAttendance } from "../../src/modules/attendance/attendance.service.js";

describe("Previous missing-checkout policy", () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();

    if (mongo) {
      await mongo.stop();
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

  it("allows next-day check-in and flags the previous missing checkout", async () => {
    const { companyId, companyAccessId, attendance } =
      await createPreviousOpenAttendance();

    const result = await validatePreviousOpenAttendance({
      companyId,
      companyAccessId,
      attendanceDate: "2026-10-31",
      policy: {
        allowNextDayCheckInWithPendingPreviousDay: true,
      },
    });

    expect(result?._id.toString()).toBe(attendance._id.toString());

    const updated = await Attendance.findById(attendance._id);

    expect(updated.calculationStatus).toBe("RECALCULATION_REQUIRED");
    expect(
      updated.anomalies.some((anomaly) => anomaly.type === "MISSING_CHECKOUT"),
    ).toBe(true);
    expect(updated.workSessions[0].status).toBe("OPEN");
  });

  it("blocks next-day check-in when the policy disallows pending checkout", async () => {
    const { companyId, companyAccessId, attendance } =
      await createPreviousOpenAttendance();

    await expect(
      validatePreviousOpenAttendance({
        companyId,
        companyAccessId,
        attendanceDate: "2026-10-31",
        policy: {
          allowNextDayCheckInWithPendingPreviousDay: false,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    const updated = await Attendance.findById(attendance._id);

    expect(updated.workSessions[0].status).toBe("OPEN");
  });
});
