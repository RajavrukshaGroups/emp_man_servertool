import ExcelJS from "exceljs";

import { getMonthlyAttendanceReport } from "./attendanceReport.service.js";

import { resolveAttendanceExportMetadata } from "./attendanceReport.exportMetadata.js";

const EXPORT_BATCH_SIZE = 100;

const STATUS_CODES = {
  PRESENT: "P",
  HALF_DAY: "HD",
  ABSENT: "A",
  PENDING: "IN",
  ON_LEAVE: "L",
  PARTIAL_LEAVE: "PL",
  HOLIDAY: "H",
  WEEKLY_OFF: "WO",
  NOT_CHECKED_IN: "NC",
  NO_ATTENDANCE_RECORDED: "NR",
  UPCOMING: "—",
  NOT_EMPLOYED: "NE",
};

const ATTENDANCE_COLORS = {
  P: { background: "FFDCFCE7", text: "FF166534" },
  A: { background: "FFFEE2E2", text: "FF991B1B" },
  HD: { background: "FFFFEDD5", text: "FF9A3412" },
  L: { background: "FFDBEAFE", text: "FF1D4ED8" },
  PL: { background: "FFE0F2FE", text: "FF0369A1" },
  H: { background: "FFF3E8FF", text: "FF7E22CE" },
  WO: { background: "FFF1F5F9", text: "FF475569" },
  IN: { background: "FFFEF9C3", text: "FF854D0E" },
  NC: { background: "FFFECACA", text: "FFB91C1C" },
  NR: { background: "FFFFF7ED", text: "FF9A3412" },
  NE: { background: "FFE5E7EB", text: "FF6B7280" },
  "—": { background: "FFF8FAFC", text: "FF94A3B8" },
};

const applyAttendanceCellStyle = (cell) => {
  const value = String(cell.value ?? "").trim();
  const status = value.replace(/\*$/, "");

  const colors = ATTENDANCE_COLORS[status];
  if (!colors) return;

  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: colors.background },
  };

  cell.font = {
    bold: true,
    color: { argb: colors.text },
  };

  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
  };
};

const minutesToHours = (minutes) =>
  Number((Number(minutes || 0) / 60).toFixed(2));

export const loadMonthlyAttendanceExportData = async ({
  companyId,
  query,
  requesterContext,
}) => {
  const baseQuery = {
    month: query.month,
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.teamId ? { teamId: query.teamId } : {}),
    ...(query.search ? { search: query.search } : {}),
  };

  const firstPage = await getMonthlyAttendanceReport({
    companyId,
    requesterContext,
    query: {
      ...baseQuery,
      page: 1,
      limit: EXPORT_BATCH_SIZE,
    },
  });

  const items = [...firstPage.items];
  const totalPages = firstPage.pagination.totalPages;

  for (let page = 2; page <= totalPages; page++) {
    const result = await getMonthlyAttendanceReport({
      companyId,
      requesterContext,
      query: {
        ...baseQuery,
        page,
        limit: EXPORT_BATCH_SIZE,
      },
    });

    items.push(...result.items);
  }

  return {
    ...firstPage,
    items,
  };
};

