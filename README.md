# JARVIS 4 — Cloud administrativo + Desktop

Versão 4.1.0. Publicação na nuvem e compilação autorizadas pelo proprietário em 22/10/2026. Evidências e limites de validação estão em [docs/V4_1.md](docs/V4_1.md) e [docs/CHATS.md](docs/CHATS.md); histórico da v4 inicial em [docs/V4.md](docs/V4.md). Não foi criada tag de release.

O Cloud possui somente o administrativo e as APIs do aplicativo. A raiz e o painel exigem autenticação; a única página de entrada é `/login`. Não há site público, cadastro público, códigos de ativação, deep links ou gestão de licenças.

O administrador cadastra nome, e-mail e senha e libera ou bloqueia o usuário. Contas ADMIN e SUPER_ADMIN ativas também entram no Desktop com o mesmo e-mail e senha do painel. O Desktop exige login antes de abrir o workspace ou criar o Quick Chat. A sessão é salva com Electron safeStorage (DPAPI no Windows); a senha não é salva. Ao iniciar e a cada cinco minutos, o Desktop valida a sessão no Cloud. Falha de validação fecha o Quick Chat e retorna ao login; indisponibilidade de rede preserva a sessão protegida para nova tentativa. Fechar a janela principal encerra o aplicativo. Minimizar mantém o aplicativo aberto.

OpenAI e PostgreSQL ficam exclusivamente no Cloud. Chats gerais e Quick Chat geral ficam no mesmo PostgreSQL, isolados pela conta; o Quick Chat usa uma conversa fixa por usuário. Projetos, seus chats, memória e permissões permanecem no componente local FastAPI/SQLite. Projetos podem tratar de estudos, escrita, planejamento, pesquisa ou software, com até 5 MB de arquivos selecionados no total. Desktop verifica o tamanho antes do envio e o backend local rejeita excessos com HTTP 413. Confirmações humanas e IPC restrito são preservados. `Backup/` é arquivo manual somente leitura e não participa do runtime.

As alterações de chats Cloud exigem a migration `20261022120000_cloud_chats` e publicação conjunta do Cloud e Desktop. Consulte [armazenamento de conversas e limites](docs/CHATS.md). Históricos locais antigos não são enviados automaticamente.

## Desenvolvimento

Para iniciar o ambiente local já configurado, dê dois cliques em `start.bat`. Ele inicia o Cloud em `http://localhost:3000`, aguarda a página de login responder e abre o JARVIS Desktop conectado a essa origem. Ao fechar o JARVIS, o iniciador encerra também o Cloud que iniciou. Se a porta 3000 estiver ocupada, avisa sem encerrar serviços existentes. As configurações privadas permanecem em `cloud/.env`; o Desktop não recebe os segredos do Cloud. O iniciador não instala dependências nem aplica migrations.

Node 22.12+, npm e Python com `backend/requirements-dev.txt`. Na raiz:

```powershell
npm ci
# Se cloud/.env ainda não existir, copie cloud/.env.example e preencha privadamente.
npm run db:generate
npm run db:deploy -w @jarvis/cloud
npm run admin:bootstrap -w @jarvis/cloud
npm run dev:cloud
```

O bootstrap usa BOOTSTRAP_EMAIL, BOOTSTRAP_NAME e BOOTSTRAP_PASSWORD temporários; não existe senha padrão. Remova essas variáveis após criar o primeiro SUPER_ADMIN. O Desktop não recebe OPENAI_API_KEY nem DATABASE_URL.

Em outro terminal, com os requisitos Python instalados:

```powershell
$env:JARVIS_CLOUD_ORIGIN = 'http://localhost:3000'
python tools/start_cloud.py
```

## Atualização da v3

Aplicar todas as migrations, incluindo `20261022000000_desktop_login`, antes de usar o Desktop v4. Essa migration adiciona sessões por dispositivo, remove as credenciais antigas de Device e revoga códigos antigos. Usuários existentes sem senha precisam receber uma nova senha no administrativo. Cadastros, consumo, auditoria e registros históricos de licenças são preservados; esses registros não concedem acesso na v4. O arquivo protegido antigo não autentica a v4.

## Verificação e build

```powershell
npm run test:cloud
npm run typecheck
npm run build:cloud
npm test -w jarvis-desktop
npm run test:electron -w jarvis-desktop
npm run test:quick -w jarvis-desktop
npm run test:cloud-electron -w jarvis-desktop
npm run test:admin-layout
python -m unittest discover -s backend -p 'test_*.py'
python -m unittest -q test_start test_cloud_build test_build test_setup
```

O pipeline Windows `tools/build_cloud_desktop.py` exige uma origem HTTPS real e gera `release/v4/JARVIS-Setup-4.0.0.exe`, sem publicar. Consulte [validação da v4](docs/V4.md) e [implantação](docs/DEPLOYMENT.md). O build local não comprova implantação, áudio pago ou funcionamento em Windows limpo.
