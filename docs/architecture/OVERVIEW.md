# Evolução arquitetural v6 — em desenvolvimento

Base de recuperação: commit `631d0c7` (5.1.0). Branch: `codex/jarvis-v6-architecture`. A alteração prévia de `cloud/next-env.d.ts` pertence ao proprietário e deve permanecer fora dos commits desta migração.

A estrutura anterior e atual é um monorepo npm: `cloud/` (Next.js/Prisma/PostgreSQL), `desktop/` (Electron e renderers DOM), `backend/` (FastAPI/SQLite e recursos locais), `packages/shared/` (contratos). Veja o [mapa vigente](../ARCHITECTURE.md).

A arquitetura alvo preserva esses caminhos até que cada mudança tenha compatibilidade demonstrada. `apps/` não é requisito funcional; mover pastas agora afetaria imports Python, preloads, iniciadores, smokes e distribuição sem resolver a IA ou o cache.

JARVIS deve ter identidade comum, modos contextuais e ferramentas especializadas. Cloud continua responsável por provedores, contas, autorização, cotas e PostgreSQL. Electron guarda sessão protegida e executa recursos nativos por IPC restrito. FastAPI executa as ferramentas autorizadas e mantém documentos locais.

Este diretório registra a migração solicitada e complementa os guias vigentes; não substitui evidências históricas nem declara v6 concluída.
