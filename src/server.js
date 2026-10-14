import http from "http";

import app from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { startBackgroundJobs, stopBackgroundJobs } from "./jobs/index.js";

const server = http.createServer(app);

// Enable only for the designated scheduler instance.
const ENABLE_BACKGROUND_JOBS = process.env.ENABLE_BACKGROUND_JOBS === "true";

const startServer = async () => {
  try {
    await connectDatabase();

    server.listen(env.PORT, () => {
      console.log(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);

      console.log(`Health check: http://localhost:${env.PORT}/api/v1/health`);

      if (ENABLE_BACKGROUND_JOBS) {
        startBackgroundJobs();
      } else {
        console.log("[Jobs] Background jobs disabled.");
      }
    });
  } catch (error) {
    console.error("Unable to start server:", error);
    process.exit(1);
  }
};

let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;

  isShuttingDown = true;

  console.log(`\n${signal} received. Starting graceful shutdown...`);

  try {
    // Stop scheduling new executions before disconnecting MongoDB.
    await stopBackgroundJobs();

    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    await disconnectDatabase();

    console.log("HTTP server closed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Graceful shutdown failed:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

startServer();
