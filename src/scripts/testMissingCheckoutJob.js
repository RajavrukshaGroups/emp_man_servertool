import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { processMissingCheckouts } from "../jobs/attendance/missingCheckout.job.js";

const main = async () => {
  try {
    await connectDatabase();

    const result = await processMissingCheckouts({
      dryRun: false,
    });

    console.log("Missing checkout write-test result:");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Missing checkout test failed:", error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
};

main();
