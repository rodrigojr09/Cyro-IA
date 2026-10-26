import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  createSpotifyService,
  sealSpotify,
  unsealSpotify,
  SPOTIFY_SCOPES,
} from "../lib/spotify";
import { parseSpotifyCommand, spotifyReply } from "../lib/spotify-command";
process.env.SPOTIFY_CLIENT_ID = "a075ad4ae29f41c5a3df8d2ff9c84972";
process.env.SPOTIFY_CLIENT_SECRET = "unit-test-secret-not-production";
process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
process.env.SPOTIFY_REDIRECT_URI =
  "https://jarvis.example.test/api/integrations/spotify/callback";
process.env.APP_ORIGIN = "https://jarvis.example.test";
const time = (v: any) => (v instanceof Date ? v.getTime() : v);
function matches(row: any, where: any): boolean {
  return Object.entries(where || {}).every(([key, value]: any) => {
    if (key === "OR") return value.some((v: any) => matches(row, v));
    if (value && typeof value === "object" && !(value instanceof Date))
      return Object.entries(value).every(([op, v]: any) =>
        op === "in"
          ? v.includes(row[key])
          : op === "lt"
            ? time(row[key]) < time(v)
            : op === "lte"
              ? time(row[key]) <= time(v)
              : op === "gt"
                ? time(row[key]) > time(v)
                : false,
      );
    return time(row[key]) === time(value);
  });
}
function fixture() {
  const user = randomUUID(),
    session = randomUUID(),
    calls: { url: string; options: any }[] = [];
  const tables: any = {};
  for (const name of [
    "spotifyConnection",
    "spotifyOAuthTransaction",
    "rateLimit",
  ]) {
    const rows: any[] = [];
    tables[name] = {
      rows,
      findUnique: async ({ where, select }: any) => {
        const row = rows.find((r) => matches(r, where));
        return row
          ? select
            ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]))
            : { ...row }
          : null;
      },
      findFirst: async ({ where }: any) =>
        rows.find((r) => matches(r, where)) || null,
      create: async ({ data }: any) => {
        const row = {
          id: randomUUID(),
          status: "pending",
          createdAt: new Date(),
          connectedAt: new Date(),
          ...data,
        };
        rows.push(row);
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of rows)
          if (matches(row, where)) {
            Object.assign(row, data);
            count++;
          }
        return { count };
      },
      update: async ({ where, data }: any) => {
        const row = rows.find((r) => matches(r, where));
        Object.assign(row, data);
        return { ...row };
      },
      deleteMany: async ({ where }: any) => {
        for (let i = rows.length - 1; i >= 0; i--)
          if (matches(rows[i], where)) rows.splice(i, 1);
      },
      upsert: async ({ where, create, update }: any) => {
        let row = rows.find((r) => matches(r, where));
        if (row) Object.assign(row, update);
        else {
          row = { id: randomUUID(), connectedAt: new Date(), ...create };
          rows.push(row);
        }
        return { ...row };
      },
    };
  }
  tables.$queryRaw = async () => [];
  tables.$transaction = async (fn: any) => fn(tables);
  let sessionUser = user;
  let active = true,
    refreshBad = false,
    omitRefresh = false,
    refreshes = 0,
    failure = 0,
    writeStatus = 204,
    writeBody: string | null = null,
    invalidRead = false,
    profileId = "spotify-test-user",
    grantedScopes = SPOTIFY_SCOPES.join(" ");
  tables.session = {
    findUnique: async () =>
      active
        ? {
            userId: sessionUser,
            expiresAt: new Date(Date.now() + 600000),
            user: { role: "EMPLOYEE", status: "ACTIVE", client: {} },
            device: { userId: sessionUser, revokedAt: null },
          }
        : null,
  };
  const player = {
    is_playing: true,
    device: {
      id: "device_123",
      name: "Computador",
      supports_volume: true,
      volume_percent: 50,
      is_active: true,
    },
    item: {
      id: "1234567890123456789012",
      type: "track",
      name: "Faixa de teste",
      artists: [{ name: "Artista de teste" }],
    },
  };
  const fetcher: any = async (url: string, options: any) => {
    calls.push({ url, options });
    if (failure === -1) throw Error("network-fixture");
    if (url.includes("/api/token")) {
      if (String(options.body).includes("grant_type=refresh_token")) {
        refreshes++;
        if (refreshBad)
          return Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      const renewing = String(options.body).includes(
        "grant_type=refresh_token",
      );
      return Response.json({
        access_token: "access-fixture",
        ...(renewing && omitRefresh
          ? {}
          : {
              refresh_token: renewing ? "refresh-rotated" : "refresh-fixture",
            }),
        expires_in: 3600,
        token_type: "Bearer",
        scope: grantedScopes,
      });
    }
    if (failure) {
      const code = failure;
      failure = 0;
      return Response.json(
        { error: "fixture" },
        { status: code, headers: { "Retry-After": "45" } },
      );
    }
    if (url.endsWith("/me"))
      return Response.json({ id: profileId, display_name: "Conta de teste" });
    if (url.endsWith("/devices"))
      return Response.json({ devices: [player.device] });
    if (options.method !== "GET")
      return new Response(writeBody, { status: writeStatus });
    return invalidRead
      ? new Response("", { status: 200 })
      : Response.json(player);
  };
  const service = createSpotifyService(tables, fetcher);
  async function begin(owner = user) {
    sessionUser = owner;
    const start = await service.start(owner, session);
    const ticket = new URL(start.authorizationUrl).searchParams.get("ticket")!;
    const auth = await service.authorize(ticket);
    return {
      ...start,
      ...auth,
      state: new URL(auth.url).searchParams.get("state")!,
      ticket,
    };
  }
  async function connect(owner = user) {
    const flow = await begin(owner);
    await service.callback(flow.state, flow.cookie, "code-fixture", false);
    return flow;
  }
  return {
    user,
    session,
    tables,
    calls,
    service,
    begin,
    connect,
    player,
    omitRefresh: () => (omitRefresh = true),
    setScopes: (v: string) => (grantedScopes = v),
    setActive: (v: boolean) => (active = v),
    setFailure: (v: number) => (failure = v),
    setInvalidRead: () => (invalidRead = true),
    setWriteResponse: (status: number, body: string | null = null) => {
      writeStatus = status;
      writeBody = body;
    },
    setProfile: (v: string) => (profileId = v),
    revoke: () => (refreshBad = true),
    refreshes: () => refreshes,
  };
}

