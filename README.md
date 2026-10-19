# JARVIS v0.2 — Windows

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
| `backend/requirements.txt` / `requirements-dev.txt` | Dependências de execução e testes. |
| `backend/.env.example` | Configuração de exemplo sem credenciais. O `.env` real permanece privado. |
| `backend/test_jarvis.py` / `desktop/security.test.js` | Testes de backend, ponte Electron e fluxo da interface. |
| `.gitignore` | Exclui segredos, token, banco, ambientes, dependências instaladas e cache Python. |

Na v0.1, as ferramentas estavam em `main.py` e o renderizador acessava o FastAPI diretamente. Na v0.2, a execução fica em `computer.py` e a comunicação passa pelo processo principal do Electron. A tabela `messages` é preservada, com até 20 mensagens anteriores no chat e 30 na recuperação do histórico. As conexões SQLite agora são fechadas explicitamente.

## Atualização da v0.1

Preserve `backend/.env` e `backend/jarvis.sqlite3`. Instale novamente as dependências Python para incluir psutil. Não há migração destrutiva do banco. Reinicie backend e Electron após atualizar.

Use um único processo backend, sem `--workers`: o token e as confirmações pertencem à sessão em memória. O backend continua sendo iniciado separadamente.

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

Solicitações de controle rejeitam campos extras, aplicativos fora da lista e caminhos arbitrários. Há no máximo 100 confirmações válidas pendentes. A documentação interativa da API fica desabilitada.

## Testes

No ambiente virtual do backend:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m unittest -v test_jarvis
```

No desktop:

```powershell
cd desktop
npm test
node --check main.js
node --check preload.js
node --check renderer.js
```

Validação da v0.2: **13 testes Python e 6 testes Node aprovados**, além da verificação de sintaxe dos três arquivos JavaScript de execução. Cobertura: autenticação, comandos e caminhos bloqueados, argumentos malformados, confirmação/cancelamento/expiração/uso único, pastas redirecionadas, consultas limitadas, chat/histórico/áudio, erros sem vazamento, remetente IPC, rotas fixas e fluxo de botões.

Os testes usam banco temporário e simulam OpenAI, áudio e abertura de programas. Não geram custos de API nem alteram o banco pessoal. A consulta de sistema é verificada localmente. A janela Electron real, a reprodução sonora e as chamadas reais à OpenAI não foram verificadas de ponta a ponta.

Conferência manual: inicie ambos os processos, consulte o sistema, solicite uma abertura, teste cancelar e confirmar, converse, escute a resposta e reinicie a interface para conferir o histórico.

## Limites desta versão
- O chat é por texto; a resposta é por texto e áudio automático. Entrada por microfone virá depois.
- O backend precisa ser iniciado separadamente do Electron.
- A memória é o histórico recente em SQLite, não uma memória semântica de longo prazo.
- Ferramentas: Bloco de Notas, Calculadora, VS Code, pastas autorizadas, processos e informações do sistema.
- Aberturas exigem confirmação explícita pela interface. Consultas diretas aparecem em texto; chat e resultados de confirmação preservam áudio automático.
- A interface é local e o backend aceita conexões apenas em loopback; não exponha a porta na rede.
- Os textos das mensagens são enviados à OpenAI para geração das respostas; não inclua segredos.
- O modelo e a voz são configuráveis em `.env`; disponibilidade e custos dependem da conta/API.
