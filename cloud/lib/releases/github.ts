import {
  compare,
  tagVersion,
} from "../../../desktop/scripts/updates/protocol.js";
export const repository = "rodrigojr09/Cyro-IA";
export class GitHubError extends Error {
  constructor(public status: number) {
    super("GitHub indisponível ou operação não permitida.");
  }
}
export function githubClient(
  token = process.env.CYRO_GITHUB_TOKEN,
  request: typeof fetch = fetch,
) {
  async function api(path: string, init: RequestInit = {}) {
    if (!token && init.method && init.method !== "GET")
      throw new Error("Configure a credencial GitHub somente no servidor.");
    if (path !== "" && !path.startsWith("/"))
      throw Error("Rota GitHub inválida.");
    const r = await request(
      "https://api.github.com/repos/" + repository + path,
      {
        ...init,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: "application/vnd.github+json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
          "X-GitHub-Api-Version": "2022-11-28",
          ...init.headers,
        },
      },
    );
    if (!r.ok) throw new GitHubError(r.status);
    return r.json();
  }
  async function tags() {
    const rows: { name: string; sha: string; version: string }[] = [];
    for (let page = 1; ; page++) {
      const items = await api("/tags?per_page=100&page=" + page);
      if (!Array.isArray(items)) throw Error("Resposta GitHub inválida.");
      for (const item of items) {
        try {
          rows.push({
            name: item.name,
            sha: item.commit.sha,
            version: tagVersion(item.name),
          });
        } catch {
          /* Non-version tags cannot be published. */
        }
      }
      if (items.length < 100) break;
      if (page >= 1000)
        throw Error("Catálogo excessivo; contate o administrador.");
    }
    return rows.sort(
      (a, b) => compare(b.version, a.version) || a.name.localeCompare(b.name),
    );
  }
  async function tag(name: string) {
    tagVersion(name);
    const ref = await api("/git/ref/tags/" + encodeURIComponent(name));
    if (
      ref.ref !== "refs/tags/" + name ||
      !/^[a-f0-9]{40,64}$/.test(ref.object?.sha)
    )
      throw Error("Tag não confirmada.");
    return ref.object.sha as string;
  }
  return { api, tags, tag };
}
