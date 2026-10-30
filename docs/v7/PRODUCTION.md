# v7 — preparação para a VPS existente e Vercel

Destinos confirmados pelo proprietário: Cloud em https://admin.cyro-ia.tech e API em https://api.cyro-ia.tech. Reutilizar PostgreSQL 17, Redis 7.2 e Cyro Files existentes na VPS. Não criar bancos/serviços substitutos, apagar volumes ou executar reset. Nenhum deploy ou migration de produção foi executado nesta tarefa.

## Configuração

- Vercel/Cloud: CYRO_BACKEND_ORIGIN=https://api.cyro-ia.tech. Remover as antigas credenciais de banco, Redis, OpenAI, Files, GitHub e AUTH_SECRET do projeto Vercel; agora pertencem ao Backend.
- Backend/Coolify: APP_ORIGIN=https://admin.cyro-ia.tech, API_PUBLIC_ORIGIN=https://api.cyro-ia.tech, DATABASE_URL/REDIS_URL privados reais e AUTH_SECRET existente. Preservar AUTH_SECRET e chaves de criptografia para abrir as configurações e sessões atuais.
- Files existente: preservar DATABASE_URL, REDIS_URL, STORAGE_PATH/volume e seus três segredos. Preferir alias privado http://cyro-files:3000, conferindo o nome real na rede do Coolify; nunca abrir o serviço para o navegador.
- Backend CYRO_FILES_SERVICE_KEY deve corresponder a Files SERVICE_AUTH_SECRET. CYRO_FILES_CONTEXT_SECRET deve corresponder a SERVICE_CONTEXT_SECRET. Emissor cyro-backend e Application ID 8e17442b-fbe8-42e2-aad7-bd7390422647 permanecem.
- Desktop: origem padrão versionada em desktop/electron/backend-config.json. CYRO_BACKEND_ORIGIN e o nome legado JARVIS_CLOUD_ORIGIN permitem substituição explícita. O build gera o arquivo histórico cloud-config.json para manter o formato do instalador. Nenhum segredo de serviço é incluído.

Os .env.production.example descrevem os campos; são modelos públicos, não configurações preenchidas. Valores reais ficam nos painéis de infraestrutura. A ferramenta production-check compara arquivos privados sem imprimir segredos e sem escrever dados. Backend e Files devem usar bancos lógicos diferentes, com os schemas já existentes de cada serviço.

## Ordem de implantação manual, após autorização

1. Registrar commits aprovados e obter backup consistente dos bancos, volume Files, configurações e chaves. Conferir o estado atual das migrations.
2. Atualizar o Files para 0.2.0, preservando volume e segredos. O suporte a instaladores é uma extensão de contexto autenticado, sem nova tabela no Files. Uploads comuns mantêm seus limites e tipos. Não adicionar executáveis à lista geral de anexos.
3. Ensaiar o schema Backend em cópia isolada. A nova migration v7 permite a configuração GitHub e adiciona setupFileId nullable em CyroRelease; não apaga ou reescreve registros existentes. Aplicar manualmente apenas as migrations pendentes com credencial apropriada. Nunca seed/reset/db push no banco atual.
4. Criar/atualizar a aplicação Backend no Coolify pelo Dockerfile, porta 3001, conectada à rede dos serviços existentes. Há target migrate separado para manutenção manual; runtime não executa migrations. A composição opcional define só a API, sem recriar PostgreSQL/Redis/Files.
5. Configurar o domínio api.cyro-ia.tech com HTTPS e encaminhamento para a API. A borda deve permitir upload de até 1 GiB e duração de até 30 minutos na rota /api/releases/upload; preservar Content-Length no download. Não cachear rotas privadas. Logs devem omitir queries de tickets e cabeçalhos de autorização.
6. Conferir /health e /ready e os serviços em Cloud → Configurações → Conexão dos serviços. /ready da API valida PostgreSQL/Redis; a publicação verifica também saúde, capacidade 0.2 e readiness do Files.
7. Publicar o Cloud na Vercel, preservando o domínio admin.cyro-ia.tech. Só encaminhamento de API, sem Prisma, provedores ou credenciais administrativas no projeto Vercel. Configurar GitHub pela tela Credenciais como SUPER_ADMIN e usar Testar conexão (somente leitura).
8. Antes do Desktop, homologar login, sessão, isolamento, chats, arquivos, atualização e recuperação com contas autorizadas. O Desktop instalado aponta diretamente para api.cyro-ia.tech, sem depender do painel.

## Spotify e troca de domínio

O callback da v7 é https://api.cyro-ia.tech/api/integrations/spotify/callback. Cadastrar esse endereço no Spotify Developer Dashboard e atualizar o campo em Cloud → Credenciais. A autorização e callback passam pela API; o Desktop recusa uma autorização com origem diferente da API configurada. Não trocar Client ID ou chave de criptografia para uma simples mudança de domínio. Autorizações em andamento no domínio antigo podem precisar ser reiniciadas.

## Atualizador

Selecionar tag existente no painel, enviar Setup.exe e confirmar a publicação. O navegador envia o binário diretamente à API, não ao servidorless da Vercel. A API valida o NSIS/versão, grava o objeto privado no Files e publica/confirma o asset GitHub usando o token protegido. Só depois marca a versão PUBLISHED.

O Desktop obtém metadados e uma autorização curta da API. A API consulta novamente a sessão e entrega o stream do Files sem expor chave de serviço ou URL interna. Checksum, tamanho, formato/versão PE e assinatura Windows são verificados no Desktop antes de instalar, com nova verificação no clique final. Não há execução de Setup neste procedimento de preparação.

Os clientes 6.x continuam recebendo links GitHub públicos quando não negociam o transporte novo; instalações privadas passam pela API, eliminando a dependência do servidor externo ausente. O publicador antigo foi mantido apenas como implementação legada de compatibilidade e não é necessário na v7.

## Transição e rollback

Manter os instaladores e imagens anteriores. Atualizar Files e Backend antes do painel/Desktop. Preservar banco, volume, chaves e identificadores JARVIS. A coluna setupFileId é aditiva; rollback de aplicação não deve apagá-la nem executar down migration. Se houver falha, reverter imagens/commits e repontar a configuração anterior, preservando arquivos e histórico. Clientes com sessão salva na origem antiga podem exigir novo login ao mudar para api.cyro-ia.tech.

Uma reversão ao Backend 6.4 recupera o comportamento antigo e pode perder o transporte privado novo de instaladores; não prometer atualizações privadas pelo Files nesse rollback. Manter a API v7 corrigida ou disponibilizar o instalador anterior autorizado durante a manutenção. Tags e releases reais nunca são criadas nesta preparação automatizada; futuras publicações dependem da ação explícita do administrador.

Docker/Linux, rede privada, certificados, domínios, PostgreSQL/Redis reais e atualização instalada precisam de homologação no ambiente de destino. Testes locais não equivalem a produção validada.
