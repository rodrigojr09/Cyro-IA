# JARVIS v0.8.2 — Windows

Assistente pessoal em Electron e FastAPI com chat, voz, controle limitado do computador e análise de projetos originais em modo **somente leitura**. Cada projeto tem sua própria memória duradoura e várias conversas independentes.

## Instalação e execução

Requisitos: Windows 10/11, Python 3.11+, Node.js 24.15+ e chave da OpenAI API com faturamento para chat, voz e análise semântica.

### Iniciar com um comando

Com as dependências já instaladas no Python atual e em `desktop/node_modules`, execute na raiz:

```powershell
python start.py
```

Também pode executar `python "C:\caminho\do\JARVIS\start.py"` a partir de qualquer diretório. O script usa `sys.executable`, sem trocar o interpretador ou reinstalar pacotes. Caso use o ambiente virtual instalado, ative-o antes ou execute `backend\.venv\Scripts\python.exe start.py`.

Para dois cliques, abra **start.bat**. Ele utiliza `backend\.venv\Scripts\python.exe` quando esse ambiente existe; caso contrário, utiliza `python` do sistema. Erros ficam visíveis com uma pausa no terminal.

O iniciador verifica instâncias existentes, identifica o backend em `127.0.0.1:8765`, aguarda `/health`, prepara os arquivos da interface com as dependências locais e abre o Electron. Por padrão, o X da janela principal mantém o JARVIS na bandeja e o Quick Chat ativo. Use **Encerrar JARVIS** no menu da bandeja ou **Ctrl+C** no terminal para finalizar os processos criados pelo iniciador. Um backend externo reutilizado permanece ativo; aplicativos abertos pelas ferramentas do backend também são preservados. Mantenha o terminal aberto enquanto utiliza o JARVIS.

Uma segunda execução é bloqueada pelo sistema operacional; o Electron também tem proteção nativa, inclusive quando iniciado por `npm start`. A verificação de saúde compara a identidade e a versão da instalação, sem expor chaves ou caminhos privados. Backend antigo ou outro serviço na porta 8765 gera orientação para encerramento manual; o script nunca finaliza o ocupante da porta. Após atualizar de uma versão anterior, reinicie o backend uma vez para disponibilizar a identificação nova do `/health`.

Falhas de dependências informam como corrigir a instalação uma vez. Não são executados `pip install` ou `npm install` durante a inicialização. O primeiro backend pode levar até 45 segundos para ficar pronto; falha ou timeout encerra somente os processos iniciados pelo lançador. `JARVIS_DATA_DIR`, quando utilizado, deve estar definido no ambiente do terminal para os dois processos, como na execução manual.

### Primeira instalação e execução manual alternativa

Backend, no PowerShell:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
# Apenas na primeira instalação, se .env ainda não existir:
Copy-Item .env.example .env
```

Configure sua chave em `backend/.env`, mantendo o arquivo privado. Na atualização, preserve o `.env` e o banco `backend/jarvis.sqlite3` existente.

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8765
```

Desktop, em outro terminal:

```powershell
cd desktop
npm ci
npm start
```

Reinicie backend e Electron após atualizar. Execute somente um backend, sem `--workers`: há uma fila e um token por instância. Não exponha a porta à rede. Nenhuma dependência dos projetos analisados é instalada.

## Projetos e conversas

