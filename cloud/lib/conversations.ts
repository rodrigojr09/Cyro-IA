import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./http";
import { storageMutation, storageStatus } from "./storage";

export const conversationCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z
    .object({
      action: z.literal("bootstrap"),
      catalogAfter: z.uuid().nullable().optional(),
      after: z.number().int().nonnegative().default(0),
      until: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("exchange"),
      id: z.uuid(),
      requestId: z.uuid(),
      assistantRequestId: z.uuid(),
      user: z.string().max(32000),
      assistant: z.string().max(32000),
    })
    .strict(),
  z.object({ action: z.literal("storage") }).strict(),
  z.object({ action: z.literal("clear"), confirmed: z.literal(true) }).strict(),
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
      instructions: z.string().max(4000).optional(),
      archived: z.boolean().optional(),
      delete: z.boolean().optional(),
      clear: z.boolean().optional(),
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
      attachmentCount: z.number().int().min(0).max(5).default(0),
    })
    .strict()
    .refine(
      (command) => command.role === "user" || command.attachmentCount === 0,
      "Somente mensagens do usuário têm anexos.",
    ),
]);

function view(row: {
  id: string;
  title: string;
  archived: boolean;
  summary: string;
  createdAt: Date;
  lastMessageAt: Date | null;
  instructions?: string;
  slot?: string | null;
}) {
  return {
    id: row.id,
    project_id: null,
    title: row.title,
    archived: Number(row.archived),
    summary: row.summary,
    instructions: row.instructions || "",
    slot: row.slot || null,
    created_at: row.createdAt,
    last_message_at: row.lastMessageAt,
  };
}

