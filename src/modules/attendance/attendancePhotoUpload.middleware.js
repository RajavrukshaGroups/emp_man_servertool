import multer from "multer";

import { ApiError } from "../../utils/ApiError.js";

/**
 * ============================================================
 * ATTENDANCE PHOTO UPLOAD
 * ============================================================
 *
 * Accept one photograph using multipart/form-data.
 *
 * Field name: photo
 *
 * Files are stored temporarily in memory.
 * Sharp will validate the actual image contents.
 */
const storage = multer.memoryStorage();

const upload = multer({
  storage,

  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 1,
    fields: 3,
    parts: 4,
  },

  fileFilter: (_req, file, callback) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new ApiError(400, "Only JPEG, PNG and WEBP photographs are supported."),
      );
    }

    return callback(null, true);
  },
}).single("photo");

/**
 * Normalize Multer errors into API errors.
 */
export const uploadAttendancePhotoMiddleware = (req, res, next) => {
  upload(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        return next(
          new ApiError(
            400,
            `Invalid attendance photo upload: ${error.message}`,
          ),
        );
      }

      return next(error);
    }

    if (!req.file?.buffer) {
      return next(new ApiError(400, "Attendance photograph is required."));
    }

    return next();
  });
};