1. Clique em **Adicionar projeto**, escolha a pasta original de um projeto e confirme a autorização nativa. O cadastro abre a seleção de fontes: navegue nas pastas e marque/desmarque arquivos antes de iniciar a análise. A prévia lista apenas nomes, tipos e tamanhos, sem ler conteúdo nem chamar a OpenAI.
2. Clique em **Salvar seleção e analisar** para iniciar a análise em segundo plano dos arquivos escolhidos, com consumo da OpenAI API. Acompanhe o estado da memória. A primeira conversa só fica disponível após uma análise bem-sucedida dentro dos limites, ou após clicar explicitamente em **Continuar com análise parcial**. Sem chave/API, ainda é produzida uma base estática parcial, cuja utilização exige essa aceitação.
3. Escolha o projeto na barra lateral, expanda sua lista e clique em um chat. A busca encontra nomes de projetos, caminhos e títulos de conversas. Projetos com nomes iguais são diferenciados pelo caminho. Selecionar a mesma pasta novamente reutiliza o UUID, os chats e a memória existentes; não duplica o cadastro.
4. Use **Novo chat** para outro assunto. O chat carrega o IDEIA.md atual e o resumo daquela conversa; criar outro chat no projeto ativo não dispara uma varredura nem uma análise completa.
5. No botão **⋯** do cabeçalho, altere o título, arquive/restaure/exclua chats, consulte páginas anteriores do histórico, veja o IDEIA.md e solicite atualização da memória.
6. Registre decisões, ideias, problemas ou informações no formulário próprio. Essas anotações são identificadas como fornecidas pelo usuário e preservadas nas atualizações; hipóteses da IA não viram decisões humanas automaticamente.
7. **Remover projeto** oferece duas escolhas distintas: remover somente o cadastro, mantendo a memória para recuperar ao cadastrar a mesma pasta; ou apagar também a memória interna daquele projeto. Ambas preservam a pasta original. A exclusão de chats e o arquivamento têm confirmação nativa. A conversa geral que recebeu a migração é protegida contra exclusão, podendo ser arquivada.
8. A janela abre maximizada no primeiro uso, com moldura nativa do Windows. Pode ser redimensionada (mínimo 800×560) e minimizada. Por padrão, o X esconde a janela na bandeja; esse comportamento pode ser alterado em Configurações → Quick Chat. **F11** alterna tela cheia. Tamanho, posição e estados de maximização/tela cheia são salvos ao fechar; posições fora dos monitores disponíveis são descartadas. Durante uma resposta, a troca de projeto/chat e um novo envio ficam bloqueados.

**Conversas gerais** continuam disponíveis na barra lateral. Não recebem automaticamente conhecimento de nenhum projeto e não têm ferramentas de leitura de projetos. Os controles locais estão em **Configurações → Aplicativo → Controle do computador**, disponíveis nas conversas gerais. Chats de projeto ficam obrigatoriamente em modo de leitura.

Exemplos: “Explique a arquitetura”, “Procure onde getUsers é usado”, “Leia index.ts do backend”, “Investigue o login”, “Compare frontend e backend” e “Mostre uma correção sem alterar os arquivos”. Quando houver arquivos duplicados, informe um dos caminhos apresentados. Sugestões aparecem em blocos de código selecionáveis e copiáveis; a voz usa uma explicação curta, sem ler centenas de linhas.

## Interface desktop

A sidebar tem projetos expansíveis, chats gerais e busca por metadados; não utiliza selects para navegação. O botão ao lado do título recolhe a sidebar. A última conversa aberta, a preferência de voz, o texto ampliado e a sidebar recolhida são restaurados entre sessões. A tela inicial oferece ações interativas; digitar uma primeira mensagem cria uma conversa quando necessário.

O compositor aceita várias linhas: **Enter envia**, **Shift+Enter quebra a linha**. Respostas aceitam Markdown sanitizado, títulos, listas, tabelas, links e blocos de código com linguagem, destaque e cópia. Há cópia da mensagem inteira. Links web exigem confirmação nativa e abrem no navegador externo; protocolos de execução e arquivos locais são bloqueados. HTML arbitrário, atributos executáveis e imagens remotas não são renderizados. A rolagem preserva a leitura quando você sobe no histórico e oferece um botão para voltar ao fim.

O cabeçalho permite ativar/desativar a voz; o rodapé indica preparação/reprodução e permite interromper o áudio. Trocar de conversa interrompe a reprodução e invalida respostas de áudio atrasadas. O microfone está indisponível, identificado como integração futura. O backend ainda não suporta cancelar a geração do chat; nenhum botão de cancelamento fictício é mostrado.

