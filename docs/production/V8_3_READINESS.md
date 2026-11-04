# Cyro v8.3.0-rc.1 — prontidão para produção

Data: 04/11/2026. Recomendação: **NO-GO** para lançamento público. Candidata local de estabilização; nenhuma tag, release, push, implantação ou migration de produção foi executada. Files usa versão independente 0.4.0; SDK continua 0.1.0.

## 1. Resumo executivo

A v8.2.0 estava implementada parcialmente e sem commits nos quatro projetos. Esta candidata incorpora esse trabalho preservado e corrige falhas de integração, memória, observabilidade e dependências. Builds e testes locais são evidência limitada: não substituem restauração dos backups reais, homologação Linux/Coolify ou instalação/atualização em Windows limpo. Não há autorização para publicação final 8.3.0.

## 2. Inventário e fronteiras

| Repositório | Base encontrada | Estado inicial | Candidata |
| --- | --- | --- | --- |
| API | f8d9f52 | Trabalho 8.2 não commitado; hotfix SUPER_ADMIN preservado | 8.3.0-rc.1 |
| Desktop | 7e68dfd | Trabalho 8.2 não commitado; instalador entregue 8.1.2 | 8.3.0-rc.1 |
| Cloud | 804408e | Painel de memória 8.2 não commitado | 8.3.0-rc.1 |
| Files | 62a1a09 | TXT 0.4 não commitado | 0.4.0 |

Desktop/Cloud → API autenticada → PostgreSQL/Redis/Files/provedores. Files exige chave do serviço e JWT curto por aplicação/cliente/proprietário. A API valida adicionalmente o vínculo arquivo/EV. Não há acesso privilegiado ao banco ou Files pelos frontends. Não há IA independente por EV. Backup/ e dados pessoais não foram modificados.

Consulta pública de leitura: API /health 200, versão 8.1.2; /ready 200; Cloud /health 200, versão 8.1.2. Isso não comprova configuração privada, schema atualizado, backups, isolamento de rede ou versão interna do Files. Os endpoints públicos não foram usados para testes de escrita.

## 3. Achados e correções

| ID | Severidade | Problema | Resultado |
| --- | --- | --- | --- |
| MEM-01 | P1 | Importação antiga avançava cursor com captura desligada | Pausa sem consumir cursor; teste transacional |
| MEM-02 | P2 | Interpretação no painel não entrava nos totais de tokens/custo | Medição comum inclui interpretação e uso desconhecido não vira custo zero |
| CHAT-01 | P1 | Inicialização baixava históricos e restaurava seleção automaticamente | Metadados somente; primeiro acesso manual carrega e mantém cache da sessão |
| CHAT-02 | P2 | Atualização parcial do catálogo invalidava caches não presentes na página; abertura por notificação descartava cache | Cache preservado quando revisão conhecida não mudou |
| CHAT-03 | P1 | Retentativa após perda da resposta podia duplicar conversa/mensagem | IDs estáveis, pergunta persistida antes da IA e recibo durável; teste de commit com resposta perdida |
| CHAT-05 | P1 | Clientes Desktop 8.1 ainda pedem fixed general e seriam bloqueados com 410 | Compatibilidade resolve conversa normal legada com slot null; somente Quick continua fixo |
| CHAT-04 | P2 | Streaming legado recebia argumento de persistência não suportado | Compatibilidade dos clientes sem operation_id preservada |
| OPS-01 | P1 | Readiness respondia apto com banco acessível mas schema ausente/desatualizado | Valida colunas/tabelas necessárias e Redis, sem ler conteúdo privado |
| OPS-02 | P2 | Erros inesperados genéricos sem correlação | x-request-id e log sanitizado; métricas amostradas incluem RSS e EV/memória |
| OPS-04 | P2 | Redis conectado sem resposta podia manter comandos e encerramento pendentes | Prazo integral de 3 s e destruição em falha; teste TCP de conexão interrompida passou em aproximadamente 3,1 s |
| OPS-03 | P2 | SSR de sessão Cloud e healthcheck Files sem prazo explícito | Limites de 10 s e 4 s, respectivamente |
| SEC-01 | P2 | Alertas Node em uuid/ExcelJS e minimatch do empacotador | Overrides limitados às versões afetadas; não aplicar audit fix --force |
| SEC-02 | P1 | Faixas Python antigas impediam correções de segurança de Pillow/cryptography | Atualização para faixas corrigidas; pip-audit final sem alertas conhecidos |
| SEC-03 | P1 | Contexto de build Docker não excluía explicitamente Backup/ e artefatos privados | .dockerignore endurecido nos serviços |
| TEST-01 | P2 | Files excedia 5 s sob concorrência de suítes em máquina de 8 GB | Execução de arquivos de teste sequencial; sem aumentar prazo nem omitir testes |
| TEST-02 | P2 | Simulador Electron ainda usava bootstrap antigo | Fixture atualizada para catálogo/Quick e abertura sem mensagens |

