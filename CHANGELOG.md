# 6.1.1 — em desenvolvimento

- Busca das integrações com uma única borda/fundo e largura completa, corrigindo a sobreposição do estilo geral de formulários.

- Sidebar com hierarquia por indentação, destaque discreto apenas na conversa ativa, títulos longos truncados, espaçamentos consistentes e rodapé separado com status leve.

- Corrigido o erro ao abrir Área de transferência: referência ao estado do botão flutuante removida das configurações. Falhas de uma seção ficam isoladas e permitem recuperar ou trocar de categoria.
- Configurações transformadas em página completa, com navegação lateral ou abas horizontais conforme a largura, formulário padronizado, retorno ao chat e foco protegido.
- Ctrl+V de imagens no chat principal adiciona anexos com prévia, sem enviar automaticamente. Limites de cinco arquivos e 5 MB, validação de imagem real, armazenamento protegido por conta e descarte de respostas atrasadas ao trocar de conversa.

# 6.1.0 — em desenvolvimento

- Writer convertido em um editor rico contínuo com TipTap/ProseMirror, documento principal e chat lateral redimensionável. Removidos controles por parágrafo e a folha de estilos da interface obsoleta.
- Comandos de desfazer/refazer no chat e atalhos do editor; seleção precisa, aprovação de propostas e proteção contra conflito com edições manuais.
- Autosave após 1,5 segundo, revisão otimista, retries idempotentes, recuperação protegida e exportação do rascunho sem sobrescrever a versão salva.
- Dados legados, associações, mensagens e checkpoints preservados por adaptação compatível, sem migração destrutiva. DOCX inclui formatação rica, tabelas simples e links.
- Writer reutiliza a identidade, o cliente Cloud, a memória da conta e as permissões do Cyro. Sem nova memória ou chamada duplicada à IA.

# 6.0.3 — em desenvolvimento

- Frontend Desktop integralmente convertido para componentes React: aplicativo, login, Quick Chat, Writer e configurações. Scripts separados por função; testes centralizados em desktop/tests.
- Revalidação da mesma sessão preserva o carregamento concluído. Quick Chat atualiza a disponibilidade sem Ctrl+R e permite preparar rascunhos durante a carga.
- Clipboard ignora conteúdo anterior à ativação, conteúdo já consumido e cópias do próprio Cyro; consentimento de envio preservado.
- Mensagens com autoria e horário quando disponível, cópia no hover/foco, navegação até o final fora da digitação, maior espaçamento e contraste.

# 6.0.2 — em desenvolvimento

- Carregamento inicial do histórico em lotes, cache de sessão e bloqueio de envio até a preparação concluir.
- Pergunta e resposta de conversas gerais comuns são persistidas juntas antes da resposta chegar ao aplicativo.

# Cyro IA 6.0.1 — em desenvolvimento

- Padronizado o apelido Cyro nas conversas, mensagens, instruções e textos de apoio; Cyro IA reservado a logos e títulos. Identidade compartilhada orienta o mesmo uso no chat, Quick Chat e Writer. Sem alteração de versão, dados ou identificadores internos.

- Marca pública alterada para Cyro IA e repositório renomeado para rodrigojr09/Cyro-IA, com autorização explícita. Desktop, Cloud, identidade compartilhada, monograma C e setup atualizados. Identificadores de instalação, arquivos de sessão, dados e IPC mantidos para compatibilidade; histórico JARVIS preservado.

- Versão solicitada pelo proprietário em 27/10/2026 para o setup, após auditoria de Operations Prisma Postgres. Leituras de conversa sem transações/quota de escrita, reutilização de conversa fixa, redução do catálogo remoto, progresso local separado, atualização de presença limitada e métricas amostradas sem conteúdo privado. APIs de autorização continuam revalidadas por requisição. Medições e limitações em docs/performance/.
- Empacotamento v6 em release/v6 e build/v6, preservando artefatos v5. Smoke de sessão com porta temporária própria. Push ao GitHub e compilação foram autorizados explicitamente pelo proprietário; nenhuma autorização implícita para tag, release ou implantação manual de produção.

# JARVIS 6.0.0 — em desenvolvimento

- Refinamento visual do Desktop: apresentação vazia mantém rolagem no topo, sem texto cortado; remoção da marca central repetida, seis atalhos com descrições mais legíveis e bordas definidas, conversa ativa com destaque reforçado e nota de leitura em tooltip acessível. Quick Chat respeita margem de 24 DIP nas bordas, com elevação, sombra nativa e hover suave. Preferências de movimento reduzido respeitadas. Alterações no código, sem atualização automática do aplicativo instalado.

