export class ApiError extends Error {
  constructor(
    statusCode,
    message = "Something went wrong.",
    errors = [],
    stack = ""
  ) {
    super(message);

    this.name = "ApiError";
    this.statusCode = statusCode;
    this.success = false;
    this.errors = errors;
    this.data = null;
    this.isOperational = true;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}