## 4. Funcionalidades e estado da v8.2

MAIN: chats comuns e Quick. EV: MAIN + apenas o espaço autorizado. Captura determinística de declarações do usuário, preferências, trabalho, decisões e fatos operacionais; hipóteses/segredos/respostas do modelo não viram fatos. Não existe interpretação semântica universal nem chamada extra por mensagem. O interpretador do painel só propõe mudanças, exige confirmação e usa o mesmo provedor/orçamento.

PostgreSQL é a verdade transacional; TXT é projeção de registros ativos. Namespaces memory/{user_id}/main.txt e memory/{user_id}/evs/{ev_id}/memory.txt. Snapshot UUID/hash imutável; CAS de revisão e geração impede publicação de upload antigo. Exclusão remove da recuperação ativa e usa tombstones; histórico/snapshots antigos permanecem para retenção técnica. Isso **não é eliminação física de backups**. Não importar automaticamente histórias completas ou arquivos locais.

Somente Quick é fixo. A antiga Conversa Geral vira conversa normal conservando IDs/mensagens/anexos. Novo chat é rascunho até o primeiro envio; títulos automáticos não sobrescrevem nome manual. Catálogo recente/pesquisa/paginação não baixam mensagens. Cache RAM por sessão: até 12 chats e aproximadamente 8 MiB por área, com tolerância à conversa corrente individual maior; logout/recriação descarta o cache. Não é cache offline persistente em disco.

EV Logístico: parsers NF-e/CT-e/MDF-e, PDF textual, CSV/XLSX, tabelas tipadas, propostas confirmadas, análise determinística, arquivos privados e exportação. Dados ausentes não viram zero ou validação fiscal oficial. PDF sem texto/OCR não é homologado. Livro Gramatical completo não está implementado: escopo antigo não foi declarado concluído nem criado nesta estabilização. Writer local tem regressão automatizada; disponibilidade do fluxo Writer no modo exclusivamente central deve ser homologada, sem afirmar paridade integral por causa dos testes locais.

## 5. Segurança

Modelo License permanece legado; login por senha vigente autoriza por conta ACTIVE, perfil Client e dispositivo/sessão não revogados. Não foi criada exigência nova de licença ausente; uma política comercial diferente precisa aprovação antes de mudar acesso. Sessões são revalidadas no servidor; contas inativas/revogadas não entram. SUPER_ADMIN continua isento da cota mensal de tokens, sem desativar contabilização/autenticação. UI não concede permissões. SQL parametrizado e escopos owner/EV; cookies mutáveis exigem origem exata. CORS fechado; URLs privadas/tokens de serviço não vão ao renderer.

Electron: contextIsolation/sandbox habilitados, nodeIntegration desabilitado, navegação e novas janelas bloqueadas, IPC por origem/frame/rota/conta. Markdown sanitizado e HTML não confiável coberto nos testes. Atualizador confere origem, tamanho, SHA256, NSIS e versão PE e revalida antes de executar. Assinatura Authenticode e instalação limpa continuam sem homologação desta candidata.