**Configurações** organiza Aparência, Voz, Inteligência artificial, Projetos, Memória e Aplicativo. Modelo e credenciais continuam configurados exclusivamente no backend; a interface nunca lê o `.env`. Gerenciamento de título, arquivamento, exclusão, anotações e memória fica no menu **⋯** do cabeçalho.

O frontend permanece em JavaScript modular, reaproveitando a integração existente. `npm start` compila dependências locais antes de abrir: Marked, DOMPurify, Highlight.js e Lucide. Nenhuma CDN é utilizada. Execute `npm ci` ao atualizar para instalar as novas dependências, incluindo as de desenvolvimento para a compilação.

## JARVIS Quick Chat

Enquanto o JARVIS estiver em execução, um ícone circular de 42 px permanece sobre as janelas, independente da principal. Clique para abrir somente o campo de entrada, sem carregar histórico nem reapresentar respostas antigas; o histórico completo permanece nas conversas gerais. Arraste para reposicionar e clique novamente ou use **Escape** para recolher. A posição é salva em `quick-state.json`, na pasta interna de dados. Mudanças de monitores recolocam o ícone dentro da área útil; o campo prefere a esquerda e troca de lado quando não há espaço. O campo e a resposta usam superfícies escuras semitransparentes (62% e 66% por padrão), com texto opaco para legibilidade. A transparência fica fixa, inclusive com o mouse sobre os painéis. Passar o mouse sobre o ícone ou qualquer painel congela somente o temporizador, com a indicação Pausado. Ao sair, a contagem é retomada, respeitando seleção, fixação e áudio. O antigo padrão de 82% é migrado para 62%; ajustes personalizados são preservados. A resposta é posicionada acima do campo, com rolagem para conteúdo longo. Não há uma janela transparente grande sobre a área de trabalho: as três superfícies são independentes e o ícone tem região circular de interação e os painéis têm cantos recortados no Windows; áreas externas não capturam cliques.

**Enter** envia; **Shift+Enter** quebra linha. Perguntas e respostas usam uma conversa própria chamada **JARVIS Quick Chat**, disponível nas conversas gerais. **Abrir conversa** restaura a janela principal e abre esse histórico. Recolher o campo não cancela uma requisição em andamento. O rascunho é mantido localmente; perguntas aceitas para geração ficam no histórico mesmo se a API falhar. Falha de conexão mantém o texto para nova tentativa manual, sem repetição automática ou cobrança automática adicional.

Para consultar código ou memória, selecione um projeto na principal e marque **Usar [projeto]** no campo rápido. O backend valida o cadastro, a seleção de fontes e o estado da análise. Nenhum histórico dos chats do projeto é copiado para a conversa rápida. Perguntas gerais, projetos diferentes e seleções de fontes diferentes recebem históricos de contexto separados, embora o histórico completo continue visível na conversa rápida. As ferramentas deste modo são exclusivamente de leitura; aberturas do computador continuam disponíveis na interface principal com confirmação humana.

A IA recebe instrução específica para respostas diretas, preferencialmente de 30–80 palavras, com exceções para precisão, completude e alertas. A resposta não é cortada após a geração. O tempo visual segue `palavras / 200 × 60 + 3`, inicialmente entre **5 e 30 segundos**. Mouse sobre a resposta, seleção, cópia, fixação e preparação/reprodução de áudio pausam o relógio. É possível fixar/desafixar ou fechar manualmente. Uma nova resposta reinicia a contagem; o temporizador nunca oculta uma geração em andamento.

Em **Configurações → Quick Chat**, ajuste a opacidade dos painéis (40–95%), palavras por minuto (80–600), tempos mínimo/máximo (limites de 3–120 segundos), voz e comportamento do X. A voz rápida vem desativada e também respeita o interruptor global da principal. A reprodução é coordenada entre janelas para evitar falas simultâneas; o painel oferece **Parar voz**. Fechar a resposta interrompe sua fala.

