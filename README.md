# JARVIS 1.0.0

Assistente desktop para Windows com chat, voz, projetos e memória persistente. Analisa código local autorizado e sugere soluções **sem alterar ou executar os projetos analisados**.

## Começar

Com as dependências existentes, execute na raiz:

```powershell
python start.py
```

Ou abra `start.bat` com dois cliques. O iniciador utiliza o interpretador atual, espera o backend em `127.0.0.1:8765/health` e abre o Electron. Não reinstala pacotes. Pode ser chamado por caminho absoluto de qualquer diretório.

Para usar o ambiente do projeto diretamente:

```powershell
backend\.venv\Scripts\python.exe start.py
```

O X mantém o aplicativo na bandeja por padrão. Para sair completamente, escolha **Encerrar JARVIS** na bandeja; isso também encerra os processos próprios do iniciador. Não encerra serviços externos reutilizados.

## Primeira instalação para desenvolvimento

Requisitos: Windows x64, Python 3.11+, Node.js 24.15+ e acesso à OpenAI API para chat, análise semântica e voz. O executável compilado dispensa Python e Node na máquina de destino.

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
# Somente se .env ainda não existir:
Copy-Item .env.example .env
cd ..\desktop
npm ci
cd ..
```

Configure a chave privadamente em `backend/.env`. Nunca publique esse arquivo. Preserve configurações e bancos existentes ao atualizar. Execução manual alternativa: no backend, `python -m uvicorn main:app --host 127.0.0.1 --port 8765`; em outro terminal, `npm start` em desktop. Use um único backend, sem workers adicionais.

## Compilar tudo em um executável

Instale as ferramentas de build **uma vez**, no mesmo Python usado para compilar:

```powershell
backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-build.txt
cd desktop
npm ci
cd ..
```

Execute **`build.bat`**. Ele roda os testes e compila o backend Python e o Electron, gerando:

```text
release/JARVIS-1.0.0-x64.exe
release/JARVIS-1.0.0-x64.exe.sha256
```

O build requer internet para baixar os runtimes do empacotador na primeira compilação, mas não instala pacotes automaticamente. Um erro interrompe o processo e mantém o terminal visível. Não executa push, upload ou publicação.

Distribua somente o `.exe` e, opcionalmente, seu checksum. No primeiro uso da edição portátil, configure sua própria chave em `%LOCALAPPDATA%\JARVIS\.env`, por exemplo `OPENAI_API_KEY=SUA_CHAVE_PRIVADA`, sem compartilhar o arquivo. Feche e reabra após configurar. A distribuição não carrega a chave do desenvolvedor. O portátil extrai arquivos temporários necessários ao funcionamento e mantém a memória fora do executável. Não tem assinatura digital; uma validação em Windows limpo é recomendada antes da distribuição pública.

## Usar projetos e conversas

1. Clique em **Adicionar projeto** e autorize a pasta.
2. Escolha somente pastas e arquivos relevantes em **Arquivos do projeto**. A seleção local não consome tokens; confirmar a análise utiliza a API. Builds, dependências, locks e segredos permanecem bloqueados.
3. Aguarde a análise ou aceite explicitamente uma base parcial. Abra um chat na sidebar e pergunte sobre o código.
4. Crie chats separados para assuntos diferentes. Novas conversas reutilizam o conhecimento do projeto; não estudam tudo novamente.
5. Use o menu **⋯** para renomear, arquivar, excluir, registrar notas ou consultar o IDEIA.md. A exclusão do cadastro nunca apaga a pasta original.

Exemplos: “Explique a arquitetura”, “Procure getUsers”, “Investigue o login” e “Mostre a correção sem alterar arquivos”. Quando houver arquivos de mesmo nome, informe o caminho desejado. Chats de projetos diferentes têm contexto separado. Conversas gerais continuam disponíveis.

## Interface e Quick Chat

A janela principal abre maximizada no primeiro uso, permite redimensionar e salva seu estado. **F11** alterna tela cheia. A sidebar tem busca e projetos expansíveis. Mensagens aceitam Markdown sanitizado, tabelas e código com linguagem/destaque/cópia. **Enter** envia e **Shift+Enter** quebra linha. A rolagem respeita sua leitura.

O ícone flutuante de 42 px funciona mesmo com a principal minimizada. Clique para abrir só o campo, sem reapresentar mensagens antigas. A resposta aparece acima, com transparência constante. Arraste o ícone para reposicionar; Escape recolhe. Mouse sobre os painéis, seleção, cópia, fixação e áudio pausam o temporizador. A resposta dura de 5 a 30 segundos por padrão, com velocidade de 200 palavras/minuto. Configure voz, transparência e tempos em **Configurações → Quick Chat**.

A voz rápida respeita o interruptor global. Use **Voz** no campo e **Ouvir** na resposta; **Parar voz** interrompe. O histórico próprio fica nas conversas gerais; **Abrir conversa** abre-o na principal. Usar um projeto no Quick Chat exige marcar explicitamente seu contexto. O microfone permanece indisponível; reconhecimento de voz é uma proposta futura.

## Memória, privacidade e segurança

Dados privados ficam em `%LOCALAPPDATA%\JARVIS`, com catálogo geral e um banco por projeto. A configuração opcional `JARVIS_DATA_DIR` deve ser absoluta e igual para backend e desktop. Faça backup da pasta inteira com o aplicativo encerrado. Os bancos locais não são criptografados.

O JARVIS lê somente fontes autorizadas, bloqueia segredos conhecidos, links e caminhos externos. Código, resumos e mensagens necessários são enviados à OpenAI; não há garantia de detecção de todo segredo embutido. Não autorize dados impróprios para envio à API. Seleção e hashes são locais; análise, chat e síntese de voz têm custo de API.

O controle do computador usa ferramentas e listas fixas. Abrir apps/pastas exige confirmação humana, com prazo e uso único. Não há terminal arbitrário, exclusão de arquivos nem instalação de dependências dos projetos. Nenhuma configuração privada deve ir para Git ou para o executável.

## Verificação e documentação

```powershell
# Raiz
backend\.venv\Scripts\python.exe -m unittest -v test_start test_build
# Backend
cd backend
.\.venv\Scripts\python.exe -m unittest -v test_jarvis test_programming test_projects test_scope test_quick
# Desktop
cd ..\desktop
npm test
npm run test:electron
npm run test:quick
npm run format:check
```

A v1.0.0 foi verificada com **96 testes Python, 50 testes Node, dois testes do Electron real e inicialização/reinicialização do portátil com memória temporária**.

Os testes usam projetos fictícios, bancos temporários e OpenAI simulada. Testes reais do Electron verificam renderização e interação; áudio usa uma amostra silenciosa. Chamadas pagas, som nos alto-falantes, Windows limpo, monitores físicos com DPI misto e jogos exclusivos precisam de validação separada. Não se garante sobreposição sobre jogos exclusivos.

- [DOCUMENT.md](DOCUMENT.md): arquitetura, armazenamento, API, segurança, limites e manutenção.
- [IDEIA.md](IDEIA.md): objetivo, decisões confirmadas e próximos passos.
- [CHANGELOG.md](CHANGELOG.md): histórico de versões.
- [AGENTS.md](AGENTS.md): regras permanentes de desenvolvimento e releases.
