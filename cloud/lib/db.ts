import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDb = globalThis as unknown as { jarvisDb?: PrismaClient };
export const db =
  globalDb.jarvisDb ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
    }),
  });
if (process.env.NODE_ENV !== "production") globalDb.jarvisDb = db;
