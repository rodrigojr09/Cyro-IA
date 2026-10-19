# Changelog

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
