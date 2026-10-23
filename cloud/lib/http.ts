import type { ZodType } from "zod";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireOrigin(request: Request) {
  const origin = process.env.APP_ORIGIN;
  if (!origin || request.headers.get("origin") !== origin)
    throw new HttpError(403, "Origem não autorizada.");
}
export async function body<T>(
  request: Request,
  schema: ZodType<T>,
  maxBytes = 131072,
): Promise<T> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "Use JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Corpo ausente.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "Corpo muito grande.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    throw new HttpError(400, "Dados inválidos.");
  }
}
export function endpoint(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpError)
        return Response.json(
          { error: error.message },
          { status: error.status },
        );
      return Response.json(
        { error: "Operação indisponível. Tente novamente." },
        { status: 503 },
      );
    }
  };
}
