# Changelog

## 0.8.2 — 2026-10-20

- Transparência fixa no Quick Chat: passar o mouse não aumenta mais a opacidade dos painéis ou do ícone. Configuração personalizada e nitidez do texto preservadas.
- Hover continua pausando o temporizador; tamanho de 42 px e abertura somente do compositor mantidos.
- Verificação: 93 testes Python, 40 testes Node e testes reais do Electron principal/Quick Chat. O teste visual confirma transparência constante antes/depois do hover e pausa do tempo. API/som reais, DPI misto e jogos exclusivos permanecem sem validação manual completa.

## 0.8.1 — 2026-10-20

- Ícone do Quick Chat reduzido de 56 para 42 px, com borda mais leve, destaque discreto ao passar o mouse e geometria atualizada para todos os monitores.
- Campo/resposta mais transparentes em repouso (62%/66%); presença do mouse no ícone ou nos painéis aumenta o contraste para 96%, mantém o texto opaco e congela o tempo com indicação Pausado.
- Pausas de hover independentes por janela, preservando seleção, cópia, fixação e áudio. A aparência muda com transição suave, sem reduzir a nitidez do texto.
- Abrir/reabrir o ícone apresenta somente o compositor, sem buscar histórico, iniciar IA ou reapresentar respostas antigas. Mensagens continuam preservadas na conversa completa.
- Configuração de opacidade aceita 40–95%; o antigo padrão de 82% migra para 62%, mantendo valores personalizados.
- Verificação: 93 testes Python, 40 testes Node, testes reais da interface principal e Quick Chat, sintaxe JavaScript e capturas. API/som reais, DPI misto e jogos exclusivos continuam sujeitos à validação manual.

## 0.8.0 — 2026-10-20

- JARVIS Quick Chat com três janelas independentes: ícone circular transparente de 56 px, compositor e resposta compacta. Campo e resposta semitransparentes, com texto opaco e cantos recortados. Sem entrada adicional na barra de tarefas e sem grande região invisível bloqueando cliques.
- Ícone arrastável com posição persistida e limites da área útil, incluindo coordenadas negativas e mudanças de monitores. Campo prefere esquerda, usa o outro lado quando necessário, e resposta fica acima com altura limitada/rolagem.
- Enter/Shift+Enter/Escape, rascunho persistente, indicador de geração e mensagens de falha. Recolher o campo mantém requisições em andamento; histórico próprio pode ser aberto na janela principal.
- Conversa rápida persistente e contexto de 30–80 palavras enviado à IA, sem corte posterior. Projeto ativo exige opção explícita e mantém políticas de leitura/seleção; histórico rápido é separado por escopo para evitar mistura de projetos/perguntas gerais.
- Temporizador configurável de 200 ppm, 5–30 segundos iniciais, com pausa por hover, seleção, cópia, fixação e áudio; geração em andamento não é ocultada automaticamente.
- Bandeja com abertura da principal/Quick Chat e encerramento explícito. X mantém na bandeja por padrão, com opção de encerrar; ausência de bandeja utiliza encerramento seguro. O iniciador continua ativo enquanto o Electron estiver ativo.
- Voz rápida opcional, respeitando preferência global e excluindo reprodução simultânea entre janelas. IPC separado por papel, preload isolado, origem validada e credenciais restritas ao processo principal.
- O iniciador verifica também a versão do backend para evitar reutilizar um processo antigo sem os endpoints do Quick Chat.
- Catálogo/base existentes preservados sem reinicialização ou alteração de schema; a conversa usa o banco geral e configurações próprias em dados internos.
- Verificação: 93 testes Python (78 backend + 15 iniciador), 39 testes Node e dois testes reais do Electron. Capturas revisadas; principal minimizada, posição, painel acima, timers, IPC, contexto, falhas, áudio simulado e encerramento verificados.
- Limites: API/som reais, arraste humano, múltiplos monitores físicos com DPI misto e jogos exclusivos não verificados de ponta a ponta. O Windows pode impedir sobreposição em tela cheia exclusiva/protegida.

## 0.7.0 — 2026-10-20

- `start.py` na raiz inicia FastAPI com o interpretador Python atual, aguarda `/health`, compila a interface com dependências existentes e abre o Electron, sem instalar pacotes ou depender do diretório corrente.
- `start.bat` permite dois cliques, preferindo o ambiente virtual já instalado; erros permanecem visíveis.
- Lock de instância do lançador e proteção nativa do Electron, inclusive para abertura via npm start. Probe evita iniciar backend e compilação quando o aplicativo já está aberto.
- `/health` identifica o serviço e a instalação por hash, sem chaves/caminhos privados. Backend externo reconhecido é reutilizado; serviço desconhecido/antigo na porta exige intervenção manual e nunca é encerrado.
- Job Objects no Windows controlam os processos criados e a árvore do Electron; backend encerra por sinal gracioso, mantendo aplicativos abertos pelo usuário fora de seu Job. Processos externos não são registrados para encerramento.
- Mensagens de progresso e tratamento de dependências ausentes, portas ocupadas, falhas/timeout e Ctrl+C. Chat, voz, projetos, memória e controle do computador preservados.
- Testes: 87 Python (72 backend e 15 iniciador), 28 Node e Electron real. HTTP, lock, árvore de processos e preservação de processos externos verificados no Windows; probe real do Electron aprovado. Fluxo humano via dois cliques/fechamento do terminal e API/áudio externos não foram exercitados de ponta a ponta.

