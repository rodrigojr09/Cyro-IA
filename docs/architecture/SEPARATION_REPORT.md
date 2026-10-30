# Cyro — entrega da etapa estrutural em 30/10/2026

**Estado: três projetos independentes extraídos e validados localmente. A migração integral solicitada ainda não está concluída.** Projetos e seus históricos/memórias locais, módulos legados de chave pessoal e a homologação integrada externa permanecem pendentes. Nenhum dado local foi enviado automaticamente e nenhuma produção foi alterada.

## 1. Estrutura entregue

```text
C:/Users/user/Desktop/
  Cyro/                 cyro-desktop: Git e remoto originais preservados
    desktop/            Electron/React/IPC
    backend/            runtime Python LOCAL, nome histórico preservado
    tools/              inicialização, testes, empacotamento
    versions/           histórico próprio 6.4.0
  cyro-backend/          novo Git independente, sem remoto
    app/api/            API e autenticação centrais
    lib/                regras, dados, provedores, segurança
    prisma/             schema e migrations
    contracts/          snapshots versionados
    vendor/             SDK oficial Files
    server.ts           processo HTTP e encerramento
    Dockerfile          preparação Coolify
  cyro-cloud/            novo Git independente, sem remoto
    app/, components/   painel Next.js
    app/api/[...path]/  transporte HTTP restrito
    lib/                sessão via API, transporte e estado de apresentação
    contracts/          contratos JSON/tipos/protocolo locais
    vercel.json         preparação Vercel
```

Cada raiz tem package.json/package-lock.json, instalação independente, testes, build, versão 6.4.0, README e versions/. Nenhum workspace/import liga os três checkouts. O pacote Electron interno em desktop/ continua parte do mesmo produto Desktop.

O antigo cloud/ do Desktop pode conter `.env`, caches e o next-env.d.ts que já estava modificado antes desta tarefa. Esses arquivos locais foram preservados no lugar, ignorados e retirados do runtime/índice Git; não constituem mais um projeto Cloud neste repositório. Backup/ não foi alterado. Dados SQLite, perfis JARVIS e instaladores anteriores não foram migrados nem apagados.

## 2. Funcionalidades por projeto

| Projeto | Funcionalidades extraídas/preservadas |
|---|---|
| Desktop | Interface Electron/React, Quick Chat, orb, notificações, animações, clipboard, captura/voz local, Writer, fontes e ferramentas Windows autorizadas, IPC restrito, sessão individual protegida, atualizador e pipeline Setup.exe |
| Backend | Os 17 handlers originais; login/admin e Desktop, sessões, usuários/clientes/dispositivos/licenças, permissões/auditoria, métricas/consumo/cotas de chats, provedores, processamento IA/áudio, conversas gerais/memória geral, Spotify e gestão de versões/atualizações |
| Backend novo | Consulta de sessão administrativa, health/readiness, rate limit Redis, SDK oficial Files, contexto JWT curto, vínculo persistido e rotas privadas de arquivos |
| Cloud | Páginas de login, dashboard, clientes, dispositivos, configurações, credenciais, consumo, auditoria e versões; layout existente e estados de carga/erro; apenas apresentação e transporte para Backend |

O Backend usa Next.js Route Handlers como servidor para conservar contratos existentes, com processo próprio e sem painel. O Cloud não contém Prisma, acesso a banco/Redis/Files ou SDK OpenAI. A autenticação administrativa é decidida pelo Backend em cada operação; verificações de papel nas páginas servem apenas à apresentação.

## 3. Contratos de API

Preservados: `/api/auth/login`, `/api/auth/logout`, `/api/admin`, `/api/management`, `/api/provider-settings`, `/api/device/login`, `/api/device/session`, `/api/device/chats`, `/api/v1/chat/completions`, `/api/v1/audio/speech`, Spotify, releases e updates. Formatos e regras existentes foram conservados.

Acrescentados:

