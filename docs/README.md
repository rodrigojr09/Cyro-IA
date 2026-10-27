# Documentação do Cyro IA 6.0.1

Cyro IA é o novo nome do JARVIS; os registros históricos mantêm a marca anterior. Os arquivos abaixo descrevem a implementação vigente. Registros antigos ficam em `history/` e preservam o contexto de suas datas, sem substituir os guias atuais.

## Produto e operação

- [Estado consolidado da v5](V5.md)
- [Instalação e atualização Windows](../INSTALL.md)
- [Implantação e desenvolvimento](DEPLOYMENT.md)
- [Vercel e variáveis de ambiente](VERCEL.md)
- [Credenciais dos provedores](CREDENTIALS.md)
- [Migração e compatibilidade](MIGRATION.md)
- [Publicação e instalador](PUBLISH.md)

## Migração em desenvolvimento

- [Arquitetura v6](architecture/OVERVIEW.md), [auditoria](architecture/AUDIT.md), [inventário](architecture/MODULES.md) e [plano incremental](architecture/MIGRATION_PLAN.md).

## Arquitetura e recursos

- [Arquitetura e mapa do código](ARCHITECTURE.md)
- [Segurança e privacidade](SECURITY.md)
- [Chats e armazenamento Cloud](CHATS.md)
- [Anexos e imagens](ATTACHMENTS.md)
- [Configurações, armazenamento e arquivamento](STORAGE-SETTINGS.md)
- [Área de transferência](CLIPBOARD.md)
- [JARVIS Writer](WRITER.md)
- [Catálogo de integrações](INTEGRATIONS.md)
- [Spotify pelo chat](SPOTIFY.md)
- [Relatório de consumo](CONSUMPTION.md)

## Desempenho do banco

- [Auditoria](performance/DATABASE_AUDIT.md), [baseline](performance/BASELINE.md), [otimizações](performance/OPTIMIZATIONS.md) e [resultados](performance/RESULTS.md).

## Qualidade e histórico

- [Validações e limites das evidências](VALIDATION.md)
- [Histórico de alterações](../CHANGELOG.md)
- [Arquivo histórico de versões e planos](history/README.md)

`Backup/` pertence ao proprietário, é somente leitura e não faz parte desta documentação de runtime. Segredos, perfis, bancos e artefatos locais não são versionados.
