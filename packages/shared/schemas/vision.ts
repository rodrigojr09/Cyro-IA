import { z } from "zod";

export const MAX_IMAGE_BYTES = 350 * 1024;
export function jpegDimensions(
  url: string,
): { width: number; height: number } | null {
  const prefix = "data:image/jpeg;base64,";
  if (
    !url.startsWith(prefix) ||
    url.length > prefix.length + Math.ceil(MAX_IMAGE_BYTES / 3) * 4
  )
    return null;
  const encoded = url.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length > MAX_IMAGE_BYTES ||
    bytes.toString("base64") !== encoded ||
    bytes[0] !== 255 ||
    bytes[1] !== 216
  )
    return null;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 255) return null;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218) return null;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 2 > bytes.length) return null;
    const size = bytes.readUInt16BE(offset);
    if (size < 2 || offset + size > bytes.length) return null;
    if ([192, 193, 194].includes(marker)) {
      if (size < 8) return null;
      const height = bytes.readUInt16BE(offset + 3),
        width = bytes.readUInt16BE(offset + 5);
      return width > 0 && height > 0 && width <= 1536 && height <= 1536
        ? { width, height }
        : null;
    }
    offset += size;
  }
  return null;
}

export const imagePart = z
  .object({
    type: z.literal("image_url"),
    image_url: z
      .object({
        url: z
          .string()
          .max(480000)
          .refine(
            (url) => jpegDimensions(url) !== null,
            "Imagem JPEG local inválida ou acima do limite.",
          ),
        detail: z.literal("auto").default("auto"),
      })
      .strict(),
  })
  .strict();
export const textPart = z
  .object({ type: z.literal("text"), text: z.string().max(48000) })
  .strict();

export function inputReservation(
  messages: Array<{
    content?: string | null | Array<{ type: string; text?: string }>;
  }>,
  model: string,
): number {
  // Base64 bytes are not text tokens. Conservative bounds for images <=1536px:
  // https://developers.openai.com/api/docs/guides/images-vision
  const imageTokens = model.startsWith("gpt-4o-mini")
    ? 40960
    : model.startsWith("gpt-4.1-mini")
      ? 4096
      : model.startsWith("gpt-4.1-nano")
        ? 6144
        : /^(gpt-4\.1|gpt-4o)/.test(model)
          ? 2048
          : /^(gpt-5|gpt-6|o[134])/.test(model)
            ? 16384
            : 65536;
  let total = messages.length * 16;
  for (const message of messages) {
    if (typeof message.content === "string")
      total += Buffer.byteLength(message.content);
    else if (Array.isArray(message.content))
      for (const part of message.content)
        total +=
          part.type === "image_url"
            ? imageTokens
            : Buffer.byteLength(part.text || "");
  }
  return total;
}
