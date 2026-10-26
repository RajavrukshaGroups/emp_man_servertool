import PDFDocument from "pdfkit";

import { loadMonthlyAttendanceExportData } from "./attendanceReport.export.service.js";

import { resolveAttendanceExportMetadata } from "./attendanceReport.exportMetadata.js";

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
  UPCOMING: "-",
  NOT_EMPLOYED: "NE",
};

const COLORS = {
  P: ["#DCFCE7", "#166534"],
  A: ["#FEE2E2", "#991B1B"],
  HD: ["#FFEDD5", "#9A3412"],
  L: ["#DBEAFE", "#1D4ED8"],
  PL: ["#E0F2FE", "#0369A1"],
  H: ["#F3E8FF", "#7E22CE"],
  WO: ["#F1F5F9", "#475569"],
  IN: ["#FEF9C3", "#854D0E"],
  NC: ["#FECACA", "#B91C1C"],
  NR: ["#FFF7ED", "#9A3412"],
  NE: ["#E5E7EB", "#6B7280"],
  "-": ["#F8FAFC", "#94A3B8"],
};

const DAYS_PER_SECTION = 31;
const MARGIN = 35;
const ROW_HEIGHT = 22;
const HEADER_HEIGHT = 26;

const splitIntoChunks = (items, size) => {
  const chunks = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
};

const drawCell = (doc, text, x, y, width, height, options = {}) => {
  const {
    background = "#FFFFFF",
    color = "#334155",
    fontSize = 7,
    bold = false,
    align = "center",
  } = options;

  doc
    .save()
    .rect(x, y, width, height)
    .fillAndStroke(background, "#E2E8F0")
    .restore();

  doc
    .font(bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(fontSize)
    .fillColor(color)
    .text(String(text ?? ""), x + 3, y + 6, {
      width: width - 6,
      height: height - 7,
      align,
      lineBreak: false,
      ellipsis: true,
    });
};

const drawPageHeader = (doc, report, sectionNumber, sectionCount, metadata) => {
  const { departmentName, teamName } = metadata;

  doc
    .font("Helvetica-Bold")
    .fontSize(17)
    .fillColor("#0F172A")
    .text("MONTHLY ATTENDANCE REGISTER", MARGIN, 28);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#475569")
    .text(
      `Month: ${report.month}   |   Timezone: ${report.timezone}   |   Employees: ${report.items.length}`,
      MARGIN,
      53,
    );

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#1E40AF")
    .text(`Department: ${departmentName}   |   Team: ${teamName}`, MARGIN, 70, {
      width: doc.page.width - MARGIN * 2,
      lineBreak: false,
      ellipsis: true,
    });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#64748B")
    .text(`Date section ${sectionNumber} of ${sectionCount}`, MARGIN, 88);
};

const drawLegend = (doc, y) => {
  const legend = [
    ["P", "Present"],
    ["A", "Absent"],
    ["HD", "Half Day"],
    ["L", "Leave"],
    ["PL", "Partial Leave"],
    ["H", "Holiday"],
    ["WO", "Weekly Off"],
    ["IN", "Checked In"],
    ["NC", "Not Checked In"],
    ["NR", "No Record"],
    ["NE", "Not Employed"],
    ["*", "Late"],
  ];

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#334155")
    .text("LEGEND", MARGIN, y);

  let x = MARGIN;
  let currentY = y + 15;

  for (const [code, description] of legend) {
    const label = `${code} = ${description}`;
    const width = doc.widthOfString(label) + 15;

    if (x + width > doc.page.width - MARGIN) {
      x = MARGIN;
      currentY += 15;
    }

    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#475569")
      .text(label, x, currentY);

    x += width + 10;
  }
};

const buildPdfBuffer = (report, metadata) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A3",
      layout: "landscape",
      margin: MARGIN,
      bufferPages: true,
      autoFirstPage: false,
    });

    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const dateSections = splitIntoChunks(report.dates, DAYS_PER_SECTION);

    const fixedColumns = [
      { title: "Code", width: 75 },
      { title: "Employee", width: 145 },
    ];

    const totalsColumns = [
      { title: "P", key: "present", width: 28 },
      { title: "HD", key: "halfDay", width: 28 },
      { title: "A", key: "absent", width: 28 },
      { title: "L", key: "onLeave", width: 28 },
      { title: "Hours", key: "totalWorkedMinutes", width: 48 },
    ];

    const usableHeight = 750;
    const firstRowY = 112;
    const maxRowsPerPage = Math.floor(
      (usableHeight - firstRowY - 70) / ROW_HEIGHT,
    );

    for (
      let sectionIndex = 0;
      sectionIndex < dateSections.length;
      sectionIndex++
    ) {
      const sectionDates = dateSections[sectionIndex];
      const isLastSection = sectionIndex === dateSections.length - 1;

      const employeePages = splitIntoChunks(
        report.items,
        Math.max(1, maxRowsPerPage),
      );

      if (employeePages.length === 0) {
        employeePages.push([]);
      }

      for (
        let employeePageIndex = 0;
        employeePageIndex < employeePages.length;
        employeePageIndex++
      ) {
        doc.addPage();

        drawPageHeader(
          doc,
          report,
          sectionIndex + 1,
          dateSections.length,
          metadata,
        );

        const columns = [
          ...fixedColumns,
          ...sectionDates.map((date) => ({
            title: date.slice(-2),
            date,
            width: 23,
          })),
          ...(isLastSection ? totalsColumns : []),
        ];

        let x = MARGIN;
        let y = firstRowY;

        for (const column of columns) {
          drawCell(doc, column.title, x, y, column.width, HEADER_HEIGHT, {
            background: "#1E293B",
            color: "#FFFFFF",
            bold: true,
          });

          x += column.width;
        }

        y += HEADER_HEIGHT;

        for (const employee of employeePages[employeePageIndex]) {
          const daysByDate = new Map(
            employee.days.map((day) => [day.date, day]),
          );

          const values = [employee.employeeCode, employee.employeeName];

          x = MARGIN;

          fixedColumns.forEach((column, index) => {
            drawCell(doc, values[index], x, y, column.width, ROW_HEIGHT, {
              align: index === 1 ? "left" : "center",
            });
            x += column.width;
          });

          for (const date of sectionDates) {
            const day = daysByDate.get(date);
            const code = STATUS_CODES[day?.displayStatus] ?? "-";
            const displayCode = day?.attendance?.isLate ? `${code}*` : code;

            const [background, color] = COLORS[code] ?? COLORS["-"];

            drawCell(doc, displayCode, x, y, 23, ROW_HEIGHT, {
              background,
              color,
              bold: true,
            });

            x += 23;
          }

          if (isLastSection) {
            for (const column of totalsColumns) {
              let value = employee.totals[column.key] ?? 0;

              if (column.key === "totalWorkedMinutes") {
                value = (Number(value) / 60).toFixed(1);
              }

              drawCell(doc, value, x, y, column.width, ROW_HEIGHT);
              x += column.width;
            }
          }

          y += ROW_HEIGHT;
        }

        drawLegend(doc, Math.min(y + 25, doc.page.height - 65));
      }
    }

    doc.end();
  });

export const generateMonthlyAttendancePdf = async ({
  companyId,
  query,
  requesterContext,
}) => {
  const report = await loadMonthlyAttendanceExportData({
    companyId,
    query,
    requesterContext,
  });

  const metadata = await resolveAttendanceExportMetadata({
    companyId,
    query,
    requesterContext,
  });

  const buffer = await buildPdfBuffer(report, metadata);
  return {
    buffer,
    filename: `monthly-attendance-${report.month}.pdf`,
  };
};
