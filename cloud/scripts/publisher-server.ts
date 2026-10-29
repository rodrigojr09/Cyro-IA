// External long-running upload service. Never run this inside a Vercel Function.
import "dotenv/config";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { mkdir, rm } from "node:fs/promises";
import { resolve, join, isAbsolute, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { verifyTicket, signTicket, signingKey } from "../lib/releases/tickets";
import { publishInstaller, assetBody } from "../lib/releases/publisher";
import { receive } from "../../desktop/scripts/updates/installer.js";
import {
  validSize,
  tagVersion,
} from "../../desktop/scripts/updates/protocol.js";
const upload = z
  .object({
    purpose: z.literal("upload"),
    id: z.string().uuid(),
    attempt: z.string().uuid(),
    tag: z.string().max(101),
    sha: z.string().regex(/^[a-f0-9]{40,64}$/),
    version: z.string(),
    size: z.number().int().refine(validSize),
    changelog: z.string().max(10000),
    recover: z.boolean(),
    exp: z.number().int(),
  })
  .strict();
const download = z
  .object({
    purpose: z.literal("download"),
    id: z.string().uuid(),
    asset: z.string().regex(/^\d{1,20}$/),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().refine(validSize),
    exp: z.number().int(),
  })
  .strict();
export function createPublisher({
  cloudOrigin,
  root,
  token,
  key,
  request = fetch,
}: {
  cloudOrigin: string;
  root: string;
  token: string;
  key: string;
  request?: typeof fetch;
}) {
  const active = new Set<string>();
  async function callback(value: Record<string, unknown>) {
    const result = await request(cloudOrigin + "/api/releases/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticket: signTicket(
          { ...value, purpose: "publisher-callback", exp: Date.now() + 60_000 },
          key,
        ),
      }),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!result.ok) throw Error("Cloud recusou a tentativa.");
  }
  const jobs = new Set<Promise<void>>();
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url || "/", "http://publisher");
    const origin = req.headers.origin;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (origin) {
      if (origin !== cloudOrigin) {
        res.writeHead(403).end();
        return;
      }
      res.setHeader("Access-Control-Allow-Origin", cloudOrigin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "PUT,GET,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization,Content-Type",
      );
      res.writeHead(204).end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200).end("Cyro publisher");
      return;
    }
    const ticket =
      (req.headers.authorization || "").replace(/^Bearer /, "") ||
      url.searchParams.get("ticket") ||
      "";
    if (req.method === "PUT" && url.pathname === "/upload") {
      const value = upload.parse(verifyTicket(ticket, key));
      if (
        tagVersion(value.tag) !== value.version ||
        Number(req.headers["content-length"]) !== value.size
      )
        throw Error("Upload inválido.");
      if (active.size >= 2 || active.has(value.id)) {
        res.writeHead(409).end("Publicação em andamento.");
        return;
      }
      active.add(value.id);
      const dir = join(resolve(root), value.id + "-" + value.attempt),
        file = join(dir, "Setup.exe");
      let started = false,
        received = false,
        created = false;
      try {
        await mkdir(root, { recursive: true, mode: 0o700 });
        await mkdir(dir, { mode: 0o700 });
        created = true; // Exclusive local reservation.
        await callback({
          id: value.id,
          attempt: value.attempt,
          event: "start",
        });
        started = true;
        const checksum = await receive(req, file, value.size);
        received = true;
        res
          .writeHead(202, { "Content-Type": "application/json" })
          .end(JSON.stringify({ ok: true, id: value.id }));
        const task = (async () => {
          try {
            const result = await publishInstaller(
              value,
              file,
              checksum,
              token,
              request,
            );
            await callback({
              id: value.id,
              attempt: value.attempt,
              event: "complete",
              ...result,
            });
          } catch {
            await callback({
              id: value.id,
              attempt: value.attempt,
              event: "fail",
            }).catch(() => {});
          } finally {
            active.delete(value.id);
            await rm(dir, { recursive: true, force: true });
          }
        })();
        jobs.add(task);
        void task.finally(() => jobs.delete(task)).catch(() => {});
      } catch (error) {
        if (started)
          await callback({
            id: value.id,
            attempt: value.attempt,
            event: "fail",
          }).catch(() => {});
        active.delete(value.id);
        if (created && !received)
          await rm(dir, { recursive: true, force: true });
        throw error;
      }
      return;
    }
    if (req.method === "GET" && url.pathname === "/download") {
      const value = download.parse(verifyTicket(ticket, key));
      const response = await assetBody(value.asset, token, request);
      if (Number(response.headers.get("content-length")) !== value.size)
        throw Error("Tamanho GitHub inválido.");
      res.writeHead(200, {
        "Content-Type": "application/vnd.microsoft.portable-executable",
        "Content-Disposition": 'attachment; filename="Setup.exe"',
        "Content-Length": String(value.size),
      });
      await pipeline(Readable.fromWeb(response.body as never), res);
      return;
    }
    res.writeHead(404).end();
  }
  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent)
        res.writeHead(400, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            error:
              "Operação recusada ou interrompida. Consulte o histórico no Cloud.",
          }),
        );
      else res.destroy();
    });
  });
  server.requestTimeout = 2 * 3600_000;
  return { server, drain: () => Promise.allSettled(jobs) };
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/publisher-server.ts")) {
  const cloudOrigin = new URL(process.env.APP_ORIGIN || "").origin;
  if (!cloudOrigin.startsWith("https://"))
    throw Error("APP_ORIGIN HTTPS obrigatório.");
  const token = process.env.CYRO_GITHUB_TOKEN;
  if (!token) throw Error("Credencial GitHub ausente.");
  const configuredRoot = process.env.CYRO_UPLOAD_DIR;
  if (
    !configuredRoot ||
    !isAbsolute(configuredRoot) ||
    configuredRoot.split(/[\\/]/).some((part) => /^backup$/i.test(part))
  )
    throw Error(
      "Configure CYRO_UPLOAD_DIR como diretório privado absoluto fora de Backup/.",
    );
  const root = resolve(configuredRoot),
    checkout = resolve(import.meta.dirname, "../..");
  const comparable = (value: string) =>
    process.platform === "win32" ? value.toLowerCase() : value;
  if (
    comparable(root) === comparable(checkout) ||
    comparable(root).startsWith(comparable(checkout + sep))
  )
    throw Error("Staging deve ficar fora do checkout do projeto.");
  const { server, drain } = createPublisher({
    cloudOrigin,
    root,
    token,
    key: signingKey(),
  });
  server.listen(Number(process.env.PORT || 8080), "127.0.0.1", () =>
    console.log(
      "Cyro publisher pronto em loopback; exponha somente via proxy HTTPS.",
    ),
  );
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => {
      void drain().then(() => process.exit(0));
    });
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
