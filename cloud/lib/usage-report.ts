import { db } from "./db";
import { scope, type Actor } from "./policy";
import { HttpError } from "./http";
import { z } from "zod";

export function usageFilters(query: URLSearchParams) {
  const from = query.get("from") || "";
  const to = query.get("to") || "";
  const clientId = query.get("clientId") || "";
  const validDate = (value: string) =>
    !value ||
    (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value);
  const limit = Number(query.get("perUser") || 5);
  const page = Number(query.get("usagePage") || 1);
  if (
    !validDate(from) ||
    !validDate(to) ||
    (from && to && from > to) ||
    (clientId && !z.string().uuid().safeParse(clientId).success) ||
    ![5, 10, 20].includes(limit) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000000
  )
    throw new HttpError(400, "Filtro de consumo inválido.");
  return {
    limit,
    page,
    where: {
      ...(clientId ? { userId: clientId } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from + "T00:00:00Z") } : {}),
              ...(to ? { lte: new Date(to + "T23:59:59.999Z") } : {}),
            },
          }
        : {}),
    },
  };
}

// Aggregate the full authorized period; bound detail reads to ten users per page.
export async function loadUsageReport(
  actor: Actor,
  query: URLSearchParams,
  database = db,
) {
  const filters = usageFilters(query);
  const where = { user: scope(actor), ...filters.where };
  const groups = await database.usageLog.groupBy({
    by: ["userId"],
    where,
    _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
    _count: { _all: true, estimatedCost: true },
  });
  const users = groups
    .map((g) => ({
      userId: g.userId,
      inputTokens: g._sum.inputTokens ?? 0,
      outputTokens: g._sum.outputTokens ?? 0,
      tokens: (g._sum.inputTokens ?? 0) + (g._sum.outputTokens ?? 0),
      calls: g._count._all,
      cost: g._sum.estimatedCost === null ? null : String(g._sum.estimatedCost),
      unpricedCalls: g._count._all - g._count.estimatedCost,
    }))
    .sort((a, b) => b.tokens - a.tokens || a.userId.localeCompare(b.userId));
  const pages = Math.max(1, Math.ceil(users.length / 10));
  const page = Math.min(filters.page, pages);
  const selected = users.slice((page - 1) * 10, page * 10);
  const profiles = selected.length
    ? await database.user.findMany({
        where: { ...scope(actor), id: { in: selected.map((u) => u.userId) } },
        select: { id: true, name: true },
      })
    : [];
  const details = await Promise.all(
    selected.map(async (user) => ({
      ...user,
      name:
        profiles.find((p) => p.id === user.userId)?.name ??
        "Usuário indisponível",
      recent: (
        await database.usageLog.findMany({
          where: { ...where, userId: user.userId },
          select: {
            id: true,
            userId: true,
            model: true,
            inputTokens: true,
            outputTokens: true,
            estimatedCost: true,
            createdAt: true,
            user: { select: { name: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: filters.limit,
        })
      ).map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        estimatedCost:
          row.estimatedCost === null ? null : String(row.estimatedCost),
      })),
    })),
  );
  return {
    perUser: filters.limit,
    page,
    pages,
    userCount: users.length,
    total: users.reduce(
      (sum, u) => ({
        inputTokens: sum.inputTokens + u.inputTokens,
        outputTokens: sum.outputTokens + u.outputTokens,
        tokens: sum.tokens + u.tokens,
        calls: sum.calls + u.calls,
      }),
      { inputTokens: 0, outputTokens: 0, tokens: 0, calls: 0 },
    ),
    users: details,
  };
}

export type UsageReport = Awaited<ReturnType<typeof loadUsageReport>>;
