import { Readable } from "node:stream";

import { configureCloudinary } from "../../config/cloudinary.js";
import { ApiError } from "../../utils/ApiError.js";

const PHOTO_PREFIX = "employee-management/attendance/photo-evidence/";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_URL_EXPIRY_SECONDS = 60;

export const getAttendancePhotoStream = async ({ imagePublicId }) => {
  if (
    typeof imagePublicId !== "string" ||
    !imagePublicId.startsWith(PHOTO_PREFIX)
  ) {
    throw new ApiError(404, "Attendance photo not found.");
  }

  const cloudinary = configureCloudinary();

  const expiresAt = Math.floor(Date.now() / 1000) + PHOTO_URL_EXPIRY_SECONDS;

  const signedUrl = cloudinary.utils.private_download_url(
    imagePublicId,
    "jpg",
    {
      resource_type: "image",
      type: "authenticated",
      expires_at: expiresAt,
    },
  );

  let response;

  try {
    response = await fetch(signedUrl, {
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      headers: {
        Accept: "image/jpeg",
      },
    });
  } catch {
    throw new ApiError(502, "Unable to retrieve attendance photo.");
  }

  if (response.status === 404) {
    await response.body?.cancel();
    throw new ApiError(404, "Attendance photo not found.");
  }

  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new ApiError(502, "Unable to retrieve attendance photo.");
  }

  const contentType = response.headers.get("content-type");

  if (!contentType?.toLowerCase().startsWith("image/jpeg")) {
    await response.body.cancel();
    throw new ApiError(502, "Unexpected attendance photo format.");
  }

  const contentLengthHeader = response.headers.get("content-length");

  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);

    if (
      !Number.isFinite(contentLength) ||
      contentLength < 0 ||
      contentLength > MAX_PHOTO_BYTES
    ) {
      await response.body.cancel();

      throw new ApiError(502, "Invalid attendance photo content length.");
    }
  }

  const source = Readable.fromWeb(response.body);

  async function* limitPhotoBytes() {
    let totalBytes = 0;

    for await (const chunk of source) {
      totalBytes += chunk.length;

      if (totalBytes > MAX_PHOTO_BYTES) {
        source.destroy();
        throw new ApiError(502, "Attendance photo exceeds delivery limit.");
      }

      yield chunk;
    }
  }

  return {
    stream: Readable.from(limitPhotoBytes()),
    contentType: "image/jpeg",
  };
};