A bandeja oferece **Abrir JARVIS**, **Quick Chat** e **Encerrar JARVIS**. Minimizar ou esconder a principal não abre outra janela principal nem encerra o backend. Encerrar pela bandeja fecha as janelas auxiliares e permite ao `start.py` finalizar seus processos. Se a bandeja estiver indisponível, o X encerra o aplicativo para evitar uma execução escondida sem acesso ao encerramento.

Janelas sempre no topo funcionam conforme as regras do Windows; não há promessa de sobreposição sobre jogos em tela cheia exclusiva ou telas protegidas. Coordenadas de múltiplos monitores têm testes com monitores virtuais; múltiplos monitores físicos, escala DPI mista, arraste humano e jogos exclusivos ainda exigem validação manual.

## Seleção de fontes e economia de tokens

Use **Arquivos do projeto** para revisar a seleção a qualquer momento. A pasta inteira começa marcada como conveniência; desmarque a raiz e marque somente as pastas/arquivos desejados para uma análise menor. Marcar uma pasta inclui arquivos futuros dentro dela; uma seleção de arquivo individual não inclui seus irmãos. Exclusões e inclusões mais específicas prevalecem sobre as da pasta superior.

`dist`, `build`, `node_modules`, caches, arquivos de lock (incluindo `package-lock.json`), mapas e bundles minificados ficam bloqueados automaticamente. As proteções de segredos, tamanho, links e limites de acesso continuam obrigatórias, mesmo que uma pasta seja marcada.

A seleção fica na base interna de cada projeto e restringe a indexação, as ferramentas do chat, a busca e os imports relacionados. Nenhum arquivo original é alterado. Cancelar a seleção não inicia análise; confirmar a mesma seleção não reanalisa. O cache dos arquivos ainda selecionados é reaproveitado. A prévia mostra até 200 itens por página, com limite de 2.000 por pasta; abra subpastas para refinar.

Na atualização da v0.4.0, projetos existentes exigem confirmação das fontes antes de novas leituras/análises. Histórico e memória anteriores são preservados. Ao mudar a seleção, o histórico continua visível, mas mensagens e resumos do escopo anterior deixam de ser enviados automaticamente à IA; a memória corrente é reconstruída com as fontes escolhidas. Notas fornecidas pelo usuário continuam preservadas.

**Zero tokens se aplica à seleção local.** Análise semântica, chat e voz continuam sujeitos ao uso da API. A economia depende da quantidade e do tamanho dos arquivos selecionados; não existe garantia de consumo zero para essas funções.

## Armazenamento e migração

O local padrão é **`%LOCALAPPDATA%\JARVIS`**, fora da instalação e dos projetos originais:

```text
JARVIS/
  registry.db
  .local-token
  general/
    project.db
  projects/
    {UUID}/
      IDEIA.md
      project.db
      arquivos/
        ARCHITECTURE.md
        FILE_INDEX.json
        DECISIONS.md       (quando houver anotações)
        PROBLEMS.md        (quando houver problemas relatados)
        FEATURES.md        (quando houver ideias registradas)
```

`registry.db` guarda catálogo, identidade normalizada de diretórios, datas, estado, versão da base, consumo registrado e índice de chats. Cada `project.db` guarda mensagens, metadados das conversas, resumos, contexto, hashes, resumos de arquivos, conhecimento, versões anteriores, anotações e uso da API. O espaço `general` é independente. A propriedade de cada chat é fixada pelo seu ID e validada pelo backend; a IA não pode transferi-lo a outro projeto ou autorizar acesso.

O IDEIA.md contém objetivo, visão geral, tecnologias, arquitetura, funcionalidades identificadas, estrutura, banco, fluxos, problemas, ideias, decisões e data da análise. Separa evidência textual estática, informações humanas, hipóteses e sugestões não implementadas. Presença de dependência ou marcador no código não comprova funcionamento em produção. DECISIONS.md mantém informações datadas, sem pressupor que ainda estejam implementadas ou vigentes.

