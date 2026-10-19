# JARVIS v0.3.0 — Windows

Assistente pessoal com análise de projetos locais pelo chat, exclusivamente em modo de leitura. Preserva chat, áudio automático, histórico SQLite e os controles locais da v0.2.

## Pré-requisitos
- Python 3.11 ou superior
- Node.js 22.12 ou superior
- Windows 10/11
- Chave da OpenAI API com faturamento habilitado (cobrança por uso)

## Backend (Terminal 1, PowerShell)
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Somente na primeira instalação, se .env ainda não existir:
Copy-Item .env.example .env
```
Edite `backend/.env` e substitua `coloque_sua_chave_aqui` pela sua chave real. Nunca envie o arquivo `.env` a outras pessoas.

```powershell
uvicorn main:app --host 127.0.0.1 --port 8765
```

## Desktop (Terminal 2, PowerShell)
```powershell
cd desktop
npm install
npm start
```

## Arquitetura

Fluxo: interface → ponte isolada do Electron → processo principal → FastAPI local → OpenAI e/ou ferramentas permitidas. O histórico fica no SQLite e a resposta de voz volta como MP3 em base64.

| Arquivo | Responsabilidade |
| --- | --- |
| `desktop/main.js` | Janela, bloqueio de navegação, validação do remetente IPC e acesso autenticado a rotas fixas do backend. |
| `desktop/preload.js` | Ponte limitada de API e controles da janela; não expõe Node.js nem o token à interface. |
| `desktop/renderer.js` | Chat, histórico, áudio, consultas diretas e botões de confirmar/cancelar. Exibe dados com `textContent`. |
| `desktop/index.html` | Interface e política de conteúdo; o renderizador não acessa diretamente a rede. |
| `desktop/package.json` / `package-lock.json` | Versão, comandos e dependências do Electron. |
| `backend/main.py` | Rotas FastAPI, autenticação, chamadas de chat/voz, orquestração e persistência SQLite. |
| `backend/computer.py` | Ferramentas com validação estrita, listas de permissão, confirmações e consultas via psutil. |
| `backend/programming/security.py` | Autorizações explícitas, validação de caminhos, leitura limitada e remoção de padrões de segredos. |
| `backend/programming/discovery.py` | Descoberta limitada, estrutura e detecção estática de tecnologias e dependências. |
| `backend/programming/tools.py` | Registro independente de ferramentas de leitura, seleção de projeto, buscas e imports relacionados. |
| `backend/programming/context.py` | Referências e resumos de programação, sem persistir resultados integrais de leitura. |
| `backend/ai_tools.py` | Ciclo progressivo de ferramentas com orçamento de contexto e preparação de resumo falado. |
| `backend/requirements.txt` / `requirements-dev.txt` | Dependências de execução e testes. |
| `backend/.env.example` | Configuração de exemplo sem credenciais. O `.env` real permanece privado. |
| `backend/test_jarvis.py` / `desktop/security.test.js` | Testes de backend, ponte Electron e fluxo da interface. |
| `backend/test_programming.py` / `desktop/smoke.cjs` | Projetos fictícios, segurança de leitura, continuidade, limites e teste real do renderizador Electron. |
| `.gitignore` | Exclui segredos, token, banco, ambientes, dependências instaladas e cache Python. |

Na v0.1, as ferramentas estavam em `main.py` e o renderizador acessava o FastAPI diretamente. Na v0.2, a execução fica em `computer.py` e a comunicação passa pelo processo principal do Electron. A tabela `messages` é preservada, com até 20 mensagens anteriores no chat e 30 na recuperação do histórico. As conexões SQLite agora são fechadas explicitamente.

## Atualização da v0.1

Preserve `backend/.env` e `backend/jarvis.sqlite3`. Instale novamente as dependências Python para incluir psutil. Não há migração destrutiva do banco. Reinicie backend e Electron após atualizar.

Use um único processo backend, sem `--workers`: o token e as confirmações pertencem à sessão em memória. O backend continua sendo iniciado separadamente.

## Assistente de programação — v0.3.0

1. Inicie backend e Electron. O modo **Análise de projetos · somente leitura** inicia marcado.
2. Clique em **Autorizar pasta**, selecione uma pasta local específica e confirme **Autorizar leitura** no diálogo nativo. Você pode autorizar diretamente um projeto ou uma pasta que contenha projetos, como a Área de Trabalho. Nenhuma pasta é liberada automaticamente para análise, nem mesmo as pastas de abertura da v0.2.
3. Digite “Analise o projeto iPet” ou informe um caminho dentro de uma raiz autorizada. “Área de Trabalho/iPet”, “Desktop/iPet”, “Documentos” e “Downloads” são reconhecidos quando essas pastas estão autorizadas. Pastas redirecionadas podem ser autorizadas diretamente pelo seletor; a raiz escolhida é canonicalizada, e links/junctions abaixo dela são bloqueados.
4. Continue com “Procure getUsers”, “Leia index.ts do backend” ou “Estou com um problema no login”. O projeto selecionado aparece na interface e é reutilizado nas perguntas seguintes. Se houver nomes duplicados, o JARVIS deve pedir que você escolha um dos caminhos.
5. Use **Copiar código** para copiar sugestões e aplicá-las manualmente. O JARVIS não altera nem executa os projetos analisados.
6. Selecione uma raiz no seletor de pastas e clique em **Revogar** para retirar a autorização. Se o projeto perder acesso, seu contexto é descartado. Autorizações não podem ser alteradas enquanto uma análise estiver em andamento.

Desmarcar o modo de análise retorna ao chat e aos controles de computador da v0.2, com suas confirmações existentes. As ferramentas de abertura não são oferecidas à IA no modo de programação. Não há ferramenta de escrita, terminal, instalação, autorização de pastas ou execução de código nesse modo. Mesmo que o modelo invente o nome de uma dessas ferramentas, o backend a recusa.

### Ferramentas de leitura

| Ferramenta | Uso |
| --- | --- |
| `list_projects` | Descobrir projetos nas raízes autorizadas, com filtro por nome. |
| `select_project` | Selecionar projeto por nome ou caminho e reutilizá-lo. |
| `list_directory` | Listar arquivos e subpastas permitidos. |
| `read_file` | Ler intervalos com linhas numeradas; aceitar nomes e referências como `index.ts do backend`. |
| `search_files` | Localizar por nome, extensão ou parte do caminho. |
| `search_code` | Buscar literalmente funções, classes, variáveis, imports e trechos. Não utiliza regex fornecida pela IA. |
| `get_project_structure` | Resumir a árvore de diretórios permitida. |
| `analyze_project` | Ler até quatro manifests e identificar tecnologias, dependências e entradas prováveis. |
| `get_file_context` | Ler o arquivo e até três imports locais relacionados, sem carregar módulos. |

A análise começa por metadados e arquivos relevantes e pode aprofundar a leitura em rodadas. Tecnologias detectadas incluem Next.js, React, Node.js, Express, Electron, Python e FastAPI; a presença de dependências é evidência estática, não garantia de uso. A análise não substitui execução de testes ou verificação de compilação do projeto: o JARVIS não realiza essas operações nos projetos analisados.

### Limites e privacidade

- Até 10 raízes locais explicitamente autorizadas. Não permite unidades inteiras nem caminhos de rede/UNC ou de dispositivo. Não percorre o disco inteiro.
- Descoberta: até 2.000 entradas, 6 níveis de subpastas e 3 segundos por varredura; na descoberta de projetos, o orçamento é compartilhado entre as raízes. Buscas podem ser parciais; autorize uma pasta mais específica quando necessário.
- Leitura: apenas tipos de texto/código previstos, UTF-8, até 128 KiB por arquivo, 200 linhas por chamada, 1.000 caracteres por linha e 12.000 caracteres de conteúdo por leitura. A saída informa truncamento.
- Pesquisa de código: até 40 arquivos, 256.000 caracteres examinados e 30 ocorrências. Diretórios retornam até 100 itens, buscas/árvores até 150 itens e projetos até 60 resultados.
- Por mensagem: até 5 rodadas e 12 chamadas de ferramenta; até 10.000 caracteres por resultado e 36.000 caracteres de resultados enviados à IA. Histórico enviado limitado a 20.000 caracteres e contexto de referências a 5.000. A resposta tem limite de 3.500 tokens. Resultados excessivos são resumidos/truncados; a IA deve informar a cobertura parcial.
- `node_modules`, `.git`, `.next`, `dist`, `build`, `coverage`, `.venv`, `__pycache__` e outros caches/dependências são ignorados. Não lê binários, bancos, `.env` (inclusive variantes), chaves, tokens e arquivos de credenciais. A política é conservadora e pode bloquear nomes legítimos que contenham termos sensíveis.
- Bloqueia travessia `..`, caminhos externos, fluxos alternativos do Windows, links simbólicos, junctions e hard links. Revalida o caminho e a identidade do arquivo durante a leitura. Não é uma sandbox contra alterações maliciosas simultâneas realizadas por outro programa do mesmo usuário.
- Padrões reconhecíveis de segredos embutidos em código são removidos antes do envio. Essa filtragem não identifica todos os segredos possíveis; autorize apenas pastas apropriadas para análise pela API. Arquivos e nomes lidos são conteúdo não confiável e nunca concedem permissões nem habilitam ferramentas.
- Autorizações ficam em `backend/.programming-roots.json`; projeto atual, último arquivo, até 20 referências e resumos ficam em `backend/.programming-context.json`. São arquivos privados do próprio JARVIS, ignorados pelo Git. Não são criados arquivos de estado dentro dos projetos externos analisados.
- Resultados integrais das ferramentas não são salvos na memória persistente. Mensagens de programação são salvas no SQLite com resumos limitados a 700 caracteres e sem blocos de código cercados por crases. O código completo sugerido fica na conversa atual; após reiniciar a interface, o histórico mostra o resumo. Esses resumos ainda podem conter referências ou pequenos trechos, portanto o banco continua sendo dado pessoal.
- Na programação, a voz usa uma versão curta, com até 700 caracteres e sem blocos de código. O resumo é preparado localmente, sem uma chamada extra de modelo.

Sem chave/API disponível, a seleção e a revogação de autorizações continuam locais, mas a interpretação e a análise pelo chat dependem da OpenAI.

## Controle do computador

Use o seletor acima do chat, inclusive sem chave OpenAI, ou peça pelo chat:

- “Abra o Bloco de Notas / a Calculadora / o VS Code.”
- “Liste os processos em execução.”
- “Consulte as informações do sistema.”
- “Abra minha pasta Downloads.”

Aplicativos permitidos: Bloco de Notas e Calculadora em `System32`; VS Code nas instalações padrão do usuário ou de `Program Files`. Não se procura executáveis no PATH nem se aceitam argumentos da IA. Instalações personalizadas exigem revisão da lista em código.

Pastas autorizadas: `Desktop`, `Documents` e `Downloads`, diretamente no perfil do usuário, pelos identificadores `desktop`, `documents` e `downloads`. Caminhos arbitrários, pastas inexistentes, links e redirecionamentos são bloqueados. Pastas transferidas para OneDrive ou outro local precisam de uma futura configuração explícita; não há descoberta automática de caminhos alternativos.

Toda abertura exige clique em **Confirmar abertura**. **Cancelar** descarta a solicitação. A confirmação expira após 120 segundos, só funciona uma vez e é consumida mesmo se a abertura falhar. Reiniciar o backend invalida as confirmações; os cartões não são restaurados do histórico. O resultado é registrado no SQLite. Enviar a solicitação ao Windows não garante que a janela apareceu.

Processos: apenas PID e nome, em ordem alfabética, até 200 registros, com indicação do total. Sem linhas de comando, caminhos ou variáveis de ambiente. Sistema: versão, arquitetura, CPUs lógicas, memória e espaço no disco do perfil.

## Segurança e privacidade

- Não existe ferramenta para executar comandos/scripts/PowerShell, excluir arquivos, encerrar processos, desligar o computador ou alterar configurações. A IA não pode adicionar ferramentas nem chamar a rota de confirmação.
- A v0.2 exige confirmação para todas as aberturas. Ações destrutivas e outras operações sensíveis permanecem indisponíveis. Qualquer implementação futura deve exigir validação própria e confirmação humana explícita.
- O backend gera um token por inicialização em `backend/.local-token`. O processo principal do Electron lê o arquivo e envia `X-Jarvis-Token`, sem entregar o token ao renderizador. O arquivo é removido no encerramento normal e substituído na próxima inicialização. Não compartilhe esse arquivo.
- Todas as rotas de dados e ações exigem autenticação. `/health` retorna apenas disponibilidade. CORS não é habilitado. O Electron bloqueia navegação e novas janelas externas; preserva isolamento de contexto, sandbox e ausência de Node.js no renderizador.
- O token reduz acesso por páginas e clientes sem autorização, mas não protege contra programas do mesmo usuário capazes de ler arquivos locais. Use somente `127.0.0.1`; não exponha a porta à rede.
- Chaves ficam no `.env`, fora da interface e das respostas. Erros da OpenAI retornam apenas o tipo de falha, sem conteúdo da exceção. Não publique `.env`, token ou banco pessoal.
- Mensagens e resultados de consultas pelo chat são enviados à OpenAI. A voz envia o texto da resposta ao serviço de áudio. Consultas pelo seletor são locais e não chamam a OpenAI. O histórico SQLite não é criptografado.

## API local

As rotas são destinadas à ponte do Electron. Clientes antigos precisam autenticar e respeitar o novo fluxo de confirmação.

| Método e rota | Comportamento |
| --- | --- |
| `GET /health` | Disponibilidade, sem autenticação. |
| `GET /history` | Últimas 30 mensagens. |
| `POST /chat` | Recebe `message`; retorna `reply` e `pending_actions`. |
| `POST /speak` | Recebe `message`; retorna `audio_base64`. |
| `GET /computer/processes` | Consulta limitada de processos. |
| `GET /computer/system` | Informações do sistema. |
| `POST /action/open` | Recebe `app`; retorna `pending_action`, sem abrir o programa. |
| `POST /action/folder` | Recebe `folder`; retorna `pending_action`. |
| `POST /action/confirm` | Recebe `confirmation_id` e `approved` booleano; executa ou cancela. |
| `GET /programming/status` | Andamento real da ferramenta, projeto selecionado e raízes autorizadas. |
| `POST /programming/authorize` | Autoriza uma raiz; no Electron só é acessível pelo fluxo separado de seleção e confirmação nativas. Não é ferramenta da IA nem rota da ponte genérica. |
| `POST /programming/revoke` | Revoga uma raiz autorizada e invalida contexto que perdeu acesso. |

`POST /chat` também aceita `mode: "programming"` (somente ferramentas de leitura) ou `mode: "chat"` (compatibilidade com v0.2; padrão da API). Retorna `speech_text` e `programming` além dos campos anteriores. A interface usa programação por padrão. Durante uma requisição, o backend serializa o chat e publica o andamento para a interface consultar.

Solicitações de controle rejeitam campos extras, aplicativos fora da lista e caminhos arbitrários. Há no máximo 100 confirmações válidas pendentes. A documentação interativa da API fica desabilitada.

## Testes

No ambiente virtual do backend:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m unittest -v test_jarvis test_programming
```