Uploads têm limites, detecção de formato, SHA256 e UUID. XML rejeita entidades/DOCTYPE; XLSX tem limites de expansão e rejeita macros/relações externas. Isso não equivale a antivírus completo: SCAN_REQUIRED_MIME_TYPES falha fechado se o adaptador exigido não existe. Não ativar antimalware obrigatório esperando que haja um scanner instalado.

Fontes dos alertas verificados: https://github.com/advisories/GHSA-w5hq-g745-h8pq, https://github.com/advisories/GHSA-g3hv-75wg-m249, https://github.com/advisories/GHSA-g6cj-pr64-35w5 e https://github.com/advisories/GHSA-4558-3h8r-v8xp. Ausência de alertas de dependências não é certificado de ausência de vulnerabilidades.

## 6. Testes e evidências

Resultados finais são registrados em TEST_RESULTS.md nesta pasta. Suites usam HTTP/Prisma reais com PostgreSQL embarcado, simuladores de Redis/Files/provedor/GitHub e perfis temporários. Pagamentos, OAuth real, publicação real e dados de produção não foram usados. Nenhum resultado com simuladores deve ser descrito como teste de serviços privados reais.

## 7. Desempenho

Host: Windows, 8 GB de RAM, Intel i5-2400, quatro processadores lógicos. Captura Electron após conversa EV e gerenciamento de memória: renderer aproximadamente 122 MiB de working set; soma de working sets dos processos aproximadamente 377 MiB após 3 s ocioso (páginas compartilhadas podem contar mais de uma vez). CPU informada pelo Electron após esse intervalo: soma aproximada 0,273% dos processos no intervalo. Cenário sintético, janela offscreen; não inclui runtime Python e não comprova ausência de vazamento em horas de uso.

Memória em PostgreSQL embarcado: 101 registros; resumo 486 tokens e fato adicional 16; JSON estruturado sintético entre 7263 e 7465 tokens. Quatro consultas na recuperação, 23 operações SQL na captura inicial e zero consultas ChatMessage ao abrir metadados EV. Estes números não são capacidade de usuários simultâneos nem economia de produção. Tempo sofre concorrência do host; repetir em homologação ociosa. Preços não configurados resultam custo desconhecido, não custo zero. Consolidação automática é determinística, sem chamadas de IA adicionais.

Metas de homologação propostas, ainda não aprovadas como SLA: startup sem histórico; API sem IA p95 < 1 s com 5 usuários no hardware real; medir 30 min de Desktop ocioso e ciclos de abertura sem crescimento continuado; memória cache respeitando limites; teste de carga não deve usar serviços pagos sem autorização. Não prometer usuários simultâneos sem ensaio.

## 8. Banco e migrations

Migration aditiva pendente 20261104000200_memory_text_and_normal_chats: flags do usuário, revisão/geração de memória, propostas transacionais, título/origem e conversão de slot general para conversa comum. Snapshots MD/JSON anteriores preservados; namespace canônico TXT e outbox marcados para reconstrução. Não executar db push/reset/seed em produção. Migrações antigas não foram reescritas. Files não precisa migration nova para TXT.

Ensaiar primeiro numa restauração isolada. Depois conferir prisma migrate status e aplicar migrate deploy pelo target administrativo, com SHA aprovado. Não executar down migration para rollback. A regra de slots somente Quick impede runtime 8.1.2 de recriar general: rollback cego à 8.1.2 **não é compatível**. Preservar candidata corrigida ou usar imagem previamente ensaiada compatível com o schema. Restauração do banco só em incidente aprovado, com perda potencial desde o backup quantificada.

## 9. Backup e recuperação

Bloqueador P1 aberto: não há evidência de restauração do backup real PostgreSQL + volume Files. pg_dump/pg_restore/psql/Docker não estão disponíveis neste host; não houve acesso administrativo à VPS. Um teste de cópia de volume sintético verifica SHA256, arquivo ausente, corrupção e path traversal, mas não substitui pg_restore.

