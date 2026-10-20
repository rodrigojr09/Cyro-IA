import { db } from "./db";
import { HttpError } from "./http";
export async function reserve(userId: string, amount: number) {
  const period = new Date().toISOString().slice(0, 7);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.status !== "ACTIVE")
      throw new HttpError(403, "Funcionário inativo.");
    const budget = await tx.usageBudget.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period },
      update: {},
    });
    if (budget.charged + budget.reserved + amount > user.monthlyTokenLimit)
      throw new HttpError(429, "Limite mensal de tokens atingido.");
    await tx.usageBudget.update({
      where: { userId_period: { userId, period } },
      data: { reserved: { increment: amount } },
    });
  });
  return { userId, period, amount };
}
export async function settle(
  reservation: { userId: string; period: string; amount: number },
  deviceId: string,
  model: string,
  usage: { prompt_tokens: number; completion_tokens: number } | null,
) {
  if (!usage) {
    // Keep the conservative reservation on unknown provider usage (disconnect/crash).
    await db.auditLog.create({
      data: {
        actorId: reservation.userId,
        action: "usage.unknown",
        targetType: "Device",
        targetId: deviceId,
      },
    });
    return;
  }
  const input = Number(process.env.OPENAI_INPUT_PRICE_PER_MILLION);
  const output = Number(process.env.OPENAI_OUTPUT_PRICE_PER_MILLION);
  const priced =
    !!process.env.OPENAI_INPUT_PRICE_PER_MILLION &&
    !!process.env.OPENAI_OUTPUT_PRICE_PER_MILLION &&
    Number.isFinite(input) &&
    Number.isFinite(output) &&
    input >= 0 &&
    output >= 0;
  await db.$transaction([
    db.usageBudget.update({
      where: {
        userId_period: {
          userId: reservation.userId,
          period: reservation.period,
        },
      },
      data: {
        reserved: { decrement: reservation.amount },
        charged: { increment: usage.prompt_tokens + usage.completion_tokens },
      },
    }),
    db.usageLog.create({
      data: {
        userId: reservation.userId,
        deviceId,
        model,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        estimatedCost: priced
          ? (usage.prompt_tokens * input + usage.completion_tokens * output) /
            1000000
          : null,
      },
    }),
  ]);
}
