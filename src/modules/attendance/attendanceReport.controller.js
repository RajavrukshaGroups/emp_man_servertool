import { getMonthlyAttendanceReport } from "./attendanceReport.service.js";

import { getAttendanceRequesterContext } from "./attendance.scope.js";

/**
 * ============================================================
 * GET MONTHLY ATTENDANCE REPORT
 * ============================================================
 *
 * GET /companies/:companyId/attendance/reports/monthly
 *
 * Scope:
 * - COMPANY: company-wide
 * - DEPARTMENT: department
 * - TEAM: managed teams + self
 *
 * Permission checks are enforced by route middleware.
 */

export const getMonthlyReport = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const report = await getMonthlyAttendanceReport({
      companyId,
      query: req.validated.query,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Monthly attendance report fetched successfully.",
      data: report,
    });
  } catch (error) {
    return next(error);
  }
};
