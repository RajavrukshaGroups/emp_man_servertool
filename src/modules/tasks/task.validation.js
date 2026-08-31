import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId.");

const optionalText = (maximumLength, fieldName = "Text") =>
  z
    .string()
    .trim()
    .max(
      maximumLength,
      `${fieldName} cannot exceed ${maximumLength} characters.`,
    )
    .optional()
    .or(z.literal(""));

const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

const taskStatusSchema = z.enum([
  "ASSIGNED",
  "IN_PROGRESS",
  "SUBMITTED",
  "COMPLETED",
  "REOPENED",
  "CANCELLED",
]);

const taskProgressSchema = z.coerce
  .number()
  .min(0, "Progress percentage cannot be below 0.")
  .max(100, "Progress percentage cannot exceed 100.");

const taskQuantitySchema = z.coerce
  .number()
  .int("Task quantity must be a whole number.")
  .min(1, "Task quantity must be at least 1.");

const taskParamsSchema = z
  .object({
    companyId: objectIdSchema,
    taskId: objectIdSchema,
  })
  .strict();

/**
 * POST /companies/:companyId/tasks
 */
export const createTaskSchema = z.object({
  body: z
    .object({
      clientId: objectIdSchema,

      workCategoryId: objectIdSchema,

      title: z
        .string()
        .trim()
        .min(3, "Task title must contain at least 3 characters.")
        .max(200, "Task title cannot exceed 200 characters."),

      description: optionalText(5000, "Task description").default(""),

      quantity: taskQuantitySchema.default(1),

      priority: taskPrioritySchema.default("MEDIUM"),

      assigneeId: objectIdSchema,

      dueDate: z.coerce.date(),
    })
    .strict(),

  params: z
    .object({
      companyId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

/**
 * PATCH /companies/:companyId/tasks/:taskId
 *
 * Metadata only.
 */
// export const updateTaskSchema = z.object({
//   body: z
//     .object({
//       clientId: objectIdSchema.optional(),

//       workCategoryId: objectIdSchema.optional(),

//       title: z
//         .string()
//         .trim()
//         .min(3, "Task title must contain at least 3 characters.")
//         .max(200, "Task title cannot exceed 200 characters.")
//         .optional(),

//       description: optionalText(5000, "Task description"),

//       quantity: taskQuantitySchema.optional(),

//       priority: taskPrioritySchema.optional(),

//       dueDate: z.coerce.date().optional(),
//     })
//     .strict()
//     .refine((body) => Object.keys(body).length > 0, {
//       message: "At least one field is required for update.",
//     }),

//   params: taskParamsSchema,

//   query: z.object({}).strict().optional(),
// });

/**
 * PATCH /companies/:companyId/tasks/:taskId
 *
 * Small ticket edits only:
 * - title
 * - description
 * - dueDate
 *
 * Structural information such as client, work category,
 * quantity, priority, assignee, team and department
 * cannot be changed from this endpoint.
 */
/**
 * PATCH /companies/:companyId/tasks/:taskId
 *
 * Editable ticket metadata:
 * - client
 * - work category
 * - title
 * - description
 * - quantity
 * - priority
 * - due date
 *
 * Workflow status and reassignment are handled separately.
 */
export const updateTaskSchema = z.object({
  body: z
    .object({
      clientId: objectIdSchema.optional(),

      workCategoryId: objectIdSchema.optional(),

      title: z
        .string()
        .trim()
        .min(3, "Task title must contain at least 3 characters.")
        .max(200, "Task title cannot exceed 200 characters.")
        .optional(),

      description: optionalText(5000, "Task description"),

      quantity: taskQuantitySchema.optional(),

      priority: taskPrioritySchema.optional(),

      dueDate: z.coerce.date().optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one field is required for update.",
    }),

  params: taskParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * ============================================================
 * REASSIGN TASK
 *
 * PATCH /companies/:companyId/tasks/:taskId/reassign
 *
 * Transfers the current ticket ownership to another employee.
 *
 * The service layer will enforce:
 *
 * - ASSIGNED, IN_PROGRESS and REOPENED only
 * - new assignee must belong to the same company
 * - Team Lead can reassign only within managed teams
 * - current ticket team must remain unchanged for now
 * - progress and work history must be preserved
 * ============================================================
 */
export const reassignTaskSchema = z.object({
  body: z
    .object({
      newAssigneeId: objectIdSchema,

      reassignmentReason: z
        .string()
        .trim()
        .min(1, "Reassignment reason is required.")
        .max(3000, "Reassignment reason cannot exceed 3000 characters."),
    })
    .strict(),

  params: taskParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * PATCH /companies/:companyId/tasks/:taskId/start
 */
export const startTaskSchema = z.object({
  body: z.object({}).strict().optional(),

  params: taskParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * PATCH /companies/:companyId/tasks/:taskId/progress
 */
export const updateTaskProgressSchema = z.object({
  body: z
    .object({
      progressPercentage: taskProgressSchema,

      workNote: optionalText(3000, "Work note").default(""),
    })
    .strict(),

  params: taskParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * PATCH /companies/:companyId/tasks/:taskId/submit
 */
export const submitTaskSchema = z.object({
  body: z
    .object({
      submissionNote: optionalText(3000, "Submission note").default(""),
    })
    .strict(),

  params: taskParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * PATCH /companies/:companyId/tasks/:taskId/complete
 */
export const completeTaskSchema = z.object({
  body: z
    .object({
      completionNote: optionalText(3000, "Completion note").default(""),
    })
    .strict(),

  params: taskParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * PATCH /companies/:companyId/tasks/:taskId/reopen
 *
 * Allowed:
 *
 * SUBMITTED -> REOPENED
 * COMPLETED -> REOPENED
 */
export const reopenTaskSchema = z.object({
  body: z
    .object({
      reopenReason: z
        .string()
        .trim()
        .min(1, "Reopen reason is required.")
        .max(3000, "Reopen reason cannot exceed 3000 characters."),
    })
    .strict(),

  params: taskParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * PATCH /companies/:companyId/tasks/:taskId/cancel
 */
export const cancelTaskSchema = z.object({
  body: z
    .object({
      cancellationReason: z
        .string()
        .trim()
        .min(1, "Cancellation reason is required.")
        .max(2000, "Cancellation reason cannot exceed 2000 characters."),
    })
    .strict(),

  params: taskParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * GET /companies/:companyId/tasks/:taskId
 */
export const getTaskByIdSchema = z.object({
  body: z.object({}).strict().optional(),

  params: taskParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * GET /companies/:companyId/tasks
 */
export const listTasksSchema = z.object({
  body: z.object({}).strict().optional(),

  params: z
    .object({
      companyId: objectIdSchema,
    })
    .strict(),

  query: z
    .object({
      page: z.coerce
        .number()
        .int("Page must be an integer.")
        .min(1, "Page must be at least 1.")
        .default(1),

      limit: z.coerce
        .number()
        .int("Limit must be an integer.")
        .min(1, "Limit must be at least 1.")
        .max(100, "Limit cannot exceed 100.")
        .default(10),

      search: z
        .string()
        .trim()
        .max(200, "Search text cannot exceed 200 characters.")
        .optional(),

      status: taskStatusSchema.optional(),

      priority: taskPrioritySchema.optional(),

      clientId: objectIdSchema.optional(),

      departmentId: objectIdSchema.optional(),

      teamId: objectIdSchema.optional(),

      workCategoryId: objectIdSchema.optional(),

      assigneeId: objectIdSchema.optional(),

      assignedById: objectIdSchema.optional(),

      dueDateFrom: z.coerce.date().optional(),

      dueDateTo: z.coerce.date().optional(),

      overdue: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),

      sortBy: z
        .enum([
          "title",
          "quantity",
          "priority",
          "status",
          "progressPercentage",
          "startDate",
          "dueDate",
          "submittedAt",
          "completedAt",
          "createdAt",
          "updatedAt",
        ])
        .default("createdAt"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    })
    .strict()
    .superRefine((query, context) => {
      if (
        query.dueDateFrom &&
        query.dueDateTo &&
        query.dueDateFrom > query.dueDateTo
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dueDateTo"],
          message: "Due date to must be later than or equal to due date from.",
        });
      }
    }),
});

/**
 * DELETE /companies/:companyId/tasks/:taskId
 */
export const deleteTaskSchema = z.object({
  body: z.object({}).strict().optional(),

  params: taskParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * ============================================================
 * GET TASK ACTIVITIES
 *
 * GET /companies/:companyId/tasks/:taskId/activities
 * ============================================================
 */
export const getTaskActivitiesSchema = z.object({
  body: z.object({}).strict().optional(),

  params: taskParamsSchema,

  query: z.object({}).strict().optional(),
});
