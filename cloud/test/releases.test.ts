import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { githubClient } from "../lib/releases/github";
import { signTicket, verifyTicket } from "../lib/releases/tickets";
import { releaseAdmin } from "../lib/releases/policy";
import { publishInstaller } from "../lib/releases/publisher";
import { createPublisher } from "../scripts/publisher-server";
import { latestStable } from "../lib/releases/selection";
const key = "test-only-".repeat(10),
  sha = "a".repeat(40);
test("latest stable ignores draft, failed, prerelease and newer creation dates", () => {
  const rows = [
    { version: "6.9.0", status: "PUBLISHED", stable: true },
    { version: "6.10.0", status: "PUBLISHED", stable: true },
    { version: "7.0.0", status: "PROCESSING", stable: true },
    { version: "8.0.0-beta", status: "PUBLISHED", stable: false },
    { version: "9.0.0", status: "FAILED", stable: true },
  ];
  assert.equal(latestStable(rows)?.version, "6.10.0");
  assert.equal(latestStable([]), null);
});
function exe() {
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
  b.writeUInt32LE(6 * 65536 + 3, 1116);
  b.writeUInt32LE(0, 1120);
  b.write("NullsoftInst", 2000);
  return b;
}
function github(bytes: Buffer, existing = false) {
  const calls: { url: string; method: string; body: any }[] = [];
  let created = false;
  const request: typeof fetch = async (input, init = {}) => {
    const url = String(input),
      method = init.method || "GET";
    calls.push({ url, method, body: init.body });
    if (url.includes("/git/ref/tags/"))
      return Response.json({ ref: "refs/tags/v6.3.0", object: { sha } });
    if (url.endsWith("/Cyro-IA")) return Response.json({ private: true });
    if (url.includes("/releases/tags/"))
      return existing
        ? Response.json({
            id: 12,
            tag_name: "v6.3.0",
            prerelease: false,
            draft: false,
          })
        : new Response("", { status: 404 });
    if (url.endsWith("/releases") && method === "POST") {
      created = true;
      return Response.json({
        id: 12,
        tag_name: "v6.3.0",
        prerelease: false,
        draft: true,
      });
    }
    if (url.includes("/assets?per_page"))
      return Response.json(existing ? [{ id: 18, name: "Setup.exe" }] : []);
    if (url.startsWith("https://uploads.github.com/"))
      return Response.json({ id: 18 });
    if (url.endsWith("/releases/assets/18"))
      return new Headers(init.headers).get("accept") ===
        "application/octet-stream"
        ? new Response(new Uint8Array(bytes), {
            headers: { "content-length": String(bytes.length) },
          })
        : Response.json({
            id: 18,
            name: "Setup.exe",
            state: "uploaded",
            size: bytes.length,
          });
    if (method === "PATCH") return Response.json({});
    throw Error("Unexpected GitHub path");
  };
  return {
    request,
    calls,
    get created() {
      return created;
    },
  };
}
test("all GitHub tag pages are read and ordered semantically; no tag writes", async () => {
  let pages = 0;
  const request: typeof fetch = async (url) => {
    pages++;
    return Response.json(
      String(url).endsWith("page=1")
        ? Array.from({ length: 100 }, (_, n) => ({
            name: "v6." + n + ".0",
            commit: { sha },
          }))
        : [
            { name: "v6.100.0", commit: { sha } },
            { name: "not-semver", commit: { sha } },
          ],
    );
  };
  const rows = await githubClient("fixture", request).tags();
  assert.equal(pages, 2);
  assert.equal(rows.length, 101);
  assert.equal(rows[0].version, "6.100.0");
  await assert.rejects(
    githubClient("fixture", async () => new Response("", { status: 404 })).tag(
      "v8.0.0",
    ),
  );
});
test("tickets reject tamper/expiration and publication rejects ordinary administrators", () => {
  const ticket = signTicket(
    { purpose: "upload", exp: Date.now() + 10000 },
    key,
  );
  assert.equal(verifyTicket(ticket, key).purpose, "upload");
  assert.throws(() => verifyTicket(ticket + "bad", key));
  assert.throws(() => verifyTicket(signTicket({ exp: 0 }, key), key));
  for (const role of ["EMPLOYEE", "ADMIN"])
    assert.throws(() => releaseAdmin({ role }));
  releaseAdmin({ role: "SUPER_ADMIN" });
});
test("publisher associates an existing tag, uploads only Setup.exe, verifies bytes and never creates refs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cyro-publish-"));
  try {
    const bytes = exe(),
      file = join(dir, "arbitrary.EXE");
    await writeFile(file, bytes);
    const fixture = github(bytes);
    const result = await publishInstaller(
      {
        id: randomUUID(),
        attempt: randomUUID(),
        tag: "v6.3.0",
        sha,
        version: "6.3.0",
        size: bytes.length,
        changelog: "notes",
        recover: false,
      },
      file,
      createHash("sha256").update(bytes).digest("hex"),
      "fixture",
      fixture.request,
    );
    assert.equal(result.assetId, "18");
    assert.equal(result.private, true);
    assert.match(result.url, /v6.3.0\/Setup.exe$/);
    assert.equal(fixture.created, true);
    assert.equal(
      fixture.calls.some(
        (c) => c.url.includes("/git/ref") && c.method !== "GET",
      ),
      false,
    );
    assert.match(
      fixture.calls.find((c) => c.url.startsWith("https://uploads"))!.url,
      /name=Setup.exe$/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("existing Setup blocks normal publication; explicit recovery verifies the entire existing asset without replacing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cyro-publish-"));
  try {
    const bytes = exe(),
      file = join(dir, "x.exe");
    await writeFile(file, bytes);
    const fixture = github(bytes, true),
      ticket = {
        id: randomUUID(),
        attempt: randomUUID(),
        tag: "v6.3.0",
        sha,
        version: "6.3.0",
        size: bytes.length,
        changelog: "",
        recover: false,
      },
      hash = createHash("sha256").update(bytes).digest("hex");
    await assert.rejects(
      publishInstaller(ticket, file, hash, "fixture", fixture.request),
    );
    await publishInstaller(
      { ...ticket, recover: true },
      file,
      hash,
      "fixture",
      fixture.request,
    );
    assert.equal(
      fixture.calls.some(
        (c) => c.method === "DELETE" || c.url.startsWith("https://uploads"),
      ),
      false,
    );
    await assert.rejects(
      publishInstaller(
        { ...ticket, recover: true },
        file,
        "b".repeat(64),
        "fixture",
        fixture.request,
      ),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("additive release migration preserves data, enforces unique tags and refuses incomplete publication", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE TABLE existing_data (value TEXT); INSERT INTO existing_data VALUES ('preserve');",
    );
    await db.exec(
      await readFile(
        new URL(
          "../prisma/migrations/20261029190000_cyro_releases/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const id = randomUUID();
    await db.query(
      'INSERT INTO "CyroRelease" (id,version,"githubTag","tagSha","fileSize",attempt,"updatedAt") VALUES ($1,\'6.3.0\',\'v6.3.0\',$2,65536,$3,NOW())',
      [id, sha, randomUUID()],
    );
    await assert.rejects(
      db.query("UPDATE \"CyroRelease\" SET status='PUBLISHED' WHERE id=$1", [
        id,
      ]),
    );
    await assert.rejects(
      db.query(
        'INSERT INTO "CyroRelease" (id,version,"githubTag","tagSha","fileSize",attempt,"updatedAt") VALUES ($1,\'6.3.0\',\'v6.3.0\',$2,65536,$3,NOW())',
        [randomUUID(), sha, randomUUID()],
      ),
    );
    assert.equal(
      (await db.query<any>("SELECT value FROM existing_data")).rows[0].value,
      "preserve",
    );
  } finally {
    await db.close();
  }
});
test("external service rejects forged ticket and CORS origin without forwarding bytes or credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "cyro-service-"));
  const { server } = createPublisher({
    cloudOrigin: "https://cloud.example.test",
    root,
    token: "private-fixture",
    key,
    request: async () => {
      throw Error("Should not call GitHub");
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  try {
    const rejected = await fetch("http://127.0.0.1:" + port + "/upload", {
      method: "PUT",
      headers: { Origin: "https://evil.example.test" },
      body: "bytes",
    });
    assert.equal(rejected.status, 403);
    const forged = await fetch("http://127.0.0.1:" + port + "/upload", {
      method: "PUT",
      headers: { Authorization: "Bearer forged" },
      body: "bytes",
    });
    assert.equal(forged.status, 400);
    assert.equal((await forged.text()).includes("private-fixture"), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
test("external upload streams installer, publishes fixed asset and confirms only after verification", async () => {
  const root = await mkdtemp(join(tmpdir(), "cyro-service-")),
    bytes = exe(),
    fixture = github(bytes),
    events: string[] = [];
  const request: typeof fetch = async (input, init) => {
    if (String(input) === "https://cloud.example.test/api/releases/callback") {
      const value = verifyTicket(JSON.parse(String(init?.body)).ticket, key);
      events.push(String(value.event));
      return Response.json({ ok: true });
    }
    return fixture.request(input, init);
  };
  const { server, drain } = createPublisher({
    cloudOrigin: "https://cloud.example.test",
    root,
    token: "private-fixture",
    key,
    request,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  try {
    const ticket = signTicket(
      {
        purpose: "upload",
        id: randomUUID(),
        attempt: randomUUID(),
        tag: "v6.3.0",
        sha,
        version: "6.3.0",
        size: bytes.length,
        changelog: "fixture",
        recover: false,
        exp: Date.now() + 60000,
      },
      key,
    );
    const result = await fetch("http://127.0.0.1:" + port + "/upload", {
      method: "PUT",
      headers: {
        Origin: "https://cloud.example.test",
        Authorization: "Bearer " + ticket,
        "Content-Type": "application/vnd.microsoft.portable-executable",
      },
      body: bytes,
    });
    assert.equal(result.status, 202);
    await drain();
    assert.deepEqual(events, ["start", "complete"]);
    assert.equal((await result.text()).includes("private-fixture"), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
