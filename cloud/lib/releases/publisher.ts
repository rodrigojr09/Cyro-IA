import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { githubClient, GitHubError, repository } from "./github";
import { inspect } from "../../../desktop/scripts/updates/installer.js";
import { semver } from "../../../desktop/scripts/updates/protocol.js";
type Ticket = {
  id: string;
  attempt: string;
  tag: string;
  sha: string;
  version: string;
  size: number;
  changelog: string;
  recover: boolean;
};
function id(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw Error("Identificador GitHub inválido.");
  return String(value);
}
export async function assetBody(
  asset: string,
  token: string,
  request: typeof fetch = fetch,
) {
  if (!/^\d{1,20}$/.test(asset)) throw Error("Asset inválido.");
  const first = await request(
    "https://api.github.com/repos/" + repository + "/releases/assets/" + asset,
    {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/octet-stream",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (first.status === 302) {
    const location = new URL(first.headers.get("location") || "");
    if (
      location.protocol !== "https:" ||
      ![
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
      ].includes(location.hostname) ||
      location.username ||
      location.password
    )
      throw Error("Redirecionamento GitHub inválido.");
    const next = await request(location, {
      redirect: "error",
      signal: AbortSignal.timeout(30 * 60_000),
    });
    if (!next.ok || !next.body) throw Error("Download GitHub interrompido.");
    return next;
  }
  if (!first.ok || !first.body) throw Error("Download GitHub indisponível.");
  return first;
}
export async function verifyAsset(
  asset: string,
  checksum: string,
  size: number,
  token: string,
  request: typeof fetch = fetch,
) {
  const response = await assetBody(asset, token, request);
  const hash = createHash("sha256");
  let total = 0;
  for await (const chunk of Readable.fromWeb(response.body as never)) {
    total += chunk.length;
    if (total > size) throw Error("Asset excede o tamanho esperado.");
    hash.update(chunk);
  }
  if (total !== size || hash.digest("hex") !== checksum)
    throw Error("Integridade do asset GitHub não confirmada.");
}
// Injectable API and transport allow fault tests without touching real releases.
export async function publishInstaller(
  ticket: Ticket,
  file: string,
  checksum: string,
  token = process.env.CYRO_GITHUB_TOKEN || "",
  request: typeof fetch = fetch,
) {
  await inspect(file, ticket.version);
  const github = githubClient(token, request);
  if ((await github.tag(ticket.tag)) !== ticket.sha)
    throw Error("A tag foi movida; publicação bloqueada.");
  const repo = await github.api("");
  let release;
  try {
    release = await github.api(
      "/releases/tags/" + encodeURIComponent(ticket.tag),
    );
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 404) throw error;
    // No ref endpoints are ever mutated. Recheck immediately before associating.
    if ((await github.tag(ticket.tag)) !== ticket.sha)
      throw Error("Tag não confirmada.");
    release = await github.api("/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: ticket.tag,
        name: ticket.tag,
        body: ticket.changelog,
        draft: true,
        prerelease: semver(ticket.version)!.pre.length > 0,
      }),
    });
  }
  const releaseId = id(release.id);
  if (
    release.tag_name !== ticket.tag ||
    !!release.prerelease !== semver(ticket.version)!.pre.length > 0
  )
    throw Error("Release incompatível com a tag.");
  const assets = [];
  for (let page = 1; ; page++) {
    const batch = await github.api(
      "/releases/" + releaseId + "/assets?per_page=100&page=" + page,
    );
    assets.push(...batch);
    if (batch.length < 100) break;
    if (page >= 1000) throw Error("Catálogo de assets excessivo.");
  }
  const existing = assets.filter((x) => x.name === "Setup.exe");
  if (existing.length > 1 || (existing.length && !ticket.recover))
    throw Error(
      "Setup.exe já existe. Use recuperação explícita; nenhum asset foi substituído.",
    );
  let asset = existing[0];
  if (!asset) {
    const stream = createReadStream(file);
    try {
      const uploaded = await request(
        "https://uploads.github.com/repos/" +
          repository +
          "/releases/" +
          releaseId +
          "/assets?name=Setup.exe",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/vnd.microsoft.portable-executable",
            "Content-Length": String(ticket.size),
          },
          body: stream as unknown as BodyInit,
          duplex: "half",
          redirect: "error",
          signal: AbortSignal.timeout(30 * 60_000),
        } as RequestInit,
      );
      if (!uploaded.ok)
        throw Error(
          "Upload GitHub falhou. Recupere a tentativa sem substituir assets.",
        );
      asset = await uploaded.json();
    } finally {
      stream.destroy();
    }
  }
  const assetId = id(asset.id);
  const confirmed = await github.api("/releases/assets/" + assetId);
  if (
    confirmed.name !== "Setup.exe" ||
    confirmed.state !== "uploaded" ||
    confirmed.size !== ticket.size
  )
    throw Error("Asset GitHub incompleto.");
  await verifyAsset(assetId, checksum, ticket.size, token, request);
  if ((await github.tag(ticket.tag)) !== ticket.sha)
    throw Error("Tag alterada durante publicação.");
  if (release.draft)
    await github.api("/releases/" + releaseId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: false }),
    });
  return {
    releaseId,
    assetId,
    url:
      "https://github.com/" +
      repository +
      "/releases/download/" +
      encodeURIComponent(ticket.tag) +
      "/Setup.exe",
    checksum,
    size: ticket.size,
    private: !!repo.private,
  };
}
