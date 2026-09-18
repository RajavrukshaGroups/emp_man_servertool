/**
 * ============================================================
 * ATTENDANCE UTILITIES
 * ============================================================
 *
 * Pure helper functions used by attendance services.
 *
 * No database queries should be performed in this file.
 */

const EARTH_RADIUS_METERS = 6371000;
const MILLISECONDS_PER_MINUTE = 60 * 1000;

/**
 * ============================================================
 * BASIC DATE HELPERS
 * ============================================================
 */

export const toDate = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

export const calculateMinutesBetween = (start, end) => {
  const startDate = toDate(start);
  const endDate = toDate(end);

  if (!startDate || !endDate) {
    return 0;
  }

  if (endDate < startDate) {
    return 0;
  }

  return Math.floor(
    (endDate.getTime() - startDate.getTime()) / MILLISECONDS_PER_MINUTE,
  );
};

/**
 * ============================================================
 * COMPANY TIMEZONE
 * ============================================================
 *
 * Returns logical attendance date in the company's timezone.
 *
 * Example:
 *
 * getAttendanceDateInTimezone(
 *   new Date(),
 *   "Asia/Kolkata"
 * )
 *
 * => "2026-08-31"
 */

export const getAttendanceDateInTimezone = (
  date = new Date(),
  timezone = "Asia/Kolkata",
) => {
  const parsedDate = toDate(date);

  if (!parsedDate) {
    throw new Error("Invalid date.");
  }

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(parsedDate);

    const year = parts.find((part) => part.type === "year")?.value;

    const month = parts.find((part) => part.type === "month")?.value;

    const day = parts.find((part) => part.type === "day")?.value;

    if (!year || !month || !day) {
      throw new Error("Unable to determine attendance date.");
    }

    return `${year}-${month}-${day}`;
  } catch {
    throw new Error(`Invalid or unsupported company timezone: ${timezone}`);
  }
};

/**
 * Returns the day of week in company timezone.
 *
 * 0 = Sunday
 * 1 = Monday
 * ...
 * 6 = Saturday
 */

export const getDayOfWeekInTimezone = (
  date = new Date(),
  timezone = "Asia/Kolkata",
) => {
  const parsedDate = toDate(date);

  if (!parsedDate) {
    throw new Error("Invalid date.");
  }

  try {
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(parsedDate);

    const days = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    return days[weekday];
  } catch {
    throw new Error(`Invalid or unsupported company timezone: ${timezone}`);
  }
};

/**
 * ============================================================
 * DATE + SHIFT TIME → UTC DATE
 * ============================================================
 *
 * attendanceDate:
 * "2026-08-31"
 *
 * time:
 * "09:30"
 *
 * timezone:
 * "Asia/Kolkata"
 *
 * returns a Date representing:
 *
 * 2026-08-31 09:30 Asia/Kolkata
 *
 * converted internally to UTC.
 *
 * Uses Intl so we do not need moment-timezone.
 */

const getTimezoneOffsetMilliseconds = (date, timezone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const asUTC = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return asUTC - date.getTime();
};

export const combineDateAndTimeInTimezone = (
  attendanceDate,
  time,
  timezone = "Asia/Kolkata",
) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
    throw new Error("attendanceDate must use YYYY-MM-DD format.");
  }

  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("time must use HH:mm format.");
  }

  const [year, month, day] = attendanceDate.split("-").map(Number);

  const [hour, minute] = time.split(":").map(Number);

  /**
   * First approximate the local wall-clock time as UTC.
   */
  let utcTimestamp = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  /**
   * Resolve timezone offset.
   *
   * Two passes help with DST timezone transitions.
   */
  for (let index = 0; index < 2; index += 1) {
    const candidate = new Date(utcTimestamp);

    const offset = getTimezoneOffsetMilliseconds(candidate, timezone);

    utcTimestamp = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offset;
  }

  return new Date(utcTimestamp);
};

/**
 * Adds calendar days to YYYY-MM-DD without relying on the
 * server's local timezone.
 */

export const addDaysToDateString = (attendanceDate, numberOfDays) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
    throw new Error("attendanceDate must use YYYY-MM-DD format.");
  }

  const [year, month, day] = attendanceDate.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + numberOfDays);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
};

