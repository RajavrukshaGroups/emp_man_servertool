import { ApiError } from "../../utils/ApiError.js";

import Company from "../companies/company.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";
import Employee from "../employees/employee.model.js";
import LeaveRequest from "../leave/leaveRequest.model.js";

import Attendance from "./attendance.model.js";

import { resolveWorkCalendarRange } from "../workCalendar/workCalendar.service.js";

import { buildReadableCompanyAccessFilter } from "./attendance.scope.js";

import { getAttendanceDateInTimezone } from "./attendance.utils.js";

/**
 * ============================================================
 * ATTENDANCE REPORTING SERVICE
 * ============================================================
 *
 * Read-only reporting for:
 * - Monthly employee attendance registers
 * - Team and department attendance reports
 * - Yearly attendance summaries
 * - Payroll-ready attendance summaries
 *
 * Security:
 * - Company isolation
 * - Permission-based access at route level
 * - Scope-based access at service level
 *
 * Attendance and LeaveRequest documents must never
 * be modified while generating reports.
 */

/**
 * ============================================================
 * MONTHLY REPORT HELPERS
 * ============================================================
 */

const getMonthRange = (month) => {
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new ApiError(400, "Month must be in YYYY-MM format.");
  }

  const [year, monthNumber] = month.split("-").map(Number);

  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return {
    month,
    fromDate: `${month}-01`,
    toDate: `${month}-${String(daysInMonth).padStart(2, "0")}`,
    daysInMonth,
  };
};

const getEmploymentDateKey = (value) => {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
};

const isEmployedOnDate = (companyAccess, date) => {
  const joiningDate = getEmploymentDateKey(companyAccess.joiningDate);

  const lastWorkingDate = getEmploymentDateKey(companyAccess.lastWorkingDate);

  if (joiningDate && date < joiningDate) return false;

  if (lastWorkingDate && date > lastWorkingDate) return false;

  return true;
};

/**
 * ============================================================
 * RESOLVE MONTHLY REPORT EMPLOYEES
 * ============================================================
 *
 * Returns employees visible to the requester.
 *
 * Security:
 * - Scope filter is always enforced.
 * - Department/team filters only narrow visibility.
 * - Company Administrators without Employee profiles
 *   are excluded from attendance registers.
 * - Historical employment periods are considered.
 */

const resolveMonthlyReportEmployees = async ({
  companyId,
  requesterContext,
  fromDate,
  toDate,
  departmentId,
  teamId,
  search,
}) => {
  const scopeFilter = await buildReadableCompanyAccessFilter({
    requesterContext,
    companyId,
  });

  const additionalFilter = {
    isDeleted: false,
    status: {
      $in: ["ONBOARDING", "ACTIVE", "INACTIVE", "RESIGNED", "TERMINATED"],
    },
    $and: [
      {
        $or: [
          { joiningDate: { $lte: new Date(`${toDate}T23:59:59.999Z`) } },
          { joiningDate: null },
        ],
      },
      {
        $or: [
          { lastWorkingDate: { $gte: new Date(`${fromDate}T00:00:00.000Z`) } },
          { lastWorkingDate: null },
        ],
      },
    ],
  };

  if (departmentId) {
    additionalFilter.departmentId = departmentId;
  }

  if (teamId) {
    additionalFilter.teamId = teamId;
  }

  if (search?.trim()) {
    const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    additionalFilter.$or = [
      { employeeCode: { $regex: escapedSearch, $options: "i" } },
      { designation: { $regex: escapedSearch, $options: "i" } },
    ];
  }

  const companyAccesses = await CompanyAccess.find({
    $and: [scopeFilter, additionalFilter],
  })
    .select(
      "_id userId companyId employeeCode designation employmentType departmentId teamId roleId attendanceMode shiftId joiningDate lastWorkingDate status",
    )
    .populate([
      {
        path: "userId",
        select: "firstName middleName lastName displayName email status",
      },
      {
        path: "departmentId",
        select: "name code",
      },
      {
        path: "teamId",
        select: "name code",
      },
    ])
    .lean();

  if (companyAccesses.length === 0) {
    return [];
  }

  const employees = await Employee.find({
    companyId,
    companyAccessId: {
      $in: companyAccesses.map((access) => access._id),
    },
    isDeleted: false,
  })
    .select("_id companyAccessId userId status")
    .lean();

  const employeeByAccessId = new Map(
    employees.map((employee) => [String(employee.companyAccessId), employee]),
  );

  return companyAccesses
    .filter((access) => employeeByAccessId.has(String(access._id)))
    .map((access) => ({
      ...access,
      employee: employeeByAccessId.get(String(access._id)),
    }));
};

