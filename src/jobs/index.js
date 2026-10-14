import cron from "node-cron";

import { processMissingCheckouts } from "./attendance/missingCheckout.job.js";
import { processMonthlyLeaveAccrual } from "./leave/monthlyAccrual.job.js";

let missingCheckoutTask = null;
let monthlyAccrualTask = null;

let isMissingCheckoutRunning = false;
let isMonthlyAccrualRunning = false;

export const startBackgroundJobs = () => {
  const enableMissingCheckout =
    process.env.ENABLE_MISSING_CHECKOUT_JOB === "true";

  const enableMonthlyAccrual =
    process.env.ENABLE_MONTHLY_ACCRUAL_JOB === "true";

  // Attendance: every 15 minutes.
  if (enableMissingCheckout && !missingCheckoutTask) {
    missingCheckoutTask = cron.schedule(
      "*/15 * * * *",
      async () => {
        if (isMissingCheckoutRunning) {
          console.log("[Jobs] Previous missing-checkout job is still running.");
          return;
        }

        isMissingCheckoutRunning = true;

        try {
          console.log("[Jobs] Starting missing-checkout detection...");

          const result = await processMissingCheckouts({
            dryRun: false,
          });

          console.log("[Jobs] Missing-checkout detection completed:", result);
        } catch (error) {
          console.error("[Jobs] Missing-checkout detection failed:", error);
        } finally {
          isMissingCheckoutRunning = false;
        }
      },
      {
        timezone: "UTC",
        noOverlap: true,
      },
    );

    console.log("[Jobs] Missing-checkout job scheduled every 15 minutes.");
  } else if (!enableMissingCheckout) {
    console.log("[Jobs] Missing-checkout job disabled.");
  }

  // Leave: daily reconciliation at 00:30 UTC.
  if (enableMonthlyAccrual && !monthlyAccrualTask) {
    monthlyAccrualTask = cron.schedule(
      "30 0 * * *",
      async () => {
        if (isMonthlyAccrualRunning) {
          console.log("[Jobs] Previous monthly-accrual job is still running.");
          return;
        }

        isMonthlyAccrualRunning = true;

        try {
          console.log(
            "[Jobs] Starting monthly leave accrual reconciliation...",
          );

          const result = await processMonthlyLeaveAccrual({
            dryRun: false,
          });

          console.log("[Jobs] Monthly leave accrual completed:", result);
        } catch (error) {
          console.error("[Jobs] Monthly leave accrual failed:", error);
        } finally {
          isMonthlyAccrualRunning = false;
        }
      },
      {
        timezone: "UTC",
        noOverlap: true,
      },
    );

    console.log("[Jobs] Monthly leave accrual scheduled daily at 00:30 UTC.");
  } else if (!enableMonthlyAccrual) {
    console.log("[Jobs] Monthly leave accrual job disabled.");
  }
};

export const stopBackgroundJobs = async () => {
  if (missingCheckoutTask) {
    await missingCheckoutTask.stop();
    await missingCheckoutTask.destroy();
    missingCheckoutTask = null;
  }

  if (monthlyAccrualTask) {
    await monthlyAccrualTask.stop();
    await monthlyAccrualTask.destroy();
    monthlyAccrualTask = null;
  }

  console.log("[Jobs] Background jobs stopped.");
};
