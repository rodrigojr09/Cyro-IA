# Integrações — JARVIS v5

## Uso

Abra **JARVIS → Configurações → Integrações**. A página usa a janela e a navegação existentes. O catálogo contém Spotify, Discord, Google Calendar, GitHub, Notion e Google Drive, todos com status **Em breve**. Os ícones são locais e seguem a biblioteca Lucide; não há imagens ou logotipos buscados na internet.

Pesquise por nome, categoria ou descrição, sem diferenciar maiúsculas, minúsculas ou acentos. Os filtros **Todas**, **Conectadas**, **Disponíveis** e **Em breve** refletem os estados do catálogo. Disponíveis inclui `available` e `disconnected`; não há entradas nesses estados nesta entrega. Conectadas informa que nenhuma integração está conectada.

Cada card abre seus detalhes na própria página, com categoria, descrição, status e recursos planejados. **Voltar ao catálogo** mantém a pesquisa/filtro e devolve o foco ao card. Não há botão de conexão, formulário de credenciais ou autenticação simulada. Os recursos listados são planos, não funcionalidades disponíveis.

## Arquitetura

- `desktop/integration-catalog.ts`: contrato `IntegrationDefinition`, estados tipados, catálogo imutável e pesquisa/filtros puros. Cada definição contém `id`, `name`, `description`, `category`, `icon`, `status` e `capabilities`.
- `desktop/integrations-ui.ts`: montagem da página, cards, detalhes, estados vazios e foco. Recebe o catálogo separado da apresentação; não usa rede, IPC, armazenamento ou autenticação.
- `desktop/vendor-entry.js`: inclui a página e o catálogo no bundle local existente, compilado pelo esbuild. Nenhum módulo TypeScript precisa ser carregado em runtime.
- `desktop/ui.js`: adiciona a categoria Integrações ao menu de configurações. A largura ampliada é aplicada somente nesta categoria; as demais permanecem no fluxo existente.
- `desktop/styles/integrations.css`: grid adaptável, destaque verde-menta, temas existentes, foco e detalhes. Reaproveita variáveis de cores, tipografia, bordas e a preferência global de movimento reduzido.
- `desktop/tsconfig.integrations.json`: verificação estrita dos dois módulos novos com `npm run typecheck -w jarvis-desktop`. Os módulos JavaScript legados do Desktop não passam a ser tipados por esse comando.

Para incluir um serviço de catálogo, adicione uma definição no arquivo central. Não existe implementação para os estados `available`, `connected`, `disconnected` e `error` além de sua apresentação e filtragem: mudar um status não cria uma conexão. Conexões futuras precisarão de implementação própria, testes e consentimento, respeitando Cloud, sessão, IPC e limites do projeto.

## Escopo e privacidade

Esta entrega não altera Cloud, Prisma, PostgreSQL, endpoints, tokens ou permissões. Não implementa APIs Spotify/Discord/Google/GitHub/Notion, OAuth, sincronização, execução de comandos ou envio de dados. A versão permanece 5.0.0. Backup/ é somente leitura.

## Validação

Os testes do catálogo verificam estados reais, imutabilidade, pesquisa e combinações de filtros. Os testes da interface verificam entrada nas configurações, cards e ícones, detalhes/retorno com foco, estados vazios, preservação das categorias anteriores e ausência de chamadas externas. As fixtures de estados futuros existem somente nos testes; o catálogo entregue continua com seis entradas `coming_soon`.

O smoke do Electron exercita a navegação na janela existente, abertura por teclado, retorno ao card, pesquisa por categoria e redimensionamento sem overflow horizontal. As capturas permitem conferir catálogo, detalhes e tamanho compacto. Não se declara nenhuma conexão externa, implantação ou instalação em Windows limpo com base nesses testes.

Resultados de 26/10/2026: `npm ci --prefer-offline --no-audit --no-fund` concluído; 135 testes Desktop, 25 Cloud, 181 Python e 30 dos iniciadores/setup/build aprovados. Typecheck estrito do catálogo/página e TypeScript do Cloud aprovados; builds Desktop/esbuild e Cloud/Next.js aprovados. A checagem Prettier passou, incluindo os módulos TypeScript novos; o lock legado gerado pelo npm é ignorado pelo formatador e não foi alterado. Não há ESLint separado no Desktop.

Electron real com preload, IPC e a interface do aplicativo validou abertura por Enter, retorno com foco, pesquisa, filtros, detalhes, temas escuro/claro e redimensionamento para 800×560 sem overflow horizontal. Capturas de catálogo, detalhes, tema claro e janela compacta foram inspecionadas visualmente. Os dados Cloud do smoke são fixtures; nenhuma API de integração é chamada. O primeiro `npm ci` encontrou um arquivo nativo em uso; após fechar o app, a instalação padrão terminou. Dois testes do iniciador excederam o tempo durante a recuperação das dependências e passaram na nova execução, sem alterações em seus limites.

## Arquivos da entrega

Criados: `desktop/integration-catalog.ts`, `desktop/integrations-ui.ts`, `desktop/styles/integrations.css`, `desktop/tsconfig.integrations.json`, `desktop/integration-catalog.test.js` e este `docs/INTEGRATIONS.md`.

Modificados: `desktop/ui.js`, `desktop/vendor-entry.js`, `desktop/app.css`, `desktop/package.json`, `desktop/.prettierignore`, `desktop/ui.test.js`, `desktop/smoke.cjs`, `tools/audit_cloud_artifact.py`, `README.md` e `CHANGELOG.md`. A auditoria do artefato passa a conferir o bundle compilado e o CSS de integrações. O bundle `desktop/vendor.js` é gerado pelo build e permanece fora do Git.

Não foi criado instalador/release nem feito push. O catálogo está pronto para a evolução futura; APIs, OAuth, conexões e sincronização continuam fora desta entrega.
