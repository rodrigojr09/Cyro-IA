> Após a separação 6.4.0, instruções de workspace/Cloud integrado abaixo são históricas. Consulte o README da raiz e os READMEs independentes de cyro-backend/cyro-cloud para configuração e deploy atuais.

# Desenvolvimento, Vercel e Prisma Postgres

## Configuração externa necessária

Para um novo ambiente, crie/selecione o Prisma Postgres, configure DATABASE_URL e DIRECT_URL privadamente, vincule o projeto Vercel ao repositório e gere AUTH_SECRET aleatório de pelo menos 32 caracteres. A produção existente usa `https://cronosjarvis.vercel.app`; não substitua os segredos ou o banco configurado durante uma atualização. OpenAI e Spotify podem ser configurados pelo SUPER_ADMIN em Dashboard → Credenciais; variáveis de ambiente são a alternativa antes do primeiro salvamento. Não envie segredos pelo chat nem os salve em commits.

Use o mesmo AUTH_SECRET nas instâncias de uma implantação. Trocar esse segredo invalida hashes de sessões existentes; exige plano de rotação. Preview deve usar outro banco e segredo, sem dados de produção. Não configurar valores privados com prefixo NEXT_PUBLIC_. Segredos BOOTSTRAP_* são temporários, apenas para CLI local segura.

## Instalação de desenvolvimento

Node 22.12+ (validado nesta máquina com Node 26.12), Python e npm são necessários para desenvolvimento. Na raiz:

```powershell
npm ci
if (-not (Test-Path cloud/.env)) { Copy-Item cloud/.env.example cloud/.env }
# Preencha cloud/.env privadamente; não sobrescreva um arquivo existente.
npm run db:generate
npm run db:validate -w @jarvis/cloud
npm run db:deploy -w @jarvis/cloud
npm run admin:bootstrap -w @jarvis/cloud
npm run dev:cloud
```

Antes do bootstrap, definir BOOTSTRAP_EMAIL, BOOTSTRAP_NAME e BOOTSTRAP_PASSWORD de pelo menos 12 caracteres em cloud/.env. A CLI usa lock transacional e recusa criar outro administrador inicial. Não há rota pública de bootstrap. Remova essas três variáveis depois. Seed não inclui senhas fixas nem funcionários falsos.

Para desenvolver schema: `npm run db:migrate -w @jarvis/cloud`. Para aplicar migrations revisadas em produção: `npm run db:deploy -w @jarvis/cloud`. Não usar db push como substituto do histórico de migrations. Constraints adicionais do SQL são intencionais; não removê-las ao evoluir o schema.

## Vercel

Importe o monorepo, selecione Root Directory cloud e habilite acesso a arquivos fora da raiz para packages/shared. Instalação a partir da raiz do workspace: `npm ci`; build: `npm run build -w @jarvis/cloud` na raiz (ou `npm run build` quando o diretório de execução for cloud). Framework Next.js; saída gerenciada pelo framework. Confira os diretórios de execução na configuração do projeto. Arquivos privados Backup/legacy são ignorados e nunca devem ser enviados; deploy deve usar somente o checkout Git público revisado, não upload indiscriminado da pasta local.

Configure DATABASE_URL, DIRECT_URL, AUTH_SECRET, APP_ORIGIN (origem HTTPS exata), OPENAI_API_KEY, OPENAI_ALLOWED_MODELS e preços opcionais. Habilite voz conscientemente com OPENAI_VOICE_ENABLED=true. Runtime Node, sem Edge. maxDuration=120 depende do plano Vercel; validar limites de streaming e timeout do plano escolhido. Aplicar migrations separadamente antes do deploy; não aplicá-las automaticamente em cada preview/build concorrente.

Validação necessária: login, criação de funcionário, login Desktop e restauração da sessão, revogação, chamada simulada/real autorizada, persistência de uso, streaming e cancelamento atravessando a Vercel. Não foi efetuado teste pago da OpenAI. Consultar as faturas do provedor para reconciliação, especialmente chamadas com uso desconhecido.

## Desktop de desenvolvimento e build Windows

Instalar requisitos em backend/.venv previamente. Não há instalação automática no pipeline.

```powershell
backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
$env:JARVIS_CLOUD_ORIGIN = 'http://localhost:3000'
backend\.venv\Scripts\python.exe tools/start_cloud.py
```

Para distribuição, configurar JARVIS_CLOUD_ORIGIN com o domínio HTTPS real (localhost é recusado no pacote), instalar requisitos de requirements-build.txt previamente e executar build.bat. A configuração pública da origem é gravada em desktop/electron/cloud-config.json e fica fora do Git. PyInstaller compila cloud_entry.py; electron-builder usa electron/builder.json e NSIS. Não embute .env, banco ou chave OpenAI.

Artefato esperado da v5: `release/v5/JARVIS-Setup-5.1.0.exe`, apontando para `https://cronosjarvis.vercel.app` quando essa origem é configurada no build. O executável não tem assinatura Authenticode. O pipeline exige `npm run check:v5` antes de empacotar. Execute `tools/audit_cloud_artifact.py` e `tools/smoke_cloud_release.py` depois de terminar a compilação; o smoke exige a porta 8765 livre, usa perfil temporário e não chama a API paga. PATH restrito não equivale a Windows limpo. Consulte [PUBLISH.md](PUBLISH.md).


## Diagnóstico da voz

Prefira configurar a voz e a chave OpenAI na [dashboard de credenciais](CREDENTIALS.md). Antes do primeiro salvamento desse provedor, `OPENAI_VOICE_ENABLED` precisa ser exatamente `true` no ambiente da Vercel para habilitar voz por variáveis; alterações nas variáveis exigem novo deploy. A configuração salva na dashboard prevalece e vale nas próximas solicitações. A voz começa desabilitada; permitir um modelo de texto não habilita síntese de voz.

O SDK Python utiliza `InternalServerError` também para respostas HTTP 503 do próprio Cloud. A mensagem isolada não comprova falha da OpenAI: pode indicar voz desabilitada ou configuração ausente. O Desktop atualizado mostra mensagens seguras específicas. Em falhas do provedor, o log `voice.failed` contém apenas status upstream e indicação de timeout; não registra texto, chave ou mensagem bruta do provedor. Conferir o status da rota `/api/v1/audio/speech` nos logs da Vercel. Testes automatizados usam respostas simuladas; não certificam áudio pago em produção.

## Checklist de implantação

1. Criar/selecionar Prisma Postgres e preencher DATABASE_URL (TCP PostgreSQL) e DIRECT_URL privadamente.
2. Configurar AUTH_SECRET aleatório, APP_ORIGIN=https://cronosjarvis.vercel.app, OPENAI_API_KEY e modelos permitidos no ambiente seguro da Vercel. Preços são opcionais; sem preço não exibir custo como zero confirmado.
3. Aplicar todas as migrations, incluindo a de login Desktop v4, e executar o bootstrap seguro do primeiro administrador por CLI com BOOTSTRAP_* temporários. Remover BOOTSTRAP_* depois.
4. Implantar cloud/ com acesso ao workspace packages/shared e executar os fluxos reais de cadastro, login, sessão, bloqueio de acesso, logout, streaming e limites.
5. Validar o instalador em outra máquina Windows sem Python/Node, incluindo atualização, atalhos, login automático e preservação dos dados. Somente depois da homologação decidir uma tag v5.1.0; esta finalização não a cria.
