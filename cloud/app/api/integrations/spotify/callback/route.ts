import { spotify } from "@/lib/spotify";
import { HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export async function GET(request: Request) {
  let message = "Autorização concluída. Volte ao Cyro para conferir a conexão.",
    status = 200;
  try {
    const query = new URL(request.url).searchParams;
    if (
      query.getAll("state").length !== 1 ||
      query.getAll("code").length > 1 ||
      query.getAll("error").length > 1
    )
      throw new HttpError(400, "Retorno inválido.");
    await rateLimit(
      `spotify-callback:${request.headers.get("x-forwarded-for")?.split(",")[0]?.slice(0, 64) || "unknown"}`,
      30,
      300,
    );
    const cookie =
      request.headers
        .get("cookie")
        ?.match(/(?:^|;\s*)__Host-jarvis-spotify=([\w-]{43})(?:;|$)/)?.[1] ||
      "";
    await spotify.callback(
      query.get("state") || "",
      cookie,
      query.get("code"),
      query.has("error"),
    );
    if (query.has("error"))
      message = "Autorização cancelada. Volte ao Cyro para tentar novamente.";
  } catch (error) {
    status = error instanceof HttpError ? error.status : 503;
    message =
      "Não foi possível concluir a autorização. Volte ao Cyro e inicie uma nova conexão.";
  }
  return new Response(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Spotify · Cyro IA</title><h1>Spotify · Cyro IA</h1><p>${message}</p></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        "X-Content-Type-Options": "nosniff",
        "Set-Cookie":
          "__Host-jarvis-spotify=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
      },
    },
  );
}
