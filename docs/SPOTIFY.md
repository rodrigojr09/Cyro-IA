# Spotify no JARVIS v5 — configuração e validação

Implementação do Authorization Code Flow e dos controles via Web API. **Ainda não validada com conta real**: o proprietário informou que as variáveis privadas e a conta autorizada ainda não foram configuradas. Os testes automatizados usam respostas Spotify simuladas; não comprovam OAuth, Premium, quota, reprodução real, distribuição pública ou aprovação do Spotify.

## Configuração do servidor

A configuração preferida agora é **Dashboard → Credenciais**, exclusiva do SUPER_ADMIN. Informe Client ID, Client Secret e callback; a chave dos tokens é gerenciada internamente. Leia [CREDENTIALS.md](CREDENTIALS.md) para migration, proteção, adoção das chaves existentes e prioridade sobre variáveis de ambiente. As instruções de variáveis abaixo continuam válidas para ambientes sem configuração salva na dashboard.

1. No Spotify Developer Dashboard, confira o app de Client ID `a075ad4ae29f41c5a3df8d2ff9c84972`, Website `https://cronosjarvis.vercel.app` e cadastre **exatamente** `https://cronosjarvis.vercel.app/api/integrations/spotify/callback`. Não basta preencher apenas Website. A configuração no Dashboard não foi acessada/verificada nesta entrega.
2. Configure no ambiente Cloud local privado e em Vercel → Project → Settings → Environment Variables:

| Variável | Valor/orientação |
| --- | --- |
| `APP_ORIGIN` | `https://cronosjarvis.vercel.app` em produção |
| `SPOTIFY_CLIENT_ID` | `a075ad4ae29f41c5a3df8d2ff9c84972` (público) |
| `SPOTIFY_CLIENT_SECRET` | segredo do app obtido no Dashboard, exclusivamente no servidor |
| `SPOTIFY_REDIRECT_URI` | callback HTTPS exato acima |
| `SPOTIFY_TOKEN_ENCRYPTION_KEY` | 32 bytes aleatórios, representados por 64 caracteres hexadecimais |

Para gerar **somente a chave de criptografia** no seu terminal privado: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Guarde a chave no gerenciador de segredos e mantenha uma cópia protegida. Não execute em CI com logs públicos, não compartilhe a saída e não use a chave de exemplo dos testes. Não é um Client Secret: esse só pode ser obtido no Spotify.

3. Aplique a migration no Cloud com `npm run db:deploy -w @jarvis/cloud` no ambiente autorizado e depois publique a nova versão do Cloud. Esta entrega **não aplica migrations remotas nem publica**. Recompile o Desktop e o runtime Python para distribuir o recurso; não basta atualizar apenas a interface.
4. Adicione a conta Spotify de teste à allowlist do Dashboard. O proprietário do app precisa de Premium ativo. Os controles de reprodução dependem de conta, dispositivo e conteúdo elegíveis.
5. Abra Configurações → Integrações → Spotify → Conectar. O navegador padrão deve abrir a página oficial do Spotify. Autorize os três scopes, volte ao JARVIS e confira a conta. A transação expira em cinco minutos e a interface consulta sua conclusão autenticada a cada quatro segundos.

Em desenvolvimento local, copie `cloud/.env.example` para o `.env` privado e configure o banco existente. O modo local HTTP continua disponível para as outras funções do JARVIS, mas **OAuth Spotify exige origem/callback HTTPS iguais**: use uma origem HTTPS de teste sob seu controle, encaminhando ao Cloud local, e cadastre seu callback exato no Dashboard. Ajuste `APP_ORIGIN`, `SPOTIFY_REDIRECT_URI` e a origem Cloud do Desktop para esse ambiente. Nunca troque o callback dinamicamente por parâmetros do frontend. `.env`, banco e tokens não entram em commits.

A alteração da chave de criptografia exige migração segura dos ciphertexts ou reconexão das contas. Trocar apenas a variável torna os tokens antigos ilegíveis. Nunca use uma nova chave aleatória em cada implantação.

## Fluxo e segurança