- Início da migração arquitetural autorizado em 27/10/2026. Base v5 preservada em `631d0c7`; auditoria inicial, inventário e plano incremental em docs/architecture/. Não representa release estável, implantação ou homologação externa.

- Identidade comum em backend/jarvis_identity.py para chat/Quick e modo Writer, preservando contrato editorial e aprovação. Cache inicial de histórico comum na janela principal, invalidação no envio e por mudança observada no catálogo; abertura do Quick sem busca preliminar duplicada. Não inclui memória GLOBAL_USER, renderer React ou sincronização incremental completa.

# JARVIS 5.1.0 — fechamento da v5 em 27/10/2026

- Versão de fechamento definida pelo proprietário em 5.1.0. Manifests/locks, VERSION, FastAPI, título do Desktop, Sobre e guias atuais sincronizados. Os registros e o checksum 5.0.0 permanecem no histórico. 460 testes automatizados, sete smokes Electron e 40 verificações de layout aprovados. Setup 5.1.0 recompilado e auditado, FileVersion/ProductVersion conferidos e reinício com perfil temporário/PATH restrito aprovado; checksum em docs/VALIDATION.md. Sessões, dados, cotas e runtime Electron 44.9.1 preservados; sem migration ou tag de homologação.

# JARVIS 5.0.0 — implementação consolidada em 27/10/2026

Finalização do código v5; homologação externa e tag continuam condicionadas às evidências em [docs/VALIDATION.md](docs/VALIDATION.md).

- Consolidação v5: documentação atual indexada em docs/README.md, instalação vigente na raiz e arquivo histórico em docs/history/. Guias de arquitetura, segurança, implantação, Writer e integrações corrigidos para os fluxos atuais; links relativos revisados. Rodapé usa versão do manifesto. Fallback de voz Spotify lê a resposta visível e limita o texto a 4.000 caracteres. Validação completa centralizada em `check:v5`, com verificação de repositório e sete smokes Electron, incluindo Writer/Spotify, obrigatória antes do empacotamento. Electron fixado em 44.9.1 corrige o aviso de segurança de certificados; auditoria npm sem vulnerabilidades conhecidas após a atualização. Diagnóstico de timeout mostra a duração configurada e verificações Python usam o interpretador selecionado pelo compilador. 460 testes, sete smokes e 40 verificações de layout aprovados. Nome do arquivo de sessão preservado por compatibilidade; sem alteração em Backup/, banco, cotas ou versão 5.0.0. Setup 5.0.0 compilado e auditado; backend congelado e reinício do payload com perfil temporário/PATH restrito aprovados. Evidências, checksum e limitações externas em docs/VALIDATION.md.

- Consumo: gráficos de tokens gerais e por usuário acima da lista, agregados sobre todo o período filtrado. Chamadas agrupadas por usuário, limite padrão de 5 (opções 10/20), até 10 usuários por página e filtros preservados na URL. Consultas de detalhes limitadas à página atual, escopo administrativo mantido e custos desconhecidos identificados. Sem alteração de cobrança, migration ou setup. Validação: 84 testes Cloud, 149 Desktop, 190 Python/backend, TypeScript, builds, formatação e 40 verificações Electron/Chromium aprovados. Documentação em docs/CONSUMPTION.md; testes do relatório e interface com dados sintéticos, sem validar números de uma conta real.

- Spotify: voz lê a mesma resposta exibida no chat, inclusive informações da faixa e perguntas de dispositivo, em vez de encaminhar o usuário à interface. Mantém os controles e limites de síntese existentes; metadados continuam fora do contexto do modelo e do histórico. Alteração Cloud, sem necessidade de novo setup. Testes automatizados com respostas simuladas; áudio pago e conta real não validados nesta correção.

- Spotify conversacional: reutiliza a lista da conta durante a escolha natural de dispositivo, evitando consultas redundantes e mantendo metadados fora da IA. Setup 5.0.0 recompilado com painéis removidos e diálogo por nome no backend. Auditoria rejeita bundle antigo; self-check e smoke do payload após finalização aprovados. 77 testes Cloud, 149 Desktop e 190 Python/backend, build e TypeScript aprovados. Checksum e limitações em docs/V5.md.

