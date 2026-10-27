# Baseline reproduzível

Base anterior: commit f89f398. Provedor: Prisma Postgres, Operations confirmada pelo proprietário. Referência recebida: 203.579 Operations JARVIS, sem série histórica exportada/usuários ativos. Não usar 207.175 como consumo exclusivo JARVIS.

Executar na raiz, após npm ci: `npm exec -w @jarvis/cloud -- tsx scripts/benchmark-database.ts f89f398`.

O script executa versões anterior/atual do serviço de conversas em PostgreSQL PGlite local, com repositório instrumentado, dados sintéticos e a mesma carga. Não conecta ao DATABASE_URL. Conta instruções SQL (inclui BEGIN/COMMIT), chamadas do repositório e duração por operação. Exclui autenticação, rate limit, rede e cobrança do provedor; os números HTTP são entradas dos cenários, não tráfego capturado. p50/p95 locais não representam latência de produção. O cenário de 10min é comprimido em sequência determinística, não uma sessão humana em tempo real.

A–I têm cenários explícitos no script. G/H não acessam este serviço Cloud; zero neste escopo não quer dizer zero consultas SQLite. J/K não foram medidos: uso administrativo real/simultâneo exige ambiente de homologação e captura normalizada. O teste de isolamento consulta um chat de outra conta e exige rejeição. Reabrir conversa quente é coberto no teste Desktop A→B→A.

Saída: build/v6/database-benchmark.json (sem identidades reais, SQL privado ou parâmetros de produção). Guardar exportação do painel antes/depois, número de usuários e tempo ativo para a comparação real. Não atribuir uma estimativa teórica ao faturamento.