export const generateMonthlyAttendanceExcel = async ({
  companyId,
  query,
  requesterContext,
}) => {
  const report = await loadMonthlyAttendanceExportData({
    companyId,
    query,
    requesterContext,
  });

  const { departmentName, teamName } = await resolveAttendanceExportMetadata({
    companyId,
    query,
    requesterContext,
  });

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Employee Management Software";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Monthly Attendance", {
    views: [{ state: "frozen", xSplit: 4, ySplit: 5 }],
  });

  const fixedColumns = [
    { header: "Employee Code", key: "employeeCode", width: 18 },
    { header: "Employee Name", key: "employeeName", width: 28 },
    { header: "Department", key: "department", width: 22 },
    { header: "Team", key: "team", width: 22 },
  ];

  const dateColumns = report.dates.map((date) => ({
    header: date.slice(-2),
    key: `day_${date}`,
    width: 7,
  }));

  const totalColumns = [
    { header: "Present", key: "present", width: 12 },
    { header: "Half Day", key: "halfDay", width: 12 },
    { header: "Absent", key: "absent", width: 12 },
    { header: "Leave", key: "onLeave", width: 12 },
    { header: "Partial Leave", key: "partialLeave", width: 16 },
    { header: "Missing", key: "missingAttendance", width: 12 },
    { header: "Worked Hours", key: "workedHours", width: 16 },
    { header: "Break Hours", key: "breakHours", width: 16 },
    { header: "Late Days", key: "lateDays", width: 12 },
    { header: "Early Checkout", key: "earlyCheckoutDays", width: 18 },
    { header: "Paid Leave Days", key: "paidLeaveDays", width: 18 },
    { header: "Unpaid Leave Days", key: "unpaidLeaveDays", width: 20 },
  ];

  sheet.columns = [...fixedColumns, ...dateColumns, ...totalColumns];

  const columnCount = sheet.columnCount;

  sheet.mergeCells(1, 1, 1, columnCount);
  sheet.getCell("A1").value = "MONTHLY ATTENDANCE REGISTER";

  sheet.mergeCells(2, 1, 2, columnCount);
  sheet.getCell("A2").value =
    `Month: ${report.month} | Timezone: ${report.timezone}`;

  sheet.mergeCells(3, 1, 3, columnCount);
  sheet.getCell("A3").value =
    `Employees: ${report.items.length} | Generated: ${new Date().toISOString()}`;

  sheet.mergeCells(4, 1, 4, columnCount);

  sheet.getCell("A4").value =
    `Department: ${departmentName} | Team: ${teamName}`;

  sheet.getCell("A4").font = {
    bold: true,
    color: { argb: "FF1E40AF" },
  };

  sheet.getCell("A4").alignment = {
    vertical: "middle",
  };

  sheet.getRow(4).height = 24;

  sheet.getRow(5).values = [
    ...fixedColumns.map((column) => column.header),
    ...dateColumns.map((column) => column.header),
    ...totalColumns.map((column) => column.header),
  ];

  const headerRow = sheet.getRow(5);
  headerRow.height = 26;

  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
    };
  });

  for (const employee of report.items) {
    const daysByDate = new Map(employee.days.map((day) => [day.date, day]));

    const dailyValues = report.dates.map((date) => {
      const day = daysByDate.get(date);
      if (!day) return "—";

      const code = STATUS_CODES[day.displayStatus] ?? "—";
      return day.attendance?.isLate ? `${code}*` : code;
    });

    const row = sheet.addRow([
      employee.employeeCode,
      employee.employeeName,
      employee.department?.name ?? "",
      employee.team?.name ?? "",
      ...dailyValues,
      employee.totals.present,
      employee.totals.halfDay,
      employee.totals.absent,
      employee.totals.onLeave,
      employee.totals.partialLeave,
      employee.totals.missingAttendance,
      minutesToHours(employee.totals.totalWorkedMinutes),
      minutesToHours(employee.totals.totalBreakMinutes),
      employee.totals.lateDays,
      employee.totals.earlyCheckoutDays,
      employee.totals.paidLeaveDays,
      employee.totals.unpaidLeaveDays,
    ]);

    row.height = 24;

    row.eachCell((cell, colNumber) => {
      cell.alignment = {
        vertical: "middle",
      };

      cell.border = {
        bottom: {
          style: "hair",
          color: { argb: "FFE2E8F0" },
        },
      };

      // Columns 5 onward contain the daily attendance matrix.
      // Do not color employee details or totals as statuses.
      const firstDateColumn = fixedColumns.length + 1;
      const lastDateColumn = fixedColumns.length + report.dates.length;

      if (colNumber >= firstDateColumn && colNumber <= lastDateColumn) {
        applyAttendanceCellStyle(cell);
      }
    });
  }

  const legendSheet = workbook.addWorksheet("Legend");

  legendSheet.columns = [
    { header: "Code", key: "code", width: 18 },
    { header: "Meaning", key: "meaning", width: 32 },
  ];

  const descriptions = {
    PRESENT: "Present",
    HALF_DAY: "Half Day",
    ABSENT: "Absent",
    PENDING: "Checked In",
    ON_LEAVE: "On Leave",
    PARTIAL_LEAVE: "Partial Leave",
    HOLIDAY: "Holiday",
    WEEKLY_OFF: "Weekly Off",
    NOT_CHECKED_IN: "Not Checked In",
    NO_ATTENDANCE_RECORDED: "No Attendance Recorded",
    UPCOMING: "Upcoming",
    NOT_EMPLOYED: "Not Employed",
  };

  Object.entries(STATUS_CODES).forEach(([status, code]) => {
    legendSheet.addRow({
      code,
      meaning: descriptions[status],
    });
  });

  legendSheet.addRow({
    code: "*",
    meaning: "Late arrival",
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer,
    filename: `monthly-attendance-${report.month}.xlsx`,
  };
};