- Spotify pelo chat: classificação estruturada por IA no Cloud para variações naturais, atalhos sem IA para comandos simples (incluindo “pausar Spotify”), validação de ações/parâmetros e uso das cotas, modelo permitido, armazenamento e suspensão existentes. Dispositivos ativos pausados continuam no mesmo alvo; sem ativo, o chat pergunta e aceita nome, com seleção restrita à conta e retomada explícita após a escolha. Contexto da pergunta em memória por sessão/chat, com expiração e sem metadados/tokens. Mini players, controles de reprodução visuais e polling removidos do principal/Quick Chat; Integrações preserva gerenciamento da conta. Validação: 76 testes Cloud, 149 Desktop, 190 Python/backend, TypeScript/builds, formatação e smoke Electron sem painéis aprovados. IA/Spotify simulados nos testes, sem chamada paga ou operação real na conta nesta alteração. Sem mudança de versão, migration ou Backup/.

- Spotify/chat: respostas HTTP 2xx vazias ou textuais dos controles não são interpretadas como JSON, evitando erro posterior à aceitação do comando. HTTP 202 gera confirmação de recebimento, sem inventar estado de reprodução; sem repetir ações bem-sucedidas. Consultas com JSON inválido e falhas reais continuam reportadas. Validação: 57 testes Cloud, 149 Desktop, 186 Python/backend, build/TypeScript, formatação e smoke Electron aprovados. Respostas Spotify simuladas; sem executar comandos na conta real nesta correção. A alteração é somente Cloud e dispensa novo setup.

- 26/10/2026: setup Windows x64 v5.0.0 compilado para o Cloud HTTPS de produção, auditado e testado com duas inicializações e persistência em perfil temporário sem Python/Node no PATH. Cloud `35908a5` com deploy Vercel concluído, login 200 e origem validada. Auditoria inclui cloud-config; smoke acompanha o diretório atual do builder. Evidências, checksum e limitações em docs/V5.md. Setup sem assinatura; sem OAuth real, API paga, Windows limpo ou tag.

- Spotify: tela de conexão atualiza o estado salvo no Cloud pelo botão Atualizar conexão e ao retornar o foco para a janela visível; Conectar antes desabilitado pode ser liberado sem remontar a tela. Remove listener ao desmontar e evita consultas simultâneas. Cloud retorna motivo seguro de configuração inválida, sem segredos. Validação: 149 testes Desktop, 55 Cloud, 186 Python/backend, TypeScript, builds e smoke Electron com transição desabilitado→habilitado e OAuth simulado; sem OAuth ou API Spotify reais.

- 26/10/2026: migrations `202610260001_spotify` e `202610260002_provider_configuration` aplicadas com sucesso no banco Cloud configurado, por autorização do proprietário. Verificação SQL confirmou ambas concluídas, as três tabelas presentes e os registros iniciais OpenAI/Spotify. Histórico remoto anterior `20261021160000_public_site_settings`, ausente localmente, preservado. Não valida implantação web, OAuth real ou chamadas pagas.

- Dashboard: carregamento com indicador antes de exibir a página, hook compartilhado no layout administrativo, cache em memória sem segredos, deduplicação de consultas e atualização explícita. Filtros de consumo preservados entre navegações; credenciais distinguem falta de permissão de banco ainda sem migration. Validação: 55 testes Cloud, 148 Desktop, 186 Python/backend, build/TypeScript, formatação e 40 verificações Electron/Chromium, incluindo carregamento e navegação sem novas consultas. Sem validação da conta ou implantação de produção.

- Dashboard: nova página Credenciais para SUPER_ADMIN configurar Spotify e OpenAI. Segredos AES-GCM no Postgres com chave derivada do AUTH_SECRET do servidor, campos vazios para manter valores, revisão concorrente, origem validada e auditoria sem conteúdo sensível. Chat/voz e OAuth/refresh leem a configuração salva; chave dos tokens Spotify existentes é preservada. Validação: 50 testes Cloud, 148 Desktop, 186 Python/backend, 40 verificações de layout com Electron, TypeScript, formatação e build aprovados. Migration e implantação remotas necessárias; sem credenciais reais ou chamadas pagas.

