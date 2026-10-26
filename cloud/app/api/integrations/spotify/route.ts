import { z } from "zod";
import { deviceAuth } from "@/lib/auth";
import { body, endpoint, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { spotify, spotifyAction, SpotifyError } from "@/lib/spotify";
import { handleSpotifyChat } from "@/lib/spotify-chat";
import { interpretSpotifyCommand } from "@/lib/spotify-interpreter";
export const runtime = "nodejs";
export const maxDuration = 90;
const inputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.enum(["status", "start", "disconnect"]) }).strict(),
  z
    .object({ operation: z.enum(["poll", "cancel"]), transactionId: z.uuid() })
    .strict(),
  z
    .object({ operation: z.literal("control"), command: spotifyAction })
    .strict(),
  z
    .object({
      operation: z.literal("chat"),
      text: z.string().min(1).max(6000),
      selectDevice: z.boolean().optional(),
      resumeAfterSelection: z.boolean().optional(),
    })
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
        value = await handleSpotifyChat(input.text, {
          classify: async (text, selecting) => {
            const connection = await spotify.status(session.userId);
            if (!connection.configured)
              throw new HttpError(
                503,
                connection.configurationError ||
                  "Spotify não configurado no Cloud.",
              );
            if (connection.status !== "connected")
              throw new HttpError(
                409,
                "Para controlar suas músicas, conecte sua conta Spotify em Configurações → Integrações.",
              );
            return interpretSpotifyCommand(
              text,
              { userId: session.userId, id: session.id },
              request.signal,
              selecting,
            );
          },
          execute: (command) => spotify.execute(session.userId, command),
          selecting: input.selectDevice === true,
          resumeAfterSelection:
            input.selectDevice === true && input.resumeAfterSelection === true,
        });
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
