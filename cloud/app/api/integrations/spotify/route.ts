import { z } from "zod";
import { deviceAuth } from "@/lib/auth";
import { body, endpoint, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { spotify, spotifyAction, SpotifyError } from "@/lib/spotify";
import { parseSpotifyCommand, spotifyReply } from "@/lib/spotify-command";
export const runtime = "nodejs";
export const maxDuration = 60;
const inputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.enum(["status", "start", "disconnect"]) }).strict(),
  z
    .object({ operation: z.enum(["poll", "cancel"]), transactionId: z.uuid() })
    .strict(),
  z
    .object({ operation: z.literal("control"), command: spotifyAction })
    .strict(),
  z
    .object({ operation: z.literal("chat"), text: z.string().min(1).max(6000) })
    .strict(),
]);
export const POST = endpoint(async (request) => {
  const session = await deviceAuth(request);
  const input = await body(request, inputSchema, 32768);
  await rateLimit(`spotify:${session.userId}`, 60, 60);
  try {
    let value: unknown;
    switch (input.operation) {
      case "status":
        value = await spotify.status(session.userId);
        break;
      case "start":
        await rateLimit(`spotify-start:${session.userId}`, 3, 300);
        value = await spotify.start(session.userId, session.sessionId);
        break;
      case "poll":
        value = await spotify.transaction(session.userId, input.transactionId);
        break;
      case "cancel":
        value = await spotify.cancel(session.userId, input.transactionId);
        break;
      case "disconnect":
        value = await spotify.disconnect(session.userId);
        break;
      case "control":
        value = await spotify.execute(session.userId, input.command);
        break;
      case "chat": {
        const command = parseSpotifyCommand(input.text);
        if (!command) {
          value = { handled: false };
          break;
        }
        if (command === "unavailable") {
          value = {
            handled: true,
            reply:
              "Busca por nome e playlists não estão disponíveis nesta integração. Use continuar, pausar, próxima, anterior ou selecione um dispositivo.",
            speech: "Esse comando musical ainda não está disponível.",
          };
          break;
        }
        // Spotify metadata is displayed directly, never sent to OpenAI or model history.
        try {
          const result = await spotify.execute(session.userId, command);
          value = {
            handled: true,
            reply: spotifyReply(command, result),
            speech: "Consulte o resultado do Spotify no JARVIS.",
          };
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          value = {
            handled: true,
            reply: error.message,
            speech: error.message,
          };
        }
        break;
      }
      default:
        throw new HttpError(400, "Operação inválida.");
    }
    return Response.json(value, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SpotifyError)
      return Response.json(
        { error: error.message },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store",
            ...(error.retryAfter
              ? { "Retry-After": String(error.retryAfter) }
              : {}),
          },
        },
      );
    throw error;
  }
});
