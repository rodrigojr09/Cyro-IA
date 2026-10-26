import OpenAI from "openai";
import { chatSchema, inputReservation } from "@jarvis/shared/schemas";
import { deviceAuth } from "@/lib/auth";
import { body, endpoint, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { reserve, settle } from "@/lib/budget";
import { proxyCompletion } from "@/lib/proxy";
import { db } from "@/lib/db";
import { openAISettings } from "@/lib/provider-settings";
import { requireStorage } from "@/lib/storage";
export const runtime = "nodejs";
export const maxDuration = 120;
export const POST = endpoint(async (request) => {
  const device = await deviceAuth(request);
  await requireStorage(device.userId);
  await rateLimit(`chat:${device.userId}`, 20, 60);
  const input = await body(request, chatSchema, 4 * 1024 * 1024);
  if (
    !input.messages.some((message) => Array.isArray(message.content)) &&
    Buffer.byteLength(JSON.stringify(input)) > 131072
  )
    throw new HttpError(413, "Corpo muito grande.");
  const settings = await db.systemSettings.findUnique({
    where: { id: "global" },
  });
  if (settings && !settings.intelligenceEnabled)
    throw new HttpError(
      403,
      "Inteligência artificial suspensa pelo administrador.",
    );
  input.max_completion_tokens = Math.min(
    input.max_completion_tokens,
    settings?.maxOutputTokens ?? 3500,
  );
  const provider = await openAISettings();
  if (!provider.allowedModels.includes(input.model))
    throw new HttpError(403, "Modelo não autorizado.");
  if (!provider.apiKey) throw new HttpError(503, "Provedor não configurado.");
  const reservation = await reserve(
    device.userId,
    inputReservation(input.messages, input.model) +
      Buffer.byteLength(JSON.stringify(input.tools ?? [])) +
      input.max_completion_tokens +
      1024,
  );
  const client = new OpenAI({
    apiKey: provider.apiKey,
    timeout: 90000,
    maxRetries: 0,
  });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(95000)]);
  const options = {
    model: input.model,
    messages:
      input.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: input.tools as
      OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
    max_completion_tokens: input.max_completion_tokens,
    ...(input.tool_choice ? { tool_choice: input.tool_choice } : {}),
    ...(input.parallel_tool_calls === false
      ? { parallel_tool_calls: false }
      : {}),
    store: false,
  };
  return proxyCompletion(
    client,
    { ...options, stream: false },
    input.stream,
    signal,
    (usage) => settle(reservation, device.id, input.model, usage),
  );
});
