import crypto from "crypto";

export const requestIdMiddleware = (req, res, next) => {
  const incomingRequestId = req.headers["x-request-id"];

  const requestId =
    typeof incomingRequestId === "string" && incomingRequestId.trim()
      ? incomingRequestId
      : crypto.randomUUID();

  req.requestId = requestId;

  res.setHeader("X-Request-Id", requestId);

  next();
};
