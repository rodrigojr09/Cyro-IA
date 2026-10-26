# Credenciais na dashboard — JARVIS v5

Abra **Dashboard → Credenciais** (`/credentials`) com uma conta **SUPER_ADMIN**. Há também um atalho em Configurações. ADMIN e EMPLOYEE não podem ler nem alterar essas configurações globais.

## Configurar

- **OpenAI:** informe a chave da API, mantenha os modelos permitidos compatíveis com o modelo usado pelo Desktop e escolha se a voz está habilitada. Cotas, armazenamento, suspensão global e limites de saída existentes continuam valendo. Habilitar voz pode gerar cobrança nas solicitações posteriores; salvar não faz chamadas pagas nem valida acesso/saldo no provedor.
- **Spotify:** informe Client ID, Client Secret e o callback HTTPS exato do Cloud, igual ao cadastrado no Spotify Developer Dashboard. O Client ID inicial é `a075ad4ae29f41c5a3df8d2ff9c84972`. O callback de produção é `https://cronosjarvis.vercel.app/api/integrations/spotify/callback`. Cada usuário continua autorizando sua própria conta no Desktop; salvar o aplicativo não conecta contas automaticamente.
- Campos de segredo sempre aparecem vazios. Deixar vazio mantém a chave atual. Para substituir, cole a nova chave e salve. Os campos são limpos ao enviar. A página retorna somente presença/configuração, não valores nem fragmentos dos segredos.
- Configuração salva na dashboard prevalece sobre variáveis de ambiente. Antes do primeiro salvamento de um provedor, as variáveis existentes continuam funcionando como alternativa. Desativar pelo formulário desliga o provedor, sem voltar silenciosamente às variáveis de ambiente.
- As próximas solicitações leem a configuração salva no Postgres, inclusive entre instâncias Cloud. Não é preciso reiniciar o Desktop para trocar chaves. Solicitações que já estavam em andamento podem terminar usando a configuração anterior.

## Instalação

Aplique a migration `202610260002_provider_configuration` no ambiente Cloud autorizado com `npm run db:deploy -w @jarvis/cloud` e publique o código atualizado. Esta tarefa não aplica migrations remotas nem publica automaticamente.

`DATABASE_URL`, `DIRECT_URL`, `APP_ORIGIN` e o `AUTH_SECRET` estável continuam configurados no servidor/Vercel. A página usa `AUTH_SECRET` já existente para derivar, por HKDF-SHA256 com domínio separado, a chave AES-256-GCM dos registros. **Não troque nem apague o AUTH_SECRET sem uma migração criptográfica planejada**: além das sessões existentes, as credenciais criptografadas dependem dele. Mantenha essa variável em armazenamento protegido e em cópia de recuperação segura.

Não é necessário cadastrar manualmente `SPOTIFY_TOKEN_ENCRYPTION_KEY` para uma integração nova configurada pela dashboard: a chave dos tokens é criada no servidor e guardada dentro da configuração criptografada. Se já existe uma chave de tokens válida no ambiente, ela é adotada no primeiro salvamento e preservada nas atualizações seguintes. Se há conexões e a chave anterior não está disponível, o salvamento é bloqueado para evitar perda de acesso aos tokens existentes.

Trocar o Client ID é bloqueado enquanto houver contas vinculadas ou autorizações Spotify pendentes. Conclua/cancele as autorizações e desconecte as contas antes de trocar o aplicativo. Atualizar apenas o Client Secret mantém a chave que protege os tokens existentes.

## Arquitetura e segurança

- `ProviderConfiguration`: duas linhas globais (`openai`/`spotify`), payload criptografado, revisão e data da alteração. Migration cria as linhas sem segredos.
- `cloud/lib/provider-settings.ts`: validação, leitura com alternativa de ambiente, criptografia autenticada com AAD por provedor, versão otimista, bloqueio de linha e auditoria sem payloads.
- `GET/POST /api/provider-settings`: somente SUPER_ADMIN com sessão web ativa. POST exige origem autorizada, JSON limitado e limite de tentativas. GET usa no-store e não devolve ciphertext, API key, Client Secret ou chave dos tokens.
- `cloud/components/credentials.tsx`: formulários independentes, estados de carregamento/erro/sucesso, segredos vazios, sem localStorage ou segredos em URLs.
- Chat e voz OpenAI usam a configuração central mantendo limites e lista de modelos. Spotify usa AsyncLocalStorage para manter uma configuração consistente durante cada operação, incluindo OAuth e refresh; a criptografia de tokens é preservada.

Salvar indica persistência, **não comprova conexão real**. Credenciais inválidas, contas sem acesso, Premium/allowlist Spotify e saldo/permissões OpenAI continuam dependentes dos provedores. Não houve teste pago, OAuth real ou implantação nesta entrega.

Orientação oficial OpenAI usada: [boas práticas de produção e proteção das chaves](https://developers.openai.com/api/docs/guides/production-best-practices). Para OAuth, scopes e limitações Spotify, consulte [SPOTIFY.md](SPOTIFY.md).
