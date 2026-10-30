// Isolated GitHub protocol fixture. Never contacts or changes a GitHub repository.
import { createServer } from "node:http";
import assert from "node:assert/strict";
export function installerFixture() {
  const b = Buffer.alloc(65536);
  b.write("MZ");
  b.writeUInt32LE(128, 60);
  b.write("PE\0\0", 128);
  b.writeUInt16LE(0x14c, 132);
  b.writeUInt16LE(1, 134);
  b.writeUInt16LE(224, 148);
  b.write(".rsrc", 376);
  b.writeUInt32LE(4096, 392);
  b.writeUInt32LE(1024, 396);
  b.writeUInt32LE(0xfeef04bd, 1100);
  b.writeUInt32LE(7 * 65536, 1116);
  b.writeUInt32LE(0, 1120);
  b.write("NullsoftInst", 2000);
  return b;
}
export async function startGitHubFixture() {
  const sha = "a".repeat(40);
  let release: any = null,
    asset: Buffer | null = null,
    tagWrites = 0;
  const server = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://local").pathname.replace(
      "/repos/rodrigojr09/Cyro-IA",
      "",
    );
    const json = (value: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    try {
      if (path.startsWith("/git/") && req.method !== "GET") {
        tagWrites++;
        return json({}, 403);
      }
      if (path === "" || path === "/")
        return json({ private: true, full_name: "rodrigojr09/Cyro-IA" });
      if (path === "/tags") return json([{ name: "v7.0.0", commit: { sha } }]);
      if (path === "/git/ref/tags/v7.0.0")
        return json({
          ref: "refs/tags/v7.0.0",
          object: { sha, type: "commit" },
        });
      if (path === "/releases/tags/v7.0.0")
        return json(release || {}, release ? 200 : 404);
      if (path === "/releases" && req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const input = JSON.parse(Buffer.concat(chunks).toString());
        assert.equal(input.tag_name, "v7.0.0");
        assert.equal(input.draft, true);
        release = { id: 1, tag_name: "v7.0.0", draft: true, prerelease: false };
        return json(release, 201);
      }
      if (path === "/releases/1/assets" && req.method === "GET")
        return json(
          asset
            ? [
                {
                  id: 2,
                  name: "Setup.exe",
                  size: asset.length,
                  state: "uploaded",
                },
              ]
            : [],
        );
      if (path === "/releases/1/assets" && req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        asset = Buffer.concat(chunks);
        return json(
          { id: 2, name: "Setup.exe", size: asset.length, state: "uploaded" },
          201,
        );
      }
      if (path === "/releases/assets/2") {
        if (req.headers.accept === "application/octet-stream") {
          res.writeHead(200, {
            "Content-Type": "application/octet-stream",
            "Content-Length": asset!.length,
          });
          return res.end(asset);
        }
        return json({
          id: 2,
          name: "Setup.exe",
          size: asset!.length,
          state: "uploaded",
        });
      }
      if (path === "/releases/1" && req.method === "PATCH") {
        release.draft = false;
        return json(release);
      }
      return json({}, 404);
    } catch {
      json({}, 500);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    get tagWrites() {
      return tagWrites;
    },
    get published() {
      return release && !release.draft;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
