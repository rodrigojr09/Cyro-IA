import { z } from "zod";
import OpenAI from "openai";
import { deviceAuth } from "@/lib/auth";
import { body, endpoint, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { reserve, settle } from "@/lib/budget";
import { db } from "@/lib/db";
import { speechError } from "@/lib/speech-error";
import { requireStorage } from "@/lib/storage";
const schema = z
  .object({
    model: z.literal("tts-1"),
    voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]),
    input: z.string().min(1).max(4000),
    response_format: z.literal("mp3"),
  })
  .strict();
export const runtime = "nodejs";
export const maxDuration = 120;
export const POST = endpoint(async (request) => {
  const device = await deviceAuth(request);
  await requireStorage(device.userId);
  const settings = await db.systemSettings.findUnique({
    where: { id: "global" },
  });
  if (settings && !settings.intelligenceEnabled)
    throw new HttpError(403, "Inteligência artificial suspensa.");
  await rateLimit(`voice:${device.userId}`, 5, 60);
  if (process.env.OPENAI_VOICE_ENABLED !== "true")
    throw new HttpError(503, "Voz não habilitada pelo administrador.");
  if (!process.env.OPENAI_API_KEY)
    throw new HttpError(503, "Chave OpenAI não configurada no Cloud.");
  const input = await body(request, schema);
  // Separate character quota; speech API returns binary, not token usage.
  await rateLimit(
    `voice-characters:${device.userId}:${new Date().toISOString().slice(0, 10)}`,
    25,
    86400,
  );
  const reservation = await reserve(device.userId, input.input.length);
  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 90000,
      maxRetries: 0,
    });
    const audio = await client.audio.speech.create(input, {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(95000)]),
    });
    await db.auditLog.create({
      data: {
        actorId: device.userId,
        action: "voice.generated",
        targetType: "Device",
        targetId: device.id,
        metadata: { model: input.model, characters: input.input.length },
      },
    });
    // Do not invent token counts. Keep conservative character reservation charged to budget.
    return new Response(await audio.arrayBuffer(), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    // Do not log text, credentials or raw provider messages.
    console.error("voice.failed", {
      upstreamStatus:
        error instanceof OpenAI.APIError ? error.status : undefined,
      timeout: error instanceof OpenAI.APIConnectionTimeoutError,
    });
    await settle(reservation, device.id, input.model, null);
    throw speechError(error);
  }
});
