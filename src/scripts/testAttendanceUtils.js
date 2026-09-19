// src/scripts/testAttendanceUtils.js

import {
  calculateGrossWorkedMinutes,
  calculateBreakMinutesInsideWorkSessions,
  calculateNetWorkedMinutes,
  calculateWorkedMinutesInsideWindow,
} from "../modules/attendance/attendance.utils.js";
const createSession = (checkInAt, checkOutAt) => ({
  checkInAt: new Date(checkInAt),
  checkOutAt: new Date(checkOutAt),
  status: "CLOSED",
});

const createBreak = (startedAt, endedAt) => ({
  startedAt: new Date(startedAt),
  endedAt: new Date(endedAt),
  status: "COMPLETED",
});

const runTest = ({
  name,
  workSessions,
  breaks = [],
  expectedGross,
  expectedBreak,
  expectedNet,
}) => {
  const gross = calculateGrossWorkedMinutes(workSessions);

  const breakMinutes = calculateBreakMinutesInsideWorkSessions({
    workSessions,
    breaks,
  });

  const net = calculateNetWorkedMinutes({
    workSessions,
    breaks,
  });

  const passed =
    gross === expectedGross &&
    breakMinutes === expectedBreak &&
    net === expectedNet;

  console.log(`\n${passed ? "✅ PASS" : "❌ FAIL"} - ${name}`);

  console.log({
    gross,
    expectedGross,
    breakMinutes,
    expectedBreak,
    net,
    expectedNet,
  });
};

/**
 * TEST 1
 * Two 30-second sessions = 1 minute.
 */
runTest({
  name: "Two 30-second work sessions",
  workSessions: [
    createSession("2026-09-19T04:30:00.000Z", "2026-09-19T04:30:30.000Z"),
    createSession("2026-09-19T04:31:00.000Z", "2026-09-19T04:31:30.000Z"),
  ],
  expectedGross: 1,
  expectedBreak: 0,
  expectedNet: 1,
});

/**
 * TEST 2
 * 80 seconds work - 40 seconds break
 * = 40 seconds net
 * = 0 complete minutes.
 */
runTest({
  name: "80 seconds work minus 40 seconds break",
  workSessions: [
    createSession("2026-09-19T04:30:00.000Z", "2026-09-19T04:31:20.000Z"),
  ],
  breaks: [createBreak("2026-09-19T04:30:20.000Z", "2026-09-19T04:31:00.000Z")],
  expectedGross: 1,
  expectedBreak: 0,
  expectedNet: 0,
});

/**
 * TEST 3
 * Break completely outside work session.
 * It must NOT reduce worked time.
 */
runTest({
  name: "Break completely outside work session",
  workSessions: [
    createSession("2026-09-19T04:30:00.000Z", "2026-09-19T05:30:00.000Z"),
  ],
  breaks: [createBreak("2026-09-19T06:00:00.000Z", "2026-09-19T06:30:00.000Z")],
  expectedGross: 60,
  expectedBreak: 0,
  expectedNet: 60,
});

/**
 * TEST 4
 * Break partially overlaps work session.
 *
 * Work  = 09:00 → 10:00
 * Break = 09:50 → 10:10
 *
 * Only 10 minutes should be deducted.
 */
runTest({
  name: "Partially overlapping break",
  workSessions: [
    createSession("2026-09-19T09:00:00.000Z", "2026-09-19T10:00:00.000Z"),
  ],
  breaks: [createBreak("2026-09-19T09:50:00.000Z", "2026-09-19T10:10:00.000Z")],
  expectedGross: 60,
  expectedBreak: 10,
  expectedNet: 50,
});

/**
 * TEST 5
 * Two 30-second breaks aggregate to one minute.
 */
runTest({
  name: "Two 30-second breaks inside work session",
  workSessions: [
    createSession("2026-09-19T09:00:00.000Z", "2026-09-19T09:10:00.000Z"),
  ],
  breaks: [
    createBreak("2026-09-19T09:02:00.000Z", "2026-09-19T09:02:30.000Z"),
    createBreak("2026-09-19T09:05:00.000Z", "2026-09-19T09:05:30.000Z"),
  ],
  expectedGross: 10,
  expectedBreak: 1,
  expectedNet: 9,
});

/**
 * TEST 6
 * Malformed overlapping breaks must not be deducted twice.
 *
 * Break 1 = 09:10 → 09:30
 * Break 2 = 09:20 → 09:40
 *
 * Unique break time = 30 minutes.
 */
runTest({
  name: "Overlapping breaks are not double deducted",
  workSessions: [
    createSession("2026-09-19T09:00:00.000Z", "2026-09-19T10:00:00.000Z"),
  ],
  breaks: [
    createBreak("2026-09-19T09:10:00.000Z", "2026-09-19T09:30:00.000Z"),
    createBreak("2026-09-19T09:20:00.000Z", "2026-09-19T09:40:00.000Z"),
  ],
  expectedGross: 60,
  expectedBreak: 30,
  expectedNet: 30,
});

