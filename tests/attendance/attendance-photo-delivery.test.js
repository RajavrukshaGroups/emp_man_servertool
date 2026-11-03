import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { configureCloudinaryMock, privateDownloadUrlMock } = vi.hoisted(() => ({
  configureCloudinaryMock: vi.fn(),
  privateDownloadUrlMock: vi.fn(),
}));

vi.mock("../../src/config/cloudinary.js", () => ({
  configureCloudinary: configureCloudinaryMock,
}));

import { getAttendancePhotoStream } from "../../src/modules/attendance/attendancePhotoDelivery.service.js";

const PHOTO_ID =
  "employee-management/attendance/photo-evidence/507f1f77bcf86cd799439011/test-photo";

const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff,
  0xd9,
]);

const makePhotoResponse = ({
  status = 200,
  contentType = "image/jpeg",
  bytes = JPEG_BYTES,
  contentLength,
} = {}) => {
  const headers = new Headers({
    "content-type": contentType,
  });

  if (contentLength !== undefined) {
    headers.set("content-length", String(contentLength));
  }

  return new Response(bytes, { status, headers });
};

const readStream = async (stream) => {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
};

describe("Attendance photo delivery service", () => {
  beforeEach(() => {
    privateDownloadUrlMock.mockReturnValue(
      "https://res.cloudinary.com/test/image/authenticated/test-photo.jpg",
    );

    configureCloudinaryMock.mockReturnValue({
      utils: {
        private_download_url: privateDownloadUrlMock,
      },
    });

    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("streams a valid JPEG without exposing the signed URL", async () => {
    fetch.mockResolvedValue(makePhotoResponse());

    const result = await getAttendancePhotoStream({
      imagePublicId: PHOTO_ID,
    });

    const receivedBytes = await readStream(result.stream);

    expect(result.contentType).toBe("image/jpeg");
    expect(receivedBytes.equals(JPEG_BYTES)).toBe(true);
    expect(result).not.toHaveProperty("signedUrl");
    expect(result).not.toHaveProperty("imagePublicId");

    expect(privateDownloadUrlMock).toHaveBeenCalledWith(
      PHOTO_ID,
      "jpg",
      expect.objectContaining({
        resource_type: "image",
        type: "authenticated",
        expires_at: expect.any(Number),
      }),
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        redirect: "error",
        headers: {
          Accept: "image/jpeg",
        },
      }),
    );
  });

  it("rejects an invalid Cloudinary photo identifier", async () => {
    await expect(
      getAttendancePhotoStream({
        imagePublicId: "invalid-photo-id",
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 404 when Cloudinary cannot find the photo", async () => {
    fetch.mockResolvedValue(
      makePhotoResponse({
        status: 404,
      }),
    );

    await expect(
      getAttendancePhotoStream({
        imagePublicId: PHOTO_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("rejects non-JPEG content types", async () => {
    fetch.mockResolvedValue(
      makePhotoResponse({
        contentType: "image/png",
      }),
    );

    await expect(
      getAttendancePhotoStream({
        imagePublicId: PHOTO_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("rejects photos exceeding the Content-Length limit", async () => {
    fetch.mockResolvedValue(
      makePhotoResponse({
        contentLength: 6 * 1024 * 1024,
      }),
    );

    await expect(
      getAttendancePhotoStream({
        imagePublicId: PHOTO_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("rejects malformed Content-Length headers", async () => {
    fetch.mockResolvedValue(
      makePhotoResponse({
        contentLength: "invalid",
      }),
    );

    await expect(
      getAttendancePhotoStream({
        imagePublicId: PHOTO_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("rejects a download failure", async () => {
    fetch.mockRejectedValue(new Error("Network failure"));

    await expect(
      getAttendancePhotoStream({
        imagePublicId: PHOTO_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("rejects an oversized photo during streaming", async () => {
    const oversizedBytes = Buffer.alloc(6 * 1024 * 1024, 0xff);

    fetch.mockResolvedValue(
      makePhotoResponse({
        bytes: oversizedBytes,
      }),
    );

    const result = await getAttendancePhotoStream({
      imagePublicId: PHOTO_ID,
    });

    await expect(readStream(result.stream)).rejects.toMatchObject({
      statusCode: 502,
    });
  });
});