- Spotify: OAuth Authorization Code no Cloud, state/cookie/transação de uso único, tokens AES-GCM por usuário, modelos Prisma e migration, refresh coordenado, controles validados, conectar/cancelar/testar/desconectar no Desktop, mini player compartilhado e comandos em chat/Quick Chat/voz. Metadados fora de prompts, histórico e voz OpenAI. Credenciais, implantação e OAuth/reprodução com conta real ainda pendentes; consulte docs/SPOTIFY.md. Sem alteração de versão ou Backup/. Validação: 148 testes Desktop, 40 Cloud, 186 Python/backend, 30 iniciadores/setup/build, TypeScript, builds e três smokes Electron aprovados; Spotify/OAuth e backend externos simulados nos testes de interface. Sem teste real de conta, implantação, migration remota, instalador ou push.

- Clipboard: removido bloqueio por foco/visibilidade Chromium; autorização e prioridade verificadas nas janelas nativas. Quick Chat visível recebe cópias diretamente mesmo sem foco, sem ativar janelas; janela principal recebe quando acessada com o Quick Chat fechado. Solicitações durante IPC em andamento são reaproveitadas, preservando exclusividade, limites e prévias em edição. Validação: 143 testes Desktop, build, TypeScript, formatação e smoke Electron aprovados, incluindo Quick Chat visível com outra janela focada e remoção sincronizada dos indicadores. Novas cópias e backend sintéticos; leitura nativa sem escrita, sem certificar som físico ou shell visual do Windows.

- Clipboard: conteúdo já existente ao iniciar/retomar o monitoramento autorizado fica disponível silenciosamente. Quick Chat aguarda brevemente o foco nativo ao abrir e permite abrir o card pelo botão mesmo com foco Chromium atrasado; IPC continua exigindo janela autorizada, visível e focada. Limites e confirmação preservados. Validação: 141 testes Desktop, build, TypeScript, formatação e smoke Electron aprovados; foco Chromium atrasado simulado sobre janelas/IPC reais, leitura nativa sem escrita e cópias sintéticas. Som físico e shell visual do Windows não certificados.

- Clipboard: novas cópias atualizam o card ainda sem ação no chat principal e Quick Chat; prévias já preparadas continuam preservadas. Substituição atômica por referência no processo principal, sem envio automático e com limites existentes mantidos. Validação: 138 testes Desktop, TypeScript, build, formatação e smoke com Electron real aprovados; leitura nativa sem escrita e novas cópias sintéticas, sem certificar som físico ou shell visual do Windows.

- 26/10/2026: nova seção Integrações nas configurações do Desktop, com catálogo TypeScript centralizado de seis serviços em breve, pesquisa por nome/categoria/descrição, filtros por status, detalhes locais e retorno com foco. Grid adaptável e destaque verde-menta integrado aos temas. Não adiciona APIs, OAuth, credenciais, conexões, endpoints ou alterações Cloud.

- Writer limpa o campo ao enviar, sem aguardar a IA, e preserva o próximo rascunho quando a resposta chega. Falhas restauram a mensagem no campo vazio; se já houver outro rascunho, a mensagem original fica marcada como não enviada na tela.

- Simplificada a interface Writer: removidos os seletores Escrita/Orientação/Conversa/Organização das respostas, propostas e compositor. Pedidos e correções são feitos pelo chat, com interpretação automática e aprovação das alterações preservada.

- Writer: feedback curto como “Muito resumido” solicita revisão explícita no arquivo ativo e limita o contrato da IA aos blocos lidos/selecionados. Corrigida revisão replace classificada como WRITE, que indevidamente pedia documento/posição. Correções de intenção no chat integrado passam a valer somente para a mensagem corrigida; pedidos seguintes voltam à interpretação automática. Aprovação e limites preservados.

- Writer: editor integrado com campos claros e largura completa; clicar/focar um parágrafo não restringe mais o contexto. Seleção explícita persiste com destaque ao focar o chat, com botão para limpar e voltar ao documento inteiro. Revisões textuais sem destino informado pela IA utilizam o documento ativo e os blocos lidos, preservando limites, confirmação e proteção de trechos parciais.

- Writer integrado ao chat padrão, com prévia à direita, um arquivo por conversa e migração dos documentos anteriores sem perder revisões. Removido o botão Novo Chat; criação pelo + de Conversas ou pelo + de cada projeto (Chat do projeto / JARVIS Writer). Arquivos TXT/Markdown/Word simples criados ou escolhidos pelo diálogo nativo, com atualização do original após aprovação e bloqueio de sobrescrita se houver edição externa. Perguntas sobre o arquivo não geram alterações; limites existentes mantidos.

