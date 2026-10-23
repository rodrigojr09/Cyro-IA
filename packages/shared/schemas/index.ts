import { z } from "zod";
import { imagePart, textPart } from "./vision";
export { inputReservation } from "./vision";
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
            content: z
              .union([
                z.string().max(48000),
                z
                  .array(z.discriminatedUnion("type", [textPart, imagePart]))
                  .min(1)
                  .max(16),
              ])
              .nullable()
              .optional(),
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
          .strict()
          .superRefine((message, ctx) => {
            if (Array.isArray(message.content)) {
              if (message.role !== "user")
                ctx.addIssue({
                  code: "custom",
                  message: "Anexos somente em mensagens do usuário.",
                });
              if (
                message.content.reduce(
                  (sum, part) =>
                    sum + (part.type === "text" ? part.text.length : 0),
                  0,
                ) > 48000
              )
                ctx.addIssue({
                  code: "custom",
                  message: "Texto dos anexos excede o limite.",
                });
            }
          }),
      )
      .min(1)
      .max(60)
      .superRefine((messages, ctx) => {
        const images = messages.flatMap((message) =>
          Array.isArray(message.content)
            ? message.content.filter((part) => part.type === "image_url")
            : [],
        );
        if (images.length > 5)
          ctx.addIssue({
            code: "custom",
            message: "No máximo 5 imagens por consulta.",
          });
      }),
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
                strict: z.boolean().optional(),
              })
              .strict(),
          })
          .strict(),
      )
      .max(30)
      .optional(),
    tool_choice: z
      .object({
        type: z.literal("function"),
        function: z
          .object({ name: z.string().regex(/^[a-z_]{1,64}$/) })
          .strict(),
      })
      .strict()
      .optional(),
    parallel_tool_calls: z.literal(false).optional(),
    max_completion_tokens: z.number().int().min(1).max(3500).default(3500),
    stream: z.boolean().default(false),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      input.tool_choice &&
      !input.tools?.some(
        (tool) => tool.function.name === input.tool_choice!.function.name,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "A função escolhida deve estar nas ferramentas fornecidas.",
      });
  });