/**
 * ============================================================
 * SHIFT BOUNDARIES
 * ============================================================
 */

export const getShiftBoundaries = ({
  attendanceDate,
  startTime,
  endTime,
  isOvernight = false,
  timezone = "Asia/Kolkata",
}) => {
  const shiftStart = combineDateAndTimeInTimezone(
    attendanceDate,
    startTime,
    timezone,
  );

  let endDate = attendanceDate;

  if (isOvernight) {
    endDate = addDaysToDateString(attendanceDate, 1);
  }

  const shiftEnd = combineDateAndTimeInTimezone(endDate, endTime, timezone);

  return {
    shiftStart,
    shiftEnd,
  };
};

/**
 * ============================================================
 * GPS / GEOFENCE
 * ============================================================
 */

const degreesToRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Haversine formula.
 *
 * Returns straight-line distance between two GPS points
 * in meters.
 */

export const calculateDistanceMeters = (
  latitude1,
  longitude1,
  latitude2,
  longitude2,
) => {
  const lat1 = Number(latitude1);
  const lon1 = Number(longitude1);
  const lat2 = Number(latitude2);
  const lon2 = Number(longitude2);

  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    throw new Error("Valid latitude and longitude values are required.");
  }

  if (
    lat1 < -90 ||
    lat1 > 90 ||
    lat2 < -90 ||
    lat2 > 90 ||
    lon1 < -180 ||
    lon1 > 180 ||
    lon2 < -180 ||
    lon2 > 180
  ) {
    throw new Error("Invalid GPS coordinates.");
  }

  const latitudeDifference = degreesToRadians(lat2 - lat1);

  const longitudeDifference = degreesToRadians(lon2 - lon1);

  const firstLatitude = degreesToRadians(lat1);
  const secondLatitude = degreesToRadians(lat2);

  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c);
};

export const isWithinGeofence = ({
  employeeLatitude,
  employeeLongitude,
  locationLatitude,
  locationLongitude,
  radiusMeters,
}) => {
  const distanceMeters = calculateDistanceMeters(
    employeeLatitude,
    employeeLongitude,
    locationLatitude,
    locationLongitude,
  );

  return {
    distanceMeters,
    withinGeofence: distanceMeters <= Number(radiusMeters),
  };
};

/**
 * ============================================================
 * LOCATION ACCURACY
 * ============================================================
 */

export const isLocationAccuracyAcceptable = (
  accuracy,
  maximumAcceptedAccuracyMeters,
) => {
  if (accuracy === null || accuracy === undefined) {
    return false;
  }

  const numericAccuracy = Number(accuracy);
  const maximumAccuracy = Number(maximumAcceptedAccuracyMeters);

  if (!Number.isFinite(numericAccuracy) || !Number.isFinite(maximumAccuracy)) {
    return false;
  }

  return numericAccuracy <= maximumAccuracy;
};

/**
 * ============================================================
 * ATTENDANCE MODE / GEOFENCE POLICY
 * ============================================================
 */

export const shouldEnforceGeofence = (attendanceMode, policy) => {
  switch (attendanceMode) {
    case "OFFICE":
      return Boolean(policy?.enforceGeofenceForOffice);

    case "HYBRID":
      return Boolean(policy?.enforceGeofenceForHybrid);

    case "FIELD":
      return Boolean(policy?.enforceGeofenceForField);

    case "REMOTE":
      return Boolean(policy?.enforceGeofenceForRemote);

    default:
      return false;
  }
};

/**
 * ============================================================
 * WORK SESSION HELPERS
 * ============================================================
 */

export const getOpenWorkSession = (attendance) => {
  if (!attendance?.workSessions?.length) {
    return null;
  }

  return (
    attendance.workSessions.find(
      (session) => session.status === "OPEN" && !session.checkOutAt,
    ) || null
  );
};

export const hasOpenWorkSession = (attendance) =>
  Boolean(getOpenWorkSession(attendance));

export const calculateSessionWorkedMinutes = (session) => {
  if (!session?.checkInAt || !session?.checkOutAt) {
    return 0;
  }

  return calculateMinutesBetween(session.checkInAt, session.checkOutAt);
};