/**
 * TEST 7
 * Break spans gap between two sessions.
 *
 * Session 1 = 09:00 → 10:00
 * Session 2 = 11:00 → 12:00
 * Break     = 09:50 → 11:10
 *
 * Valid overlap:
 * 09:50 → 10:00 = 10m
 * 11:00 → 11:10 = 10m
 *
 * Total deductible break = 20m.
 */
runTest({
  name: "Break spanning multiple work sessions",
  workSessions: [
    createSession("2026-09-19T09:00:00.000Z", "2026-09-19T10:00:00.000Z"),
    createSession("2026-09-19T11:00:00.000Z", "2026-09-19T12:00:00.000Z"),
  ],
  breaks: [createBreak("2026-09-19T09:50:00.000Z", "2026-09-19T11:10:00.000Z")],
  expectedGross: 120,
  expectedBreak: 20,
  expectedNet: 100,
});

const runWindowTest = ({
  name,
  workSessions,
  breaks = [],
  windowStart,
  windowEnd,
  expected,
}) => {
  const actual = calculateWorkedMinutesInsideWindow({
    workSessions,
    breaks,
    windowStart: new Date(windowStart),
    windowEnd: new Date(windowEnd),
  });

  const passed = actual === expected;

  console.log(`\n${passed ? "✅ PASS" : "❌ FAIL"} - ${name}`);

  console.log({
    actual,
    expected,
  });
};

/**
 * TEST 8
 * Break is inside compensation window
 * but outside actual work session.
 *
 * It must NOT reduce compensation work.
 */
runWindowTest({
  name: "Window ignores break outside work session",

  workSessions: [
    createSession("2026-09-19T17:00:00.000Z", "2026-09-19T17:30:00.000Z"),
  ],

  breaks: [createBreak("2026-09-19T17:40:00.000Z", "2026-09-19T17:50:00.000Z")],

  windowStart: "2026-09-19T17:00:00.000Z",
  windowEnd: "2026-09-19T18:00:00.000Z",

  expected: 30,
});

/**
 * TEST 9
 * Break partially overlaps work inside window.
 *
 * Work:  17:00 → 17:30
 * Break: 17:20 → 17:40
 *
 * Only 10 minutes are deductible.
 */
runWindowTest({
  name: "Window deducts only break overlapping work",

  workSessions: [
    createSession("2026-09-19T17:00:00.000Z", "2026-09-19T17:30:00.000Z"),
  ],

  breaks: [createBreak("2026-09-19T17:20:00.000Z", "2026-09-19T17:40:00.000Z")],

  windowStart: "2026-09-19T17:00:00.000Z",
  windowEnd: "2026-09-19T18:00:00.000Z",

  expected: 20,
});

/**
 * TEST 10
 * Only part of work session falls inside window.
 *
 * Session: 16:30 → 17:30
 * Window:  17:00 → 18:00
 *
 * Work inside window = 30 minutes.
 */
runWindowTest({
  name: "Work session is clipped to compensation window",

  workSessions: [
    createSession("2026-09-19T16:30:00.000Z", "2026-09-19T17:30:00.000Z"),
  ],

  windowStart: "2026-09-19T17:00:00.000Z",
  windowEnd: "2026-09-19T18:00:00.000Z",

  expected: 30,
});

/**
 * TEST 11
 * Sub-minute precision inside compensation window.
 *
 * Two 30-second sessions = 60 seconds = 1 minute.
 */
runWindowTest({
  name: "Window aggregates sub-minute work before flooring",

  workSessions: [
    createSession("2026-09-19T17:00:00.000Z", "2026-09-19T17:00:30.000Z"),
    createSession("2026-09-19T17:01:00.000Z", "2026-09-19T17:01:30.000Z"),
  ],

  windowStart: "2026-09-19T17:00:00.000Z",
  windowEnd: "2026-09-19T18:00:00.000Z",

  expected: 1,
});

/**
 * TEST 12
 * 80 seconds work - 40 seconds valid break
 * = 40 seconds
 * = 0 complete minutes.
 */
runWindowTest({
  name: "Window floors only after subtracting break",

  workSessions: [
    createSession("2026-09-19T17:00:00.000Z", "2026-09-19T17:01:20.000Z"),
  ],

  breaks: [createBreak("2026-09-19T17:00:20.000Z", "2026-09-19T17:01:00.000Z")],

  windowStart: "2026-09-19T17:00:00.000Z",
  windowEnd: "2026-09-19T18:00:00.000Z",

  expected: 0,
});

console.log("\n====================================");
console.log("Attendance utility tests completed.");
console.log("====================================");
