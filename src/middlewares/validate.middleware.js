import { ApiError } from "../utils/ApiError.js";

const formatZodErrors = (issues) => {
  return issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
    code: issue.code,
  }));
};

export const validate = (schema) => {
  return async (req, res, next) => {
    const result = await schema.safeParseAsync({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      return next(
        new ApiError(
          400,
          "Validation failed.",
          formatZodErrors(result.error.issues),
        ),
      );
    }

    req.validated = result.data;

    next();
  };
};
