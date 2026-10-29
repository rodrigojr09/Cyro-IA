import { createHmac, timingSafeEqual } from "node:crypto";
export function signingKey() {
  const key = process.env.CYRO_PUBLISHER_SECRET;
  if (!key || key.length < 64)
    throw Error(
      "Configure o segredo do servidor externo (mínimo 64 caracteres).",
    );
  return key;
}
export function signTicket(value: Record<string, unknown>, key = signingKey()) {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return (
    body + "." + createHmac("sha256", key).update(body).digest("base64url")
  );
}
export function verifyTicket(
  value: string,
  key = signingKey(),
): Record<string, unknown> {
  if (value.length > 8192) throw Error("Ticket inválido.");
  const [body, mac, ...extra] = value.split(".");
  const expected = createHmac("sha256", key)
    .update(body || "")
    .digest();
  const actual = Buffer.from(mac || "", "base64url");
  if (
    extra.length ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    throw Error("Ticket inválido.");
  const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!Number.isSafeInteger(data.exp) || data.exp < Date.now())
    throw Error("Ticket expirado.");
  return data;
}
export function publisherOrigin() {
  const url = new URL(
    process.env.CYRO_PUBLISHER_ORIGIN || "https://unconfigured.invalid",
  );
  if (
    !process.env.CYRO_PUBLISHER_ORIGIN ||
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw Error("Servidor externo de publicação não configurado.");
  return url.origin;
}
