import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import AttendancePhotoEvidence from "../../src/modules/attendance/attendancePhotoEvidence.model.js";
import { consumeAttendancePhotoEvidence } from "../../src/modules/attendance/attendancePhotoEvidence.consume.js";

describe("Attendance photo evidence consumption", () => {
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

  const createPendingEvidence = async (overrides = {}) => {
    const companyId = new mongoose.Types.ObjectId();
    const companyAccessId = new mongoose.Types.ObjectId();
    const attendanceId = new mongoose.Types.ObjectId();
    const workSessionId = new mongoose.Types.ObjectId();

    const evidence = await AttendancePhotoEvidence.create({
      companyId,
      companyAccessId,
      attendanceId,
      workSessionId,
      fieldVisitId: null,
      action: "CHECK_OUT",
      imagePublicId: "test/photo/public-id",
      imageAssetId: "test-asset-id",
      status: "PENDING",
      capturedAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      ...overrides,
    });

    return {
      evidence,
      companyId,
      companyAccessId,
      attendanceId,
      workSessionId,
    };
  };

  const consume = async (fixture, overrides = {}) => {
    return mongoose.connection.transaction(async (session) => {
      return consumeAttendancePhotoEvidence({
        evidenceId: fixture.evidence._id,
        companyId: fixture.companyId,
        companyAccessId: fixture.companyAccessId,
        attendanceId: fixture.attendanceId,
        workSessionId: fixture.workSessionId,
        fieldVisitId: null,
        action: "CHECK_OUT",
        session,
        ...overrides,
      });
    });
  };

  it("consumes valid pending evidence", async () => {
    const fixture = await createPendingEvidence();

    const result = await consume(fixture);

    expect(result.status).toBe("CAPTURED");
    expect(result.imagePublicId).toBe("test/photo/public-id");
    expect(result.imageAssetId).toBe("test-asset-id");

    const updated = await AttendancePhotoEvidence.findById(
      fixture.evidence._id,
    );

    expect(updated.status).toBe("CONSUMED");
    expect(updated.consumedAt).toBeInstanceOf(Date);
  });

  it("rejects evidence belonging to another company", async () => {
    const fixture = await createPendingEvidence();

    await expect(
      consume(fixture, {
        companyId: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const unchanged = await AttendancePhotoEvidence.findById(
      fixture.evidence._id,
    );

    expect(unchanged.status).toBe("PENDING");
  });

  it("rejects evidence belonging to another employee", async () => {
    const fixture = await createPendingEvidence();

    await expect(
      consume(fixture, {
        companyAccessId: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects expired evidence", async () => {
    const fixture = await createPendingEvidence({
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expect(consume(fixture)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("prevents consuming the same evidence twice", async () => {
    const fixture = await createPendingEvidence();

    await consume(fixture);

    await expect(consume(fixture)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("rolls back consumption when the transaction fails", async () => {
    const fixture = await createPendingEvidence();

    await expect(
      mongoose.connection.transaction(async (session) => {
        await consumeAttendancePhotoEvidence({
          evidenceId: fixture.evidence._id,
          companyId: fixture.companyId,
          companyAccessId: fixture.companyAccessId,
          attendanceId: fixture.attendanceId,
          workSessionId: fixture.workSessionId,
          fieldVisitId: null,
          action: "CHECK_OUT",
          session,
        });

        throw new Error("Simulated attendance failure");
      }),
    ).rejects.toThrow("Simulated attendance failure");

    const updated = await AttendancePhotoEvidence.findById(
      fixture.evidence._id,
    );

    expect(updated.status).toBe("PENDING");
    expect(updated.consumedAt).toBeNull();
  });
  it("rejects evidence for a different attendance action", async () => {
    const fixture = await createPendingEvidence();

    await expect(
      consume(fixture, {
        action: "FIELD_VISIT_START",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const unchanged = await AttendancePhotoEvidence.findById(
      fixture.evidence._id,
    );

    expect(unchanged.status).toBe("PENDING");
  });

  it("rejects evidence for a different attendance record", async () => {
    const fixture = await createPendingEvidence();

    await expect(
      consume(fixture, {
        attendanceId: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects evidence for a different work session", async () => {
    const fixture = await createPendingEvidence();

    await expect(
      consume(fixture, {
        workSessionId: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects evidence with a mismatched field visit", async () => {
    const fixture = await createPendingEvidence();

    await expect(
      consume(fixture, {
        fieldVisitId: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
