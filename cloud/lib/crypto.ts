import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export function token() {
  return randomBytes(32).toString("base64url");
}
export function hash(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("AUTH_SECRET deve ter pelo menos 32 caracteres.");
  return createHmac("sha256", secret).update(value).digest("hex");
}
export async function passwordHash(value: string) {
  if (value.length < 12 || value.length > 256)
    throw new Error("Senha deve ter entre 12 e 256 caracteres.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${((await scrypt(value, salt, 64)) as Buffer).toString("hex")}`;
}
export async function passwordMatches(value: string, encoded: string) {
  const [algorithm, salt, expected] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !expected || expected.length !== 128)
    return false;
  const actual = (await scrypt(value, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(expected, "hex"), actual);
}
