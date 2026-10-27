import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomBytes } from "node:crypto";

const salt = randomBytes(32);
type Summary = {
  route: string;
  method: string;
  operations: Record<string, number>;
  operationDurationMs: Record<string, number>;
  sql: Record<string, number>;
  sqlDurationMs: number;
  errors: number;
  cacheHits: number;
  cacheMisses: number;
  user?: string;
  session?: string;
};
const scope = new AsyncLocalStorage<Summary>();
const routeNames = new Set([
  "/api/device/chats",
  "/api/device/session",
  "/api/device/login",
  "/api/v1/chat/completions",
  "/api/v1/audio/speech",
  "/api/admin",
  "/api/management",
  "/api/provider-settings",
  "/api/integrations/spotify",
  "/api/integrations/spotify/authorize",
  "/api/integrations/spotify/callback",
  "/api/auth/login",
  "/api/auth/logout",
]);
function pseudonym(value: string) {
  return createHmac("sha256", salt).update(value).digest("hex").slice(0, 16);
}
export function metricIdentity(user: string, session: string) {
  const current = scope.getStore();
  if (current) {
    current.user = pseudonym(user);
    current.session = pseudonym(session);
  }
}
export function metricCache(hit: boolean) {
  const current = scope.getStore();
  if (current) hit ? current.cacheHits++ : current.cacheMisses++;
}
export async function metricOperation<T>(
  label: string,
  action: () => Promise<T>,
): Promise<T> {
  const current = scope.getStore();
  if (!current) return action();
  // Label is generated from Prisma model/operation names, never query arguments.
  current.operations[label] = (current.operations[label] || 0) + 1;
  const started = performance.now();
  try {
    return await action();
  } catch (error) {
    current.errors++;
    throw error;
  } finally {
    current.operationDurationMs[label] =
      (current.operationDurationMs[label] || 0) + performance.now() - started;
  }
}
export function metricSql(query: string, duration: number) {
  const current = scope.getStore();
  if (!current) return;
  const prefix =
    query
      .trimStart()
      .match(/^[A-Za-z]+/)?.[0]
      .toUpperCase() || "OTHER";
  const kind = [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "BEGIN",
    "COMMIT",
    "ROLLBACK",
  ].includes(prefix)
    ? prefix
    : "OTHER";
  current.sql[kind] = (current.sql[kind] || 0) + 1;
  current.sqlDurationMs += duration;
}
export async function requestMetrics(
  request: Request,
  action: () => Promise<Response>,
  emit = (value: object) => console.info(JSON.stringify(value)),
) {
  if (process.env.JARVIS_DB_METRICS !== "1") return action();
  const configured = Number(process.env.JARVIS_DB_METRICS_SAMPLE ?? "0.1");
  const sample = Number.isFinite(configured)
    ? Math.max(0, Math.min(1, configured))
    : 0.1;
  if (Math.random() >= sample) return action();
  const path = new URL(request.url).pathname;
  const summary: Summary = {
    route: routeNames.has(path) ? path : "/other",
    method: ["GET", "POST", "DELETE"].includes(request.method)
      ? request.method
      : "OTHER",
    operations: {},
    operationDurationMs: {},
    sql: {},
    sqlDurationMs: 0,
    errors: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
  return scope.run(summary, async () => {
    const started = performance.now();
    let status = 500;
    try {
      const response = await action();
      status = response.status;
      return response;
    } finally {
      // One sampled summary per request. No SQL text, parameters, tokens or bodies.
      try {
        emit({
          event: "jarvis.database",
          sample,
          ...summary,
          status,
          durationMs: performance.now() - started,
          repeatedOperations: Object.values(summary.operations).reduce(
            (sum, count) => sum + Math.max(0, count - 1),
            0,
          ),
        });
      } catch {
        /* Observability cannot break the request. */
      }
    }
  });
}