export const calculateGrossWorkedMinutes = (workSessions = []) =>
  workSessions.reduce(
    (total, session) => total + calculateSessionWorkedMinutes(session),
    0,
  );

/**
 * ============================================================
 * BREAK HELPERS
 * ============================================================
 */

export const getActiveBreak = (attendance) => {
  if (!attendance?.breaks?.length) {
    return null;
  }

  return (
    attendance.breaks.find(
      (breakItem) => breakItem.status === "ACTIVE" && !breakItem.endedAt,
    ) || null
  );
};

export const hasActiveBreak = (attendance) =>
  Boolean(getActiveBreak(attendance));

export const calculateBreakDurationMinutes = (breakItem) => {
  if (!breakItem?.startedAt || !breakItem?.endedAt) {
    return 0;
  }

  return calculateMinutesBetween(breakItem.startedAt, breakItem.endedAt);
};

export const calculateTotalBreakMinutes = (breaks = []) =>
  breaks.reduce(
    (total, breakItem) => total + calculateBreakDurationMinutes(breakItem),
    0,
  );

/**
 * ============================================================
 * NET WORKED MINUTES
 * ============================================================
 *
 * Gross session duration minus completed break duration.
 */

export const calculateNetWorkedMinutes = ({
  workSessions = [],
  breaks = [],
}) => {
  const grossWorkedMinutes = calculateGrossWorkedMinutes(workSessions);

  const totalBreakMinutes = calculateTotalBreakMinutes(breaks);

  return Math.max(0, grossWorkedMinutes - totalBreakMinutes);
};

/**
 * ============================================================
 * FIRST CHECK-IN / LAST CHECKOUT
 * ============================================================
 */

export const getFirstCheckInAt = (workSessions = []) => {
  const timestamps = workSessions
    .map((session) => toDate(session.checkInAt))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  return timestamps[0] || null;
};

export const getLastCheckOutAt = (workSessions = []) => {
  const timestamps = workSessions
    .map((session) => toDate(session.checkOutAt))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime());

  return timestamps[0] || null;
};

/**
 * ============================================================
 * LATE ARRIVAL
 * ============================================================
 */

export const calculateLateMinutes = ({
  firstCheckInAt,
  shiftStart,
  graceMinutes = 0,
}) => {
  const checkIn = toDate(firstCheckInAt);
  const expectedStart = toDate(shiftStart);

  if (!checkIn || !expectedStart) {
    return {
      lateMinutes: 0,
      isLate: false,
    };
  }

  const difference = calculateMinutesBetween(expectedStart, checkIn);

  const lateMinutes = Math.max(0, difference - Number(graceMinutes || 0));

  return {
    lateMinutes,
    isLate: lateMinutes > 0,
  };
};

/**
 * ============================================================
 * EARLY CHECKOUT
 * ============================================================
 */

export const calculateEarlyCheckoutMinutes = ({
  lastCheckOutAt,
  shiftEnd,
  graceMinutes = 0,
}) => {
  const checkout = toDate(lastCheckOutAt);
  const expectedEnd = toDate(shiftEnd);

  if (!checkout || !expectedEnd) {
    return {
      earlyCheckoutMinutes: 0,
      isEarlyCheckout: false,
    };
  }

  if (checkout >= expectedEnd) {
    return {
      earlyCheckoutMinutes: 0,
      isEarlyCheckout: false,
    };
  }

  const difference = calculateMinutesBetween(checkout, expectedEnd);

  const earlyCheckoutMinutes = Math.max(
    0,
    difference - Number(graceMinutes || 0),
  );

  return {
    earlyCheckoutMinutes,
    isEarlyCheckout: earlyCheckoutMinutes > 0,
  };
};

/**
 * ============================================================
 * ATTENDANCE STATUS
 * ============================================================
 *
 * This function only determines status from worked minutes.
 *
 * Leave / holiday / weekly-off integration will be handled
 * separately by service/monthly-summary logic.
 */

