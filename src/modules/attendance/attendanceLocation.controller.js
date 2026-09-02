import {
  createAttendanceLocation,
  listAttendanceLocations,
  getAttendanceLocationById,
  updateAttendanceLocation,
} from "./attendanceLocation.service.js";

import { getAttendanceRequesterContext } from "./attendance.scope.js";

export const createLocation = async (req, res, next) => {
  try {
    const requesterContext = getAttendanceRequesterContext(req);

    const location = await createAttendanceLocation({
      companyId: req.params.companyId,
      data: req.body,
      requesterContext,
    });

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Attendance location created successfully.",
      data: location,
    });
  } catch (error) {
    next(error);
  }
};

export const listLocations = async (req, res, next) => {
  try {
    const result = await listAttendanceLocations({
      companyId: req.params.companyId,
      query: req.query,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Attendance locations fetched successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getLocation = async (req, res, next) => {
  try {
    const location = await getAttendanceLocationById({
      companyId: req.params.companyId,
      locationId: req.params.locationId,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Attendance location fetched successfully.",
      data: location,
    });
  } catch (error) {
    next(error);
  }
};

export const updateLocation = async (req, res, next) => {
  try {
    const requesterContext = getAttendanceRequesterContext(req);

    const location = await updateAttendanceLocation({
      companyId: req.params.companyId,
      locationId: req.params.locationId,
      data: req.body,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Attendance location updated successfully.",
      data: location,
    });
  } catch (error) {
    next(error);
  }
};
