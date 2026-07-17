import http from "http";

import app from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

const server = http.createServer(app);

const startServer = async () => {
  try {
    await connectDatabase();

    server.listen(env.PORT, () => {
      console.log(
        `Server running in ${env.NODE_ENV} mode on port ${env.PORT}`
      );
      console.log(
        `Health check: http://localhost:${env.PORT}/api/v1/health`
      );
    });
  } catch (error) {
    console.error("Unable to start server:", error);
    process.exit(1);
  }
};

const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    await disconnectDatabase();

    console.log("HTTP server closed successfully.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10_000).unref();
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