/**
 * ============================================================
 * LOAD MONTHLY ATTENDANCE REPORT DATA
 * ============================================================
 *
 * Fetches attendance, approved leave and work calendar
 * for authorized employees in the requested month.
 *
 * Read-only: does not modify any records.
 */

const loadMonthlyReportData = async ({
  companyId,
  companyAccessIds,
  fromDate,
  toDate,
}) => {
  const fromDateTime = new Date(`${fromDate}T00:00:00.000Z`);
  const toDateTime = new Date(`${toDate}T23:59:59.999Z`);

  const [attendanceRecords, approvedLeaves, workCalendar] = await Promise.all([
    Attendance.find({
      companyId,
      companyAccessId: { $in: companyAccessIds },
      attendanceDate: {
        $gte: fromDate,
        $lte: toDate,
      },
      isDeleted: false,
    }).lean(),

    LeaveRequest.find({
      companyId,
      companyAccessId: { $in: companyAccessIds },
      status: "APPROVED",
      isDeleted: false,
      dateDetails: {
        $elemMatch: {
          date: {
            $gte: fromDateTime,
            $lte: toDateTime,
          },
          countedAsLeave: true,
        },
      },
    })
      .select(
        "_id companyAccessId leaveTypeId dateDetails status cancellationStatus attendanceApplicationStatus",
      )
      .lean(),

    resolveWorkCalendarRange({
      companyId,
      fromDate,
      toDate,
    }),
  ]);

  const attendanceByEmployeeAndDate = new Map();

  for (const attendance of attendanceRecords) {
    attendanceByEmployeeAndDate.set(
      `${String(attendance.companyAccessId)}:${attendance.attendanceDate}`,
      attendance,
    );
  }

  const approvedLeavesByEmployeeAndDate = new Map();

  for (const leave of approvedLeaves) {
    for (const detail of leave.dateDetails || []) {
      if (!detail.countedAsLeave) continue;

      const date = new Date(detail.date).toISOString().slice(0, 10);

      if (date < fromDate || date > toDate) continue;

      const key = `${String(leave.companyAccessId)}:${date}`;

      if (!approvedLeavesByEmployeeAndDate.has(key)) {
        approvedLeavesByEmployeeAndDate.set(key, []);
      }

      approvedLeavesByEmployeeAndDate.get(key).push({
        leaveRequestId: leave._id,
        leaveTypeId: leave.leaveTypeId,
        dayPortion: detail.dayPortion,
        leaveDays: Number(detail.leaveDays || 0),
        paidDays: Number(detail.paidDays || 0),
        unpaidDays: Number(detail.unpaidDays || 0),
        allocationType: detail.allocationType,
      });
    }
  }

  const workDayByDate = new Map(
    workCalendar.days.map((day) => [day.date, day]),
  );

  return {
    attendanceByEmployeeAndDate,
    approvedLeavesByEmployeeAndDate,
    workDayByDate,
  };
};

/**
 * ============================================================
 * RESOLVE MONTHLY REPORT DAY
 * ============================================================
 *
 * Combines attendance, approved leave and work calendar.
 *
 * This is a reporting classification, not a payroll
 * calculation. It does not modify source records.
 */

