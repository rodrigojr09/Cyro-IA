import { AsyncLocalStorage } from "node:async_hooks";
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./http";

export const spotifyRuntime = new AsyncLocalStorage<
  Record<string, string | undefined>
>();
const secret = z.string().trim().min(1).max(512).optional();
const base = { revision: z.number().int().min(0), enabled: z.boolean() };
export const providerCommand = z.discriminatedUnion("provider", [
  z
    .object({
      ...base,
      provider: z.literal("openai"),
      apiKey: secret,
      allowedModels: z
        .array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/))
        .min(1)
        .max(20),
      voiceEnabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      provider: z.literal("spotify"),
      clientId: z.string().regex(/^[a-f0-9]{32}$/i),
      clientSecret: secret,
      redirectUri: z.string().url().max(2048),
    })
    .strict(),
]);
export type ProviderCommand = z.infer<typeof providerCommand>;
function rootKey() {
  const key = process.env.AUTH_SECRET;
  if (!key || key.length < 32)
    throw new HttpError(503, "Proteção do servidor não configurada.");
  return Buffer.from(
    hkdfSync("sha256", key, "jarvis-provider-settings-v1", "aes-256-gcm", 32),
  );
}
export function sealProvider(id: string, data: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", rootKey(), iv);
  cipher.setAAD(Buffer.from("provider:v1:" + id));
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    bytes.toString("base64url"),
  ].join(".");
}
export function unsealProvider(id: string, value: string): Record<string, any> {
  try {
    const [v, iv, tag, data] = value.split(".");
    if (v !== "v1" || !iv || !tag || !data) throw Error();
    const cipher = createDecipheriv(
      "aes-256-gcm",
      rootKey(),
      Buffer.from(iv, "base64url"),
    );
    cipher.setAAD(Buffer.from("provider:v1:" + id));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(data, "base64url")),
        cipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new HttpError(
      503,
      "Não foi possível abrir a configuração protegida. Confira a chave do servidor.",
    );
  }
}
function environment(id: "openai" | "spotify") {
  return id === "openai"
    ? {
        enabled: true,
        apiKey: process.env.OPENAI_API_KEY || "",
        allowedModels: (process.env.OPENAI_ALLOWED_MODELS || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        voiceEnabled: process.env.OPENAI_VOICE_ENABLED === "true",
      }
    : {
        enabled: true,
        clientId:
          process.env.SPOTIFY_CLIENT_ID || "a075ad4ae29f41c5a3df8d2ff9c84972",
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
        redirectUri:
          process.env.SPOTIFY_REDIRECT_URI ||
          `${process.env.APP_ORIGIN || ""}/api/integrations/spotify/callback`,
        tokenKey: process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY || "",
      };
}
export async function readProvider(
  id: "openai" | "spotify",
  database: any = db,
) {
  const row = database.providerConfiguration
    ? await database.providerConfiguration.findUnique({ where: { id } })
    : null;
  return {
    data: row?.ciphertext
      ? unsealProvider(id, row.ciphertext)
      : environment(id),
    revision: row?.revision || 0,
    source: row?.ciphertext ? "dashboard" : "environment",
  };
}
export async function openAISettings(database: any = db) {
  const { data } = await readProvider("openai", database);
  return {
    apiKey: data.enabled ? data.apiKey : "",
    allowedModels: data.allowedModels as string[],
    voiceEnabled: data.enabled && data.voiceEnabled,
  };
}
export async function spotifyEnvironment(database: any = db) {
  const { data } = await readProvider("spotify", database);
  return {
    SPOTIFY_CLIENT_ID: data.clientId,
    SPOTIFY_CLIENT_SECRET: data.enabled ? data.clientSecret : undefined,
    SPOTIFY_REDIRECT_URI: data.redirectUri,
    SPOTIFY_TOKEN_ENCRYPTION_KEY: data.tokenKey,
  };
}
export function validateRedirect(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.origin !== process.env.APP_ORIGIN ||
    url.pathname !== "/api/integrations/spotify/callback" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new HttpError(
      400,
      "Use o callback HTTPS exato da origem deste Cloud, também cadastrado no Spotify.",
    );
}
export function createProviderSettings(database: any = db) {
  async function status() {
    const [o, s] = await Promise.all([
      readProvider("openai", database),
      readProvider("spotify", database),
    ]);
    return {
      openai: {
        revision: o.revision,
        source: o.source,
        enabled: o.data.enabled,
        hasApiKey: !!o.data.apiKey,
        allowedModels: o.data.allowedModels.length
          ? o.data.allowedModels
          : ["gpt-4.1-mini"],
        voiceEnabled: o.data.voiceEnabled,
      },
      spotify: {
        revision: s.revision,
        source: s.source,
        enabled: s.data.enabled,
        hasClientSecret: !!s.data.clientSecret,
        clientId: s.data.clientId,
        redirectUri: s.data.redirectUri,
      },
    };
  }
  async function save(actorId: string, value: ProviderCommand) {
    const input = providerCommand.parse(value);
    if (input.provider === "spotify") validateRedirect(input.redirectUri);
    await database.$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT id FROM "ProviderConfiguration" WHERE id = ${input.provider} FOR UPDATE`;
      const row = await tx.providerConfiguration.findUnique({
        where: { id: input.provider },
      });
      if (!row)
        throw new HttpError(
          503,
          "Aplique a migration de configurações do Cloud.",
        );
      if (row.revision !== input.revision)
        throw new HttpError(
          409,
          "A configuração mudou. Atualize a página antes de salvar.",
        );
      const previous = row.ciphertext
        ? unsealProvider(input.provider, row.ciphertext)
        : environment(input.provider);
      let data: Record<string, unknown>;
      if (input.provider === "openai") {
        const key = input.apiKey || previous.apiKey || "";
        if (key && !/^sk-[A-Za-z0-9_-]{16,500}$/.test(key))
          throw new HttpError(400, "Formato de chave OpenAI inválido.");
        if (input.enabled && !key)
          throw new HttpError(400, "Informe a chave OpenAI para habilitar.");
        data = {
          enabled: input.enabled,
          apiKey: key,
          allowedModels: [...new Set(input.allowedModels)],
          voiceEnabled: input.voiceEnabled,
        };
      } else {
        const clientSecret = input.clientSecret || previous.clientSecret || "";
        if (clientSecret && !/^[A-Za-z0-9_-]{16,512}$/.test(clientSecret))
          throw new HttpError(400, "Formato de Client Secret inválido.");
        if (input.enabled && !clientSecret)
          throw new HttpError(
            400,
            "Informe o Client Secret Spotify para habilitar.",
          );
        const connected = await tx.spotifyConnection.count();
        const pending = await tx.spotifyOAuthTransaction.count({
          where: {
            status: { in: ["pending", "authorizing", "processing"] },
            expiresAt: { gt: new Date() },
          },
        });
        if ((connected || pending) && previous.clientId !== input.clientId)
          throw new HttpError(
            409,
            "Desconecte as contas Spotify antes de trocar o Client ID.",
          );
        if (connected && !/^[a-f0-9]{64}$/i.test(previous.tokenKey || ""))
          throw new HttpError(
            409,
            "Restaure a chave de criptografia existente antes de configurar o Spotify.",
          );
        data = {
          enabled: input.enabled,
          clientId: input.clientId,
          clientSecret,
          redirectUri: input.redirectUri,
          tokenKey: /^[a-f0-9]{64}$/i.test(previous.tokenKey || "")
            ? previous.tokenKey
            : randomBytes(32).toString("hex"),
        };
      }
      await tx.providerConfiguration.update({
        where: { id: input.provider },
        data: {
          ciphertext: sealProvider(input.provider, data),
          revision: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "provider.configure",
          targetType: "ProviderConfiguration",
          targetId: input.provider,
        },
      });
    });
    return { ok: true };
  }
  return { status, save };
}
export const providerSettings = createProviderSettings();
export function requireProviderAdmin(actor: { role: string }) {
  if (actor.role !== "SUPER_ADMIN")
    throw new HttpError(
      403,
      "Somente SUPER_ADMIN pode configurar credenciais globais.",
    );
}