- `POST /api/integrations/spotify`: operações `status`, `start`, `poll`, `cancel`, `disconnect`, `control`, `chat`, sempre com a sessão individual Bearer JARVIS existente. Não aceita `userId` fornecido pelo cliente.
- `GET /api/integrations/spotify/authorize`: consome um ticket aleatório curto, criado pela sessão autenticada, estabelece cookie HttpOnly/Secure/SameSite=Lax e redireciona para `accounts.spotify.com`. A URL contém apenas esse ticket temporário, nunca tokens ou Client Secret.
- `GET /api/integrations/spotify/callback`: valida state, cookie do navegador, expiração, sessão ativa e consumo atômico. Troca o código no Cloud e vincula a conta ao iniciador autenticado. Retorna uma página sem tokens, sem redirect arbitrário e sem recursos externos. Códigos OAuth/state seguem o fluxo oficial de autorização; configure também a infraestrutura para não registrar queries sensíveis.
- `SpotifyOAuthTransaction`: hashes do ticket/state/cookie, usuário, sessão, estado e validade. Transações expiradas são removidas na próxima inicialização de conexão; desconectar remove todas do usuário.
- `SpotifyConnection`: vínculo único por usuário e por conta Spotify, scopes, validade e tokens AES-256-GCM com IV aleatório e AAD por usuário/finalidade. Tokens não vão ao Electron. Trocar de conta exige desconectar primeiro. Restrições únicas e bloqueio da linha do usuário protegem vínculos concorrentes.
- Refresh usa lease condicional no Postgres para coordenar instâncias Cloud. Respeita rotação e conserva o refresh token anterior quando o Spotify não envia outro. Renovação concorrente pode responder que a conexão está sendo renovada; uma nova tentativa é permitida, sem loops infinitos.
- 401 provoca no máximo uma renovação e uma repetição; 403 informa Premium/permissão/allowlist; 404 informa ausência de recurso/dispositivo; 429 conserva cooldown compartilhado no banco e retorna Retry-After; rede/5xx não inventam sucesso. Comandos não são repetidos automaticamente em falhas de rede.
- Desconectar exige confirmação nativa, apaga tokens e invalida transações. Não há promessa de revogação remota: o usuário pode removê-la também nas configurações da conta Spotify.

## Scopes e controles

Somente `user-read-currently-playing`, `user-read-playback-state`, `user-modify-playback-state`. Não solicita e-mail, playlists privadas, biblioteca, streaming ou Web Playback SDK.

Operações: reprodução atual, dispositivos, pausar, continuar, próxima, anterior, volume absoluto (0–100), volume relativo (+/-10 quando suportado), seleção de dispositivo e teste de conexão. Os destinos HTTP são fixos e os parâmetros são validados. A reprodução permanece no Spotify do usuário.

Os exemplos “pausa a música”, “continua a música”, “próxima”, “volta a música anterior”, “qual música está tocando?”, “mostra meus dispositivos Spotify”, “coloca o volume em 40%” e “aumenta o volume” são interpretados sem IA adicional. A detecção usa comandos completos; frases negativas, instruções citadas e intenção incerta não autorizam ações. Pedidos fora desse vocabulário podem receber pedido de esclarecimento, sem execução presumida.

O chat principal, Quick Chat e transcrições do pipeline de voz existente usam o mesmo serviço Cloud. Há também a ferramenta `spotify_control` no ciclo de ferramentas: ela só considera a mensagem humana original, não aceita parâmetros de execução vindos do modelo/arquivos e termina a rodada diretamente na interface. Nenhum resultado Spotify retorna ao modelo.

**Metadados de reprodução são efêmeros:** não entram no histórico persistente de conversas, memória, resumos, prompts ou síntese de voz OpenAI. A resposta visual mostra a faixa; a resposta falada confirma que o resultado está disponível na interface. Isso evita ingestão de conteúdo Spotify em IA. Não se gera histórico de audição.

