import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { metricOperation, metricSql } from "./metrics";
const globalDb = globalThis as unknown as { jarvisDb?: PrismaClient };
function createDatabase() {
  const metrics = process.env.JARVIS_DB_METRICS === "1";
  const client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
    }),
    log: metrics ? [{ emit: "event", level: "query" }] : [],
  });
  if (!metrics) return client;
  client.$on("query", (event) => metricSql(event.query, event.duration));
  return client.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        return metricOperation(`${model || "raw"}.${operation}`, () =>
          query(args),
        );
      },
    },
  }) as unknown as PrismaClient;
}
export const db = globalDb.jarvisDb ?? createDatabase();
// Reuse within each warm process. This is not a shared cross-instance cache.
globalDb.jarvisDb = db;