export async function conversations(
  userId: string,
  command: z.infer<typeof conversationCommand>,
) {
  if (command.action === "bootstrap") {
    // Keyset pagination loads all history in batches, without one request per chat.
    // Ownership is checked by the relation on every page; no client-supplied owner.
    const catalog =
      command.catalogAfter !== null
        ? await db.conversation.findMany({
            where: {
              userId,
              ...(command.catalogAfter
                ? { id: { gt: command.catalogAfter } }
                : {}),
            },
            orderBy: { id: "asc" },
            take: 50,
          })
        : undefined;
    const until =
      command.until ??
      (
        await db.chatMessage.findFirst({
          where: { conversation: { userId } },
          orderBy: { id: "desc" },
          select: { id: true },
        })
      )?.id ??
      0;
    const rows =
      command.after >= until
        ? []
        : await db.chatMessage.findMany({
            where: {
              conversation: { userId },
              id: { gt: command.after, lte: until },
            },
            orderBy: { id: "asc" },
            take: 500,
            select: {
              id: true,
              conversationId: true,
              role: true,
              content: true,
              createdAt: true,
              localAttachmentCount: true,
            },
          });
    // Bound each network response by bytes as well as rows (large pasted texts).
    const messages: typeof rows = [];
    let bytes = 0;
    for (const message of rows) {
      const size = Buffer.byteLength(JSON.stringify(message));
      if (messages.length && bytes + size > 2 * 1024 * 1024) break;
      messages.push(message);
      bytes += size;
    }
    return {
      catalogNext:
        catalog?.length === 50 ? catalog[catalog.length - 1].id : null,
      chats: catalog?.map(view),
      messages: messages.map((message) => ({
        id: message.id,
        chat_id: message.conversationId,
        role: message.role,
        content: message.content,
        created_at: message.createdAt,
        attachment_count: message.localAttachmentCount,
      })),
      until,
      next:
        messages.length &&
        (messages.length < rows.length || rows.length === 500)
          ? messages[messages.length - 1].id
          : null,
    };
  }
  if (command.action === "storage") return storageStatus(userId);
  if (command.action === "clear")
    return storageMutation(userId, async (tx) => {
      await tx.conversation.deleteMany({ where: { userId } });
      return { cleared: true };
    });
  if (command.action === "fixed") {
    const existing = await db.conversation.findFirst({
      where: { userId, slot: command.slot },
    });
    if (existing && !existing.archived) return view(existing);
    return view(
      await storageMutation(userId, (tx) =>
        tx.conversation.upsert({
          where: { userId_slot: { userId, slot: command.slot } },
          create: {
            userId,
            slot: command.slot,
            title:
              command.slot === "quick"
                ? "Cyro IA Quick Chat"
                : "Conversa geral",
          },
          update: { archived: false },
        }),
      ),
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
    return storageMutation(userId, async (tx) => {
      // Caller-generated ID makes retries safe without granting access to another owner.
      await tx.conversation.createMany({
        data: {
          id: command.requestId,
          userId,
          title: command.title.trim() || "Nova conversa",
        },
        skipDuplicates: true,
      });
      const row = await tx.conversation.findFirst({
        where: { id: command.requestId, userId },
      });
      if (!row) throw new HttpError(404, "Conversa inexistente.");
      return view(row);
    });
  }
  // Read paths authenticate ownership without write locks or storage quota scans.
  if (command.action === "get" || command.action === "history") {
    const row = await db.conversation.findFirst({
      where: { id: command.id, userId },
    });
    if (!row) throw new HttpError(404, "Conversa inexistente.");
    if (command.action === "get") return view(row);
    if (command.action === "history") {
      const rows = await db.chatMessage.findMany({
        where: {
          conversationId: row.id,
          ...(command.before ? { id: { lt: command.before } } : {}),
          ...(command.scope !== undefined ? { scope: command.scope } : {}),
        },
        orderBy: { id: "desc" },
        take: command.limit,
      });
      return rows.reverse().map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        created_at: message.createdAt,
        attachment_count: message.localAttachmentCount,
      }));
    }
  }
  return storageMutation(userId, async (tx) => {
    // Serialize mutations, including delete and message insertion, across devices.
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id=${command.id}::uuid AND "userId"=${userId}::uuid FOR UPDATE`;
    const row = await tx.conversation.findFirst({
      where: { id: command.id, userId },
    });
    if (!row) throw new HttpError(404, "Conversa inexistente.");
    if (command.action === "change") {
      if (row.slot && (command.delete || command.archived))
        throw new HttpError(400, "Esta conversa fixa é preservada.");
      if (command.delete) {
        await tx.conversation.delete({ where: { id: row.id } });
        return { deleted: true };
      }
      if (command.clear) {
        await tx.chatMessage.deleteMany({ where: { conversationId: row.id } });
        return view(
          await tx.conversation.update({
            where: { id: row.id },
            data: { summary: "", lastMessageAt: null },
          }),
        );
      }
      return view(
        await tx.conversation.update({
          where: { id: row.id },
          data: {
            title: command.title?.trim() || undefined,
            archived: command.archived,
            instructions: command.instructions,
          },
        }),
      );
    }
    if (row.archived) throw new HttpError(400, "Conversa arquivada.");
    if (command.action === "exchange") {
      // Both messages and their summary commit together before the device receives success.
      const inserted = await tx.chatMessage.createMany({
        data: [
          {
            conversationId: row.id,
            requestId: command.requestId,
            role: "user",
            content: command.user,
          },
          {
            conversationId: row.id,
            requestId: command.assistantRequestId,
            role: "assistant",
            content: command.assistant,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count !== 0 && inserted.count !== 2)
        throw new HttpError(409, "Identificador de envio já utilizado.");
      const saved = inserted.count
        ? await tx.conversation.update({
            where: { id: row.id },
            data: {
              lastMessageAt: new Date(),
              summary: (
                row.summary +
                "\nuser: " +
                command.user.slice(0, 500) +
                "\nassistant: " +
                command.assistant.slice(0, 500)
              ).slice(-3000),
            },
          })
        : row;
      const savedMessages = await tx.chatMessage.findMany({
        where: {
          conversationId: row.id,
          requestId: { in: [command.requestId, command.assistantRequestId] },
        },
        orderBy: { id: "asc" },
      });
      return {
        ok: true,
        chat: view(saved),
        messages: savedMessages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          created_at: message.createdAt,
        })),
      };
    }
    const inserted = await tx.chatMessage.createMany({
      data: {
        conversationId: row.id,
        requestId: command.requestId,
        role: command.role,
        content: command.content,
        scope: command.scope,
        localAttachmentCount: command.attachmentCount,
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
    const message = await tx.chatMessage.findUniqueOrThrow({
      where: {
        conversationId_requestId: {
          conversationId: row.id,
          requestId: command.requestId,
        },
      },
      select: { id: true },
    });
    return { ok: true, id: message.id };
  });
}
