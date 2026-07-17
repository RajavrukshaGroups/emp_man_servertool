import mongoose from "mongoose";

import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

const handleMongooseValidationError = (error) => {
  const errors = Object.values(error.errors).map((item) => ({
    path: item.path,
    message: item.message,
  }));

  return new ApiError(400, "Database validation failed.", errors);
};

const handleDuplicateKeyError = (error) => {
  const duplicateFields = Object.keys(error.keyPattern || {});

  const errors = duplicateFields.map((field) => ({
    path: field,
    message: `${field} already exists.`,
  }));

  return new ApiError(409, "Duplicate value detected.", errors);
};

const handleInvalidObjectIdError = (error) => {
  return new ApiError(400, `Invalid value provided for ${error.path}.`);
};

export const errorHandler = (error, req, res, next) => {
  let normalizedError = error;

  if (error instanceof mongoose.Error.ValidationError) {
    normalizedError = handleMongooseValidationError(error);
  }

  if (error?.code === 11000) {
    normalizedError = handleDuplicateKeyError(error);
  }

  if (error instanceof mongoose.Error.CastError) {
    normalizedError = handleInvalidObjectIdError(error);
  }

  const statusCode = normalizedError.statusCode || 500;
  const message = normalizedError.message || "Internal server error.";

  const response = {
    success: false,
    statusCode,
    message,
    errors: normalizedError.errors || [],
  };

  if (!env.IS_PRODUCTION) {
    response.stack = normalizedError.stack;
  }

  res.status(statusCode).json(response);
};
