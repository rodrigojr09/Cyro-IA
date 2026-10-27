# Otimizações aplicadas

- Conversas existentes: fixed faz leitura antes de criar; get/history usam leitura com ownership no servidor, sem locks/quota de escrita. Mutações continuam transacionais e serializadas.
- Presença: lastSeenAt no máximo a cada 5min, baseado no timestamp lido da própria sessão. Não guarda autorização em cache. Revogação, expiração, status e bloqueio continuam checados em cada API.
- Workspace geral: uma lista é dividida em ativa/arquivada localmente; elimina segunda chamada Cloud.
- Polling: catálogo remoto a cada 60s quando visível, retomada por foco/visibilidade e eventos nativos de mutação. Progresso de indexação segue em /workspace/progress, apenas SQLite. Falhas têm backoff limitado até 64s; após cinco falhas, novas tentativas remotas aguardam foco/visibilidade/evento explícito. Promessa compartilhada evita chamadas simultâneas no renderer. Janelas ocultas não consultam catálogo. O intervalo remoto mantém atualização entre dispositivos, com até 60s de atraso visível; não é push global.
- Histórico quente mantém Map da sessão existente, com invalidação por envio, mutação e metadados. Não persiste histórico geral no renderer. Quick informa mutações à janela principal via evento sem payload/segredos, produzido pelo processo principal, sem novo IPC invocável pelo renderer.
- Pool Prisma único por processo quente (máximo 3); não se presume compartilhamento entre instâncias Vercel.

## Instrumentação

JARVIS_DB_METRICS=1 habilita resumos amostrados por requisição; JARVIS_DB_METRICS_SAMPLE define fração 0–1 (padrão 0,1). Desativado por padrão. Não escreve em tabelas. Registra rota permitida, método, status, duração, contadores ORM/SQL por tipo, erros e repetição por método. Identidades são HMAC com salt efêmero do processo; não permitem correlação estável entre instâncias. Não registra URL/querystring, SQL, parâmetros, token, nomes, e-mail ou texto de mensagens. Coletor não pode interromper a requisição. Callbacks do driver podem não herdar contexto em todas as versões; verificar contagens em homologação. Erros após abertura de streaming devem ser observados também no proxy. Cache hit/miss dispõe de helper, mas cache do renderer é medido nos testes do cliente, pois um hit não chega ao servidor.

Nenhum cache de licença/autorização de 15min foi adotado: reduziria a rapidez de revogação sem necessidade. Memória pessoal global, cache unificado de histórico entre renderers e eventos entre dispositivos permanecem no plano arquitetural; não são declarados concluídos. Nenhuma mudança de índice, Redis, migration destrutiva ou credencial.

## Compatibilidade e rollback

APIs públicas existentes preservadas; /workspace/progress é local autenticada e entrou na allowlist restrita. Reverter commits de otimização restaura polling/leitura anteriores sem migração de dados. Desabilitar métricas não afeta autorização nem dados. Não alterar perfil pessoal/Backup. O smoke de sessão usa porta temporária própria, sem encerrar o JARVIS instalado.
