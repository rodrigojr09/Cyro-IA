import { admin } from "@/lib/auth";
import { body, endpoint, requireOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import {
  providerSettings,
  providerCommand,
  requireProviderAdmin,
} from "@/lib/provider-settings";
export const runtime = "nodejs";
export const GET = endpoint(async () => {
  const actor = await admin();
  requireProviderAdmin(actor);
  return Response.json(await providerSettings.status(), {
    headers: { "Cache-Control": "no-store" },
  });
});
export const POST = endpoint(async (request) => {
  requireOrigin(request);
  const actor = await admin();
  requireProviderAdmin(actor);
  await rateLimit(`provider-settings:${actor.id}`, 10, 300);
  const input = await body(request, providerCommand, 16384);
  return Response.json(await providerSettings.save(actor.id, input), {
    headers: { "Cache-Control": "no-store" },
  });
});
