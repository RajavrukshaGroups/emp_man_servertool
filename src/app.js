import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import hpp from "hpp";
import morgan from "morgan";

import { env } from "./config/env.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { notFoundHandler } from "./middlewares/not-found.middleware.js";
import { requestIdMiddleware } from "./middlewares/request-id.middleware.js";
import apiRoutes from "./routes/index.js";

const app = express();

app.disable("x-powered-by");

if (env.IS_PRODUCTION) {
  app.set("trust proxy", 1);
}

app.use(requestIdMiddleware);

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Company-Id",
      "X-Request-Id",
    ],
  })
);

app.use(helmet());
app.use(hpp());
app.use(compression());

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(cookieParser());

if (!env.IS_PRODUCTION) {
  app.use(morgan("dev"));
}

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Employee Management Server",
  });
});

app.use("/api/v1", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;