# O que enviar à Vercel

Importe o repositório Git do projeto na Vercel. O código necessário ao Cloud é:

```text
cloud/                  Next.js, API, painel, Prisma e vercel.json
packages/shared/        schemas, tipos e constantes compartilhados
package.json            definição dos workspaces
package-lock.json       versões exatas das dependências
```

Não envie Backup/, .env, bancos locais, node_modules, .venv, build/, release/ ou o instalador .exe. O Desktop e o serviço Python são distribuídos pelo instalador e não executam na Vercel. Esses diretórios de código podem continuar no mesmo repositório monorepo, mas não fazem parte do runtime Cloud.

## Projeto na Vercel

- Framework: Next.js.
- Root Directory: cloud.
- Habilitar **Include source files outside of the Root Directory in the Build Step**, pois packages/shared fica na raiz do monorepo.
- Node.js: 22.x compatível (ou versão suportada pelo plano que atenda engines >=22.12).
- O cloud/vercel.json já define a instalação somente dos workspaces Cloud/shared e `npm run build`. A seleção de workspace foi verificada localmente com npm ci --dry-run, sem instalar o Desktop nesse comando.
- Output Directory: padrão do Next.js, sem override manual.
- Domínio escolhido: https://cronosjarvis.vercel.app.

## Variáveis em Settings → Environment Variables

| Nome | Valor a configurar privadamente |
|---|---|
| DATABASE_URL | URL TCP PostgreSQL real copiada do Prisma Postgres |
| DIRECT_URL | URL real para migrations, fornecida pelo Prisma Postgres |
| AUTH_SECRET | Segredo aleatório forte, mínimo 32 caracteres |
| APP_ORIGIN | https://cronosjarvis.vercel.app |
| OPENAI_API_KEY | Chave real, exclusivamente no servidor |
| OPENAI_ALLOWED_MODELS | Lista de modelos permitidos, por exemplo gpt-4.1-mini |
| OPENAI_VOICE_ENABLED | false inicialmente; true se desejar habilitar voz paga |

Preços opcionais: OPENAI_INPUT_PRICE_PER_MILLION e OPENAI_OUTPUT_PRICE_PER_MILLION, conforme o modelo/provedor. Não inventar preços. Não usar prefixo NEXT_PUBLIC_ para segredos. Preview deve usar banco e segredos separados de produção.

## Preparar banco e primeiro administrador

Na sua máquina, configure cloud/.env privadamente, execute:

```powershell
npm run db:deploy -w @jarvis/cloud
npm run admin:bootstrap -w @jarvis/cloud
```

O bootstrap exige BOOTSTRAP_EMAIL, BOOTSTRAP_NAME e BOOTSTRAP_PASSWORD temporários no ambiente local seguro. Remova essas variáveis depois. Não colocar senha na linha de comando ou no Git. Não executar migrations automaticamente em todo build de preview.

Depois do deploy, testar login, cadastro de cliente, login no Desktop, sessão automática, bloqueio, logout e consumo. A produção existente já possui deploys confirmados; um novo ambiente ainda exige banco, variáveis e autorização próprios. O status de deploy não valida as operações autenticadas nem chamadas pagas.

## Credenciais pela dashboard

Em uma instalação atualizada, configure OpenAI e Spotify por **Dashboard → Credenciais** com SUPER_ADMIN. Configuração salva prevalece sobre as variáveis de provedor; banco, APP_ORIGIN e AUTH_SECRET continuam no ambiente do servidor. Não troque AUTH_SECRET sem planejar a recuperação das sessões e segredos criptografados. Callback Spotify exato de produção: `https://cronosjarvis.vercel.app/api/integrations/spotify/callback`. Leia [CREDENTIALS.md](CREDENTIALS.md) e [SPOTIFY.md](SPOTIFY.md).

Referências: [Vercel — monorepos](https://vercel.com/docs/monorepos/monorepo-faq), [Vercel — build](https://vercel.com/docs/builds/configure-a-build), [npm ci e workspaces](https://docs.npmjs.com/cli/commands/npm-ci/).
