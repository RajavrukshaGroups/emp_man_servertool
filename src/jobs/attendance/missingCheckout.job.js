import Attendance from "../../modules/attendance/attendance.model.js";
import AttendancePolicy from "../../modules/attendance/attendancePolicy.model.js";

const MINUTE_MS = 60 * 1000;

/**
 * Detect expired open attendance sessions.
 *
 * This first version only flags missing checkouts.
 * It never invents checkout timestamps or changes worked minutes.
 */
export const processMissingCheckouts = async ({
  now = new Date(),
  dryRun = true,
} = {}) => {
  const currentTime = new Date(now);

  if (Number.isNaN(currentTime.getTime())) {
    throw new Error("Invalid processing time.");
  }

  const summary = {
    scanned: 0,
    eligible: 0,
    flagged: 0,
    skipped: 0,
    errors: 0,
  };

  const cursor = Attendance.find({
    isDeleted: false,
    workSessions: {
      $elemMatch: {
        status: "OPEN",
        checkOutAt: null,
      },
    },
  }).cursor();

  for await (const attendance of cursor) {
    summary.scanned += 1;

    try {
      const policy = await AttendancePolicy.findOne({
        _id: attendance.attendancePolicyId,
        companyId: attendance.companyId,
        isDeleted: false,
      }).lean();

      if (!policy) {
        summary.skipped += 1;
        continue;
      }

      // AUTO_CLOSE requires a separate policy-aware implementation.
      if (policy.missingCheckoutAction === "AUTO_CLOSE") {
        summary.skipped += 1;
        continue;
      }

      const maxOpenMinutes = Number(policy.maximumOpenSessionMinutes);

      if (!Number.isFinite(maxOpenMinutes) || maxOpenMinutes <= 0) {
        summary.skipped += 1;
        continue;
      }

      const expiredSessions = attendance.workSessions.filter((session) => {
        if (session.status !== "OPEN" || session.checkOutAt) {
          return false;
        }

        const checkInTime = new Date(session.checkInAt).getTime();

        return (
          Number.isFinite(checkInTime) &&
          currentTime.getTime() - checkInTime >= maxOpenMinutes * MINUTE_MS
        );
      });

      if (expiredSessions.length === 0) {
        summary.skipped += 1;
        continue;
      }

      summary.eligible += 1;

      const hasOpenAnomaly = attendance.anomalies.some(
        (anomaly) =>
          anomaly.type === "MISSING_CHECKOUT" && anomaly.status === "OPEN",
      );

      if (hasOpenAnomaly) {
        summary.skipped += 1;
        continue;
      }

      if (dryRun) {
        summary.flagged += 1;
        continue;
      }

      const result = await Attendance.updateOne(
        {
          _id: attendance._id,
          companyId: attendance.companyId,
          isDeleted: false,

          workSessions: {
            $elemMatch: {
              status: "OPEN",
              checkOutAt: null,
              checkInAt: {
                $lte: new Date(
                  currentTime.getTime() - maxOpenMinutes * MINUTE_MS,
                ),
              },
            },
          },

          anomalies: {
            $not: {
              $elemMatch: {
                type: "MISSING_CHECKOUT",
                status: "OPEN",
              },
            },
          },
        },
        {
          $push: {
            anomalies: {
              type: "MISSING_CHECKOUT",
              status: "OPEN",
              description:
                "An attendance work session exceeded the maximum allowed open duration without checkout.",
              detectedAt: currentTime,
            },
          },
          $set: {
            calculationStatus: "RECALCULATION_REQUIRED",
          },
        },
      );

      if (result.modifiedCount === 1) {
        summary.flagged += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (error) {
      summary.errors += 1;
      console.error(`[MissingCheckout] Attendance ${attendance._id}:`, error);
    }
  }

  return summary;
};