O SQLite é a fonte de verdade da memória. Os documentos são exportados com substituição atômica; o histórico de conhecimento permanece no banco. Versões monotônicas e checkpoints permitem retomar análise interrompida e reconstruir documentos sem descartar a base anterior.

Na primeira inicialização da v0.4, as mensagens de `backend/jarvis.sqlite3` são copiadas integralmente para uma conversa geral. A origem é aberta somente para leitura, e cada ID importado recebe um marcador transacional: reiniciar não duplica mensagens. O banco antigo não é apagado ou alterado. Autorizações anteriores são copiadas para a área de dados; o contexto antigo fica preservado em `legacy-programming-context.json`, sem ser aplicado a projetos novos. A atualização não cadastra nem estuda automaticamente todas as pastas anteriormente autorizadas: selecione o projeto para iniciar a nova análise.

O `.env` continua sendo configuração privada do backend; não é movido nem incluído no Git. O token agora é lido pelo Electron na pasta de dados. Clientes que usavam o token na pasta de instalação precisam ser adaptados. O estado de desenvolvimento não deve ser copiado para o projeto original.

Para testes ou instalação personalizada, `JARVIS_DATA_DIR` pode definir um **caminho absoluto** de dados. Configure a mesma variável de ambiente nos dois terminais, antes de iniciar backend e Electron; não basta defini-la no `.env` lido apenas pelo Python. Use um local privado fora dos projetos. Para backup, encerre o backend e copie a pasta de dados inteira; ela contém conversas pessoais e não deve ser publicada. Os bancos não são criptografados.

## Análise inicial, cache e atualização

A fila de indexação tem um trabalhador e compartilha com o chat um limite de uma chamada de modelo por vez. A leitura de estrutura/código é feita fora do loop HTTP, mantendo a interface utilizável. A análise realiza:

- Descoberta segura de arquivos e manifests, com exclusões e orçamento de busca.
- SHA-256 dos arquivos elegíveis, metadados e extração estática de símbolos, imports, marcadores de rotas e modelos/tabelas.
- Leitura de trechos pequenos em lotes, resumos por arquivo, agrupamento por módulo e consolidação do conhecimento. Não importa módulos nem executa código.
- Atualização somente dos arquivos cujo hash mudou, dos novos arquivos e de dependentes transitivos reconhecidos por imports. Exclusões são confirmadas somente em varreduras completas; dados não reconfirmados em varreduras parciais são marcados como históricos.
- Invalidação mais ampla quando manifests/dependências mudam ou há alteração estrutural grande. Uma nova análise completa dentro dos limites pode ser necessária, mas resumos válidos são reutilizados quando possível.

O projeto é verificado ao ser aberto e, enquanto estiver ativo, a cada **30 segundos**, com debounce de **10 segundos** e deduplicação da fila. Criar ou abrir outro chat do mesmo projeto ativo não provoca nova análise completa. Projetos inativos são verificados quando abertos; não existe monitor independente com o backend fechado. Estados parciais/falhos não repetem chamadas pagas indefinidamente: use **Atualizar memória** para retomar.

Uma passagem analisa semanticamente até 60 arquivos. Se houver mais arquivos pendentes, use Atualizar memória para continuar o próximo conjunto, reutilizando o cache. É possível aceitar uma base parcial e conversar enquanto sua cobertura é ampliada. A interface informa se a base está atualizada, em análise, parcial, interrompida ou desatualizada por indisponibilidade da pasta.

Se a pasta ficar inacessível, os chats e a última memória publicada continuam disponíveis. A IA deve informar a limitação e não afirmar que leu a versão atual. Tentativas futuras de leitura continuam respeitando permissões do Windows.

O histórico do chat e suas respostas geradas são persistidos, inclusive exemplos sugeridos, com filtragem de padrões de segredos. Resultados brutos das ferramentas e arquivos inteiros não são automaticamente armazenados como mensagens: a base usa referências e resumos. O contexto enviado à IA é limitado ao projeto/chat solicitado e à versão atual do conhecimento, independentemente dos demais chats.

