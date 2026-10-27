# Plano incremental — v6.0.0 em desenvolvimento

## Recuperação e ordem

Base `631d0c7`; branch `codex/jarvis-v6-architecture`. Modificação prévia `cloud/next-env.d.ts` não pertence à migração. Rollback: reverter commits individuais em ordem inversa, preservando dados e alterações do proprietário; nunca reset destrutivo.

| Ordem | Arquivos / dependências | Mudança / risco | Critério |
| --- | --- | --- | --- |
| 1 | docs/architecture, README, CHANGELOG, AGENTS, manifests/locks/VERSION e rótulos | inventário, alvo autorizado; risco de versão divergente | verificador do repositório e testes de distribuição |
| 2 | backend/main.py, writer_intelligence.py, novo módulo de identidade | identidade comum sem modificar aprovação, limites ou transporte | testes Python e Writer Electron |
| 3 | contratos shared, conversas Cloud, adaptador e IPC | eventos/revisões autenticados e cache de sessão; risco de cache entre contas | A→B→A, deduplicação, paginação, logout, Quick/main, mudança remota |
| 4 | Prisma + serviço de memória + contexto comum | memória global aditiva; risco de escopo privado | duas contas/projetos e propagação entre três modos, rollback documentado |
| 5 | ai_tools e serviços existentes | registro central e orquestração comum; risco de ampliar execução | ferramentas negadas e confirmação, orçamento, cancelamento |
| 6 | renderer, quick, build, preloads | React/TS incremental se vantagem demonstrada | preservar janelas, voz, clipboard, drafts e installer |
| 7 | integração/configuração/rotas | extrações por domínio sem mudar API pública | testes existentes e revisão de contratos |
| 8 | validação e pacote Windows | regressões, instalação/atualização | check completo + pacote auditado; homologação externa separada |

## Estado

Auditoria e inventário iniciais registrados; revisão integral ainda pendente. Identidade extraída para backend/jarvis_identity.py e consumida pelo chat/Quick e modo Writer; contrato editorial e aprovação preservados. Nenhuma migração de banco realizada. Cache inicial do renderer principal implementado conforme CHAT_CACHE.md, com limitações explícitas. Memória global permanece pendente. Não marcar v6 estável sem fechar critérios do pedido.

## Validação

Instalar workspaces com npm ci na raiz. Executar testes Cloud, TypeScript/build, Desktop, Python, sete smokes Electron e layout. Builds não comprovam login remoto, OpenAI paga, áudio físico, OAuth Spotify real nem Windows limpo. Registrar execução atual separadamente das evidências v5 em docs/VALIDATION.md.