| Método | Rota | Finalidade |
|---|---|---|
| GET | /api/auth/session | Identidade administrativa validada, sem dados sensíveis |
| GET | /health | Processo disponível |
| GET | /ready | PostgreSQL e Redis prontos; 503 em falha |
| GET / POST | /api/files | Listagem da própria conta / upload binário com X-File-Name |
| GET / DELETE | /api/files/:id | Download como anexo / exclusão com propriedade validada |

Backend contém 20 handlers API. O Cloud encaminha rotas permitidas a uma origem fixa, mantém cookies HttpOnly e streams, remove cabeçalhos internos e não segue redirects externos. Exceção restrita: autorização Spotify pode redirecionar para accounts.spotify.com/authorize. Não há credencial de serviço no relay.

Contratos/protocolo são snapshots locais versionados, sem dependência por caminho entre projetos. Mudanças futuras exigem atualizar a versão do contrato e testar clientes anteriores antes de alterar consumidores. A sincronização é por revisão/versionamento, não por monorepo.

## 4. Variáveis de ambiente

| Projeto | Variáveis |
|---|---|
| Desktop | JARVIS_CLOUD_ORIGIN: API central; HTTPS em distribuição. Nome histórico preservado. Nenhum segredo de servidor |
| Cloud | CYRO_BACKEND_ORIGIN: origem fixa HTTPS da API em produção; loopback permitido em desenvolvimento |
| Backend obrigatórias | DATABASE_URL, REDIS_URL, AUTH_SECRET, APP_ORIGIN |
| Backend operação | DIRECT_URL para migrations quando diferente; PORT=3001, HOST=0.0.0.0, CORS_ORIGINS exatas adicionais, CYRO_TIME_ZONE, JARVIS_DB_METRICS* |
| Backend IA/Spotify | OPENAI_*, SPOTIFY_* conforme .env.example; preservar chaves de criptografia e configurações existentes |
| Backend Files | CYRO_FILES_URL, CYRO_FILES_APPLICATION_ID, CYRO_FILES_SERVICE_KEY, CYRO_FILES_CONTEXT_SECRET, CYRO_FILES_ISSUER |
| Backend atualizações | CYRO_GITHUB_TOKEN, CYRO_PUBLISHER_ORIGIN, CYRO_PUBLISHER_SECRET, CYRO_UPLOAD_DIR |
| Bootstrap | BOOTSTRAP_* somente CLI temporária; não executar seed/bootstrap na transição do banco existente |

Application ID Files: `8e17442b-fbe8-42e2-aad7-bd7390422647`. Preferir rede privada `http://cyro-files:3000`; o domínio HTTPS informado depende da configuração real da infraestrutura. A chave corresponde a SERVICE_AUTH_SECRET e a assinatura a SERVICE_CONTEXT_SECRET no Files, sem copiar valores para código ou clientes.

SDK real encontrado e lido em `C:/Users/user/Desktop/cyro-files/sdk`, junto de docs/backend.md. Cópia oficial 0.1.0 versionada no Backend, com hash de origem. JWT HS256, emissor cyro-backend, audiência cyro-files, TTL 120s. Cliente/proprietário derivam da sessão e vínculo Client, nunca do corpo HTTP. Downloads passam pelo Backend; nenhuma URL assinada interna ou CDN pública foi implementada.

## 5. Testes e builds

Ambiente local: Windows, Node 26.12.0, npm 11.7.0 e Python 3.14. Node >=24.11 declarado nos novos projetos; CI Linux/Node 24 preparado, sem execução remota nesta tarefa.