- Writer passa a exigir chamada editorial única com schema estrito, escolha nominal da função e chamadas paralelas desativadas no proxy Cloud existente. Comentários como “muito resumido” orientam uma ampliação do texto atual; limites e aprovação permanecem. Falhas deixam a mensagem editável sem duplicar tentativas no chat. Melhorado contraste do texto confirmado na prévia.

- Writer sem seleção considera o documento inteiro; ao exceder o contexto, prioriza o final de baixo para cima, com aviso de leitura parcial. Limites de 8.000 caracteres de documento e 64 KB do pacote mantidos, incluindo caracteres multibyte; revisões não podem substituir blocos lidos parcialmente ou fora do escopo.

- Continuidade do Writer: enviar uma nova mensagem aprova a proposta pendente antes da consulta seguinte, com aviso no card, preservação de ajustes, bloqueio por conflito e proteção contra envio duplicado. Rejeitar continua disponível para descartar a proposta antes de continuar.

- Corrigido contrato editorial do Writer: resposta estruturada pelo suporte a funções já existente no Cloud, IDs de blocos novos gerados localmente e compatibilidade com JSON em bloco Markdown. Pedidos de geração preparam adições para aprovação, sem criar arquivos indevidos ou inserir o comando no documento quando a revisão linguística estiver desligada.

- Corrigido alinhamento das preferências do Writer: caixas de seleção compactas à esquerda dos textos, com quebra de linha e espaçamento consistentes. Conferência visual e fluxo Writer validados no Electron real.

- JARVIS Writer integrado aos projetos existentes: múltiplos arquivos e chats próprios, nome escolhido na criação, árvore à esquerda, conversa central e prévia à direita com diferenças em azul.
- Edição estruturada independente da IA, salvamento manual transacional, propostas com versão-base, confirmação de alterações importantes, classificação híbrida corrigível, cancelamento e inserção automática conservadora.
- Revisões persistentes com originais, desfazer/refazer sequenciais e em lote, restauração como nova revisão, remoção recuperável, isolamento e retenção sem descarte silencioso de versões importantes.
- Contexto seletivo e consentimento por projeto pelo cliente Cloud existente, sem novos endpoints públicos ou chave OpenAI no Desktop. Limites de fontes preservados e tetos editoriais explícitos.
- Exportação OOXML real com python-docx, Word como padrão, seleção de capítulos/projeto, Markdown/TXT e gravação nativa atômica. Testes e limitações (incluindo ausência de LibreOffice para renderização) em docs/WRITER.md.

- Corrigidas opções de clipboard no principal: prévia em Nova conversa sem criar chat antes da confirmação, reivindicação quando a detecção chega após o foco e tratamento de notificação nova durante solicitação anterior. Restauração da janela minimizada testada com foco nativo real.

- Corrigida leitura nativa no Electron 44: API assíncrona ClipboardItem/Blob, sem polling sobreposto; leituras antigas são invalidadas ao pausar/desativar. Teste real de leitura Windows, sem escrita no clipboard, e regressões de limites e concorrência.

- Assistente de clipboard opt-in, com monitor único no Electron, baseline silencioso, intervalo de 850 ms e conteúdo efêmero em memória.
- Indicadores sincronizados no overlay Windows e no ícone flutuante, som PCM local com volume, intervalo mínimo e respeito ao silêncio global.
- Atribuição atômica ao primeiro chat, faixa compacta de ações locais para texto/código/link e prévia editável somente após a escolha, com confirmação explícita pelo fluxo de envio existente.
- Substituição da cópia pendente sem sobrescrever edição; pausa, desativação, descarte e expiração em 10 minutos.
- IPC por janela/frame autenticado, limites de conteúdo, filtros preventivos de credenciais e validação de URLs. Nenhum novo endpoint Cloud ou histórico permanente de clipboard.
- Título clicável expande/recolhe o conteúdo original. Imagens têm prévia local limitada a 5 MB/50 MP na captura e 1.536 px/350 KB na prévia; sem envio/análise de imagem pelo clipboard. Validação do shell Windows e audição física são registradas separadamente dos testes automatizados em docs/V5.md. Sem publicação, push ou tag de release.

# JARVIS 4.0.0 — 22/10/2026, em validação

- Corrigido acesso de ADMIN/SUPER_ADMIN ao Desktop: perfil criado após senha válida; sessão, bloqueio e logout mantêm as mesmas proteções, sem mudar o papel administrativo.

