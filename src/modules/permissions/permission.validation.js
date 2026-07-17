import { z } from "zod";

export const listPermissionsSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({}).optional(),

  query: z.object({
    module: z.string().trim().min(1).optional(),

    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  }),
});