No desktop:

```powershell
cd desktop
npm test
npm run test:electron
node --check main.js
node --check preload.js
node --check renderer.js
```

Validação da v0.3.0: **35 testes Python, 10 testes Node e teste real do renderizador Electron**, além da verificação de sintaxe dos arquivos JavaScript. Inclui regressões da v0.2, descoberta, leitura TypeScript/JavaScript/Python/JSON, buscas, duplicatas, caminhos e segredos bloqueados, links/hard links, permissões, contexto, voz curta e limites. Os projetos fictícios são comparados por hashes antes e depois para detectar qualquer alteração.

Os testes usam banco temporário e simulam OpenAI, áudio e abertura de programas. Não geram custos de API nem alteram projetos reais ou o banco pessoal. A consulta de sistema é verificada localmente. O teste Electron abre uma janela oculta com o preload real e respostas fictícias, verificando modo, chat, layout, código como texto, cópia e resumo de voz. Não escreve na área de transferência real e salva apenas uma captura temporária. Se o Windows não permitir criar symlinks no teste, o atributo de redirecionamento é simulado; hard links são verificados no sistema de arquivos real. Reprodução sonora, diálogo nativo operado por uma pessoa e chamadas reais à OpenAI continuam sem validação de ponta a ponta. O ambiente atual emite um aviso de depreciação de TestClient/httpx, sem falhas nos testes.

Conferência manual: inicie ambos os processos, autorize um projeto de teste, peça sua análise, investigue um arquivo e faça uma pergunta de continuação. Confira o projeto atual, código copiável, voz curta, histórico resumido e revogação. Para regressão da v0.2, desmarque o modo de análise, consulte o sistema e teste cancelar/confirmar uma abertura.

## Limites desta versão
- O chat é por texto; a resposta é por texto e áudio automático. Entrada por microfone virá depois.
- O backend precisa ser iniciado separadamente do Electron.
- A memória é o histórico recente em SQLite, não uma memória semântica de longo prazo.
- Ferramentas: Bloco de Notas, Calculadora, VS Code, pastas autorizadas, processos e informações do sistema.
- Aberturas exigem confirmação explícita pela interface. Consultas diretas aparecem em texto; chat e resultados de confirmação preservam áudio automático.
- A interface é local e o backend aceita conexões apenas em loopback; não exponha a porta na rede.
- Os textos das mensagens são enviados à OpenAI para geração das respostas; não inclua segredos.
- O modelo e a voz são configuráveis em `.env`; disponibilidade e custos dependem da conta/API.
