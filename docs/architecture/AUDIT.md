# Auditoria arquitetural — 27/10/2026

Inspeção estática inicial da base `631d0c7`. Não equivale a pentest nem homologação externa. Os achados abaixo têm evidência no código; ausência de achado não prova ausência de risco.

| Severidade | Evidência | Consequência / ação |
| --- | --- | --- |
| HIGH | `backend/main.py`: SYSTEM; `backend/writer_intelligence.py`: assist cria sua própria identidade "JARVIS Writer" | Identidade e regras divergentes; extrair identidade comum e manter contrato editorial como modo. |
| HIGH | `desktop/workspace.js`: openChat chama `/chats/history` incondicionalmente | A→B→A refaz histórico. Implementar cache de sessão, invalidação por alterações e testes de contagem de requisições. |
| HIGH | `cloud/prisma/schema.prisma`: sem entidade de memória pessoal; `backend/project_store.py` e `writer_store.py`: contexto por projeto | Memória GLOBAL_USER entre modos/dispositivos ainda ausente. Exige modelo aditivo, autenticação e testes de isolamento antes de ativar. Não importar notas privadas como memória global. |
| MEDIUM | `desktop/workspace.js`: poll agenda `/workspace` a cada 2000 ms | Catálogo consultado continuamente mesmo sem indexação. Precisa substituir por eventos e atualização direcionada sem perder progresso. |
| MEDIUM | `desktop/renderer.js`: openQueuedQuick consulta histórico antes de catalog/openChat | Busca redundante na transição Quick→principal. Compartilhar carregamento. |
| MEDIUM | `backend/main.py`: múltiplos domínios em um arquivo; `desktop/main.js`, `renderer.js`, `workspace.js`: processos/UI/orquestração extensos | Extração incremental com contratos e regressões; não mover tudo simultaneamente. |
| MEDIUM | `backend/main.py`: caminho legado AsyncOpenAI quando CLOUD=false | Distribuição Cloud usa adaptador, mas código legado ainda permite provedor local. Auditar iniciadores e testes antes de bloquear/remover compatibilidade. |
| MEDIUM | `desktop/package.json`: typecheck somente tsconfig.integrations.json | A maior parte do renderer JS não é verificada por TypeScript. Migração React deve incluir cobertura dos contratos IPC. |
| LOW | `cloud/`, `desktop/` já são workspaces npm | Renomear para apps não traz benefício imediato; preservar caminhos nesta fase. |

Segurança existente observada: validação de sessão no Cloud, isolamento por userId nas conversas, tokens Spotify cifrados, IPC com allowlist e confirmação editorial. Não foram identificadas credenciais para publicação; arquivos privados não devem entrar na auditoria.

Pendências da auditoria completa: grafo de imports/ciclos, referências dinâmicas e dependências antes de qualquer remoção; npm audit atual; perfil de renderizações e consultas; revisão integral dos fluxos OAuth, arquivos e multiusuário. Nenhuma duplicação é removida apenas por semelhança de nome.

## Remediações iniciais

Identidade comum extraída e validada na suíte Python (193 testes). Cache inicial e remoção da busca preliminar Quick→principal implementados, com 13 testes de workspace aprovados. Ainda faltam revisão/cursor remotos, memória global, React e auditoria integral. npm ci concluiu com 485 pacotes instalados, 489 auditados e nenhuma vulnerabilidade reportada em 27/10/2026; essa checagem não prova ausência de falhas de aplicação.
