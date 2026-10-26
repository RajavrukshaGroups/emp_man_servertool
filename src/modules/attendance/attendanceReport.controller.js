import { getMonthlyAttendanceReport } from "./attendanceReport.service.js";

import { getAttendanceRequesterContext } from "./attendance.scope.js";

import { generateMonthlyAttendanceExcel } from "./attendanceReport.export.service.js";

import { generateMonthlyAttendancePdf } from "./attendanceReport.pdf.service.js";

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

export const exportMonthlyReportExcel = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const { buffer, filename } = await generateMonthlyAttendanceExcel({
      companyId,
      query: req.validated.query,
      requesterContext,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.setHeader("Cache-Control", "private, no-store");

    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    return next(error);
  }
};

export const exportMonthlyReportPdf = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const { buffer, filename } = await generateMonthlyAttendancePdf({
      companyId,
      query: req.validated.query,
      requesterContext,
    });

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    res.setHeader("Cache-Control", "private, no-store");

    return res.status(200).send(buffer);
  } catch (error) {
    return next(error);
  }
};