- Cloud somente administrativo e APIs; raiz protegida, sem site ou cadastro público.
- Acesso Desktop por e-mail e senha definidos pelo administrador; bloqueio de usuário e troca de senha invalidam sessões.
- Removidos emissão de códigos, ativação por protocolo e gestão de licenças. Registros históricos não autorizam acesso.
- Login antes do workspace e do Quick Chat; sessão protegida salva sem guardar senha, com validação na abertura e a cada cinco minutos.
- Falha de validação retorna ao login e encerra o Quick Chat. Fechar a janela encerra o JARVIS, inclusive com preferência antiga de bandeja.
- Migração de sessões por dispositivo e remoção das credenciais antigas; metadados e saída Windows atualizados para v4.
- Publicação na nuvem e compilação autorizadas pelo proprietário em 22/10/2026; sem tag de release antecipada. Evidências e limitações em docs/V4.md.

# JARVIS 3.0.0 — implementação em validação

- Voz: Desktop preserva mensagens seguras do Cloud sobre habilitação, licença e limites, em vez de exibir apenas InternalServerError. Cloud distingue configuração recusada pelo provedor, limite e timeout, sem registrar texto ou segredos.
- Painel administrativo adaptado a celulares e tablets: formulários flexíveis, tabelas com rolagem própria, textos longos sem ampliar a página e saída de sessão acessível no celular.
- Cards de indicadores com espaçamento consistente, navegação com estados de foco/hover e verificação de layout em Chromium com dados sintéticos.
- Reconstrução a partir do arquivo manual Backup/, preservado sem alterações.
- Client dedicado, cadastro/edição, limites individuais, máximo de dispositivos, licenças e configurações globais.
- Ativação por campo de código ou jarvis://; credencial individual protegida, renovação antecipada e estados offline/revogação.
- Streaming Cloud → serviço local → Electron, cancelamento e preservação de ferramentas, histórico, Quick Chat e memória.
- Voz central opcional; ditado progressivo quando o runtime suporta, com consentimento de áudio restrito.
- Distribuição NSIS JARVIS-Setup-3.0.0.exe, sem portátil ou dependências de desenvolvimento exigidas no destino.
- Sem tag de release até validar Vercel/Prisma Postgres reais e Windows limpo. Resultados finais: docs/VALIDATION.md.

---

# Desenvolvimento 3.0.0 — 2026-10-20

Destino v3.0.0 ainda não lançado; não criar tag até validação final.

- Preservação local de 110 arquivos da prévia 2.0.1-dev.0, com SHA-256 e integridade SQLite, sem .git/dependências e sem publicar dados privados.
- Monorepo npm workspaces, Next.js App Router/TypeScript e Prisma 7/Postgres central.
- Painel administrativo com escopo por administrador, funcionários, ativações, dispositivos, métricas e auditoria.
- Sessões opacas, senhas scrypt, bootstrap por CLI, rate limits persistentes e ativação atômica de uso único.
- Proxy OpenAI autenticado com uso do provedor, reservas de cota, streaming, cancelamento e voz opcional.
- Adaptação preservativa do Electron/FastAPI, deep links jarvis://, safeStorage e builder Windows NSIS; nenhuma nova distribuição portátil.
- Origem pública escolhida pelo proprietário: https://cronosjarvis.vercel.app. Não comprova implantação.
- Limitações e critérios pendentes de release estão em docs/VALIDATION.md. A prévia portátil anterior não foi transformada retroativamente em release.

---

# Changelog

## Em desenvolvimento — destino v2.0.1, ainda não lançado

- Caminhos portáteis pelo executável externo; diretórios persistentes do Electron no dispositivo; backend congelado recusa fallback para AppData.
- Assistente nativo de instalação em seis etapas e motor de cópia/atualização recuperável com verificação, sem formatação ou remoção de arquivos pessoais.
- Cofre de chave com scrypt e AES-256-GCM, senha mestra, configuração nativa, teste autenticado opcional e desbloqueio ao iniciar. Modo fonte mantém backend/.env.
- Referências relativas ao volume para novos projetos portáteis e catálogo SQLite com esquema 3; históricos e bases individuais preservados.
- Backups offline manuais/automáticos, retenção, exportação, integridade e restauração confirmada preservando a pasta anterior.
- Encerramento do backend próprio por pipe; ampliação das sugestões e instruções do assistente para escritório, estudos e tarefas cotidianas; preferências iniciais de nome, tema, voz e Quick Chat.
- Ainda faltam proteção criptográfica das conversas/memória/backups, migração guiada dos dados anteriores, inicialização autorizada por computador e validação do instalador/USB/Windows limpo. Não há release, commit de versão ou tag v2.0.1 nesta etapa.