Conjunto consistente: bancos lógicos cyro e cyro_files + volume Files + commit/imagem + configuração pública e manifesto. Guardar chaves essenciais separadas em cofre/backup cifrado, com controle de acesso. Interromper escritas coordenadamente na API e Files durante o conjunto; dump e volume em horários arbitrários não garantem consistência. Redis não é fonte dos arquivos/memórias, mas indisponibilidade bloqueia operações protegidas.

Frequência proposta: diário, retenção 7 diários/4 semanais/6 mensais, cifrado fora da VPS; ensaio mensal e após migrations. RPO pretendido 24 h; RTO pretendido 4 h, ainda não medidos. Após pg_restore em bancos isolados e restauração do volume, executar verificador read-only do Files (VERIFY_DATABASE_URL/VERIFY_STORAGE_PATH, npm run verify:backup após build ou na imagem do serviço), validar 100% READY/hash/tamanho e registrar órfãos separadamente. Script não remove nem repara objetos. Conferir isolamento, login, memória, chats, arquivo e reinício na plataforma recuperada; registrar duração real.

## 10. Infraestrutura e observabilidade

Verificar manualmente Coolify: PostgreSQL/Redis/Files somente rede privada; API HTTPS pública porta interna 3000; não publicar 5432/6379/volume. Preservar chaves, UID/GID/volume Files e bancos separados. Containers Node executam como usuário node. Uma réplica Files por volume local; horizontalização entre hosts não está validada.

Liveness /health; readiness /ready. API agora verifica schema esperado e Redis. Files valida banco/Redis/espaço. Falha Files não derruba o processo inteiro da API, mas operações de arquivos/snapshots ficam pendentes e recuperáveis. Métricas API são amostradas e agregadas em RAM; IDs pseudonimizados, nenhum SQL/argumento/conteúdo/token. Logs inesperados usam x-request-id; Cloud repassa esse identificador. Não habilitar logs brutos de bodies/queries de tickets no proxy.

Alertas propostos: 3 falhas consecutivas de readiness em 30 s, erros 5xx > 2% em 5 min, disco < 20% ou < 2 GiB, RAM sustentada > 85%, falhas de jobs/snapshots e backup sem sucesso há 26 h. Configurar rotação/retenção de logs e canal de alerta autorizado no Coolify/monitor existente. Alertas não foram instalados na VPS por esta tarefa.

## 11. Instalador e atualização

Último instalador preservado: 8.1.2 em release/v8, 183683386 bytes, SHA256 fb971acf068623eba982c7a16959738aec1ec16bed871349023733d8c0a5d119. Não é instalador da candidata. Não houve novo instalador/publicação/tag, nem validação de instalação limpa, atualização instalada/desinstalação em Windows descartável. NSIS preserva dados de usuário (deleteAppDataOnUninstall=false). Repetir audit de fontes/runtime/hash/versão PE e antivírus/assinatura no pacote exato aprovado. Prerelease não deve aparecer como stable latest.

## 12. Pendências e riscos residuais

| Prioridade | Pendência | Evidência necessária |
| --- | --- | --- |
| P1 | Restauração coordenada real não demonstrada | Bancos/volume isolados, 100% manifesto, smoke e RPO/RTO |
| P1 | Deploy Linux/privacidade de rede e segredos da VPS não auditados com acesso administrativo | Evidências Coolify, portas, volumes, TLS, ready e restart |
| P1 | Pacote novo não homologado em instalação/atualização/desinstalação Windows limpa | Mesmo artefato RC, preservar dados, assinatura/hash e rollback |
| P1 | Fluxo Writer central não demonstrado para usuário exclusivamente EV | Homologar interface e persistência; não prometer testes locais como paridade |
| P2 | Sete testes Files com PostgreSQL/Redis reais sem execução | Serviços isolados TEST_DATABASE_URL/TEST_REDIS_URL |
| P2 | IA paga/voz/OAuth real e carga/longa duração não homologados | Ambiente de teste autorizado e métricas |
| P2 | Retenção técnica de snapshots/recibos/histórico cresce sem expurgo automático | Política aprovada e monitoramento de cota |
| P2 | Scanner antimalware opcional sem adaptador produtivo | Política explícita e solução antes de prometer inspeção completa |
| P3 | Documentos históricos v5–v8.1 têm decisões superadas | Referências atuais no topo; histórico preservado |

