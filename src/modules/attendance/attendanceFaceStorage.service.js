import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import mongoose from "mongoose";

import { configureCloudinary } from "../../config/cloudinary.js";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const PHOTO_ACTIONS = Object.freeze({
  CHECK_IN: "check-in",
  CHECK_OUT: "check-out",
  FIELD_VISIT_START: "field-visit-start",
  FIELD_VISIT_END: "field-visit-end",
});

const processImage = async (imageBuffer) => {
  if (!Buffer.isBuffer(imageBuffer)) {
    throw new Error("A valid image buffer is required.");
  }

  if (imageBuffer.length === 0 || imageBuffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image exceeds the permitted size.");
  }

  const metadata = await sharp(imageBuffer, {
    limitInputPixels: 20_000_000,
    failOn: "error",
  }).metadata();

  if (!["jpeg", "png", "webp"].includes(metadata.format)) {
    throw new Error("Unsupported image format.");
  }

  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width < 320 ||
    metadata.height < 320
  ) {
    throw new Error("Image resolution is too low.");
  }

  return sharp(imageBuffer, {
    limitInputPixels: 20_000_000,
    failOn: "error",
  })
    .rotate()
    .resize({
      width: 1280,
      height: 1280,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 85,
      mozjpeg: true,
    })
    .toBuffer();
};

const uploadProtectedImage = async ({ folder, imageBuffer }) => {
  const processedImage = await processImage(imageBuffer);

  const cloudinary = configureCloudinary();

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: randomUUID(),
        resource_type: "image",
        type: "authenticated",
        overwrite: false,
      },
      (error, uploaded) => {
        if (error) {
          reject(error);
          return;
        }

        if (!uploaded) {
          reject(new Error("Cloudinary returned no upload result."));
          return;
        }

        resolve(uploaded);
      },
    );

    pipeline(Readable.from([processedImage]), uploadStream).catch(reject);
  });

  return {
    imagePublicId: result.public_id,
    imageAssetId: result.asset_id,
  };
};

const validateEmployeeContext = ({ companyId, companyAccessId }) => {
  if (
    !mongoose.isObjectIdOrHexString(companyId) ||
    !mongoose.isObjectIdOrHexString(companyAccessId)
  ) {
    throw new Error("Valid company and employee access IDs are required.");
  }
};

/**
 * Existing facial enrollment storage.
 *
 * Retained for compatibility with the previously
 * created enrollment model and future integrations.
 */
export const uploadAttendanceFaceImage = async ({
  companyId,
  companyAccessId,
  imageBuffer,
}) => {
  validateEmployeeContext({
    companyId,
    companyAccessId,
  });

  const folder = [
    "employee-management",
    "attendance",
    "face-enrollment",
    String(companyId),
    String(companyAccessId),
  ].join("/");

  return uploadProtectedImage({
    folder,
    imageBuffer,
  });
};

/**
 * Store photo evidence for attendance actions.
 *
 * IMPORTANT:
 * - This service only uploads images.
 * - It does not verify liveness or employee identity.
 * - Authorization must be enforced by the caller.
 * - Do not accept action or employee identity directly
 *   from an untrusted request without validation.
 */
export const uploadAttendancePhoto = async ({
  companyId,
  companyAccessId,
  action,
  imageBuffer,
}) => {
  validateEmployeeContext({
    companyId,
    companyAccessId,
  });

  if (!Object.hasOwn(PHOTO_ACTIONS, action)) {
    throw new Error("Unsupported attendance photo action.");
  }

  const folder = [
    "employee-management",
    "attendance",
    "photo-evidence",
    String(companyId),
    String(companyAccessId),
    PHOTO_ACTIONS[action],
  ].join("/");

  return uploadProtectedImage({
    folder,
    imageBuffer,
  });
};

/**
 * ============================================================
 * DELETE ATTENDANCE PHOTO EVIDENCE
 * ============================================================
 *
 * Used for cleanup when an uploaded photograph
 * cannot be associated with a valid evidence record.
 *
 * Only trusted backend services should call this.
 */
export const deleteAttendancePhoto = async ({ imagePublicId }) => {
  if (
    typeof imagePublicId !== "string" ||
    !imagePublicId.startsWith("employee-management/attendance/photo-evidence/")
  ) {
    throw new Error("Invalid attendance photo evidence public ID.");
  }

  const cloudinary = configureCloudinary();

  const result = await cloudinary.uploader.destroy(imagePublicId, {
    resource_type: "image",
    type: "authenticated",
    invalidate: true,
  });

  if (result?.result !== "ok" && result?.result !== "not found") {
    throw new Error("Cloudinary attendance photo deletion failed.");
  }

  return {
    deleted: result.result === "ok",
    alreadyMissing: result.result === "not found",
  };
};

export { PHOTO_ACTIONS };