## Limites de leitura e custo

| Operação | Limites padrão |
| --- | --- |
| Varredura | 2.000 entradas, 6 níveis e 3 segundos; indexação até 400 arquivos e 16 MiB lidos por passagem. |
| Arquivo | Texto UTF-8 previsto na lista, até 128 KiB, 200 linhas por ferramenta, 1.000 caracteres por linha e 12.000 caracteres por leitura. |
| Análise inicial/incremental | Até 60 arquivos semânticos por passagem, em lotes de 6; até 1.200 caracteres de trecho por arquivo; entrada de cada lote até 12.000 caracteres. |
| Consolidação | Agrupamento resumido por módulo; até 10.000 caracteres enviados à consolidação e 2.200 tokens por resposta de indexação. |
| Chat | Até 5 rodadas e 12 ferramentas, 10.000 caracteres por resultado e 36.000 no total de resultados; histórico até 20.000, referências até 5.000, IDEIA.md resumido até 10.000 e resumo da conversa até 3.000 caracteres. Resposta até 3.500 tokens. |
| Busca | Até 40 arquivos/256.000 caracteres examinados/30 ocorrências de código; até 100 entradas de diretório e 150 de busca/árvore. |
| Histórico na interface | Páginas de até 100 mensagens. O envio ao modelo usa apenas contexto limitado, não todo o histórico. |
| Voz | Programação: até 700 caracteres, removendo blocos de código, sem chamada extra de modelo para o resumo. |

Os limites produzem cobertura parcial, nunca uma afirmação de leitura completa de todo o código. Para projetos maiores, escolha uma raiz mais específica e retome lotes quando necessário. Resumos de arquivos minimizados/ofuscados ou gerados podem não ser úteis; binários, arquivos grandes e dependências não são analisados. A detecção de relações é estática e heurística; aliases complexos e imports dinâmicos podem exigir investigação pelo chat.

O uso de tokens é registrado quando retornado pela API, separado em operações de lote, consolidação e chat. O indicador de memória exibe o total registrado como dica ao passar o mouse. Não é uma estimativa monetária nem inclui necessariamente tentativas/repetições não informadas pelo provedor. Sem mudanças, a verificação por hashes não faz uma chamada de análise à OpenAI. Uma conversa nova reutiliza o conhecimento existente.

## Segurança

- O JARVIS nunca escreve, cria, renomeia, exclui ou executa arquivos dos projetos analisados. Não instala dependências nem executa terminal sugerido pela IA. Escritas e remoções da memória são feitas somente na área interna.
- Cada chat de projeto tem uma política de leitura restrita à raiz daquele projeto. Caminhos externos, travessia `..`, UNC/dispositivos, fluxos alternativos do Windows, links, junctions e hard links são bloqueados. O cadastro rejeita raízes que contenham a própria base interna.
- São ignorados `node_modules`, `.git`, `.next`, `dist`, `build`, `coverage`, `.venv`, `__pycache__` e outros caches. `.env` e variantes, chaves, tokens, credenciais, bancos e binários são bloqueados. A política conservadora pode bloquear nomes legítimos contendo termos sensíveis.
- Padrões reconhecíveis de segredos embutidos em código são removidos antes do envio. A filtragem não identifica todo segredo possível: autorize apenas código apropriado para análise pela API. Arquivos, resumos e IDEIA.md são dados não confiáveis e não habilitam ferramentas ou permissões.
- Todas as rotas de dados exigem token local. `/health` retorna apenas disponibilidade. O token fica no processo principal do Electron, fora do renderizador. CORS, navegação e novas janelas externas permanecem bloqueados; sandbox e isolamento de contexto são preservados.
- A ponte genérica não oferece cadastro de projetos nem exclusões de chats/projetos; essas operações passam por fluxos separados e diálogos humanos. Anotações humanas têm formulário explícito, sem ferramenta da IA para confirmá-las.
- A remoção recursiva valida o destino interno por UUID e não aceita caminhos de projeto como destino. Arquivos internos redirecionados/compartilhados são recusados. Nenhuma dessas proteções substitui a segurança do Windows contra outro programa malicioso executando como o mesmo usuário.
- Mensagens, trechos consultados e resumos necessários são enviados à OpenAI. Voz envia o texto a sintetizar. Nunca publique `.env`, token, histórico, bancos ou a base pessoal.

