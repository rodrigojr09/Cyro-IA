import "dotenv/config";
import { db } from "../lib/db";
// No fixed password and no sample personal records in a production database.
if (process.env.NODE_ENV === "production")
  throw Error("Seed de desenvolvimento bloqueado em produção.");
console.log(
  "Seed sem credenciais ou usuários fictícios. Use admin:bootstrap para o primeiro administrador.",
);
await db.$disconnect();
