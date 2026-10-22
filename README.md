# JARVIS 3 — Cloud + Desktop

**Implementação v3.0.0 em validação. Sem tag de release até validar Cloud real e Windows limpo.**

O Electron é o aplicativo dos funcionários. O Next.js na Vercel centraliza administração, autenticação, licenças e chamadas OpenAI. Prisma ORM 7 + Prisma Postgres armazenam dados centrais; FastAPI e SQLite preservam memória, histórico, projetos e ferramentas locais autorizadas. Não há nova edição em pendrive.

Origem pública definida pelo proprietário: **https://cronosjarvis.vercel.app**. A existência desta configuração não comprova implantação ou conexão ao banco.

## Estrutura

- `Backup/`: arquivo manual do proprietário, mantido somente para leitura e reaproveitamento.
- `cloud/`: Next.js, painel, API, Prisma schema/migration, bootstrap e testes.
- `desktop/`: interface existente; `electron/` contém entrada v3 e instalador NSIS; `services/` contém ativação e proteção de credenciais.
- `backend/`: componente local reaproveitado, sem acesso direto à OpenAI no modo Cloud.
- `packages/shared/`: contratos, tipos, schemas e constantes compartilhados.
- `docs/`: arquitetura, migração, implantação, segurança e validação.

Os arquivos originais não foram movidos destrutivamente. Snapshot anterior inclui alterações ainda não commitadas e arquivos privados; **nunca publicar Backup/legacy**. Consulte Backup/MANIFEST.md.

## Desenvolvimento

Requisitos: Node 22.12+, npm e Python compatível com requirements do backend. No Windows, preparar backend/.venv e instalar requirements-dev.txt previamente. Na raiz:

```powershell
npm ci
npm exec -w jarvis-desktop -- install-electron
# Somente se cloud/.env ainda não existir:
Copy-Item cloud/.env.example cloud/.env
# Preencha URLs reais do Prisma Postgres e segredos privadamente.
npm run db:generate
npm run db:deploy -w @jarvis/cloud
npm run admin:bootstrap -w @jarvis/cloud
npm run dev:cloud
```

Bootstrap exige BOOTSTRAP_EMAIL, BOOTSTRAP_NAME e BOOTSTRAP_PASSWORD temporários em ambiente privado; não há senha administrativa fixa. Remova essas variáveis após criar o primeiro SUPER_ADMIN. Veja docs/DEPLOYMENT.md.

Em outro terminal:

```powershell
$env:JARVIS_CLOUD_ORIGIN = 'http://localhost:3000'
backend\.venv\Scripts\python.exe tools/start_cloud.py
```

O desktop não deve receber OPENAI_API_KEY nem DATABASE_URL. Abra o link jarvis://activate recebido do administrador. Memória/ferramentas continuam locais; configurações de portabilidade anteriores são históricas. Não importar automaticamente perfis de desenvolvimento.

## Testes

```powershell
npm run test:cloud
npm run typecheck
npm run build:cloud
cd backend
.venv\Scripts\python.exe -m unittest -v test_cloud test_cloud_integration test_jarvis test_programming test_projects test_scope test_quick test_portable test_protection test_startup
cd ../desktop
npm test
npm run test:electron
npm run test:quick
npm run test:cloud-electron
npm run format:check
```

Para verificar a responsividade do painel, execute `npm run test:admin-layout` na raiz. A verificação utiliza Chromium/Electron com as páginas reais e dados sintéticos locais, em larguras de 320, 390, 768, 1024 e 1440 pixels. As capturas ficam em `build/admin-layout/`; esse teste não acessa a Vercel nem valida autenticação.

Testes externos usam mocks quando indicado; compilação não comprova implantação. docs/VALIDATION.md registra resultados e pendências. Banco real, chamadas pagas, voz e Windows limpo têm validações separadas.

## Instalador tradicional Windows

Instale requirements-build.txt e dependências npm previamente. Configure a origem HTTPS real e execute build.bat:

```powershell
$env:JARVIS_CLOUD_ORIGIN = 'https://cronosjarvis.vercel.app'
.\build.bat
```

O pipeline v3 usa PyInstaller para o componente local e NSIS para o Electron; não instala dependências, não publica nem faz push. Saída: `release/v3/JARVIS-Setup-3.0.0.exe`. A existência do executável não significa release aprovada. O aplicativo instalado deverá dispensar Python/Node; esse requisito precisa ser testado em outro Windows sem essas instalações. O instalador foi gerado e o payload foi iniciado/reiniciado com PATH restrito e dados temporários. Isso não certifica instalação em Windows limpo. Consulte docs/VALIDATION.md.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Migração e preservação](docs/MIGRATION.md)
- [Vercel e Prisma Postgres](docs/DEPLOYMENT.md)
- [Segurança](docs/SECURITY.md)
- [Validação e impedimentos da release](docs/VALIDATION.md)

DOCUMENT.md, INSTALL.md e PORTABLE-VALIDATION.md da raiz ainda contêm referências históricas da prévia anterior; o guia vigente é README + docs/. IDEIA.md permanece preservado.
