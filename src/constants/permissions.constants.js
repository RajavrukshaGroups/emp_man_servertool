export const PERMISSION_MODULES = Object.freeze({
  COMPANY: "company",
  ADMIN: "admin",
  EMPLOYEE: "employee",
  ROLE: "role",
  PERMISSION: "permission",
  DEPARTMENT: "department",
  TEAM: "team",
  TASK: "task",
  LEAVE: "leave",
  ATTENDANCE: "attendance",
  REPORT: "report",
  ANNOUNCEMENT: "announcement",
  SETTINGS: "settings",
  AUDIT: "audit",
});

export const PERMISSIONS = Object.freeze({
  COMPANY_CREATE: "company.create",
  COMPANY_READ: "company.read",
  COMPANY_UPDATE: "company.update",
  COMPANY_DEACTIVATE: "company.deactivate",

  ADMIN_CREATE: "admin.create",
  ADMIN_READ: "admin.read",
  ADMIN_UPDATE: "admin.update",
  ADMIN_DEACTIVATE: "admin.deactivate",

  EMPLOYEE_CREATE: "employee.create",
  EMPLOYEE_READ: "employee.read",
  EMPLOYEE_UPDATE: "employee.update",
  EMPLOYEE_DEACTIVATE: "employee.deactivate",

  ROLE_CREATE: "role.create",
  ROLE_READ: "role.read",
  ROLE_UPDATE: "role.update",
  ROLE_DELETE: "role.delete",

  PERMISSION_READ: "permission.read",

  DEPARTMENT_CREATE: "department.create",
  DEPARTMENT_READ: "department.read",
  DEPARTMENT_UPDATE: "department.update",
  DEPARTMENT_DELETE: "department.delete",

  TEAM_CREATE: "team.create",
  TEAM_READ: "team.read",
  TEAM_UPDATE: "team.update",
  TEAM_DELETE: "team.delete",
  TEAM_ASSIGN_MEMBER: "team.assign_member",
  TEAM_ASSIGN_LEAD: "team.assign_lead",

  TASK_CREATE: "task.create",
  TASK_READ: "task.read",
  TASK_ASSIGN: "task.assign",
  TASK_UPDATE: "task.update",
  TASK_SUBMIT: "task.submit",
  TASK_REVIEW: "task.review",
  TASK_APPROVE: "task.approve",
  TASK_REWORK: "task.rework",
  TASK_CANCEL: "task.cancel",

  LEAVE_APPLY: "leave.apply",
  LEAVE_READ: "leave.read",
  LEAVE_RECOMMEND: "leave.recommend",
  LEAVE_APPROVE: "leave.approve",
  LEAVE_REJECT: "leave.reject",
  LEAVE_CANCEL: "leave.cancel",

  ATTENDANCE_CHECK_IN: "attendance.check_in",
  ATTENDANCE_CHECK_OUT: "attendance.check_out",
  ATTENDANCE_READ: "attendance.read",
  ATTENDANCE_CORRECTION_REQUEST: "attendance.correction_request",
  ATTENDANCE_CORRECTION_APPROVE: "attendance.correction_approve",

  REPORT_READ: "report.read",
  REPORT_EXPORT: "report.export",

  ANNOUNCEMENT_CREATE: "announcement.create",
  ANNOUNCEMENT_READ: "announcement.read",
  ANNOUNCEMENT_UPDATE: "announcement.update",
  ANNOUNCEMENT_DELETE: "announcement.delete",

  SETTINGS_READ: "settings.read",
  SETTINGS_UPDATE: "settings.update",

  AUDIT_READ: "audit.read",
});

export const PERMISSION_LIST = Object.freeze(Object.values(PERMISSIONS));