## 0.6.0 — 2026-10-20

- Redesign desktop completo: janela nativa maximizada no primeiro uso, redimensionável, sem always-on-top, F11 e persistência validada de posição/tamanho/estado.
- Sidebar recolhível com projetos expansíveis, chats gerais, busca de projetos/caminhos/títulos e destaques de seleção. Última conversa e preferências locais são restauradas.
- Tela inicial com sugestões, área de leitura limitada, compositor multilinha com Enter/Shift+Enter e estados de processamento/erro.
- Markdown sanitizado com DOMPurify, tabelas, links, código destacado e cópia de blocos/mensagens. Links externos web passam por validação e confirmação nativa; nenhum HTML executável ou navegação arbitrária é permitido.
- Rolagem que respeita a posição de leitura, retorno à última mensagem e histórico anterior inserido sem apagar as mensagens atuais.
- Voz automática configurável, preparação/reprodução visíveis, interrupção e invalidação de áudio atrasado ao mudar de chat. Microfone identificado como futuro; cancelamento de geração não é oferecido porque não existe no backend.
- Configurações por categoria e gerenciamento de chat/memória em diálogos. Controle do computador, seleção de fontes, confirmações humanas, API, chats e memória existentes preservados.
- Endpoint workspace inclui somente metadados das conversas para navegação, excluindo projetos removidos. Nenhuma migração ou reinicialização dos bancos é necessária.
- Frontend modular em JavaScript, dependências empacotadas localmente com esbuild, ícones Lucide, Marked e Highlight.js; nenhuma CDN. Execute npm ci ao atualizar.
- Verificação: 72 testes Python, 27 testes Node, sintaxe JavaScript, compilação e Electron real com capturas revisadas. API/voz externas simuladas; interação nativa humana e restauração em múltiplos monitores não verificadas de ponta a ponta.

## 0.5.0 — 2026-10-19

- Seleção visual de pastas e arquivos antes da primeira análise, com prévia local paginada de metadados sem leitura de conteúdo nem uso da OpenAI.
- Regras persistentes por projeto, com inclusões/exclusões herdadas e edição pelo botão Arquivos do projeto. Nenhuma análise começa ao cadastrar ou cancelar a seleção.
- Indexação, chat, buscas, contexto relacionado e API legada respeitam as fontes selecionadas. Builds, dependências, lockfiles, mapas e bundles minificados são excluídos obrigatoriamente.
- Seleção idêntica evita reanálise; cache dos arquivos ainda incluídos é preservado. Seleção vazia não usa API. Arquivos individuais são descobertos diretamente, evitando percorrer pastas irrelevantes.
- Migração preserva dados e exige revisão da seleção nos projetos existentes. Ao alterar o escopo, histórico permanece disponível na interface, mas o contexto anterior deixa de ser reenviado automaticamente.
- Verificação: 71 testes Python, 17 testes Node, sintaxe JavaScript e teste real do Electron com dados fictícios. Inclui prévia sem abertura de conteúdo, cache sem chamadas extras, isolamento de leituras, migração, reinicialização e confirmação visual.
- Limitação: a prévia é gratuita em tokens; análise, chat e áudio ainda usam a API. API e voz reais não foram exercitadas; integrações externas usam simulações nos testes. Aviso existente de depreciação de TestClient/httpx.

## 0.4.0 — 2026-10-19

### Adicionado

- Cadastro de projetos por UUID, caminho canonicalizado e identidade do diretório, evitando duplicações e separando projetos homônimos.
- Dados privados em `%LOCALAPPDATA%\JARVIS`: catálogo `registry.db`, bases `projects/{UUID}/project.db`, `IDEIA.md`, `arquivos/` e espaço de conversas gerais.
- Indexação automática em fila assíncrona: hashes, resumos por arquivo, consolidação por módulo, análise em lotes, cache e registro de uso de tokens quando informado pela API.
- IDEIA.md versionado com distinção entre evidências estáticas, relatos, hipóteses e sugestões; documentos complementares e histórico interno de versões.
- Múltiplos chats por projeto e chats gerais: criar, abrir, renomear, arquivar, restaurar, excluir com confirmação e consultar histórico paginado.
- Contexto fixado ao proprietário de cada chat; novos chats reutilizam IDEIA.md e resumos, sem reindexação completa.
- Verificação ao abrir projeto e a cada 30 segundos para o projeto ativo, com debounce, invalidação de dependentes e atualização incremental. Mudanças de manifests ou grandes mudanças estruturais invalidam análises mais amplas.
- Continuação explícita com base parcial, retomada de indexação, notas humanas e separação entre remover cadastro e apagar memória interna.
- Navegação compacta por projetos/chats e modo expandido, indicadores de estado da base e gerenciamento por diálogos nativos.