export const determineWorkedAttendanceStatus = ({
  workedMinutes,
  fullDayMinutes,
  halfDayMinutes,
}) => {
  const worked = Number(workedMinutes || 0);
  const fullDay = Number(fullDayMinutes || 0);
  const halfDay = Number(halfDayMinutes || 0);

  if (fullDay > 0 && worked >= fullDay) {
    return "PRESENT";
  }

  if (halfDay > 0 && worked >= halfDay) {
    return "HALF_DAY";
  }

  return "ABSENT";
};

/**
 * ============================================================
 * SCHEDULE COMPENSATION
 * ============================================================
 */

/**
 * Calculates how many worked minutes occurred inside a
 * particular time window.
 *
 * Only CLOSED work sessions participate because an open
 * session does not yet have a final duration.
 */
export const calculateWorkedMinutesInsideWindow = ({
  workSessions = [],
  breaks = [],
  windowStart,
  windowEnd,
}) => {
  const startBoundary = toDate(windowStart);
  const endBoundary = toDate(windowEnd);

  if (!startBoundary || !endBoundary || endBoundary <= startBoundary) {
    return 0;
  }

  /**
   * Calculate gross worked time overlapping the requested
   * compensation window.
   */
  const grossWorkedMinutes = workSessions.reduce((total, session) => {
    const sessionStart = toDate(session.checkInAt);
    const sessionEnd = toDate(session.checkOutAt);

    if (!sessionStart || !sessionEnd) {
      return total;
    }

    const overlapStart = new Date(
      Math.max(sessionStart.getTime(), startBoundary.getTime()),
    );

    const overlapEnd = new Date(
      Math.min(sessionEnd.getTime(), endBoundary.getTime()),
    );

    if (overlapEnd <= overlapStart) {
      return total;
    }

    return total + calculateMinutesBetween(overlapStart, overlapEnd);
  }, 0);

  /**
   * Calculate completed break time overlapping the same
   * compensation window.
   */
  const breakMinutes = breaks.reduce((total, breakItem) => {
    const breakStart = toDate(breakItem.startedAt);
    const breakEnd = toDate(breakItem.endedAt);

    if (!breakStart || !breakEnd) {
      return total;
    }

    const overlapStart = new Date(
      Math.max(breakStart.getTime(), startBoundary.getTime()),
    );

    const overlapEnd = new Date(
      Math.min(breakEnd.getTime(), endBoundary.getTime()),
    );

    if (overlapEnd <= overlapStart) {
      return total;
    }

    return total + calculateMinutesBetween(overlapStart, overlapEnd);
  }, 0);

  return Math.max(0, grossWorkedMinutes - breakMinutes);
};

/**
 * Calculate schedule-deviation compensation.
 *
 * Raw late/early evidence remains untouched.
 */
export const calculateScheduleCompensation = ({
  workSessions = [],
  breaks = [],

  shiftStart,
  shiftEnd,

  lateMinutes = 0,
  earlyCheckoutMinutes = 0,

  compensationPolicy = {},
}) => {
  const enabled = compensationPolicy.scheduleCompensationEnabled !== false;

  if (!enabled) {
    return {
      isLateCompensated: false,
      lateCompensatedMinutes: 0,

      isEarlyCheckoutCompensated: false,
      earlyCheckoutCompensatedMinutes: 0,
    };
  }

  const maximumCompensationMinutes = Math.max(
    0,
    Number(compensationPolicy.maximumCompensationMinutes || 0),
  );

  const effectiveMaximum =
    maximumCompensationMinutes > 0
      ? maximumCompensationMinutes
      : Number.MAX_SAFE_INTEGER;

  /**
   * ------------------------------------------
   * LATE ARRIVAL
   * ------------------------------------------
   *
   * Only work performed AFTER scheduled shift end
   * can compensate late arrival.
   */

  let lateCompensatedMinutes = 0;

  if (
    lateMinutes > 0 &&
    compensationPolicy.allowPostShiftWorkForLateArrival !== false
  ) {
    const lastCheckout = getLastCheckOutAt(workSessions);

    if (lastCheckout && shiftEnd && lastCheckout > shiftEnd) {
      const postShiftWorkedMinutes = calculateWorkedMinutesInsideWindow({
        workSessions,
        breaks,
        windowStart: shiftEnd,
        windowEnd: lastCheckout,
      });

      lateCompensatedMinutes = Math.min(
        Number(lateMinutes),
        postShiftWorkedMinutes,
        effectiveMaximum,
      );
    }
  }

  /**
   * ------------------------------------------
   * EARLY CHECKOUT
   * ------------------------------------------
   *
   * Only work performed BEFORE scheduled shift start
   * can compensate early checkout.
   */

  let earlyCheckoutCompensatedMinutes = 0;

  if (
    earlyCheckoutMinutes > 0 &&
    compensationPolicy.allowPreShiftWorkForEarlyCheckout !== false
  ) {
    const firstCheckIn = getFirstCheckInAt(workSessions);

    if (firstCheckIn && shiftStart && firstCheckIn < shiftStart) {
      const preShiftWorkedMinutes = calculateWorkedMinutesInsideWindow({
        workSessions,
        breaks,

        windowStart: firstCheckIn,
        windowEnd: shiftStart,
      });

      earlyCheckoutCompensatedMinutes = Math.min(
        Number(earlyCheckoutMinutes),
        preShiftWorkedMinutes,
        effectiveMaximum,
      );
    }
  }

  return {
    isLateCompensated:
      Number(lateMinutes) > 0 && lateCompensatedMinutes >= Number(lateMinutes),

    lateCompensatedMinutes,

    isEarlyCheckoutCompensated:
      Number(earlyCheckoutMinutes) > 0 &&
      earlyCheckoutCompensatedMinutes >= Number(earlyCheckoutMinutes),

    earlyCheckoutCompensatedMinutes,
  };
};

