import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { configureCloudinary } from "../../config/cloudinary.js";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export async function uploadAttendanceFaceImage({
  companyId,
  companyAccessId,
  imageBuffer,
}) {
  if (!companyId || !companyAccessId || !Buffer.isBuffer(imageBuffer)) {
    throw new Error("Invalid facial image upload parameters.");
  }

  if (imageBuffer.length === 0 || imageBuffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Facial image exceeds the permitted size.");
  }

  const metadata = await sharp(imageBuffer, {
    limitInputPixels: 20_000_000,
    failOn: "error",
  }).metadata();

  if (!["jpeg", "png", "webp"].includes(metadata.format)) {
    throw new Error("Unsupported facial image format.");
  }

  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width < 320 ||
    metadata.height < 320
  ) {
    throw new Error("Facial image resolution is too low.");
  }

  const processedImage = await sharp(imageBuffer, {
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

  const cloudinary = configureCloudinary();

  const folder = [
    "employee-management",
    "attendance",
    "face-enrollment",
    String(companyId),
    String(companyAccessId),
  ].join("/");

  const publicId = randomUUID();

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        type: "authenticated",
        overwrite: false,
        invalidate: true,
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
}
