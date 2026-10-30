# Separação Backend / Cloud / Desktop — 30/10/2026

## Auditoria antes de alterações
Base: c8d6d55, 6.3.1. Alteração preexistente: cloud/next-env.d.ts (preservar).
O Git atual e seu remoto permanecem Desktop; nenhuma publicação, tag ou alteração de produção autorizada nesta tarefa.

- Desktop: desktop/ (Electron, React, IPC, Quick Chat, clipboard, voz, Writer, atualizador), backend/ Python local (Windows, arquivos/projetos autorizados, SQLite e ferramentas), iniciadores e empacotamento em tools/.
- Backend central: cloud/app/api/** (17 handlers), cloud/lib/ exceto dashboard-store, Prisma/schema e 9 migrations existentes, scripts administrativos, testes de negócio; OpenAI, autenticação administrativa/cookie e dispositivo/Bearer, clientes, dispositivos, consumo, auditoria, chats, Spotify e versões.
- Cloud apresentação: cloud/app exceto api, components, globals.css, dashboard-store. Páginas SSR usam admin() diretamente; substituir por consulta de sessão via API. Fetches relativos devem continuar funcionando com encaminhamento HTTP sem regra de negócio.
- Acoplamentos: npm workspaces e @jarvis/shared; releases importa protocol.js/installer.js do Desktop; dashboard importa versão do package da raiz; ferramentas de build/validação/iniciadores pressupõem cloud/. O SDK OpenAI no Python é adaptador HTTP para a API central no modo Cloud; modo legado também permite execução local e precisa de transição explícita.
- Persistência: PostgreSQL/Prisma central; SQLite e caminhos JARVIS locais devem permanecer. Não executar migrations em produção. Preservar AUTH_SECRET, chaves de criptografia e banco para manter tokens/dados; cookies ficam no domínio do painel por proxy e não são exportados para outro domínio.
- Contratos: manter URLs /api/auth, admin, management, provider-settings, device, integrations/spotify, v1/chat/completions, v1/audio/speech, releases e updates. Congelar inventário de métodos e cópias versionadas dos contratos/protocolo, sem imports entre checkouts.
- Variáveis identificadas: DATABASE_URL, DIRECT_URL, AUTH_SECRET, APP_ORIGIN, OPENAI_*, SPOTIFY_*, BOOTSTRAP_*, CYRO_GITHUB_TOKEN, CYRO_PUBLISHER_*, CYRO_UPLOAD_DIR, CYRO_TIME_ZONE, JARVIS_DB_METRICS*. Desktop: JARVIS_CLOUD_ORIGIN e sessão individual. Cloud novo: URL do Backend, sem credenciais internas.
- Cyro Files: fonte real encontrada em ../cyro-files/sdk e docs/backend.md; será lida antes da implementação. Não importar segredos ou .env. Application ID fornecido: 8e17442b-fbe8-42e2-aad7-bd7390422647.

## Etapas e critérios
1. Extrair por cópia controlada para ../cyro-backend e ../cyro-cloud, sem copiar .env, generated, bancos, caches ou perfis. Instalação, testes e builds independentes antes de remover fontes antigas.
2. Remover imports entre projetos; API central mantém handlers/Prisma atuais; Cloud recebe somente apresentação e transporte. Testar proxy (cookies, CSRF, redirect, stream), sessão, autorização e inventário de rotas.
3. Backend: Docker/Coolify, health/ready, encerramento, Redis, SDK Files e autorização derivada da sessão. Validar upload/download com testes locais; registrar integração real como pendente sem credenciais/serviço autorizado.
4. Desktop: remover workspace Cloud/shared após validação, preservar runtime local e build/Setup; apontar API por configuração existente. Atualizar verificações e iniciadores. Não apagar funções locais sem substituição demonstrada.
5. Executar npm ci, testes, TypeScript/build dos três, Python e smokes Electron. Comparar migrations byte a byte e contratos. Registrar falhas reais, não afirmar áudio pago, instalação limpa ou produção.
6. Commits locais lógicos por projeto, sem remotos novos nem push/tags/releases. Documentar deploy manual, transição e rollback. Versionamento independente inicial 6.4.0 nos novos projetos (extração compatível); Desktop só alterar versão se empacotamento final for validado.

## Riscos e transição
- Não remover implementação antiga até os novos builds e testes passarem; se persistir bloqueio, declarar etapa incompleta.
- Cloud proxy é transporte apenas, com origem fixa, lista de rotas, sem redirects arbitrários ou header administrativo secreto; Backend valida CSRF e sessão novamente.
- Backend deve aceitar exclusivamente origem pública do painel; Desktop usa Bearer e HTTPS. Não permitir CORS curinga com cookies.
- Redis/Files e Docker privado dependem de acesso de infraestrutura. Nenhuma chamada mutante ao serviço real nesta tarefa.
- Projetos/memórias locais não podem ser enviados ao servidor sem consentimento. Migração de orquestração Python exige contratos e testes próprios; preservar comportamento até substituição validada.
- Publicar Backend paralelo com mesmo schema/chaves, validar conta de teste; trocar painel e depois instalador; manter API antiga como compatibilidade temporária. Rollback reponta URLs/versão anterior, preserva banco e chaves; sem down migration destrutiva.
