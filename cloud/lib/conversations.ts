import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./http";

export const conversationCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z
    .object({ action: z.literal("fixed"), slot: z.enum(["general", "quick"]) })
    .strict(),
  z
    .object({
      action: z.literal("create"),
      title: z.string().max(120),
      requestId: z.uuid(),
    })
    .strict(),
  z.object({ action: z.literal("get"), id: z.uuid() }).strict(),
  z
    .object({
      action: z.literal("history"),
      id: z.uuid(),
      limit: z.number().int().min(1).max(100),
      before: z.number().int().positive().optional(),
      scope: z.enum(["", "quick:general"]).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("change"),
      id: z.uuid(),
      title: z.string().max(120).optional(),
      archived: z.boolean().optional(),
      delete: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("append"),
      id: z.uuid(),
      requestId: z.uuid(),
      role: z.enum(["user", "assistant"]),
      content: z.string().max(32000),
      scope: z.enum(["", "quick:general"]).default(""),
    })
    .strict(),
]);

function view(row: {
  id: string;
  title: string;
  archived: boolean;
  summary: string;
  createdAt: Date;
  lastMessageAt: Date | null;
}) {
  return {
    id: row.id,
    project_id: null,
    title: row.title,
    archived: Number(row.archived),
    summary: row.summary,
    created_at: row.createdAt,
    last_message_at: row.lastMessageAt,
  };
}

export async function conversations(
  userId: string,
  command: z.infer<typeof conversationCommand>,
) {
  if (command.action === "fixed") {
    return view(
      await db.conversation.upsert({
        where: { userId_slot: { userId, slot: command.slot } },
        create: {
          userId,
          slot: command.slot,
          title:
            command.slot === "quick" ? "JARVIS Quick Chat" : "Conversa geral",
        },
        update: { archived: false },
      }),
    );
  }
  if (command.action === "list")
    return (
      await db.conversation.findMany({
        where: { userId },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      })
    ).map(view);
  if (command.action === "create") {
    // Caller-generated ID makes retries safe without granting access to another owner.
    await db.conversation.createMany({
      data: {
        id: command.requestId,
        userId,
        title: command.title.trim() || "Nova conversa",
      },
      skipDuplicates: true,
    });
    const row = await db.conversation.findFirst({
      where: { id: command.requestId, userId },
    });
    if (!row) throw new HttpError(404, "Conversa inexistente.");
    return view(row);
  }
  return db.$transaction(async (tx) => {
    // Serialize mutations, including delete and message insertion, across devices.
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id=${command.id}::uuid AND "userId"=${userId}::uuid FOR UPDATE`;
    const row = await tx.conversation.findFirst({
      where: { id: command.id, userId },
    });
    if (!row) throw new HttpError(404, "Conversa inexistente.");
    if (command.action === "get") return view(row);
    if (command.action === "history") {
      const rows = await tx.chatMessage.findMany({
        where: {
          conversationId: row.id,
          ...(command.before ? { id: { lt: command.before } } : {}),
          ...(command.scope !== undefined ? { scope: command.scope } : {}),
        },
        orderBy: { id: "desc" },
        take: command.limit,
      });
      return rows
        .reverse()
        .map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          created_at: message.createdAt,
        }));
    }
    if (command.action === "change") {
      if (row.slot && (command.delete || command.archived))
        throw new HttpError(400, "Esta conversa fixa é preservada.");
      if (command.delete) {
        await tx.conversation.delete({ where: { id: row.id } });
        return { deleted: true };
      }
      return view(
        await tx.conversation.update({
          where: { id: row.id },
          data: {
            title: command.title?.trim() || undefined,
            archived: command.archived,
          },
        }),
      );
    }
    if (row.archived) throw new HttpError(400, "Conversa arquivada.");
    const inserted = await tx.chatMessage.createMany({
      data: {
        conversationId: row.id,
        requestId: command.requestId,
        role: command.role,
        content: command.content,
        scope: command.scope,
      },
      skipDuplicates: true,
    });
    if (inserted.count)
      await tx.conversation.update({
        where: { id: row.id },
        data: {
          lastMessageAt: new Date(),
          summary: (
            row.summary +
            "\n" +
            command.role +
            ": " +
            command.content.slice(0, 500)
          ).slice(-3000),
        },
      });
    return { ok: true };
  });
}
