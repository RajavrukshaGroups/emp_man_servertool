import { afterAll, beforeAll, describe, expect, it } from "vitest";

import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import AttendancePhotoEvidence from "../../src/modules/attendance/attendancePhotoEvidence.model.js";

import { consumeCheckInPhotoEvidence } from "../../src/modules/attendance/attendancePhotoEvidence.consume.js";

describe("Attendance CHECK_IN photo evidence consumption", () => {
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
      attendanceId: null,
      workSessionId: null,
      fieldVisitId: null,
      action: "CHECK_IN",
      imagePublicId: "test/checkin/photo",
      imageAssetId: "test-checkin-asset",
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
      return consumeCheckInPhotoEvidence({
        evidenceId: fixture.evidence._id,
        companyId: fixture.companyId,
        companyAccessId: fixture.companyAccessId,
        attendanceId: fixture.attendanceId,
        workSessionId: fixture.workSessionId,
        session,
        ...overrides,
      });
    });
  };

  it("consumes and binds valid CHECK_IN evidence", async () => {
    const fixture = await createPendingEvidence();

    const result = await consume(fixture);

    expect(result.status).toBe("CAPTURED");
    expect(result.imagePublicId).toBe("test/checkin/photo");
    expect(result.imageAssetId).toBe("test-checkin-asset");

    const updated = await AttendancePhotoEvidence.findById(
      fixture.evidence._id,
    );

    expect(updated.status).toBe("CONSUMED");
    expect(updated.consumedAt).toBeInstanceOf(Date);

    expect(updated.attendanceId.toString()).toBe(
      fixture.attendanceId.toString(),
    );

    expect(updated.workSessionId.toString()).toBe(
      fixture.workSessionId.toString(),
    );
  });

  it("rejects evidence belonging to another company", async () => {
    const fixture = await createPendingEvidence();

    await expect(
      consume(fixture, {
        companyId: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const updated = await AttendancePhotoEvidence.findById(
      fixture.evidence._id,
    );

    expect(updated.status).toBe("PENDING");
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

  it("rejects evidence uploaded for another action", async () => {
    const fixture = await createPendingEvidence({
      action: "CHECK_OUT",
    });

    await expect(consume(fixture)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("rejects evidence already bound to an attendance", async () => {
    const fixture = await createPendingEvidence({
      attendanceId: new mongoose.Types.ObjectId(),
    });

    await expect(consume(fixture)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("rejects evidence already bound to a work session", async () => {
    const fixture = await createPendingEvidence({
      workSessionId: new mongoose.Types.ObjectId(),
    });

    await expect(consume(fixture)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("rejects evidence bound to a field visit", async () => {
    const fixture = await createPendingEvidence({
      fieldVisitId: new mongoose.Types.ObjectId(),
    });

    await expect(consume(fixture)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("rejects invalid photo evidence IDs", async () => {
    const fixture = await createPendingEvidence();

    await expect(
      consume(fixture, {
        evidenceId: "invalid-id",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("requires a database transaction", async () => {
    const fixture = await createPendingEvidence();

    await expect(
      consumeCheckInPhotoEvidence({
        evidenceId: fixture.evidence._id,
        companyId: fixture.companyId,
        companyAccessId: fixture.companyAccessId,
        attendanceId: fixture.attendanceId,
        workSessionId: fixture.workSessionId,
        session: null,
      }),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it("rolls back consumption and binding when transaction fails", async () => {
    const fixture = await createPendingEvidence();

    await expect(
      mongoose.connection.transaction(async (session) => {
        await consumeCheckInPhotoEvidence({
          evidenceId: fixture.evidence._id,
          companyId: fixture.companyId,
          companyAccessId: fixture.companyAccessId,
          attendanceId: fixture.attendanceId,
          workSessionId: fixture.workSessionId,
          session,
        });

        throw new Error("Simulated CHECK_IN failure");
      }),
    ).rejects.toThrow("Simulated CHECK_IN failure");

    const updated = await AttendancePhotoEvidence.findById(
      fixture.evidence._id,
    );

    expect(updated.status).toBe("PENDING");
    expect(updated.consumedAt).toBeNull();
    expect(updated.attendanceId).toBeNull();
    expect(updated.workSessionId).toBeNull();
  });
});