/**
 * ============================================================
 * RECALCULATE ATTENDANCE TOTALS
 * ============================================================
 *
 * Central calculation helper.
 *
 * IMPORTANT:
 * This does not save anything to MongoDB.
 */

export const calculateAttendanceTotals = ({
  workSessions = [],
  breaks = [],
  shiftSnapshot,
  compensationPolicySnapshot = {},
  attendanceDate,
  timezone = "Asia/Kolkata",
}) => {
  const firstCheckInAt = getFirstCheckInAt(workSessions);

  const lastCheckOutAt = getLastCheckOutAt(workSessions);

  const grossWorkedMinutes = calculateGrossWorkedMinutes(workSessions);

  const totalBreakMinutes = calculateTotalBreakMinutes(breaks);

  const totalWorkedMinutes = Math.max(
    0,
    grossWorkedMinutes - totalBreakMinutes,
  );

  /**
   * Schedule adherence evidence.
   */
  let lateMinutes = 0;
  let isLate = false;

  let earlyCheckoutMinutes = 0;
  let isEarlyCheckout = false;

  /**
   * Schedule compensation evidence.
   */
  let isLateCompensated = false;
  let lateCompensatedMinutes = 0;

  let isEarlyCheckoutCompensated = false;
  let earlyCheckoutCompensatedMinutes = 0;

  if (
    shiftSnapshot &&
    attendanceDate &&
    shiftSnapshot.startTime &&
    shiftSnapshot.endTime
  ) {
    const { shiftStart, shiftEnd } = getShiftBoundaries({
      attendanceDate,

      startTime: shiftSnapshot.startTime,

      endTime: shiftSnapshot.endTime,

      isOvernight: shiftSnapshot.isOvernight || false,

      timezone,
    });

    /**
     * ----------------------------------------
     * LATE ARRIVAL
     * ----------------------------------------
     */

    const lateResult = calculateLateMinutes({
      firstCheckInAt,

      shiftStart,

      graceMinutes: shiftSnapshot.lateGraceMinutes || 0,
    });

    lateMinutes = lateResult.lateMinutes;

    isLate = lateResult.isLate;

    /**
     * ----------------------------------------
     * EARLY CHECKOUT
     * ----------------------------------------
     */

    const earlyResult = calculateEarlyCheckoutMinutes({
      lastCheckOutAt,

      shiftEnd,

      graceMinutes: shiftSnapshot.earlyCheckoutGraceMinutes || 0,
    });

    earlyCheckoutMinutes = earlyResult.earlyCheckoutMinutes;

    isEarlyCheckout = earlyResult.isEarlyCheckout;

    /**
     * ----------------------------------------
     * SCHEDULE COMPENSATION
     * ----------------------------------------
     *
     * Calculate compensation only after both
     * schedule deviations are known.
     */

    const compensationResult = calculateScheduleCompensation({
      workSessions,
      breaks,

      shiftStart,
      shiftEnd,

      lateMinutes,
      earlyCheckoutMinutes,

      compensationPolicy: compensationPolicySnapshot,
    });

    isLateCompensated = compensationResult.isLateCompensated;

    lateCompensatedMinutes = compensationResult.lateCompensatedMinutes;

    isEarlyCheckoutCompensated = compensationResult.isEarlyCheckoutCompensated;

    earlyCheckoutCompensatedMinutes =
      compensationResult.earlyCheckoutCompensatedMinutes;
  }

  /**
   * Attendance classification remains based on
   * actual NET worked minutes.
   *
   * Compensation does not falsify worked time.
   */
  const attendanceStatus = determineWorkedAttendanceStatus({
    workedMinutes: totalWorkedMinutes,

    fullDayMinutes: shiftSnapshot?.fullDayMinutes || 0,

    halfDayMinutes: shiftSnapshot?.halfDayMinutes || 0,
  });

  return {
    firstCheckInAt,
    lastCheckOutAt,

    grossWorkedMinutes,
    totalBreakMinutes,
    totalWorkedMinutes,

    lateMinutes,
    isLate,

    earlyCheckoutMinutes,
    isEarlyCheckout,

    isLateCompensated,
    lateCompensatedMinutes,

    isEarlyCheckoutCompensated,
    earlyCheckoutCompensatedMinutes,

    attendanceStatus,
  };
};