## 1.0.1 — 2026-10-20

- Corrigida a orientação de OPENAI_API_KEY na edição portátil: aponta para a configuração privada na pasta de dados, não para backend/.env. Chat e voz recusam chave ausente com orientação consistente.
- Configurações → Inteligência artificial → Abrir configuração abre o arquivo selecionado no Explorer, criando template vazio somente quando necessário. Não lê, devolve, sobrescreve nem embute chaves; exige a janela principal confiável.
- Verificação: 97 testes Python, 56 testes Node e dois testes reais do Electron. Testes cobrem os dois modos, preservação do arquivo existente, bloqueio de hard links e autorização do IPC. É necessário encerrar pela bandeja e reiniciar após editar o .env; a chave do desenvolvimento não é copiada automaticamente.

## 1.0.0 — 2026-10-20

- Revisão de design: contraste e espaçamento, títulos com truncamento, item ativo na sidebar, foco da busca, hierarquia de leitura, tabelas e cópia no cabeçalho do código. Layout refinado em 800×560, diálogos com nomes acessíveis e status de memória sem repetição. Transparência e comportamento do Quick Chat preservados.
- Código JavaScript/HTML/CSS padronizado com Prettier, Python com Black e finais de linha definidos. Estilos divididos em tokens, layout, chat, diálogos e responsividade. Refatoração de formatação Python conferida por AST; somente main.py contém mudanças funcionais para o modo empacotado.
- README reestruturado para uso/instalação/distribuição, DOCUMENT criado como referência técnica e IDEIA como visão do próprio JARVIS, separando implementação, decisões humanas, limitações e propostas futuras.
- build.bat e pipeline Windows: testes antes da compilação, PyInstaller para o backend e Electron portátil x64 em um único exe de distribuição, ícone próprio gerado localmente e checksum SHA-256. Sem instalação automática de pacotes, assinatura digital ou publicação.
- Runtime empacotado aguarda saúde/identidade/versão do backend, recusa ocupantes incompatíveis e supervisiona somente o processo próprio. Monitor Windows do pai evita backend órfão se o Electron for interrompido. Configuração privada fica na área de dados, nunca no artefato.
- Compatibilidade com banners do CMD na saída JSON do npm, sem modificar a configuração do Windows. Dependências de build atualizadas e cadeia de proxy corrigida; auditoria npm sem vulnerabilidades reportadas.
- Preservados esquemas SQLite, migração legada, memória existente, permissões de leitura, chat, voz e confirmações humanas. Não há migração destrutiva nesta versão.
- Verificação: 96 testes Python, 50 testes Node, dois testes reais do Electron, verificações de formatação e auditoria de dependências. Portátil real iniciado duas vezes com memória temporária: saúde, autenticação, criação/persistência de chat e término do backend após interrupção do pai aprovados, sem chamada à OpenAI. APIs pagas, áudio nos alto-falantes, monitores físicos com DPI misto e Windows limpo não validados de ponta a ponta. O artefato é portátil sem assinatura Authenticode.

## 0.8.3 — 2026-10-20

- Corrigido o campo de entrada do Quick Chat: 12 px de padding horizontal, borda/foco que não invadem o texto e layout flexível para preservar os caracteres e os controles.
- Voz rápida ativada por padrão e na primeira atualização para esta versão, respeitando a voz global. Desativação posterior continua persistida. Botão de voz no compositor e ação Ouvir na resposta.
- Reprodução automática autorizada nas janelas auxiliares; erros de reprodução deixam de ser silenciosos e permitem nova tentativa. Eventos de término/erro usam a geração do áudio para não interromper uma fala mais recente.
- Mantidos transparência fixa, timer pausável, ícone pequeno e abertura somente do campo.
- Verificação: 93 testes Python, 42 testes Node e dois testes reais do Electron. O campo foi conferido por geometria/captura; o player nativo reproduziu uma amostra WAV silenciosa, incluindo nova tentativa. API de voz e alto-falantes reais, DPI misto e jogos exclusivos continuam sem validação de ponta a ponta.

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
