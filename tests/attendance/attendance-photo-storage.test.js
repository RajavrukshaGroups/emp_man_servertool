import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import sharp from "sharp";

import { uploadAttendancePhoto } from "../../src/modules/attendance/attendanceFaceStorage.service.js";

describe("Attendance photo storage validation", () => {
  it("rejects corrupted JPEG image contents", async () => {
    const companyId = new mongoose.Types.ObjectId();
    const companyAccessId = new mongoose.Types.ObjectId();

    const corruptedImage = Buffer.from(
      "This is not a real JPEG image.",
      "utf8",
    );

    await expect(
      uploadAttendancePhoto({
        companyId,
        companyAccessId,
        action: "CHECK_IN",
        imageBuffer: corruptedImage,
      }),
    ).rejects.toThrow();
  });
  it("rejects images below the minimum resolution", async () => {
    const companyId = new mongoose.Types.ObjectId();
    const companyAccessId = new mongoose.Types.ObjectId();

    const smallImage = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: {
          r: 120,
          g: 160,
          b: 200,
        },
      },
    })
      .jpeg()
      .toBuffer();

    await expect(
      uploadAttendancePhoto({
        companyId,
        companyAccessId,
        action: "CHECK_IN",
        imageBuffer: smallImage,
      }),
    ).rejects.toThrow("Image resolution is too low.");
  });

  it("rejects images exceeding the 15 MB size limit", async () => {
    const companyId = new mongoose.Types.ObjectId();
    const companyAccessId = new mongoose.Types.ObjectId();

    const oversizedImage = Buffer.alloc(15 * 1024 * 1024 + 1, 0);

    await expect(
      uploadAttendancePhoto({
        companyId,
        companyAccessId,
        action: "CHECK_IN",
        imageBuffer: oversizedImage,
      }),
    ).rejects.toThrow("Image exceeds the permitted size.");
  });
});
