import Company from "../../modules/companies/company.model.js";

import { accrueBulkMonthlyLeaveBalances } from "../../modules/leave/leaveBalance.service.js";

/**
 * Resolve the YYYY-MM period in the company's timezone.
 */
const getCompanyPeriod = (date, timezone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const getPart = (type) => parts.find((part) => part.type === type)?.value;

  return `${getPart("year")}-${getPart("month")}`;
};

/**
 * Reconcile current-month leave accrual across active companies.
 *
 * Can run daily:
 * - Credits the current month if not already accrued.
 * - Recovers missed accruals later in the same month.
 * - Does not credit future months.
 * - Does not backfill earlier months.
 *
 * dryRun=true does not write to the database.
 */
export const processMonthlyLeaveAccrual = async ({
  now = new Date(),
  dryRun = true,
} = {}) => {
  const currentTime = new Date(now);

  if (Number.isNaN(currentTime.getTime())) {
    throw new Error("Invalid monthly accrual processing time.");
  }

  const summary = {
    scannedCompanies: 0,
    dueCompanies: 0,
    processedCompanies: 0,
    skippedCompanies: 0,
    accruedBalances: 0,
    alreadyAccruedBalances: 0,
    failedBalances: 0,
    errors: [],
  };

  const cursor = Company.find({
    status: "ACTIVE",
    isDeleted: false,
  })
    .select("_id name timezone")
    .lean()
    .cursor();

  for await (const company of cursor) {
    summary.scannedCompanies += 1;

    let periodKey = null;

    try {
      const timezone = company.timezone || "Asia/Kolkata";

      periodKey = getCompanyPeriod(currentTime, timezone);

      summary.dueCompanies += 1;

      if (dryRun) {
        console.log(`[MonthlyAccrual][DRY RUN] ${company.name}: ${periodKey}`);
        continue;
      }

      const result = await accrueBulkMonthlyLeaveBalances({
        companyId: company._id,
        periodDate: new Date(`${periodKey}-01T00:00:00.000Z`),
        requesterContext: {
          userId: null,
        },
      });

      summary.processedCompanies += 1;
      summary.accruedBalances += result.accrued;
      summary.alreadyAccruedBalances += result.alreadyAccrued;
      summary.failedBalances += result.failed;

      if (result.failed > 0) {
        summary.errors.push({
          companyId: company._id.toString(),
          companyName: company.name,
          periodKey,
          failures: result.failures,
        });
      }

      console.log(`[MonthlyAccrual] ${company.name} (${periodKey}):`, {
        accrued: result.accrued,
        alreadyAccrued: result.alreadyAccrued,
        failed: result.failed,
      });
    } catch (error) {
      summary.errors.push({
        companyId: company._id.toString(),
        companyName: company.name,
        periodKey,
        message: error.message,
      });

      console.error(`[MonthlyAccrual] Company ${company._id}:`, error);
    }
  }

  return summary;
};
