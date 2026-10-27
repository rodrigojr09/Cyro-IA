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


## 6.0.2 — preparacao da sessao e confirmacao de gravacao

O login e seguido por `/workspace/bootstrap`: catalogo de conversas e historicos completos em lotes Cloud, incluindo arquivados, com isolamento pelo usuario autenticado. O cursor de mensagens usa um limite superior fixo durante o carregamento; o catalogo tambem e paginado. Os lotes limitam linhas e bytes de texto UTF-8. Historicos dos projetos continuam locais, conforme a politica de dados. Nao se importam conversas gerais legadas locais.

O renderer mantem o snapshot somente em memoria e bloqueia envio ate concluir historico, cota e restauracao da selecao. Falhas preservam o bloqueio e oferecem nova tentativa. O processo principal tambem bloqueia chat e Quick Chat enquanto o carregamento nao conclui; mudanca de sessao invalida essa permissao. As verificacoes Cloud de autenticacao, propriedade, cota e confirmacao humana permanecem ativas.

Navegacao reutiliza o catalogo; a selecao de projeto ainda informa o backend sobre indexacao e contexto, sem listar novamente as conversas. Apenas as ultimas 100 mensagens sao renderizadas, e paginas anteriores ja carregadas sao recuperadas do cache. Writer preserva o fluxo proprio de documento e suas verificacoes de arquivo. Conteudos de projeto nao sao enviados ao banco Cloud por esta mudanca.

Conversas gerais de texto comum usam `exchange`: pergunta, resposta e resumo sao gravados na mesma transacao, com IDs estaveis nas tentativas do transporte. O retorno inclui os registros confirmados e atualiza o cache da sessao. O aplicativo nao exibe deltas antes dessa confirmacao. Anexos e Quick Chat preservam suas vinculacoes e escopos; suas gravacoes continuam sendo aguardadas antes do retorno final.

O catalogo remoto e consultado a cada cinco minutos enquanto visivel, alem dos gatilhos explicitos de foco/visibilidade e mudancas de outras janelas. A consulta periodica de armazenamento a cada 30 segundos foi removida; a cota e carregada na inicializacao e ao abrir as configuracoes, e o servidor a verifica em geracoes e gravacoes. Indexacao continua consultando progresso local.

Limites: carregar todo o historico aumenta o trabalho inicial em contas grandes e depende da rede. Nao e um snapshot transacional entre dispositivos; exclusoes ou mensagens concorrentes sao reconciliadas pela atualizacao de catalogo. Historicos invalidados depois do login usam a paginacao existente; este carregamento inicial nao transforma o cache em fonte autoritativa para a IA. O servidor continua consultando o contexto autorizado. Antes de usar o Desktop 6.0.2, publicar o Cloud da mesma versao, que reconhece `bootstrap` e `exchange`. Nao ha migration de esquema nesta revisao.
