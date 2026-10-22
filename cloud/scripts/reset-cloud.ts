import "dotenv/config";
import { db } from "../lib/db";
import { resetCloud, resetSummarySQL } from "../lib/reset-cloud";
async function main() {
  if (!process.env.DATABASE_URL)
    throw Error(
      "Configure DATABASE_URL privadamente em cloud/.env. Nenhum banco foi alterado.",
    );
  if (!process.argv.includes("--apply")) {
    const summary = await db.$queryRawUnsafe(resetSummarySQL);
    console.log(JSON.stringify({ mode: "preview", summary }));
    return;
  }
  const result = await db.$transaction((tx) => resetCloud(tx), {
    timeout: 120000,
    maxWait: 15000,
  });
  console.log(JSON.stringify({ mode: "applied", ...result }));
}
main()
  .catch(() => {
    console.error(
      "Limpeza não concluída. Confira a conexão privada e a existência de SUPER_ADMIN ativo com senha. Falhas transacionais são revertidas.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
