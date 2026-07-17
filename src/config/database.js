import mongoose from "mongoose";

import { env } from "./env.js";

export const connectDatabase = async () => {
  try {
    mongoose.set("strictQuery", true);

    const connection = await mongoose.connect(env.MONGODB_URI, {
      autoIndex: !env.IS_PRODUCTION,
    });

    console.log(
      `MongoDB connected successfully: ${connection.connection.host}`
    );
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
};

export const disconnectDatabase = async () => {
  try {
    await mongoose.disconnect();
    console.log("MongoDB disconnected successfully.");
  } catch (error) {
    console.error("MongoDB disconnection failed:", error.message);
  }
};