## Ferramentas e arquitetura

Electron → preload isolado → ponte autenticada → FastAPI → memória do proprietário do chat e ferramentas de leitura → OpenAI. Os dados persistentes ficam separados da configuração e do código-fonte do JARVIS.

| Arquivo/módulo | Responsabilidade |
| --- | --- |
| `backend/data_paths.py` | Pasta privada de dados do aplicativo. |
| `backend/project_store.py` | Catálogo, bancos por projeto, conversas, migração e exportação atômica. |
| `backend/project_index.py` | Fila, hashes, cache, lotes, documentos, versões e acompanhamento de mudanças. |
| `backend/project_chat.py` | Contexto por conversa e ferramentas fixadas ao projeto proprietário. |
| `backend/main.py` | Rotas autenticadas, ciclo de vida, chat/voz e integração. |
| `backend/ai_tools.py` | Ciclo progressivo de ferramentas, orçamento e voz resumida. |
| `backend/programming/` | Leitura segura, descoberta, estrutura, busca e contexto compatível da v0.3. |
| `backend/computer.py` | Ações locais da v0.2, com listas fixas e confirmações. |
| `desktop/main.js` / `preload.js` | Janela, token, rotas permitidas, diálogos nativos e cópia segura. |
| `desktop/workspace.js` | Projetos, conversas, memória, estados e gerenciamento da interface. |
| `desktop/index.html` / `app.css` | Layout desktop, sidebar, compositor e diálogos responsivos. |
| `desktop/ui.js` / `vendor-entry.js` | Markdown sanitizado, código, ícones, configurações, rolagem e indicadores. |
| `desktop/renderer.js` | Chat, áudio, confirmação humana e controles do computador. |
| `desktop/quick-controller.js` / `quick-core.js` | Janelas independentes, bandeja, IPC, posição por monitor, configurações, temporizador e coordenação de áudio. |
| `desktop/quick.html` / `quick-renderer.js` | Ícone, campo, resposta, seleção de texto e rascunho local do Quick Chat. |
| `desktop/window-state.js` | Validação e persistência das dimensões/estados da janela. |

Ferramentas de programação: `list_projects`, `select_project`, `list_directory`, `read_file`, `search_files`, `search_code`, `get_project_structure`, `analyze_project`, `get_file_context` e `read_knowledge`. Em chats cadastrados, listar/selecionar/analisar reutiliza somente o projeto daquele chat; mudar de projeto exige a interface. `read_knowledge` acessa apenas documentos internos previstos, sem caminho arbitrário.

Rotas principais: `GET /workspace`, `POST /workspace/view`, `/projects/register`, `/projects/refresh`, `/projects/accept-partial`, `/projects/remove`, `/projects/note`, `GET /projects/knowledge`, `POST /chats/create`, `/chats/change`, `GET /chats/history` e `POST /chat` com `chat_id`. IDs são validados; as conversas pertencem a um proprietário fixo.

Para compatibilidade, `/history` e `/chat` sem `chat_id` referem-se à conversa geral padrão. O modo de programação antigo sem ID mantém as autorizações legadas; não utiliza a base de outros projetos cadastrados. As rotas `/programming/status`, `/programming/authorize` e `/programming/revoke` continuam autenticadas, mas a interface nova cadastra projetos pelo diálogo próprio. Documentação interativa da API permanece desativada.

## Controles do computador preservados

Nas conversas gerais, abra **Configurações → Aplicativo → Controle do computador**. Bloco de Notas e Calculadora têm executáveis fixos em System32; VS Code é localizado somente nas instalações padrão de usuário/Program Files. Não se usa PATH nem argumentos da IA.