const resolveMonthlyReportDay = ({
  date,
  companyAccess,
  attendance,
  approvedLeaves = [],
  workDay,
  today,
}) => {
  const totalLeaveDays = approvedLeaves.reduce(
    (sum, leave) => sum + Number(leave.leaveDays || 0),
    0,
  );

  const paidLeaveDays = approvedLeaves.reduce(
    (sum, leave) => sum + Number(leave.paidDays || 0),
    0,
  );

  const unpaidLeaveDays = approvedLeaves.reduce(
    (sum, leave) => sum + Number(leave.unpaidDays || 0),
    0,
  );

  const isEmployed = isEmployedOnDate(companyAccess, date);

  let displayStatus;

  if (!isEmployed) {
    displayStatus = "NOT_EMPLOYED";
  } else if (attendance) {
    displayStatus = attendance.attendanceStatus;
  } else if (workDay?.classification === "HOLIDAY") {
    displayStatus = "HOLIDAY";
  } else if (workDay?.classification === "WEEKLY_OFF") {
    displayStatus = "WEEKLY_OFF";
  } else if (totalLeaveDays >= 1) {
    displayStatus = "ON_LEAVE";
  } else if (totalLeaveDays > 0) {
    displayStatus = "PARTIAL_LEAVE";
  } else if (date > today) {
    displayStatus = "UPCOMING";
  } else if (date === today) {
    displayStatus = "NOT_CHECKED_IN";
  } else {
    displayStatus = "NO_ATTENDANCE_RECORDED";
  }

  // Flag overlaps for review without assuming they are invalid.
  // A half-day attendance + half-day leave can be legitimate.
  const hasLeaveAttendanceOverlap = Boolean(attendance) && totalLeaveDays > 0;

  return {
    date,
    displayStatus,
    isEmployed,

    attendanceId: attendance?._id || null,
    attendanceStatus: attendance?.attendanceStatus || null,

    workDay: workDay
      ? {
          isWorkingDay: workDay.isWorkingDay,
          classification: workDay.classification,
          source: workDay.source,
          name: workDay.name || "",
        }
      : null,

    attendance: attendance
      ? {
          firstCheckInAt: attendance.firstCheckInAt,
          lastCheckOutAt: attendance.lastCheckOutAt,
          totalWorkedMinutes: attendance.totalWorkedMinutes || 0,
          totalBreakMinutes: attendance.totalBreakMinutes || 0,
          isLate: Boolean(attendance.isLate),
          isEarlyCheckout: Boolean(attendance.isEarlyCheckout),
          calculationStatus: attendance.calculationStatus,
        }
      : null,

    approvedLeaves,
    totalLeaveDays,
    paidLeaveDays,
    unpaidLeaveDays,
    hasLeaveAttendanceOverlap,
  };
};

/**
 * ============================================================
 * GET MONTHLY ATTENDANCE REPORT
 * ============================================================
 *
 * Employee-by-date attendance register.
 *
 * All employee visibility is enforced by
 * resolveMonthlyReportEmployees().
 *
 * This is a read-only operational report.
 * Payroll calculations will be implemented separately.
 */

