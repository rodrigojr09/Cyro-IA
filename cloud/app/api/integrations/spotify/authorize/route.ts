import { endpoint } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { spotify } from "@/lib/spotify";
export const runtime = "nodejs";
export const GET = endpoint(async (request) => {
  await rateLimit(
    `spotify-browser:${request.headers.get("x-forwarded-for")?.split(",")[0]?.slice(0, 64) || "unknown"}`,
    20,
    300,
  );
  const result = await spotify.authorize(
    new URL(request.url).searchParams.get("ticket") || "",
  );
  return new Response(null, {
    status: 302,
    headers: {
      Location: result.url,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Set-Cookie": `__Host-jarvis-spotify=${result.cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300`,
    },
  });
});