O mini player reutilizável existe nos dois ambientes, recolhido no botão com a marca Spotify. Ao abrir consulta estado real e disponibiliza controles, faixa/artista, link para abrir a faixa no Spotify, dispositivos e volume compatível. Não inclui capa nesta etapa. Atualiza a cada 30 segundos enquanto estiver aberto/visível; suspende consultas quando recolhido ou com documento oculto. Requer conexão real e não mostra reprodução fictícia. Ativos oficiais de marca são distribuídos localmente a partir do [kit de design Spotify](https://developer.spotify.com/documentation/design), sem modificação da marca.

## Distribuição e funcionalidades futuras

As regras consultadas em 26/10/2026 limitam novas aplicações Development Mode a cinco usuários autenticados e autorizados na allowlist; exigem Premium do proprietário. Aplicações antigas podem ter exceções preservadas. Não há contorno desses limites. Distribuição pública/comercial precisa de elegibilidade, análise e conformidade específicas do Spotify; esta implementação não concede aprovação.

Busca/reprodução por nome ou playlist ficam explicitamente indisponíveis. A busca não é universalmente proibida (a migração de fevereiro/2026 reduz seu limite máximo para dez), mas este pacote não implementa seleção por nome, autorização de playlists, seleção de resultados ou reprodução sob demanda. Não solicita novos scopes nem promete que a modalidade da conta permita essas funcionalidades. Uma expansão precisará de validação própria.

Fontes oficiais: [OAuth](https://developer.spotify.com/documentation/web-api/tutorials/code-flow), [refresh](https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens), [scopes](https://developer.spotify.com/documentation/web-api/concepts/scopes), [quotas](https://developer.spotify.com/documentation/web-api/concepts/quota-modes), [mudanças Development Mode](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide), [controle de reprodução](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback), [rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits), [política de conteúdo/IA e distribuição](https://developer.spotify.com/policy).

## Roteiro obrigatório de teste real (pendente)

Após configurar servidor/Dashboard e a conta autorizada: validar conectar, negar, expirar, repetir callback, reconectar, reiniciar Desktop mantendo a conta, refresh, teste de conexão e desconectar. Com Spotify elegível aberto, executar todos os controles pelo chat principal, Quick Chat, transcrição por voz e mini player. Confirmar outro usuário JARVIS isolado, conta sem dispositivo, dispositivo restrito e respostas de Premium/permissão. Conferir nome da conta, remoção de tokens, ausência de segredos em respostas/logs e a revogação manual na conta Spotify. Não usar contas de terceiros sem autorização.

## Validação desta entrega — 26/10/2026

- 40 testes Cloud aprovados, incluindo OAuth/refresh/erros com HTTP simulado e migration/índices em PostgreSQL embarcado real.
- 148 testes Desktop aprovados, incluindo conexão/cancelamento, restrição IPC, ausência de polling recolhido, preservação da sessão diante de 403 e proteção dos metadados na fala do Quick Chat.
- 186 testes Python do backend e 30 testes de iniciadores/setup/build aprovados. O fluxo compartilhado de texto/transcrição e a ferramenta de IA foram exercitados sem conta externa.
- TypeScript Cloud/Desktop, build de produção Next.js, bundles Desktop e checagem Prettier aprovados. Não existe comando ESLint separado no Desktop.
- Electron real: smoke geral de navegação/integrações/temas/tamanho compacto; smoke de clipboard para regressão; smoke Spotify com preload/IPC reais, autorização/conclusão Cloud simuladas, dois mini players, comando e desconexão. Capturas dos detalhes conectados e Quick Chat inspecionadas.
- Não realizados: OAuth/chamadas Spotify reais, Premium/allowlist real, áudio pago, microfone físico, implantação, migration remota, criação de instalador ou validação em Windows limpo. Credenciais ainda não configuradas pelo proprietário. Sem push, release ou tag.
- Dependências reutilizam a instalação dos workspaces feita na raiz com `npm ci`; nenhuma dependência nova foi adicionada. A migração permanece somente no código e no banco embarcado dos testes.

## Arquivos criados/modificados

- `.gitignore`
- `CHANGELOG.md`
- `README.md`
- `backend/ai_tools.py`
- `backend/cloud_entry.py`
- `backend/main.py`
- `backend/spotify_commands.py`
- `backend/test_spotify.py`
- `cloud/.env.example`
- `cloud/app/api/integrations/spotify/authorize/route.ts`
- `cloud/app/api/integrations/spotify/callback/route.ts`
- `cloud/app/api/integrations/spotify/route.ts`
- `cloud/lib/spotify-command.ts`
- `cloud/lib/spotify.ts`
- `cloud/prisma/migrations/202610260001_spotify/migration.sql`
- `cloud/prisma/schema.prisma`
- `cloud/test/spotify.test.ts`
- `desktop/.prettierignore`
- `desktop/assets/spotify-black.svg`
- `desktop/assets/spotify-white.svg`
- `desktop/build.cjs`
- `desktop/clipboard-smoke.cjs`
- `desktop/clipboard-ui.js`
- `desktop/electron/builder.json`
- `desktop/electron/main.cjs`
- `desktop/integration-catalog.test.js`
- `desktop/integration-catalog.ts`
- `desktop/integrations-ui.ts`
- `desktop/main.js`
- `desktop/package.json`
- `desktop/preload.js`
- `desktop/quick-controller.js`
- `desktop/quick-preload.js`
- `desktop/quick-spotify-entry.js`
- `desktop/quick.html`
- `desktop/quick.test.js`
- `desktop/services/cloud.js`
- `desktop/services/cloud.test.js`
- `desktop/session.test.js`
- `desktop/smoke.cjs`
- `desktop/spotify-ipc.js`
- `desktop/spotify-smoke.cjs`
- `desktop/spotify-ui.ts`
- `desktop/spotify.test.js`
- `desktop/styles/integrations.css`
- `desktop/tsconfig.integrations.json`
- `desktop/ui.js`
- `desktop/ui.test.js`
- `desktop/vendor-entry.js`
- `docs/INTEGRATIONS.md`
- `docs/SPOTIFY.md`
- `tools/audit_cloud_artifact.py`