## 13. Checklist de deploy, após aprovação

1. Aprovar SHA/artefatos e congelar candidata; nenhuma alteração após evidência sem reteste.
2. Obter e restaurar backup consistente em isolamento; resolver P1 antes de lançamento público.
3. Files 0.4.0 na rede privada; volume/chaves preservados; health.memoryTextSnapshots=true e ready 200.
4. Ensaiar/aplicar somente migrations pendentes API; runtime não executa migrations.
5. API 8.3.0-rc.1; origens exatas, chaves existentes, banco/Redis privados; CYRO_EV_ENABLED e CYRO_MEMORY_ENABLED somente após dependências homologadas; budgets 500/800.
6. Conferir health/version, ready/schema, login, sessão, MAIN/EV, upload/download e erro recuperável com contas de teste autorizadas.
7. Cloud na Vercel com apenas CYRO_BACKEND_ORIGIN; remover credenciais legadas somente mediante autorização operacional. Redis/PostgreSQL não exigem novo serviço nem reset.
8. Homologar RC Desktop no Windows limpo e atualização sobre 8.1.2; entregar somente artefato auditado, sem publicação automática.
9. Validar alertas, restauração, rollback e aprovar explicitamente a versão final 8.3.0. Nenhuma tag/release automática.

## 14. Rollback

Parar novas escritas, preservar logs sanitizados e estado para diagnóstico. Preferir correção/rollback de imagem compatível com schema novo. Não remover colunas, tabelas, snapshots ou volume; não reduzir revisões. Depois da conversão de general, não retornar automaticamente ao runtime antigo que tenta recriá-lo. Restaurar banco+volume somente em conjunto consistente e com autorização de incidente. Revalidar memória/chats/files antes de liberar acesso; registrar perda potencial entre backup e incidente. Clientes podem exigir login novamente, sem apagar perfil local.

## 15. Critério para encerrar a candidata

Testes locais, segurança das dependências e build precisam passar no mesmo código; bloqueadores P1 acima precisam evidência externa ou exceção explícita aceita. Ausência de falhas nos testes não autoriza GO. Não há aprovação final implícita.

## 16. Recomendação

**NO-GO** para produção pública nesta data. O código local foi estabilizado e preparado para homologação, mas backups restauráveis, infraestrutura privada e pacote instalado precisam ser demonstrados. Alterar para CONDITIONAL GO/GO apenas após evidências e aprovação explícita do responsável.


## Arquivos centrais alterados

API: prisma/schema.prisma e migration 20261104000200_memory_text_and_normal_chats; lib/memory/{engine,policy,tokens,chat,migrate,sync,manage,interpret,commands}.ts; lib/conversations.ts; rotas memory/ev/chat; lib/http.ts, lib/metrics.ts, lib/redis.ts, app/ready/route.ts e app/health/route.ts; manifests/lock, contratos e testes de persistência/resiliência.

Desktop: backend/cloud_conversations.py e backend/main.py; App/Sidebar/workspace/store.js e EVWorkspace.jsx; MemoryPanel.jsx e ev-ipc.js; estilos, requisitos Python, manifests/locks e testes JS/Python/Electron/plataforma. Instaladores anteriores não foram alterados.

Cloud: components/memory.tsx, lib/auth.ts, lib/backend.ts, contracts/api-routes.json, fixture de layout e manifests/lock. Não foram adicionados drivers de banco/provedor/Files.

Files: src/services/files.ts, src/storage/local.ts, src/routes/index.ts e src/app.ts para TXT; src/storage/verify.ts, scripts/verify-backup.ts e tests/restore.test.ts para verificação read-only; Dockerfile/.dockerignore, tsconfig e manifests/lock. SDK preserva contrato 0.1.0.

Todos: README, CHANGELOG, AGENTS e histórico de versão; documentos de memória/produção e resultados reais. git show dos commits locais fornece o inventário exato por alteração lógica.