### Migração e segurança

- Importação idempotente do histórico antigo como conversa geral, sem apagar nem modificar o banco original. Autorizações e contexto antigos preservados na área interna; contexto antigo não é aplicado a projetos novos.
- Token de sessão movido para a pasta de dados. Todos os projetos originais continuam somente leitura; escrita e exclusão se limitam à memória interna.
- Validação de UUIDs e destinos internos, proteção contra bancos/documentos redirecionados e confirmação humana para remoção/arquivamento/exclusão.
- Corrigido o risco de troca de conversa durante resposta: seleção e envio ficam bloqueados até o término.
- Bases anteriores permanecem utilizáveis quando a pasta está inacessível; arquivos não reconfirmados em varreduras parciais são rotulados como históricos.

### Verificação e limites

- 59 testes Python, 14 testes Node, sintaxe JavaScript e teste real do Electron com dados fictícios.
- Testes abrangem migração, duplicatas Windows, bases independentes, memória, múltiplos chats, isolamento, hashes, dependentes transitivos, recuperação, limites e exclusão segura. Projetos fictícios são conferidos por hashes.
- Indexação: até 400 arquivos/16 MiB por varredura, 60 arquivos para análise semântica por passagem, lotes de 6 e trechos de até 1.200 caracteres por arquivo. Limites ou falhas deixam a base parcial; Atualizar memória retoma arquivos pendentes usando cache.
- Verificação periódica funciona apenas com backend em execução e para o projeto ativo. Projetos inativos são verificados ao abri-los. API real, som e operação humana dos diálogos continuam sem validação completa; testes usam respostas simuladas. Aviso de depreciação de TestClient/httpx no ambiente.

## 0.3.0 — 2026-10-19

### Adicionado

- Assistente de programação pelo chat em modo estritamente de leitura, selecionado por padrão na interface.
- Autorização explícita de até dez pastas por seletor e confirmação nativos, com revogação; a IA não pode conceder permissões.
- Descoberta limitada de projetos, aliases de pastas do Windows, seleção reutilizável e esclarecimento para arquivos/projetos duplicados.
- Ferramentas `list_projects`, `select_project`, `list_directory`, `read_file`, `search_files`, `search_code`, `get_project_structure`, `analyze_project` e `get_file_context`.
- Detecção estática de Next.js, React, Node.js, Express, FastAPI, Electron e Python; consultas progressivas com linhas numeradas e imports locais.
- Contexto privado com referências e resumos, andamento da análise e nome do projeto na janela flutuante.
- Blocos de código selecionáveis e copiáveis como texto; voz curta sem ler os blocos completos.
- Limites de leitura, busca, rodadas, chamadas de ferramentas e contexto enviado à OpenAI; filtros de segredos e bloqueios de links, junctions, hard links e caminhos externos.

### Melhorado e corrigido

- Orquestração separada em `ai_tools.py` e ferramentas de leitura isoladas das ações de computador da v0.2.
- Histórico de programação persiste resumos, sem gravar automaticamente o conteúdo integral das ferramentas ou blocos de código.
- Proteção de arquivos privados de programação no `.gitignore`, limitação do histórico enviado e rejeição de tokens de sessão não ASCII sem erro interno.
- Chat, áudio, memória SQLite e confirmações de abertura preservados no modo anterior.

### Verificação

- 35 testes Python e 10 testes Node, mais teste do renderizador Electron real com dados fictícios e validação de sintaxe JavaScript.
- Testes de projetos fictícios verificam hashes antes/depois e simulam OpenAI e execução; sem modificar projetos reais ou gerar custos de API.
- Chamadas reais à OpenAI, reprodução sonora e uso humano do seletor nativo não foram testados de ponta a ponta. Detecção de imports é estática e parcial, com aprofundamento via buscas. Aviso de depreciação de TestClient/httpx no ambiente, sem falhas.

## 0.2.0 — base anterior

- Controle limitado do computador: aplicativos e pastas autorizados com confirmação humana, processos e sistema.
- Token local intermediado pelo Electron, chat, voz automática e histórico SQLite.
- Registrada como base local antes da implementação da 0.3.0. Não foi criada tag retroativa.
