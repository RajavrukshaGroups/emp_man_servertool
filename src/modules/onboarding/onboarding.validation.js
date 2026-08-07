import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId.");

const onboardingStatuses = [
  "USER_CREATED",
  "COMPANY_ACCESS_CREATED",
  "COMPLETED",
];

/**
 * GET /onboarding
 */
export const listOnboardingSchema = z.object({
  body: z.object({}).strict().optional(),

  params: z.object({}).strict().optional(),

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
        .max(100, "Search cannot exceed 100 characters.")
        .optional(),

      onboardingStatus: z.enum(onboardingStatuses).optional(),
    })
    .strict(),
});

/**
 * GET /onboarding/:userId
 */
export const onboardingUserIdParamSchema = z.object({
  body: z.object({}).strict().optional(),

  params: z
    .object({
      userId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});
