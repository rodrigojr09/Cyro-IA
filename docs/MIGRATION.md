# Migração e compatibilidade — JARVIS v5

## Atualização do Cloud

Faça uma cópia de recuperação do banco pelo processo autorizado antes de mudanças estruturais. Aplique as migrations versionadas com `npm run db:deploy -w @jarvis/cloud`; não substitua o histórico por `db push`, reset ou edição de migrations já aplicadas. O build apenas gera o Prisma Client e compila.

A evolução inclui login Desktop, chats gerais Cloud, armazenamento, anexos, Spotify e configuração criptografada de provedores. As duas migrations Spotify/credenciais foram aplicadas no ambiente autorizado em 26/10/2026; o registro está em [CREDENTIALS.md](CREDENTIALS.md). Isso não aplica migrations de uma instalação nova automaticamente. Um registro remoto anterior de configuração pública foi preservado, sem reset do banco.

## Atualização do Desktop

Feche o aplicativo, preserve uma cópia externa dos dados locais e use o instalador autorizado. O perfil fica fora dos binários. O nome de sessão `cloud-session-v4.bin` é intencionalmente preservado; não renomear nem remover para atualizar o rótulo da versão. Senhas não são salvas no Desktop.

Chats gerais e Quick Chat usam a conta Cloud; projetos, memória e Writer permanecem locais. Não há importação automática dos históricos gerais antigos. O formato editorial e os recursos locais precisam do backend empacotado correspondente: apenas reabrir uma janela não atualiza o Python de um ambiente de desenvolvimento ainda em execução.

## Instalações antigas e recuperação

Credenciais/códigos de ativação anteriores não autenticam a v5. Contas existentes precisam de senha válida administrada pelo responsável. Não enviar chaves OpenAI/Spotify ou dados de banco ao Desktop para contornar login ou indisponibilidade de rede.

Não tratar cofres portáteis criptografados como bancos SQLite comuns. A migração desses perfis continua explícita e dependente de recuperação segura; não sobrescrever nem apagar a origem. O [arquivo de migração v3](history/MIGRATION-V3.md) é somente histórico, assim como os guias portáteis.

`Backup/` permanece arquivo manual somente leitura; não é fonte automática de runtime, migração, build ou deploy. Para operar o ambiente atual, use [INSTALL.md](../INSTALL.md), [DEPLOYMENT.md](DEPLOYMENT.md) e [VALIDATION.md](VALIDATION.md).
