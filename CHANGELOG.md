# Changelog

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
