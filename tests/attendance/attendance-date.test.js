import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Attendance from "../../src/modules/attendance/attendance.model.js";
import { resolveCheckInAttendanceDate } from "../../src/modules/attendance/attendance.service.js";

describe("Attendance date resolution", () => {
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

  // TEST 1: Normal daytime shift
  it("resolves a normal daytime shift without existing attendance", async () => {
    const attendanceDate = await resolveCheckInAttendanceDate({
      companyId: new mongoose.Types.ObjectId(),
      companyAccessId: new mongoose.Types.ObjectId(),
      currentTime: new Date("2026-10-30T04:15:00.000Z"),
      shift: {
        startTime: "09:30",
        endTime: "18:30",
        isOvernight: false,
        earlyCheckInWindowMinutes: 15,
      },
      timezone: "Asia/Kolkata",
    });

    expect(attendanceDate).toBe("2026-10-30");
  });

  // TEST 2: Overnight re-check-in after midnight
  it("uses the previous attendance date for an overnight re-check-in", async () => {
    const companyId = new mongoose.Types.ObjectId();
    const companyAccessId = new mongoose.Types.ObjectId();

    await Attendance.collection.insertOne({
      companyId,
      companyAccessId,
      attendanceDate: "2026-10-30",
      isDeleted: false,
      shiftSnapshot: {
        startTime: "22:00",
        endTime: "06:00",
        isOvernight: true,
        allowPostShiftCheckIn: false,
        postShiftCheckInWindowMinutes: 0,
      },
      workSessions: [
        {
          checkInAt: new Date("2026-10-30T16:30:00.000Z"),
          checkOutAt: new Date("2026-10-30T18:00:00.000Z"),
          status: "CLOSED",
        },
      ],
    });

    const attendanceDate = await resolveCheckInAttendanceDate({
      companyId,
      companyAccessId,
      currentTime: new Date("2026-10-30T19:30:00.000Z"),
      shift: {
        startTime: "22:00",
        endTime: "06:00",
        isOvernight: true,
        earlyCheckInWindowMinutes: 15,
      },
      timezone: "Asia/Kolkata",
    });

    expect(attendanceDate).toBe("2026-10-30");
  });

  it("uses the new attendance date when the next overnight shift begins", async () => {
    const companyId = new mongoose.Types.ObjectId();
    const companyAccessId = new mongoose.Types.ObjectId();

    await Attendance.collection.insertOne({
      companyId,
      companyAccessId,
      attendanceDate: "2026-10-30",
      isDeleted: false,
      shiftSnapshot: {
        startTime: "22:00",
        endTime: "06:00",
        isOvernight: true,
        allowPostShiftCheckIn: false,
        postShiftCheckInWindowMinutes: 0,
      },
      workSessions: [
        {
          checkInAt: new Date("2026-10-30T16:30:00.000Z"),
          checkOutAt: new Date("2026-10-30T23:30:00.000Z"),
          status: "CLOSED",
        },
      ],
    });

    const attendanceDate = await resolveCheckInAttendanceDate({
      companyId,
      companyAccessId,
      currentTime: new Date("2026-10-31T16:30:00.000Z"),
      shift: {
        startTime: "22:00",
        endTime: "06:00",
        isOvernight: true,
        earlyCheckInWindowMinutes: 15,
      },
      timezone: "Asia/Kolkata",
    });

    expect(attendanceDate).toBe("2026-10-31");
  });

  it("resolves a new attendance date despite a previous missing checkout", async () => {
    const companyId = new mongoose.Types.ObjectId();
    const companyAccessId = new mongoose.Types.ObjectId();

    await Attendance.collection.insertOne({
      companyId,
      companyAccessId,
      attendanceDate: "2026-10-30",
      isDeleted: false,
      shiftSnapshot: {
        startTime: "22:00",
        endTime: "06:00",
        isOvernight: true,
        allowPostShiftCheckIn: false,
        postShiftCheckInWindowMinutes: 0,
      },
      workSessions: [
        {
          checkInAt: new Date("2026-10-30T16:30:00.000Z"),
          checkOutAt: null,
          status: "OPEN",
        },
      ],
    });

    const attendanceDate = await resolveCheckInAttendanceDate({
      companyId,
      companyAccessId,
      currentTime: new Date("2026-10-31T16:30:00.000Z"),
      shift: {
        startTime: "22:00",
        endTime: "06:00",
        isOvernight: true,
        earlyCheckInWindowMinutes: 15,
      },
      timezone: "Asia/Kolkata",
    });

    expect(attendanceDate).toBe("2026-10-31");
  });
});