| Projeto/verificação | Resultado |
|---|---|
| Instalação | npm ci real nas três raízes; locks independentes; dry-run final do lock Desktop aprovado |
| Backend | 105/105 testes; TypeScript e build passaram |
| Backend HTTP real local | health 200; ready 503 com dependências indisponíveis; sessão/admin/files 401; origem inválida 403; preflight autorizado 204 |
| Banco | Nove migrations originais idênticas byte a byte, inclusive no índice Git; dez migrations aplicadas em PostgreSQL embarcado PGlite |
| Arquivos | Contexto assinado, SDK/streaming, upload/vínculo/download, acesso negado a outra conta e retomada de exclusão testados com serviços/repositório simulados |
| Cloud | 9/9 testes; build/TypeScript aprovados; 63 verificações de layout com Chromium real/dados sintéticos |
| Desktop | 159/159 testes JS; 214/214 Python; 31/31 iniciadores/build/setup; 2/2 ferramentas; TypeScript/build aprovados |
| Electron | Sete smokes reais aprovados, com Cloud/IA/OAuth sintéticos e perfis temporários |
| Setup 6.4.0 | Gerado e auditado; origem HTTPS anterior preservada como ponte de compatibilidade |

Instalador: `release/v6/Cyro-IA-Setup-6.4.0.exe`, 183.646.685 bytes. SHA-256: `6ea833ce0d919215616ece8e9acd7d388c746c92c494763e11409e564ceca05d`. Auditoria do ASAR/runtime aprovada; `jarvis-backend.exe --self-check` do payload real passou sem chamadas pagas. Os instaladores anteriores foram preservados. O Setup não foi instalado/executado contra o perfil do proprietário e não foi homologado em Windows limpo.

Os smokes registram avisos de handlers de atualização ausentes em algumas fixtures e uma rejeição intencional de IPC clipboard. A entrada real desktop/electron/main.cjs instala o IPC de atualização, e os testes específicos de desenvolvimento/atualizador passaram. Esses avisos não equivalem a homologação do aplicativo instalado.

Docker não está disponível nesta máquina; imagem, drenagem SIGTERM em Linux, Coolify, Vercel, PostgreSQL 17/Redis 7.2 reais e rede privada não foram validados. Não foram atestados login integrado de produção, áudio pago, OAuth real, Files real, Windows limpo ou atualização instalada.

## 6. Pendências para concluir o objetivo integral

1. Centralizar no Backend os metadados, históricos e memórias dos projetos atualmente locais. Permanecem em ProjectStore/CloudConversations/ProjectChatService no runtime Desktop; a extração preservou esse comportamento para não perder dados ou autorização local.
2. Preparar migração idempotente e explicitamente consentida desses dados para a conta autenticada, com checkpoints, isolamento entre clientes, compatibilidade com SQLite existente e rollback. Manter permissões de arquivos e execução Windows exclusivamente locais.
3. Concluir a substituição e retirada do caminho legado de execução com chave pessoal e de políticas/orquestração que devam ser centrais. Iniciadores oficiais já usam sessão/API; presença de módulos legados não deve ser apresentada como centralização total.
4. Integrar anexos legados e vínculos de arquivos com os futuros recursos de projeto/conversa. Cotas atuais de chats não incluem automaticamente Files. A API nova cobre arquivos privados da própria conta vinculada a Client, sem compartilhamento administrativo entre proprietários.
5. Homologar os três produtos contra ambiente de teste PostgreSQL 17/Redis/Files, login real e revogação, dois clientes/dispositivos, conversas/projetos, falhas/recuperação, provedores, atualizações e rollback.
6. Autorizar posteriormente publicação dos novos repositórios e deploy; definir origem HTTPS definitiva da API e só então trocar a configuração dos clientes.

Não há declaração de migração integral concluída nem de produção pronta. Funcionalidades preservadas e testes locais aprovados não substituem essas etapas.

## 7. Commits locais

| Repositório | Commit | Conteúdo |
|---|---|---|
| Desktop original | ba29974 | Auditoria e plano de separação |
| Desktop original | 7a8f37d | Extração, independência do Desktop, versão 6.4.0, iniciadores e documentação |
| cyro-backend | 34659a7 | API central, contratos, infraestrutura e integração Files |
| cyro-backend | 588d9c1 | Organização dos módulos para manutenção |
| cyro-backend | d2ebaed | Contrato explícito de arquivos individuais |
| cyro-cloud | 66b2a4d | Painel independente e cliente HTTP |
| cyro-cloud | 1faa81e | Organização do transporte e contratos |
| cyro-cloud | e0b1c12 | Rotas dinâmicas derivadas do contrato e teste adicional; 9/9 |

