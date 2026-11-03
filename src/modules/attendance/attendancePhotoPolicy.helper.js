const PHOTO_ACTION_SETTINGS = {
  CHECK_IN: "requireForCheckIn",
  CHECK_OUT: "requireForCheckOut",
  FIELD_VISIT_START: "requireForFieldVisitStart",
  FIELD_VISIT_END: "requireForFieldVisitEnd",
};

const PHOTO_MODE_SETTINGS = {
  OFFICE: "requireForOffice",
  FIELD: "requireForField",
  HYBRID: "requireForHybrid",
  REMOTE: "requireForRemote",
};

export const isAttendancePhotoRequired = ({
  policy,
  action,
  attendanceMode,
}) => {
  const photoCapture = policy?.photoCapture;

  if (!photoCapture?.enabled) {
    return false;
  }

  const actionSetting = PHOTO_ACTION_SETTINGS[action];
  const modeSetting = PHOTO_MODE_SETTINGS[attendanceMode];

  if (!actionSetting || !modeSetting) {
    return false;
  }

  return (
    photoCapture[actionSetting] === true && photoCapture[modeSetting] === true
  );
};