export const getMonthlyAttendanceReport = async ({
  companyId,
  query = {},
  requesterContext,
}) => {
  const company = await Company.findOne({
    _id: companyId,
    isDeleted: false,
  })
    .select("_id timezone")
    .lean();

  if (!company) {
    throw new ApiError(404, "Company not found.");
  }

  const { month, fromDate, toDate, daysInMonth } = getMonthRange(query.month);

  const timezone = company.timezone || "Asia/Kolkata";

  const today = getAttendanceDateInTimezone(new Date(), timezone);

  const employeeAccesses = await resolveMonthlyReportEmployees({
    companyId,
    requesterContext,
    fromDate,
    toDate,
    departmentId: query.departmentId,
    teamId: query.teamId,
    search: query.search,
  });

  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new ApiError(400, "Invalid pagination parameters.");
  }

  const sortedEmployees = [...employeeAccesses].sort((a, b) =>
    String(a.employeeCode || "").localeCompare(String(b.employeeCode || "")),
  );

  const total = sortedEmployees.length;
  const totalPages = Math.ceil(total / limit);

  const paginatedEmployees = sortedEmployees.slice(
    (page - 1) * limit,
    page * limit,
  );

  const {
    attendanceByEmployeeAndDate,
    approvedLeavesByEmployeeAndDate,
    workDayByDate,
  } = await loadMonthlyReportData({
    companyId,
    companyAccessIds: paginatedEmployees.map((access) => access._id),
    fromDate,
    toDate,
  });

  const dates = Array.from({ length: daysInMonth }, (_, index) => {
    return `${month}-${String(index + 1).padStart(2, "0")}`;
  });

  const items = paginatedEmployees.map((access) => {
    const accessId = String(access._id);

    const user = access.userId || {};

    const employeeName =
      user.displayName ||
      [user.firstName, user.middleName, user.lastName]
        .filter(Boolean)
        .join(" ") ||
      "Employee";

    const days = dates.map((date) => {
      const key = `${accessId}:${date}`;

      return resolveMonthlyReportDay({
        date,
        companyAccess: access,
        attendance: attendanceByEmployeeAndDate.get(key) || null,
        approvedLeaves: approvedLeavesByEmployeeAndDate.get(key) || [],
        workDay: workDayByDate.get(date) || null,
        today,
      });
    });

    const totals = {
      present: 0,
      halfDay: 0,
      absent: 0,
      pending: 0,
      onLeave: 0,
      partialLeave: 0,
      holiday: 0,
      weeklyOff: 0,
      notCheckedIn: 0,
      missingAttendance: 0,
      upcoming: 0,
      notEmployed: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      totalWorkedMinutes: 0,
      totalBreakMinutes: 0,
      lateDays: 0,
      earlyCheckoutDays: 0,
      leaveAttendanceOverlaps: 0,
    };

    const statusCounterKeys = {
      PRESENT: "present",
      HALF_DAY: "halfDay",
      ABSENT: "absent",
      PENDING: "pending",
      ON_LEAVE: "onLeave",
      PARTIAL_LEAVE: "partialLeave",
      HOLIDAY: "holiday",
      WEEKLY_OFF: "weeklyOff",
      NOT_CHECKED_IN: "notCheckedIn",
      NO_ATTENDANCE_RECORDED: "missingAttendance",
      UPCOMING: "upcoming",
      NOT_EMPLOYED: "notEmployed",
    };

    for (const day of days) {
      const counterKey = statusCounterKeys[day.displayStatus];

      if (counterKey) {
        totals[counterKey] += 1;
      }

      if (!day.isEmployed) continue;

      totals.paidLeaveDays += day.paidLeaveDays;
      totals.unpaidLeaveDays += day.unpaidLeaveDays;

      totals.totalWorkedMinutes += Number(
        day.attendance?.totalWorkedMinutes || 0,
      );

      totals.totalBreakMinutes += Number(
        day.attendance?.totalBreakMinutes || 0,
      );

      if (day.attendance?.isLate) {
        totals.lateDays += 1;
      }

      if (day.attendance?.isEarlyCheckout) {
        totals.earlyCheckoutDays += 1;
      }

      if (day.hasLeaveAttendanceOverlap) {
        totals.leaveAttendanceOverlaps += 1;
      }
    }

    return {
      companyAccessId: access._id,
      employeeId: access.employee?._id || null,
      employeeCode: access.employeeCode || "",
      employeeName,
      designation: access.designation || "",
      employmentType: access.employmentType,
      department: access.departmentId || null,
      team: access.teamId || null,
      attendanceMode: access.attendanceMode,
      joiningDate: access.joiningDate || null,
      lastWorkingDate: access.lastWorkingDate || null,
      employmentStatus: access.status,
      days,
      totals,
    };
  });

  return {
    month,
    fromDate,
    toDate,
    timezone,
    dates,
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    },
  };
};