Pastas de abertura: Desktop, Documents e Downloads diretamente no perfil; pastas inexistentes/redirecionadas são bloqueadas. Essas permissões de abertura não autorizam automaticamente análise de código. Cada abertura exige confirmação humana, expira em 120 segundos e só pode ser confirmada uma vez. Processos retornam apenas PID/nome, até 200; o sistema retorna arquitetura, versão, CPUs, memória e disco. Exclusões de arquivos, encerramento de processos e comandos arbitrários continuam indisponíveis.

## Testes e validação

Na raiz, com as dependências de teste instaladas:

```powershell
backend\.venv\Scripts\python.exe -m unittest -v test_start
```

Os testes do iniciador cobrem ordem de inicialização, reutilização, dependências ausentes, porta ocupada, timeout/erro, Ctrl+C e lock. HTTP local, desligamento gracioso de Uvicorn, locks e Job Objects do Windows são exercitados com processos fictícios reais; conferem preservação de processo externo e dos aplicativos abertos pelo backend. O probe nativo do Electron também foi executado. O fluxo completo via dois cliques, fechamento manual do terminal e integrações externas ainda exigem validação humana.


```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m unittest -v test_jarvis test_programming test_projects test_scope test_quick
```

```powershell
cd desktop
npm test
npm run test:electron
npm run test:quick
node --check main.js
node --check preload.js
node --check renderer.js
node --check workspace.js
node --check scope.js
node --check ui.js
node --check window-state.js
node --check quick-controller.js
node --check quick-renderer.js
node --check quick-preload.js
node --check quick-core.js
node --check smoke.cjs
```

Validação da v0.8.2: **93 testes Python (78 backend + 15 iniciador), 40 testes Node e teste do Electron real**, além de sintaxe JavaScript. Cobre cadastro/duplicatas Windows, bases independentes, geração de conhecimento, múltiplos chats, migração idempotente, isolamento, cache, hashes, dependências transitivas, memória reutilizada, dados sensíveis, interrupções, reinicialização e exclusão segura. Projetos fictícios são verificados por hashes; nenhuma alteração intencional do teste é confundida com escrita do assistente.

OpenAI, voz e abertura de programas são simulados; não há custos de API nos testes. O Electron é exercitado em janela oculta, com preload real, sidebar, vários chats, Markdown, configurações, redimensionamento e dados fictícios. Maximização/F11 e validação/persistência da janela têm testes automatizados de lógica; interação nativa humana e restauração visual em diferentes monitores precisam de validação manual. Não utiliza a área de transferência real. Captura temporária: `jarvis-v06-home.png`, `jarvis-v06-chat.png` e `jarvis-v06-settings.png` no diretório temporário do usuário. Quando symlinks não são permitidos no Windows, o atributo de redirecionamento é simulado nos testes; hard links são testados no sistema real.

O teste real do Quick Chat verifica a principal minimizada, ícone independente, envio/recepção simulados, resposta acima do campo, hover/fixação/tempo, posição restaurada, janela Electron em tela cheia comum e encerramento de todas as janelas. Capturas adicionais: `jarvis-v08-quick-response.png` e `jarvis-v08-quick-input.png`.

Chamadas reais à OpenAI, reprodução sonora e interação humana com os diálogos nativos não foram verificadas de ponta a ponta. O ambiente emite aviso de depreciação de TestClient/httpx, sem falha na suíte.

Validação manual sugerida: reinicie os dois processos, confira a conversa geral migrada, cadastre um projeto de teste, selecione somente suas fontes, confirme e aguarde a análise, crie dois chats com assuntos distintos, reinicie o JARVIS e abra-os novamente. Altere manualmente um arquivo do projeto de teste e confira a atualização incremental. Teste arquivar/restaurar e remover somente o cadastro antes de qualquer escolha de apagar memória. Microfone e execução/edição de projetos permanecem fora do escopo.
