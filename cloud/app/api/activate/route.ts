import { activateSchema } from "@jarvis/shared/schemas";
import { body, endpoint } from "@/lib/http";
import { consumeActivation } from "@/lib/activation";
import { rateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const POST = endpoint(async (request) => {
  // Persistent global and per-install limits; changing deviceId cannot bypass global cap.
  await rateLimit("activation:global", 100, 60);
  const input = await body(request, activateSchema);
  await rateLimit(`activation:device:${input.deviceId}`, 5, 300);
  return Response.json(await consumeActivation(input), {
    headers: { "Cache-Control": "no-store" },
  });
});
