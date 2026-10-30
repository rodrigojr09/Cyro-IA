# Cyro IA — Desktop

Este é o repositório original Cyro-IA, preservado como Desktop. Histórico Git, appId, executável JARVIS, perfis, sessões e IPC permanecem compatíveis. Backend e painel Cloud passam a projetos independentes em `C:/Users/user/Desktop/cyro-backend` e `C:/Users/user/Desktop/cyro-cloud`; não são workspaces deste repositório.

Electron/React, Quick Chat, ícone flutuante, notificações, clipboard, voz, Writer, atualizador e ferramentas Windows permanecem aqui. `backend/` é o nome histórico do runtime Python local, responsável pelo acesso autorizado a arquivos/projetos e recursos Windows; não é o novo Backend central. Dados locais e instaladores anteriores são preservados. `Backup/` é somente leitura e não integra runtime ou distribuição.

## Desenvolvimento

Node >=22.12 e Python com dependências de `backend/requirements-dev.txt`. Execute `npm ci` na raiz e instale as dependências Python. Configure `JARVIS_CLOUD_ORIGIN` com a origem da API central (HTTPS em distribuição; localhost permitido em desenvolvimento). Inicie Backend e Cloud em seus próprios projetos; depois execute `start.bat` ou `npm run dev` para o Desktop. O Desktop não inicia serviços dos outros projetos e não recebe segredos de banco, Redis, Files, GitHub ou provedores.

Login, sessões e atualizações conservam os contratos `/api/device/*`, `/api/v1/*` e `/api/updates/*`. Nomes históricos da variável e dos arquivos de sessão continuam por compatibilidade. Não mudar URLs de produção antes da homologação dos três projetos.

## Validação e distribuição

`npm run check:v6` reúne consistência, testes Desktop/Python, TypeScript, build e smokes Electron. O nome permanece por compatibilidade com o pipeline. Backend e Cloud têm verificações e versões próprias. Para gerar Setup.exe, instale `backend/requirements-build.txt`, configure a origem HTTPS autorizada e execute `build.bat`; o pipeline valida antes de compilar e não publica automaticamente.

Testes com serviços simulados não validam áudio pago, OAuth real, infraestrutura, Windows limpo ou atualização instalada. Resultados e limitações da separação devem constar no relatório de migração; não considerar a migração homologada antes dos fluxos críticos reais.

## Documentação

- [Plano e auditoria da separação](docs/architecture/THREE_PROJECT_MIGRATION.md).
- [Limites e configuração do Desktop](docs/architecture/DESKTOP_BOUNDARY.md).
- [Registro da versão](versions/6.4.0.md).
- [Interface e módulos locais](desktop/README.md), [Writer](docs/WRITER.md), [anexos](docs/ATTACHMENTS.md) e [clipboard](docs/CLIPBOARD.md).
- [Histórico de validação anterior](docs/VALIDATION.md) e [índice documental](docs/README.md). Instruções antigas de workspace/Cloud embutido não devem ser usadas após a separação.

READMEs dos novos projetos documentam variáveis, deploy manual no Coolify/Vercel, criação dos repositórios privados após autorização e transição/rollback. Nenhuma publicação, push, tag, release ou alteração de produção nesta tarefa.

Desenvolvido por Rodrigo Junior. Repositório Desktop: [Cyro-IA](https://github.com/rodrigojr09/Cyro-IA).