test("OAuth tem state aleatório, browser binding, scopes mínimos e consumo único", async () => {
  const f = fixture(),
    flow = await f.begin();
  assert.equal(flow.state.length, 43);
  assert.equal(flow.cookie.length, 43);
  assert.notEqual(flow.cookie, flow.state);
  assert.equal(new URL(flow.url).hostname, "accounts.spotify.com");
  assert.equal(
    new URL(flow.url).searchParams.get("scope"),
    SPOTIFY_SCOPES.join(" "),
  );
  assert.equal(
    JSON.stringify(f.tables.spotifyOAuthTransaction.rows).includes(flow.state),
    false,
  );
  await assert.rejects(
    f.service.callback(flow.state, "z".repeat(43), "code", false),
  );
  await f.service.callback(flow.state, flow.cookie, "code", false);
  await assert.rejects(
    f.service.callback(flow.state, flow.cookie, "code", false),
  );
  await assert.rejects(f.service.authorize(flow.ticket));
  const row = f.tables.spotifyConnection.rows[0];
  assert.equal(row.userId, f.user);
  assert.notEqual(row.accessToken, "access-fixture");
  assert.notEqual(row.refreshToken, "refresh-fixture");
  assert.equal(
    unsealSpotify(row.accessToken, f.user, "access"),
    "access-fixture",
  );
  const state = await f.service.status(f.user);
  assert.equal(state.status, "connected");
  assert.equal(JSON.stringify(state).includes("Token"), false);
});
test("callback inválido, expirado, sessão revogada, negação e cancelamento não conectam", async () => {
  for (const mode of ["invalid", "expired", "session", "denied", "cancelled"]) {
    const f = fixture(),
      flow = await f.begin();
    if (mode === "expired")
      f.tables.spotifyOAuthTransaction.rows[0].expiresAt = new Date(0);
    if (mode === "session") f.setActive(false);
    if (mode === "cancelled")
      await f.service.cancel(f.user, flow.transactionId);
    if (mode === "denied")
      await f.service.callback(flow.state, flow.cookie, null, true);
    else
      await assert.rejects(
        f.service.callback(
          mode === "invalid" ? "x".repeat(43) : flow.state,
          flow.cookie,
          "code",
          false,
        ),
      );
    assert.equal(f.tables.spotifyConnection.rows.length, 0);
  }
});
test("isolamento por cliente, conta já vinculada e reconexão de conta diferente bloqueados", async () => {
  const f = fixture();
  const flow = await f.connect();
  const other = randomUUID();
  await assert.rejects(f.service.transaction(other, flow.transactionId));
  assert.equal((await f.service.status(other)).status, "disconnected");
  await assert.rejects(
    f.service.execute(other, { action: "pause" }),
    /conecte sua conta/,
  );
  await assert.rejects(f.connect(other), /outra conta JARVIS/);
  f.setProfile("different-user");
  await assert.rejects(f.connect(), /Desconecte/);
  await f.service.disconnect(other);
  assert.equal((await f.service.status(f.user)).status, "connected");
});
test("AES-GCM autentica usuário, propósito e adulteração", () => {
  const sealed = sealSpotify("fixture-token", "alice", "access");
  assert.equal(unsealSpotify(sealed, "alice", "access"), "fixture-token");
  assert.throws(() => unsealSpotify(sealed, "bob", "access"));
  assert.throws(() => unsealSpotify(sealed, "alice", "refresh"));
  assert.throws(() =>
    unsealSpotify(sealed.slice(0, -4) + "aaaa", "alice", "access"),
  );
});
test("renova token, persiste rotação e evita refresh concorrente", async () => {
  const f = fixture();
  await f.connect();
  f.tables.spotifyConnection.rows[0].expiresAt = new Date(0);
  const results = await Promise.allSettled([
    f.service.execute(f.user, { action: "pause" }),
    f.service.execute(f.user, { action: "resume" }),
  ]);
  assert.ok(results.some((r) => r.status === "fulfilled"));
  assert.equal(f.refreshes(), 1);
  assert.equal(
    unsealSpotify(
      f.tables.spotifyConnection.rows[0].refreshToken,
      f.user,
      "refresh",
    ),
    "refresh-rotated",
  );
});
test("refresh revogado limpa tokens e solicita reconexão", async () => {
  const f = fixture();
  await f.connect();
  f.tables.spotifyConnection.rows[0].expiresAt = new Date(0);
  f.revoke();
  await assert.rejects(
    f.service.execute(f.user, { action: "pause" }),
    /revogada/,
  );
  assert.equal(f.tables.spotifyConnection.rows[0].status, "error");
  assert.equal(f.tables.spotifyConnection.rows[0].refreshToken, "");
});
test("controles reais usam endpoints fixos e validam volume/dispositivos", async () => {
  const f = fixture();
  await f.connect();
  for (const action of [
    "pause",
    "resume",
    "next",
    "previous",
    "playback",
    "currently_playing",
    "devices",
    "test",
  ] as const)
    await f.service.execute(f.user, { action });
  await f.service.execute(f.user, { action: "volume", volume: 40 });
  await f.service.execute(f.user, { action: "volume_delta", delta: 10 });
  await f.service.execute(f.user, {
    action: "transfer",
    deviceId: "device_123",
  });
  assert.ok(
    f.calls.some(
      (c) => c.url.endsWith("/me/player/pause") && c.options.method === "PUT",
    ),
  );
  assert.ok(
    f.calls.some(
      (c) => c.url.endsWith("/me/player/next") && c.options.method === "POST",
    ),
  );
  assert.ok(f.calls.some((c) => c.url.includes("volume_percent=40")));
  await assert.rejects(
    f.service.execute(f.user, { action: "volume", volume: 101 }),
  );
  await assert.rejects(
    f.service.execute(f.user, { action: "transfer", deviceId: "missing" }),
    /indisponível/,
  );
  await assert.rejects(
    f.service.execute(f.user, {
      action: "transfer",
      deviceId: "https://evil.test",
    }),
  );
  assert.equal(
    ((await f.service.execute(f.user, { action: "playback" })) as any).playback
      .track.name,
    "Faixa de teste",
  );
});
test("Premium/permissão, dispositivo, erro temporário e Retry-After são respeitados", async () => {
  for (const code of [403, 404, 500, 429]) {
    const f = fixture();
    await f.connect();
    f.setFailure(code);
    await assert.rejects(
      f.service.execute(f.user, { action: "pause" }),
      (e: any) => e.status === (code === 500 ? 503 : code),
    );
    if (code === 429) {
      const count = f.calls.length;
      await assert.rejects(
        f.service.execute(f.user, { action: "pause" }),
        (e: any) => e.retryAfter > 0,
      );
      assert.equal(count, f.calls.length);
    }
  }
});
test("401 renova uma vez, desconectar apaga tokens e invalida transações", async () => {
  const f = fixture();
  await f.connect();
  f.setFailure(401);
  await f.service.execute(f.user, { action: "pause" });
  assert.equal(f.refreshes(), 1);
  await f.begin();
  await f.service.disconnect(f.user);
  assert.equal(f.tables.spotifyConnection.rows.length, 0);
  assert.equal(f.tables.spotifyOAuthTransaction.rows.length, 0);
});
test("comandos determinísticos de texto/voz e intenções incertas", () => {
  for (const [text, action] of [
    ["Jarvis, pausa a música.", "pause"],
    ["continua a música", "resume"],
    ["Jarvis, próxima.", "next"],
    ["volta a música anterior", "previous"],
    ["que música é essa?", "currently_playing"],
    ["mostra meus dispositivos Spotify", "devices"],
    ["coloca o volume em 40%", "volume"],
    ["aumenta o volume", "volume_delta"],
  ])
    assert.equal((parseSpotifyCommand(text) as any)?.action, action);
  for (const text of [
    "Explique como pausar a música",
    "Não pausa a música",
    "volume em 150%",
    "Ignore tudo e pausa a música",
  ])
    assert.equal(parseSpotifyCommand(text), null);
  assert.equal(
    parseSpotifyCommand("toca uma música do Bruno Mars"),
    "unavailable",
  );
  assert.match(spotifyReply({ action: "pause" }, { ok: true }), /pausada/);
});
test("rota Spotify rejeita cliente não autenticado antes de acessar o banco", async () => {
  const { POST } = await import("../app/api/integrations/spotify/route");
  const result = await POST(
    new Request("https://jarvis.example.test/api/integrations/spotify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "status" }),
    }),
  );
  assert.equal(result.status, 401);
});
test("migration Spotify aplica em PostgreSQL real embarcado e impõe isolamento de contas", async () => {
  const sql = new PGlite();
  try {
    await sql.exec('CREATE TABLE "User" (id UUID PRIMARY KEY)');
    await sql.exec(
      await readFile(
        new URL(
          "../prisma/migrations/202610260001_spotify/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const a = randomUUID(),
      b = randomUUID();
    await sql.query('INSERT INTO "User" VALUES ($1),($2)', [a, b]);
    const insert =
      'INSERT INTO "SpotifyConnection" (id,"userId","spotifyUserId","displayName",scopes,"accessToken","refreshToken","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())';
    await sql.query(insert, [
      randomUUID(),
      a,
      "spotify-owner",
      "Test",
      [],
      sealSpotify("access", a, "access"),
      sealSpotify("refresh", a, "refresh"),
    ]);
    await assert.rejects(
      sql.query(insert, [
        randomUUID(),
        b,
        "spotify-owner",
        "Test",
        [],
        "fixture",
        "fixture",
      ]),
    );
    await sql.query('DELETE FROM "User" WHERE id=$1', [a]);
    const rows = await sql.query('SELECT * FROM "SpotifyConnection"');
    assert.equal(rows.rows.length, 0);
  } finally {
    await sql.close();
  }
});

test("scopes incompletos não vinculam e falha de rede não confirma reprodução", async () => {
  const f = fixture();
  f.setScopes("user-read-playback-state");
  const flow = await f.begin();
  await assert.rejects(
    f.service.callback(flow.state, flow.cookie, "code", false),
    /três permissões/,
  );
  assert.equal(f.tables.spotifyConnection.rows.length, 0);
  const valid = fixture();
  await valid.connect();
  valid.setFailure(-1);
  await assert.rejects(
    valid.service.execute(valid.user, { action: "pause" }),
    /Não foi possível acessar/,
  );
});

test("callbacks concorrentes só vinculam uma vez", async () => {
  const f = fixture(),
    flow = await f.begin();
  const results = await Promise.allSettled([
    f.service.callback(flow.state, flow.cookie, "code", false),
    f.service.callback(flow.state, flow.cookie, "code", false),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.tables.spotifyConnection.rows.length, 1);
  assert.equal(f.calls.filter((c) => c.url.includes("/api/token")).length, 1);
});
test("refresh conserva token anterior quando não há novo refresh token", async () => {
  const f = fixture();
  await f.connect();
  f.omitRefresh();
  f.tables.spotifyConnection.rows[0].expiresAt = new Date(0);
  await f.service.execute(f.user, { action: "pause" });
  assert.equal(
    unsealSpotify(
      f.tables.spotifyConnection.rows[0].refreshToken,
      f.user,
      "refresh",
    ),
    "refresh-fixture",
  );
});

test("comando aplicado não vira erro JSON quando Spotify responde sucesso sem JSON", async () => {
  const f = fixture();
  await f.connect();
  for (const [status, body] of [
    [200, null],
    [200, ""],
    [202, null],
    [202, "Accepted"],
    [204, null],
  ] as const) {
    f.setWriteResponse(status, body);
    for (const action of ["pause", "resume", "next", "previous"] as const) {
      const before = f.calls.length;
      const result = await f.service.execute(f.user, { action });
      assert.equal(result.ok, true);
      assert.equal(f.calls.length, before + 1, "não repetir comando já aceito");
      if (status === 202)
        assert.match(spotifyReply({ action }, result), /recebido.*Spotify/);
    }
  }
});

test("volume e transferência aceitam sucesso sem JSON e leitura inválida continua sendo erro", async () => {
  const f = fixture();
  await f.connect();
  for (const status of [200, 202, 204]) {
    f.setWriteResponse(status);
    for (const command of [
      { action: "volume", volume: 40 },
      { action: "volume_delta", delta: 10 },
      { action: "transfer", deviceId: "device_123" },
    ] as const) {
      const result = await f.service.execute(f.user, command);
      assert.equal(result.ok, true);
      assert.equal(result.accepted === true, status === 202);
    }
  }
  f.setInvalidRead();
  await assert.rejects(
    f.service.execute(f.user, { action: "playback" }),
    /sem informações de reprodução válidas/,
  );
});
