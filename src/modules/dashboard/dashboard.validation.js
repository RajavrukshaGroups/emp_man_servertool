import { z } from "zod";

const objectIdSchema = z
  .string({
    required_error: "Company ID is required.",
    invalid_type_error: "Company ID must be a string.",
  })
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ObjectId.");

export const getDashboardSummarySchema = z.object({
  params: z.object({
    companyId: objectIdSchema,
  }),
});
