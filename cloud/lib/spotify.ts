import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./http";
import { canUseSession } from "./policy";
import { spotifyRuntime, spotifyEnvironment } from "./provider-settings";

export const SPOTIFY_SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
] as const;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
export function spotifyConfig() {
  const {
    SPOTIFY_CLIENT_ID: id,
    SPOTIFY_CLIENT_SECRET: secret,
    SPOTIFY_REDIRECT_URI: redirect,
    SPOTIFY_TOKEN_ENCRYPTION_KEY: key,
  } = spotifyRuntime.getStore() || process.env;
  if (
    !id ||
    !/^[a-f0-9]{32}$/i.test(id) ||
    !secret ||
    !key ||
    !/^[a-f0-9]{64}$/i.test(key)
  )
    throw new HttpError(
      503,
      "Spotify ainda não configurado pelo administrador.",
    );
  let url: URL;
  try {
    url = new URL(redirect!);
  } catch {
    throw new HttpError(503, "Redirect Spotify não configurado.");
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== process.env.APP_ORIGIN ||
    url.pathname !== "/api/integrations/spotify/callback" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new HttpError(503, "Configure o callback HTTPS exato do Spotify.");
  return {
    id,
    secret,
    redirect: url.href,
    origin: url.origin,
    key: Buffer.from(key, "hex"),
  };
}
export function sealSpotify(value: string, userId: string, purpose: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", spotifyConfig().key, iv);
  cipher.setAAD(Buffer.from(`spotify:v1:${userId}:${purpose}`));
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    bytes.toString("base64url"),
  ].join(".");
}
export function unsealSpotify(value: string, userId: string, purpose: string) {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data)
    throw new HttpError(409, "Reconecte sua conta Spotify.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    spotifyConfig().key,
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(`spotify:v1:${userId}:${purpose}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
const tokenData = z.object({
  access_token: z.string().min(1).max(8192),
  refresh_token: z.string().min(1).max(8192).optional(),
  expires_in: z.number().int().min(1).max(86400),
  token_type: z.literal("Bearer"),
  scope: z.string().max(2000).optional(),
});
export const spotifyAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("resume"),
      deviceId: z
        .string()
        .regex(/^[a-zA-Z0-9_-]{1,128}$/)
        .optional(),
    })
    .strict(),
  z
    .object({
      action: z.enum([
        "playback",
        "currently_playing",
        "devices",
        "pause",
        "next",
        "previous",
        "test",
      ]),
    })
    .strict(),
  z
    .object({
      action: z.literal("volume"),
      volume: z.number().int().min(0).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("volume_delta"),
      delta: z.union([z.literal(10), z.literal(-10)]),
    })
    .strict(),
  z
    .object({
      action: z.literal("transfer"),
      deviceId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    })
    .strict(),
]);
export type SpotifyAction = z.infer<typeof spotifyAction>;
export class SpotifyError extends HttpError {
  constructor(
    status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(status, message);
  }
}
export function createSpotifyService(
  database = db,
  fetcher: typeof fetch = fetch,
) {
  async function http(url: string, options: RequestInit = {}) {
    const cooldown = await database.rateLimit.findUnique({
      where: { key: "spotify-upstream-cooldown" },
    });
    if (cooldown && cooldown.expiresAt.getTime() > Date.now())
      throw new SpotifyError(
        429,
        "Aguarde o limite de solicitações do Spotify.",
        Math.ceil((cooldown.expiresAt.getTime() - Date.now()) / 1000),
      );
    try {
      return await fetcher(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      });
    } catch {
      throw new SpotifyError(
        503,
        "Não foi possível acessar o Spotify. Tente novamente.",
      );
    }
  }
  async function lockUser(tx: any, userId: string) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
  }
  async function sessionValid(
    sessionId: string,
    userId: string,
    store: any = database,
  ) {
    const session = await store.session.findUnique({
      where: { id: sessionId },
      include: { device: true, user: { include: { client: true } } },
    });
    return (
      session &&
      session.userId === userId &&
      session.device &&
      canUseSession(session, new Date())
    );
  }
  async function start(userId: string, sessionId: string) {
    const config = spotifyConfig(),
      ticket = opaque();
    const tx = await database.$transaction(async (sql) => {
      await lockUser(sql, userId);
      await sql.spotifyOAuthTransaction.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      await sql.spotifyOAuthTransaction.updateMany({
        where: {
          userId,
          status: { in: ["pending", "authorizing", "processing"] },
        },
        data: { status: "cancelled", browserHash: null },
      });
      return sql.spotifyOAuthTransaction.create({
        data: {
          userId,
          sessionId,
          ticketHash: digest(ticket),
          expiresAt: new Date(Date.now() + 5 * 60000),
        },
      });
    });
    return {
      transactionId: tx.id,
      expiresAt: tx.expiresAt.toISOString(),
      authorizationUrl: `${config.origin}/api/integrations/spotify/authorize?ticket=${ticket}`,
    };
  }
  async function authorize(ticket: string) {
    if (!/^[\w-]{43}$/.test(ticket))
      throw new HttpError(400, "Autorização inválida ou expirada.");
    const config = spotifyConfig();
    const tx = await database.spotifyOAuthTransaction.findUnique({
      where: { ticketHash: digest(ticket) },
    });
    if (
      !tx ||
      tx.status !== "pending" ||
      tx.expiresAt <= new Date() ||
      !(await sessionValid(tx.sessionId, tx.userId))
    )
      throw new HttpError(400, "Autorização inválida ou expirada.");
    const state = opaque(),
      browser = opaque();
    const used = await database.spotifyOAuthTransaction.updateMany({
      where: { id: tx.id, status: "pending", expiresAt: { gt: new Date() } },
      data: {
        status: "authorizing",
        stateHash: digest(state),
        browserHash: digest(browser),
      },
    });
    if (used.count !== 1) throw new HttpError(409, "Autorização já iniciada.");
    const url = new URL("https://accounts.spotify.com/authorize");
    url.search = new URLSearchParams({
      client_id: config.id,
      response_type: "code",
      redirect_uri: config.redirect,
      scope: SPOTIFY_SCOPES.join(" "),
      state,
      show_dialog: "true",
    }).toString();
    return { url: url.href, cookie: browser };
  }
  async function exchange(form: URLSearchParams) {
    const cfg = spotifyConfig();
    const response = await http("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + Buffer.from(cfg.id + ":" + cfg.secret).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    if (!response.ok) {
      if ([400, 401].includes(response.status))
        throw new SpotifyError(
          409,
          "Autorização Spotify inválida ou revogada. Reconecte sua conta.",
        );
      await failure(response);
    }
    const parsed = tokenData.safeParse(await response.json());
    if (!parsed.success)
      throw new SpotifyError(502, "Resposta de autorização Spotify inválida.");
    return parsed.data;
  }
  async function callback(
    state: string,
    browser: string,
    code: string | null,
    denied: boolean,
  ) {
    if (!/^[\w-]{43}$/.test(state) || !/^[\w-]{43}$/.test(browser))
      throw new HttpError(400, "Retorno de autorização inválido.");
    const tx = await database.spotifyOAuthTransaction.findUnique({
      where: { stateHash: digest(state) },
    });
    if (
      !tx ||
      tx.browserHash !== digest(browser) ||
      tx.expiresAt <= new Date() ||
      !(await sessionValid(tx.sessionId, tx.userId))
    )
      throw new HttpError(400, "Autorização inválida ou expirada.");
    const used = await database.spotifyOAuthTransaction.updateMany({
      where: {
        id: tx.id,
        status: "authorizing",
        expiresAt: { gt: new Date() },
      },
      data: { status: denied ? "denied" : "processing", browserHash: null },
    });
    if (used.count !== 1)
      throw new HttpError(409, "Este retorno já foi utilizado.");
    if (denied) return;
    try {
      if (!code || code.length > 2048)
        throw new HttpError(400, "Código Spotify inválido.");
      const tokens = await exchange(
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: spotifyConfig().redirect,
        }),
      );
      const scopes = (tokens.scope || "").split(" ");
      if (
        !tokens.refresh_token ||
        !SPOTIFY_SCOPES.every((scope) => scopes.includes(scope))
      )
        throw new HttpError(
          403,
          "Autorize as três permissões de reprodução para conectar.",
        );
      const profileResponse = await http("https://api.spotify.com/v1/me", {
        headers: { Authorization: "Bearer " + tokens.access_token },
      });
      if (!profileResponse.ok) await failure(profileResponse);
      const profile = z
        .object({
          id: z.string().min(1).max(128),
          display_name: z.string().max(200).nullable().optional(),
        })
        .parse(await profileResponse.json());
      await database.$transaction(async (sql) => {
        await lockUser(sql, tx.userId);
        const live = await sql.spotifyOAuthTransaction.findUnique({
          where: { id: tx.id },
        });
        if (
          live?.status !== "processing" ||
          live.expiresAt <= new Date() ||
          !(await sessionValid(tx.sessionId, tx.userId, sql))
        )
          throw new HttpError(409, "Conexão cancelada ou expirada.");
        const existing = await sql.spotifyConnection.findUnique({
          where: { userId: tx.userId },
        });
        if (existing && existing.spotifyUserId !== profile.id)
          throw new HttpError(
            409,
            "Desconecte a conta atual antes de vincular outra conta Spotify.",
          );
        const other = await sql.spotifyConnection.findUnique({
          where: { spotifyUserId: profile.id },
        });
        if (other && other.userId !== tx.userId)
          throw new HttpError(
            409,
            "Esta conta Spotify já está vinculada a outra conta Cyro IA.",
          );
        const data = {
          spotifyUserId: profile.id,
          displayName: profile.display_name || "Conta Spotify",
          scopes,
          accessToken: sealSpotify(tokens.access_token, tx.userId, "access"),
          refreshToken: sealSpotify(
            tokens.refresh_token!,
            tx.userId,
            "refresh",
          ),
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          status: "connected",
          refreshLeaseUntil: null,
          retryAt: null,
        };
        await sql.spotifyConnection.upsert({
          where: { userId: tx.userId },
          create: { userId: tx.userId, ...data },
          update: data,
        });
        await sql.spotifyOAuthTransaction.update({
          where: { id: tx.id },
          data: { status: "completed" },
        });
      });
    } catch (error) {
      await database.spotifyOAuthTransaction.updateMany({
        where: { id: tx.id, status: "processing" },
        data: { status: "failed" },
      });
      if (error instanceof HttpError) throw error;
      throw new SpotifyError(502, "Não foi possível vincular a conta Spotify.");
    }
  }
  async function status(userId: string) {
    const connection = await database.spotifyConnection.findUnique({
      where: { userId },
      select: { status: true, displayName: true, connectedAt: true },
    });
    let configured = true;
    let configurationError: string | null = null;
    try {
      spotifyConfig();
    } catch (error) {
      configured = false;
      configurationError =
        error instanceof HttpError
          ? error.message
          : "Configuração Spotify indisponível.";
    }
    return {
      configured,
      configurationError,
      status: connection?.status || "disconnected",
      displayName: connection?.displayName || null,
      connectedAt: connection?.connectedAt || null,
    };
  }
  async function transaction(userId: string, id: string) {
    const tx = await database.spotifyOAuthTransaction.findFirst({
      where: { id, userId },
    });
    if (!tx) throw new HttpError(404, "Transação não encontrada.");
    return {
      status:
        tx.expiresAt <= new Date() &&
        !["completed", "denied", "cancelled", "failed"].includes(tx.status)
          ? "expired"
          : tx.status,
      expiresAt: tx.expiresAt,
    };
  }
  async function cancel(userId: string, id: string) {
    await database.spotifyOAuthTransaction.updateMany({
      where: {
        id,
        userId,
        status: { in: ["pending", "authorizing", "processing"] },
      },
      data: { status: "cancelled", browserHash: null },
    });
    return { ok: true };
  }
  async function disconnect(userId: string) {
    await database.$transaction(async (sql) => {
      await lockUser(sql, userId);
      await sql.spotifyOAuthTransaction.deleteMany({ where: { userId } });
      await sql.spotifyConnection.deleteMany({ where: { userId } });
    });
    return { ok: true };
  }
  async function failure(response: Response): Promise<never> {
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after"));
      const wait =
        Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 30;
      await database.rateLimit.upsert({
        where: { key: "spotify-upstream-cooldown" },
        create: {
          key: "spotify-upstream-cooldown",
          count: 0,
          expiresAt: new Date(Date.now() + wait * 1000),
        },
        update: { expiresAt: new Date(Date.now() + wait * 1000) },
      });
      throw new SpotifyError(
        429,
        "Spotify limitou as solicitações. Aguarde antes de tentar novamente.",
        wait,
      );
    }
    if (response.status === 403)
      throw new SpotifyError(
        403,
        "Spotify não permitiu a operação. Confira Premium, permissões, conta autorizada no Dashboard e restrições do dispositivo/conteúdo.",
      );
    if (response.status === 404)
      throw new SpotifyError(
        404,
        "Nenhum dispositivo ativo ou recurso disponível. Abra o Spotify e selecione um dispositivo.",
      );
    if (response.status === 401)
      throw new SpotifyError(409, "Reconecte sua conta Spotify.");
    throw new SpotifyError(
      response.status >= 500 ? 503 : 502,
      "Spotify indisponível para esta operação. Tente novamente.",
    );
  }
  async function revoke(
    userId: string,
    id: string,
    expected: Record<string, unknown> = {},
  ) {
    await database.spotifyConnection.updateMany({
      where: { userId, id, ...expected },
      data: {
        status: "error",
        accessToken: "",
        refreshToken: "",
        refreshLeaseUntil: null,
      },
    });
  }
  async function token(userId: string) {
    const connection = await database.spotifyConnection.findUnique({
      where: { userId },
    });
    if (!connection)
      throw new SpotifyError(
        409,
        "Para controlar suas músicas, conecte sua conta Spotify em Configurações → Integrações.",
      );
    if (connection.status !== "connected")
      throw new SpotifyError(
        409,
        "Reconecte sua conta Spotify em Configurações → Integrações.",
      );
    if (!SPOTIFY_SCOPES.every((scope) => connection.scopes.includes(scope)))
      throw new SpotifyError(
        403,
        "Permissões insuficientes. Reconecte o Spotify.",
      );
    if (connection.expiresAt.getTime() > Date.now() + 30000)
      return {
        id: connection.id,
        sealed: connection.accessToken,
        value: unsealSpotify(connection.accessToken, userId, "access"),
      };
    const lease = new Date(Date.now() + 20000);
    const acquired = await database.spotifyConnection.updateMany({
      where: {
        id: connection.id,
        userId,
        accessToken: connection.accessToken,
        expiresAt: { lte: new Date(Date.now() + 30000) },
        status: "connected",
        OR: [
          { refreshLeaseUntil: null },
          { refreshLeaseUntil: { lt: new Date() } },
        ],
      },
      data: { refreshLeaseUntil: lease },
    });
    if (!acquired.count)
      throw new SpotifyError(
        503,
        "Spotify está renovando a conexão. Tente novamente em instantes.",
      );
    try {
      const next = await exchange(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: unsealSpotify(
            connection.refreshToken,
            userId,
            "refresh",
          ),
        }),
      );
      const scopes = next.scope ? next.scope.split(" ") : connection.scopes;
      if (!SPOTIFY_SCOPES.every((scope) => scopes.includes(scope)))
        throw new SpotifyError(
          409,
          "Permissões revogadas. Reconecte o Spotify.",
        );
      const saved = await database.spotifyConnection.updateMany({
        where: {
          id: connection.id,
          userId,
          refreshLeaseUntil: lease,
          status: "connected",
        },
        data: {
          accessToken: sealSpotify(next.access_token, userId, "access"),
          refreshToken: next.refresh_token
            ? sealSpotify(next.refresh_token, userId, "refresh")
            : connection.refreshToken,
          scopes,
          expiresAt: new Date(Date.now() + next.expires_in * 1000),
          refreshLeaseUntil: null,
        },
      });
      if (!saved.count)
        throw new SpotifyError(409, "Conexão alterada. Tente novamente.");
      const current = await database.spotifyConnection.findUnique({
        where: { userId },
      });
      if (
        !current ||
        current.id !== connection.id ||
        current.status !== "connected"
      )
        throw new SpotifyError(409, "Conexão alterada.");
      return {
        id: current.id,
        sealed: current.accessToken,
        value: unsealSpotify(current.accessToken, userId, "access"),
      };
    } catch (error) {
      if (error instanceof SpotifyError && error.status === 409)
        await revoke(userId, connection.id, { refreshLeaseUntil: lease });
      throw error;
    } finally {
      await database.spotifyConnection.updateMany({
        where: { id: connection.id, userId, refreshLeaseUntil: lease },
        data: { refreshLeaseUntil: null },
      });
    }
  }
  async function api(
    userId: string,
    path: string,
    method = "GET",
    body?: unknown,
    retry = true,
  ): Promise<any> {
    const cooldown = await database.rateLimit.findUnique({
      where: { key: "spotify-upstream-cooldown" },
    });
    if (cooldown && cooldown.expiresAt.getTime() > Date.now())
      throw new SpotifyError(
        429,
        "Aguarde o limite de solicitações do Spotify.",
        Math.ceil((cooldown.expiresAt.getTime() - Date.now()) / 1000),
      );
    const access = await token(userId);
    const response = await http("https://api.spotify.com/v1" + path, {
      method,
      headers: {
        Authorization: "Bearer " + access.value,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401 && retry) {
      await database.spotifyConnection.updateMany({
        where: {
          id: access.id,
          userId,
          accessToken: access.sealed,
          status: "connected",
        },
        data: { expiresAt: new Date(0) },
      });
      return api(userId, path, method, body, false);
    }
    if (response.status === 401)
      await revoke(userId, access.id, { accessToken: access.sealed });
    if (!response.ok) await failure(response);
    // Player writes have no required JSON response. Never repeat a successful
    // action merely because the upstream returned an empty/non-JSON body.
    if (method !== "GET")
      return response.status === 202 ? { accepted: true } : null;
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      throw new SpotifyError(
        502,
        "Spotify respondeu sem informações de reprodução válidas. Tente consultar novamente.",
      );
    }
  }
  function device(value: any) {
    return {
      id:
        typeof value?.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value.id)
          ? value.id
          : null,
      name: String(value?.name || "Dispositivo Spotify").slice(0, 150),
      active: value?.is_active === true,
      restricted: value?.is_restricted === true,
      volume: Number.isInteger(value?.volume_percent)
        ? value.volume_percent
        : null,
      supportsVolume: value?.supports_volume === true,
    };
  }
  function playback(value: any) {
    if (!value) return null;
    const item = value.item;
    const id =
      typeof item?.id === "string" && /^[a-zA-Z0-9]{22}$/.test(item.id)
        ? item.id
        : null;
    return {
      playing: value.is_playing === true,
      device: value.device ? device(value.device) : null,
      track:
        id && item?.type === "track"
          ? {
              name: String(item.name).slice(0, 200),
              artist: (item.artists || [])
                .slice(0, 10)
                .map((a: any) => String(a.name).slice(0, 100))
                .join(", "),
              url: `https://open.spotify.com/track/${id}`,
            }
          : null,
    };
  }
  async function execute(userId: string, input: SpotifyAction) {
    const command = spotifyAction.parse(input);
    if (command.action === "test") {
      await api(userId, "/me");
      return { ok: true };
    }
    if (command.action === "devices") {
      const data = await api(userId, "/me/player/devices");
      return { devices: (data?.devices || []).slice(0, 50).map(device) };
    }
    if (["playback", "currently_playing"].includes(command.action))
      return {
        playback: playback(
          await api(
            userId,
            command.action === "playback"
              ? "/me/player"
              : "/me/player/currently-playing",
          ),
        ),
      };
    if (command.action === "transfer") {
      const available = (await execute(userId, { action: "devices" })) as any;
      if (
        !available.devices.some(
          (d: any) => d.id === command.deviceId && !d.restricted,
        )
      )
        throw new SpotifyError(404, "Dispositivo indisponível ou restrito.");
      const result = await api(userId, "/me/player", "PUT", {
        device_ids: [command.deviceId],
        play: false,
      });
      return { ok: true, ...result };
    }
    if (command.action === "volume_delta") {
      const data = await api(userId, "/me/player");
      if (
        !data?.device?.supports_volume ||
        !Number.isInteger(data.device.volume_percent)
      )
        throw new SpotifyError(
          409,
          "O dispositivo não permite ajustar o volume.",
        );
      return execute(userId, {
        action: "volume",
        volume: Math.max(
          0,
          Math.min(100, data.device.volume_percent + command.delta),
        ),
      });
    }
    let result;
    if (command.action === "volume") {
      const data = await api(userId, "/me/player");
      if (!data?.device?.supports_volume)
        throw new SpotifyError(
          409,
          "Abra um dispositivo Spotify compatível com controle de volume.",
        );
      result = await api(
        userId,
        "/me/player/volume?volume_percent=" + command.volume,
        "PUT",
      );
    } else {
      const targets = {
        pause: ["pause", "PUT"],
        resume: ["play", "PUT"],
        next: ["next", "POST"],
        previous: ["previous", "POST"],
      } as const;
      const target = targets[command.action as keyof typeof targets];
      if (!target) throw new HttpError(400, "Comando Spotify inválido.");
      result = await api(
        userId,
        "/me/player/" +
          target[0] +
          (command.action === "resume" && command.deviceId
            ? "?device_id=" + encodeURIComponent(command.deviceId)
            : ""),
        target[1],
      );
    }
    return { ok: true, ...result };
  }
  function configured<T extends (...args: any[]) => Promise<any>>(fn: T): T {
    return (async (...args: Parameters<T>) =>
      spotifyRuntime.run(await spotifyEnvironment(database), () =>
        fn(...args),
      )) as T;
  }
  return {
    start: configured(start),
    authorize: configured(authorize),
    callback: configured(callback),
    status: configured(status),
    transaction,
    cancel,
    disconnect,
    execute: configured(execute),
  };
}
export const spotify = createSpotifyService();
