import { endpoint } from "@/lib/http";
import { latestRelease, releaseMetadata } from "@/lib/releases/catalog";
export const GET = endpoint(async () => {
  const latest = await latestRelease();
  return Response.json(
    { release: latest ? releaseMetadata(latest) : null },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
  );
});
