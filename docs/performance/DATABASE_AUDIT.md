# Auditoria do consumo de banco — 27/10/2026

## Provedor e métrica

A configuração local aponta para Prisma Postgres; credenciais e hostname completo não são publicados. A captura fornecida pelo proprietário mostra Operations: 207.175 no workspace, 203.579 no projeto JARVIS e 3.596 em outro projeto. O gráfico cobre 1–31 de outubro; não prova por si só uma janela exata de cinco dias.

A [FAQ oficial do Prisma Postgres](https://www.prisma.io/docs/postgres/faq) define uma operação como uma interação de leitura/escrita. Distingue uma chamada Prisma Client de SQL direto; uma chamada ORM pode produzir várias instruções SQL. SELECT 1 também é contabilizado. Portanto HTTP, chamadas ORM, instruções SQL, conexões e Operations do painel não são métricas intercambiáveis. O projeto usa PrismaPg/pg com conexão PostgreSQL direta; o contador do painel é a referência de faturamento, não uma soma inferida dos logs locais.

Não houve acesso autenticado ao painel, exportação de séries, Query Insights ou teste de carga de produção. A confirmação da redução real exige comparar períodos normalizados após implantação. Nenhum dado de produção foi apagado ou migrado.

## Causas comprovadas no código

| Ponto | Disparo / frequência anterior | Operações e necessidade |
| --- | --- | --- |
| desktop/workspace.js poll → backend/main.py workspace | a cada 2s, inclusive sem interação | general_chat fixed + list; tráfego Cloud desnecessário para progresso local. |
| backend/main.py workspace_view | entrada/reload geral | duas chamadas list (ativas/arquivadas), embora a resposta já contenha ambas. |
| cloud/lib/conversations.ts fixed | cada catálogo/abertura Quick | upsert dentro de storageMutation mesmo quando existe: lock de usuário e duas agregações de armazenamento. |
| cloud/lib/conversations.ts get/history | abrir contexto/histórico | leituras dentro de transação de mutação: lock de usuário, cota antes/depois e lock de conversa. |
| cloud/lib/auth.ts deviceAuth | toda API Desktop | sessão/usuário/dispositivo necessários; escrita lastSeenAt em toda requisição era redundante. |
| cloud/lib/rate-limit.ts | rotas protegidas | upsert por chamada necessário ao limite compartilhado; preservado. |
| desktop/electron/main.cjs | sessão a cada 5min | necessário para revogação/renovação; preservado, sem cache de autorização. |
| cloud/lib/db.ts | criação por módulo/processo | pool max=3, timeout/idle 10s; agora singleton por processo quente também em produção. Não é cache global serverless. |

## Demais domínios auditados

Auth/login/logout e administração continuam consultando autorização no servidor. Budgets usam persistência e transações; não foram trocados por contadores locais. storageMutation permanece em escritas e mantém rollback por cota. Spotify não usa polling de reprodução; estado é solicitado ao abrir/atualizar/focar configurações e tokens seguem cifrados no servidor. Configurações de provedor incluem revisão concorrente e não ganham cache de segredo no renderer. Dashboard já possui cache por recurso/filtro e consultas de consumo agrupadas/paginadas; não há evidência para adicionar Redis. Projetos/Writer/memórias de projeto são SQLite local e não devem ser contados como PostgreSQL. Memória GLOBAL_USER continua ausente, conforme plano v6, e não foi inventada nesta otimização.

Índices existentes: Conversation(userId,slot) único e (userId,lastMessageAt); ChatMessage(conversationId,id), chave idempotente; Session(tokenHash) e deviceId; Device(userId,revokedAt). Nenhum índice/migration criado sem plano de execução de produção. EXPLAIN ANALYZE e contagem de conexões reais não foram coletados: sem acesso de observabilidade ao serviço. N+1 não comprovado; repetição por método nos logs é sinal para investigação, não diagnóstico automático.

## Inventário estático de chamadas

A tabela seguinte localiza chamadas diretas em lib, rotas e scripts. Uma chamada não equivale automaticamente a uma instrução SQL nem a uma Operation. Durações dependem do cenário e devem ser coletadas com a instrumentação; não foram inventadas por linha.

| Arquivo e linha | Funcao/handler | Chamada | Frequencia/duracao |
| --- | --- | --- | --- |
| cloud/lib/auth.ts:16 | admin | `db.session.findUnique` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/auth.ts:36 | deviceAuth | `db.session.findUnique` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/auth.ts:53 | deviceAuth | `db.device.update` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/budget.ts:5 | reserve | `db.$transaction` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/budget.ts:6 | reserve | `tx.$queryRaw` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/budget.ts:7 | reserve | `tx.user.findUniqueOrThrow` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/budget.ts:10 | reserve | `tx.usageBudget.upsert` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/budget.ts:17 | reserve | `tx.usageBudget.update` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/budget.ts:32 | settle | `db.auditLog.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/budget.ts:51 | settle | `db.$transaction` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/budget.ts:52 | settle | `db.usageBudget.update` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/budget.ts:64 | settle | `db.usageLog.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:88 | conversations | `tx.conversation.deleteMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:92 | conversations | `db.conversation.findFirst` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:98 | conversations | `tx.conversation.upsert` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:113 | conversations | `db.conversation.findMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:121 | conversations | `tx.conversation.createMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:129 | conversations | `tx.conversation.findFirst` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:138 | conversations | `db.conversation.findFirst` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:144 | conversations | `db.chatMessage.findMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:164 | conversations | `tx.$queryRaw` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:165 | conversations | `tx.conversation.findFirst` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:173 | conversations | `tx.conversation.delete` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:177 | conversations | `tx.chatMessage.deleteMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:179 | conversations | `tx.conversation.update` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:186 | conversations | `tx.conversation.update` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:197 | conversations | `tx.chatMessage.createMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:209 | conversations | `tx.conversation.update` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/conversations.ts:222 | conversations | `tx.chatMessage.findUniqueOrThrow` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/provider-settings.ts:199 | save | `tx.$queryRaw` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/provider-settings.ts:200 | save | `tx.providerConfiguration.findUnique` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/provider-settings.ts:238 | save | `tx.spotifyConnection.count` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/provider-settings.ts:239 | save | `tx.spotifyOAuthTransaction.count` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/provider-settings.ts:265 | save | `tx.providerConfiguration.update` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/provider-settings.ts:272 | save | `tx.auditLog.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/rate-limit.ts:6 | rateLimit | `db.rateLimit.upsert` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/reset-cloud.ts:14 | resetCloud | `tx.$executeRawUnsafe` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/reset-cloud.ts:18 | resetCloud | `tx.$queryRawUnsafe` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/reset-cloud.ts:44 | resetCloud | `tx.$executeRawUnsafe` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/reset-cloud.ts:46 | resetCloud | `tx.$executeRawUnsafe` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/reset-cloud.ts:49 | resetCloud | `tx.$executeRawUnsafe` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/reset-cloud.ts:50 | resetCloud | `tx.$queryRawUnsafe` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/spotify-interpreter.ts:13 | createSpotifyInterpreter | `db.systemSettings.findUnique` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/spotify.ts:179 | lockUser | `tx.$queryRaw` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/storage.ts:13 | storageStatus | `client.$queryRaw` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/storage.ts:42 | storageMutation | `db.$transaction` | conforme evento da rota/servico; nao medida por linha |
| cloud/lib/storage.ts:45 | storageMutation | `tx.$queryRaw` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:13 | module | `client.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:21 | module | `client.update` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:44 | GET | `db.user.findMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:61 | GET | `db.device.findMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:77 | GET | `db.usageLog.findMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:92 | GET | `db.auditLog.findMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:112 | GET | `db.user.count` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:113 | GET | `db.user.count` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:116 | GET | `db.device.count` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:122 | GET | `db.usageLog.aggregate` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:149 | POST | `db.$transaction` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:150 | POST | `client.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:159 | POST | `tx.user.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:170 | POST | `tx.auditLog.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:180 | POST | `client.update` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:181 | POST | `tx.user.findUnique` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:189 | POST | `tx.user.update` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:202 | POST | `tx.session.deleteMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:204 | POST | `tx.device.findUnique` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:210 | POST | `tx.device.update` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:214 | POST | `tx.session.deleteMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/admin/route.ts:216 | POST | `tx.auditLog.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/management/route.ts:14 | GET | `db.systemSettings.findUnique` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/management/route.ts:31 | POST | `db.$transaction` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/management/route.ts:32 | POST | `tx.systemSettings.upsert` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/management/route.ts:37 | POST | `tx.auditLog.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/v1/chat/completions/route.ts:23 | POST | `db.systemSettings.findUnique` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/v1/audio/speech/route.ts:24 | POST | `db.systemSettings.findUnique` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/v1/audio/speech/route.ts:52 | POST | `db.auditLog.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/device/login/route.ts:17 | POST | `db.user.findUnique` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/device/login/route.ts:33 | POST | `db.$transaction` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/device/login/route.ts:35 | POST | `tx.$queryRaw` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/device/login/route.ts:36 | POST | `tx.user.findUnique` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/device/login/route.ts:44 | POST | `tx.client.upsert` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/device/login/route.ts:49 | POST | `tx.device.findUnique` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/device/login/route.ts:58 | POST | `tx.device.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/device/login/route.ts:65 | POST | `tx.session.deleteMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/device/login/route.ts:66 | POST | `tx.session.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/device/login/route.ts:74 | POST | `tx.auditLog.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/device/session/route.ts:20 | POST | `db.session.updateMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/device/session/route.ts:37 | DELETE | `db.session.deleteMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/auth/login/route.ts:14 | POST | `db.user.findUnique` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/auth/login/route.ts:26 | POST | `db.auditLog.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/auth/login/route.ts:33 | POST | `db.$transaction` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/auth/login/route.ts:34 | POST | `db.session.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/auth/login/route.ts:37 | POST | `db.auditLog.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/auth/logout/route.ts:12 | POST | `db.$transaction` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/auth/logout/route.ts:13 | POST | `db.session.deleteMany` | conforme evento da rota/servico; nao medida por linha |
| cloud/app/api/auth/logout/route.ts:14 | POST | `db.auditLog.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/scripts/bootstrap-admin.ts:13 | module | `db.$transaction` | conforme evento da rota/servico; nao medida por linha |
| cloud/scripts/bootstrap-admin.ts:14 | module | `tx.$executeRaw` | conforme evento da rota/servico; nao medida por linha |
| cloud/scripts/bootstrap-admin.ts:15 | module | `tx.user.count` | conforme evento da rota/servico; nao medida por linha |
| cloud/scripts/bootstrap-admin.ts:17 | module | `tx.user.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/scripts/bootstrap-admin.ts:25 | module | `tx.auditLog.create` | conforme evento da rota/servico; nao medida por linha |
| cloud/scripts/reset-cloud.ts:10 | main | `db.$queryRawUnsafe` | conforme evento da rota/servico; nao medida por linha |
| cloud/scripts/reset-cloud.ts:14 | main | `db.$transaction` | conforme evento da rota/servico; nao medida por linha |