/**
 * ============================================================
 * OPEN SESSION DURATION
 * ============================================================
 */

export const getOpenSessionDurationMinutes = (
  attendance,
  currentTime = new Date(),
) => {
  const session = getOpenWorkSession(attendance);

  if (!session?.checkInAt) {
    return 0;
  }

  return calculateMinutesBetween(session.checkInAt, currentTime);
};

/**
 * ============================================================
 * OVERLAP CHECK
 * ============================================================
 */

export const doTimeRangesOverlap = (startA, endA, startB, endB) => {
  const aStart = toDate(startA);
  const aEnd = toDate(endA);
  const bStart = toDate(startB);
  const bEnd = toDate(endB);

  if (!aStart || !aEnd || !bStart || !bEnd) {
    return false;
  }

  return aStart < bEnd && bStart < aEnd;
};

export const hasOverlappingWorkSessions = (workSessions = []) => {
  const closedSessions = workSessions.filter(
    (session) => session.checkInAt && session.checkOutAt,
  );

  for (
    let firstIndex = 0;
    firstIndex < closedSessions.length;
    firstIndex += 1
  ) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < closedSessions.length;
      secondIndex += 1
    ) {
      const first = closedSessions[firstIndex];
      const second = closedSessions[secondIndex];

      if (
        doTimeRangesOverlap(
          first.checkInAt,
          first.checkOutAt,
          second.checkInAt,
          second.checkOutAt,
        )
      ) {
        return true;
      }
    }
  }

  return false;
};

export const validateLocationCapturedAt = ({
  capturedAt,
  currentTime,
  maximumAgeMs = 5 * 60 * 1000,
  maximumFutureSkewMs = 60 * 1000,
}) => {
  if (!capturedAt) {
    return {
      valid: true,
      reason: null,
      capturedAt: currentTime,
    };
  }

  const parsedCapturedAt = new Date(capturedAt);

  if (Number.isNaN(parsedCapturedAt.getTime())) {
    return {
      valid: false,
      reason: "INVALID",
      capturedAt: null,
    };
  }

  const ageMs = currentTime.getTime() - parsedCapturedAt.getTime();

  if (ageMs > maximumAgeMs) {
    return {
      valid: false,
      reason: "STALE",
      capturedAt: parsedCapturedAt,
    };
  }

  if (ageMs < -maximumFutureSkewMs) {
    return {
      valid: false,
      reason: "FUTURE",
      capturedAt: parsedCapturedAt,
    };
  }

  return {
    valid: true,
    reason: null,
    capturedAt: parsedCapturedAt,
  };
};