Desktop continua na branch original codex/jarvis-v6-architecture e remoto rodrigojr09/Cyro-IA. Novos projetos usam codex/architecture-split, sem remotos. Não houve git init no Desktop, force push, substituição de histórico, tags, releases ou push.

## 8. Criar repositórios GitHub — somente após autorização

Criar pela interface do GitHub dois repositórios **privados e vazios**, cyro-backend e cyro-cloud, sem README/licença/ignore iniciais. Os históricos locais já existem. Revisar commits e então, em cada pasta, adicionar o endereço correspondente como origin e enviar a branch codex/architecture-split. Não alterar o origin do Desktop.

Comandos abaixo são instruções futuras, não foram executados:

```powershell
Set-Location C:/Users/user/Desktop/cyro-backend
git remote add origin git@github.com:rodrigojr09/cyro-backend.git
git push -u origin codex/architecture-split

Set-Location C:/Users/user/Desktop/cyro-cloud
git remote add origin git@github.com:rodrigojr09/cyro-cloud.git
git push -u origin codex/architecture-split
```

Não criar tags/releases de produção automaticamente. Configurar a branch de deploy somente depois da revisão e homologação.

## 9. Deploy independente — manual

**Backend/Coolify:** importar o repositório autorizado, usar Dockerfile, porta 3001, domínio HTTPS escolhido pelo proprietário e rede privada dos serviços existentes. Inserir variáveis no Coolify, sem segredos em build args. Backup e ensaio em cópia do banco, conferir migrate status e executar manualmente npm run db:deploy. Não há migration automática no startup. Usar /ready para tráfego e /health para liveness; prazo de parada >=30s. A única migration nova adiciona FileBinding. Não executar reset/db push/seed nem alterar instalações PostgreSQL/Redis/Files.

**Cloud/Vercel:** importar repositório autorizado como Next.js, raiz do projeto, npm ci e npm run build. Configurar apenas CYRO_BACKEND_ORIGIN HTTPS; APP_ORIGIN no Backend deve corresponder exatamente ao painel. Sem banco/segredos de serviço na Vercel. Homologar cookies, redirects Spotify, layout e limites de tamanho/duração do relay.

**Desktop:** manter build.bat e npm ci na raiz. JARVIS_CLOUD_ORIGIN permanece como configuração compatível. O instalador desta etapa reutiliza a origem HTTPS anterior como ponte; não demonstra que a nova API foi implantada. Trocar origem apenas após homologação e autorização.

## 10. Transição e rollback

1. Manter API/Cloud atuais ativos e instaladores anteriores disponíveis. Fazer backup consistente e ensaiar migrations sem alterar produção.
2. Subir Backend em paralelo após autorização, com mesmo banco e chaves preservadas, sem duplicar tarefas ou abrir serviços internos. Aplicar apenas migration aditiva aprovada.
3. Validar contas de homologação, isolamento, sessões, arquivos, provedores e atualizações. Preservar AUTH_SECRET e chaves Spotify/configurações criptografadas para não invalidar dados.
4. Publicar painel apontando para a nova API, conservando domínio para cookies. Migrar Desktop gradualmente por configuração/instalador, mantendo contratos antigos durante a janela de versões instaladas.
5. Executar a migração de projetos locais somente após sua implementação e critérios do item 6; nunca copiar dados de outro usuário ou enviar todo o histórico implicitamente.
6. Rollback de aplicação repõe imagens/commits e URLs anteriores, sem down migration destrutiva. Manter FileBinding, uploads, banco, chaves e perfis. Se domínio do painel mudar, exigir novo login. Não prometer indisponibilidade zero sem teste real.

Mais detalhes: READMEs e VALIDATION.md nos dois novos projetos, [plano inicial](THREE_PROJECT_MIGRATION.md) e [limite do Desktop](DESKTOP_BOUNDARY.md).
