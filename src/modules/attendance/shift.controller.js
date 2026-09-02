import {
  createShift,
  listShifts,
  getShiftById,
  updateShift,
} from "./shift.service.js";

import { getAttendanceRequesterContext } from "./attendance.scope.js";

export const createAttendanceShift = async (req, res, next) => {
  try {
    const requesterContext = getAttendanceRequesterContext(req);

    const shift = await createShift({
      companyId: req.params.companyId,
      data: req.body,
      requesterContext,
    });

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Attendance shift created successfully.",
      data: shift,
    });
  } catch (error) {
    next(error);
  }
};

export const listAttendanceShifts = async (req, res, next) => {
  try {
    const result = await listShifts({
      companyId: req.params.companyId,
      query: req.query,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Attendance shifts fetched successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAttendanceShift = async (req, res, next) => {
  try {
    const shift = await getShiftById({
      companyId: req.params.companyId,
      shiftId: req.params.shiftId,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Attendance shift fetched successfully.",
      data: shift,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAttendanceShift = async (req, res, next) => {
  try {
    const requesterContext = getAttendanceRequesterContext(req);

    const shift = await updateShift({
      companyId: req.params.companyId,
      shiftId: req.params.shiftId,
      data: req.body,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Attendance shift updated successfully.",
      data: shift,
    });
  } catch (error) {
    next(error);
  }
};
