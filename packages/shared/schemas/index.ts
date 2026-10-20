import { z } from "zod";
export const activateSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    deviceId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
  })
  .strict();
export const activationSchema = z
  .object({
    assignedUserId: z.string().uuid(),
    expiresInHours: z.number().int().min(1).max(168),
  })
  .strict();
export const loginSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(12).max(256),
  })
  .strict();
export const employeeSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE"),
    monthlyTokenLimit: z.number().int().min(0).max(100_000_000).default(100000),
  })
  .strict();
export const chatSchema = z
  .object({
    model: z.string().min(1).max(100),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["system", "user", "assistant", "tool"]),
            content: z.string().max(48000).nullable().optional(),
            tool_call_id: z.string().max(200).optional(),
            tool_calls: z
              .array(
                z
                  .object({
                    id: z.string().max(200),
                    type: z.literal("function"),
                    function: z
                      .object({
                        name: z.string().max(100),
                        arguments: z.string().max(20000),
                      })
                      .strict(),
                  })
                  .strict(),
              )
              .max(12)
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(60),
    tools: z
      .array(
        z
          .object({
            type: z.literal("function"),
            function: z
              .object({
                name: z.string().regex(/^[a-z_]{1,64}$/),
                description: z.string().max(2000).optional(),
                parameters: z.record(z.string(), z.unknown()),
              })
              .strict(),
          })
          .strict(),
      )
      .max(30)
      .optional(),
    max_completion_tokens: z.number().int().min(1).max(3500).default(3500),
    stream: z.boolean().default(false),
  })
  .strict();
