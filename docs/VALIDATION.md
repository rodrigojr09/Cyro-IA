# Validação 6.1.0 — Writer contínuo

Em 28/10/2026, a suíte check:v6 concluiu com sucesso: versões/repositório, 2 ferramentas Node, 92 testes Cloud, TypeScript/build Cloud, TypeScript Desktop, build Desktop, 211 testes Python backend, 35 iniciadores/empacotamento, sete cenários Electron e 40 verificações de layout administrativo em Chromium. A suíte Desktop final suplementar passou 135 testes após os últimos ajustes de recuperação/seleção; são 475 testes sem dupla contagem, além dos cenários Electron e do layout. npm ci na raiz concluiu com 540 pacotes instalados, 544 auditados e zero vulnerabilidades reportadas. Formatação Desktop e git diff --check aprovados.

O Writer foi conferido visualmente com documento contínuo principal e chat lateral. Não há controles por parágrafo, botões de gerar/revisar ou undo/redo no preview. TipTap/ProseMirror faz seleção, cursor e histórico; uma única instância permanece após salvamento. O teste com 300 parágrafos confirma cursor e instância estáveis, sem afirmar um benchmark ilimitado. Os limites existentes de documento permanecem.

O cenário Electron final exercitou digitação nativa, Enter, Ctrl+Z/Ctrl+Shift+Z, copiar/colar com ClipboardEvent sem alterar o clipboard pessoal, formatação colada, redimensionamento pelo teclado, save real em SQLite, comandos de histórico pelo chat, proposta sem aplicação automática, consulta sem escrita, edição manual posterior e conflito, exportação DOCX, confirmação RESTAURAR, reload da janela e arquivo original explicitamente autorizado. Confirmou um checkpoint para o primeiro ciclo de digitação com dois parágrafos. Os testes de store confirmaram 40 edições → um save após a pausa, retry com mesmo request_id, recuperação após descarte do editor e preservação diante de reload que falha.

Os 13 casos focados de backend validaram dados legados sem regravação na leitura, revisões, restauração, idempotência, isolamento de projeto, rich JSON seguro, seleção simples/múltipla/aninhada, correção pontual preservando formatação, geração inicial e de seção, conflito durante geração, DOCX com marcas/listas/tabela/link/alinhamento/quebras e exportação de rascunho sem sobrescrever a versão salva. O contexto Cloud reutiliza a conversa geral do usuário autenticado em uma leitura limitada adicional por requisição editorial; não há nova memória nem segunda chamada ao modelo. Essa contagem não equivale ao total de Operations do provedor.

A [matriz dos 25 cenários](architecture/WRITER-6.1-VALIDATION.md) identifica as evidências. Logs locais: build/v6/v610-check-final.log, v610-desktop-verified.log, v610-editor-final.log, v610-rich-verified.log, v610-writer-verified.log e v610-format-check.log. Capturas finais: diretório temporário jarvis-writer-smoke-uW758z. No fechamento do primeiro cenário integrado houve uma conexão encerrada durante a limpeza do servidor; o cenário final passou aguardando a confirmação da sincronização antes de encerrar.

IA editorial, OAuth e Cloud dos cenários de interface são sintéticos. Os testes verificam contratos e fluxos; não certificam qualidade gramatical de OpenAI paga, áudio físico, Operations reais após deploy, instalação/atualização em Windows limpo ou fidelidade arbitrária de Word externo. Não houve leitura de documentos pessoais, migração destrutiva, alteração de Backup/, push, tag, release ou deploy. Nenhum setup 6.1.0 foi compilado neste pedido. O editor básico mantém o transporte compatível, mas a memória compartilhada de conta requer o Cloud 6.1.0 publicado após autorização. O aplicativo instalado não recebe estas mudanças automaticamente.

# Validação 6.0.3 — React Desktop e recuperação do Quick Chat

Em 28/10/2026, o Desktop foi migrado integralmente para React.js, com scripts separados por função e testes centralizados em desktop/tests. Foram aprovados 125 testes Desktop, 91 Cloud, 198 backend Python, 35 iniciadores/empacotamento e 2 ferramentas Node (451 testes sem dupla contagem), TypeScript Cloud/Desktop, builds Cloud/Desktop, sete cenários Electron e 40 verificações de layout administrativo com Chromium real. npm ci na raiz concluiu com zero vulnerabilidades reportadas.

O teste de sessão executa a entrada Electron e o FastAPI reais com perfil temporário e Cloud sintético. Após o bootstrap e a confirmação da janela, revalida a mesma sessão e confirma que o Quick Chat permanece pronto e editável sem reload. Testes adicionais recusam confirmação antes do bootstrap, rejeitam bootstrap de sessão anterior e bloqueiam envio após logout. No renderer, o rascunho continua editável durante a carga, enquanto o envio aguarda confirmação nativa.

Clipboard: o conteúdo existente na ativação/retomada é apenas uma referência; nenhum aviso inicial é oferecido. Revalidar a sessão não reinicia a captura. Conteúdo consumido e cópias do próprio Cyro recebem deduplicação temporária limitada à memória. Testes cobrem exclusividade entre janelas, captura ClipboardItem/Blob, conteúdo consumido, cópia interna e restrição do novo IPC à janela autenticada. O teste Electron lê a API Windows sem escrever no clipboard pessoal e usa mudanças sintéticas para os demais cenários.

UI: mensagens identificam autoria e horário quando disponível; botões de cópia aparecem no hover/foco e ficam acessíveis em superfícies sem hover. O teste Electron verifica ausência de sobreposição da navegação com a digitação, separação mínima dos controles e ausência de overflow horizontal em 1366×738 e 800×600. Capturas foram conferidas visualmente. O contraste calculado do novo texto secundário fica entre 8,08:1 e 10,35:1 nas superfícies escuras verificadas e 6,88:1 no branco; isso não constitui auditoria integral de WCAG.

Writer foi verificado com Electron e FastAPI/SQLite reais: edição/salvamento, proposta antes de aplicar, aprovação humana, desfazer/refazer, conflito externo, recuperação, exportação DOCX e arquivo original autorizado. IA, Cloud, OAuth Spotify e áudio remoto foram simulados. Reprodução WAV foi exercitada sem som físico. Não foram certificados OpenAI paga, audição/ditado físico, Spotify real, deploy, Operations do provedor ou Windows limpo. O aplicativo instalado não é atualizado automaticamente pelo código-fonte.

Sem migrations novas; contrato Cloud compatível com 6.0.2 ou posterior. O teste Python de interoperabilidade foi atualizado para o novo caminho do módulo de armazenamento protegido. Nenhum conteúdo de Backup/ foi alterado. A alteração preexistente de cloud/next-env.d.ts foi preservada e permanece fora do trabalho versionado. Evidências locais: build/v6/v603-desktop-final2.log, v603-python-final.log, v603-tools-python-final.log, v603-electron-final3.log e v603-admin-final.log. Instruções de estrutura e comandos em [desktop/README.md](../desktop/README.md).

Instalador compilado em 28/10/2026: `release/v6/Cyro-IA-Setup-6.0.3.exe`, 183480305 bytes, ProductVersion 6.0.3 (payload 6.0.3.0), Authenticode NotSigned. SHA256 `b7bac4761877c5ba6303438e87bbd3e42d77fe0ac9df45ef8a2b7becfd31a45a`, conferido contra o arquivo `.exe.sha256`. O pipeline oficial `tools/build_cloud_desktop.py` concluiu todas as etapas de check:v6, PyInstaller, electron-builder, auditoria de ASAR/runtime e checksum. Os bundles React, estilos e módulos nativos correspondem às fontes atuais; testes/JSX e arquivos privados proibidos foram recusados pela auditoria.

O self-check do serviço congelado e o teste do payload real passaram: inicialização com PATH restrito sem Node/Python, autenticação local e persistência após reinício, usando exclusivamente dados temporários. Uma tentativa de inicialização antes do fim do empacotamento falhou; a verificação válida foi repetida com o pacote final e aprovada. Logs: build/v6/cyro-setup-6.0.3.log, cyro-6.0.3-frozen-selfcheck.log, cyro-6.0.3-artifact-audit.log e cyro-6.0.3-payload-smoke-final.log. Não equivale a instalar/atualizar em Windows limpo. Setup local, sem tag, release, push ou deploy nesta revisão.

# Validacao 6.0.2 — preparacao da sessao e gravacao confirmada

Em 27/10/2026, implementacao nos commits c271395 e a54cdad. Pipeline check:v6 aprovado: 91 testes Cloud, 166 Desktop, 198 backend Python, 35 iniciadores/empacotamento e 2 ferramentas Node (492 testes sem dupla contagem), TypeScript Cloud/Desktop, builds Cloud/Desktop, sete smokes Electron reais com provedores simulados e 40 verificacoes de layout com Chromium real.

Regressoes novas cobrem bloqueio durante bootstrap, falha e nova tentativa, invalidacao da permissao ao trocar sessao, Quick Chat bloqueado antes da carga, cache de historicos carregados e de gravacoes confirmadas, isolamento entre contas, pagina de mais de 500 mensagens, catalogo de mais de 50 conversas, limite de bytes UTF-8 por lote, IDs de retry e uma transacao por par. O teste ASGI verifica que falha de persistencia impede o retorno da resposta gerada. O relogio controlado registrou duas sincronizacoes de catalogo em dez minutos, sem gatilhos externos. Resultados e limites em [RESULTS.md](performance/RESULTS.md).

Sem migrations novas, sem uso de API paga e sem validacao de Windows limpo. Nao foram medidos tempo de login com historico real, Operations do provedor apos deploy, OAuth ou audio fisico. O Desktop 6.0.2 exige publicar o Cloud da mesma revisao antes da instalacao: os comandos bootstrap/exchange nao existem no servidor anterior. Nao foi declarado deploy concluido. A alteracao preexistente em cloud/next-env.d.ts e preservada e fica fora dos commits. Backup/ nao foi alterado.

Instalador gerado em 27/10/2026 e conferido em 28/10/2026: `release/v6/Cyro-IA-Setup-6.0.2.exe`, 186215312 bytes. SHA256 `4f793224544a39732ee2fe305e77f71008201d90c041f87feda263f00db43ae9`, confirmado independentemente contra o arquivo `.exe.sha256`. Setup ProductVersion 6.0.2 e payload ProductVersion 6.0.2.0, ambos Cyro IA. Auditoria de ASAR/runtime aprovada; self-check do backend congelado aprovado. Assinatura Authenticode: NotSigned. Logs locais: `build/v6/cyro-setup-6.0.2.log` e `build/v6/cyro-6.0.2-frozen-selfcheck.log`. Compilacao local, sem envio ao GitHub, tag, release ou deploy nesta revisao.

# Validacao 6.0.1 - apelido Cyro

Em 27/10/2026: mensagens, botoes, textos de apoio e apresentacao do assistente usam Cyro; logos e titulos mantem Cyro IA. A regra foi registrada no AGENTS.md. Passaram 161 testes Desktop, 88 Cloud, 2 de identidade, 6 de Quick Chat e 8 de empacotamento/versionamento. A revisao final passou ainda por 33 testes focados de interface/workspace e pelo smoke Electron real com dados Cloud simulados. Verificador de repositorio e git diff --check aprovados.

Esta revisao altera o codigo-fonte; o instalador anterior nao foi recompilado para incluir estes textos. Sem validacao de audio pago ou Windows limpo.

# Novo banco Cloud - migracao e superadministrador em 27/10/2026

Por autorizacao explicita do proprietario, o destino DIRECT_URL configurado privadamente foi consultado antes de qualquer alteracao e estava sem tabelas publicas. Prisma validate e migrate deploy concluidos: oito migrations locais aplicadas, sem rollback ou pendencia. Migrate status confirmou schema atualizado. Nenhum reset, db push, importacao de Backup/ ou exclusao de dados de clientes foi executado. A remocao de colunas legadas da migration desktop_login ocorreu somente nas tabelas vazias recem-criadas.

Bootstrap oficial executado com BOOTSTRAP_* ja configurados privadamente. Verificacao real confirmou exatamente um SUPER_ADMIN ACTIVE, senha correspondente ao hash salvo e um registro de auditoria admin.bootstrap. Duas linhas iniciais de ProviderConfiguration presentes. E-mail, nome, senha, hash e URLs privadas nao sao publicados neste registro. As tres variaveis temporarias de bootstrap foram removidas apos conferir o cadastro. AUTH_SECRET e credenciais do banco foram preservados.

DATABASE_URL usava outro endpoint e falhou na conexao; DIRECT_URL funcionou. O endereco local de runtime foi alinhado ao endereco verificado do mesmo banco, preservando usuario, senha e nome do banco. A alteracao e privada em cloud/.env, fora do Git. Nao confirma que a Vercel usa a mesma configuracao nem valida login publicado: as variaveis remotas e o deploy precisam corresponder ao novo banco. Nao foi feita copia automatica de usuarios, conversas ou credenciais de provedores do banco anterior.

Evidencias locais em build/v6/new-db-validate.log, new-db-migrate.log, new-db-bootstrap.log, new-db-verification.log e new-db-final-status.log; logs nao sao publicados. Testes com PostgreSQL Cloud real, sem OpenAI paga, Spotify ou alteracoes no Desktop instalado.

# Cyro IA 6.0.1 - validacao da marca e compatibilidade

Em 27/10/2026 a suite completa foi repetida apos a renomeacao: 88 testes Cloud, 161 Desktop, 195 backend Python, 35 iniciadores/empacotamento e 2 ferramentas Node (481 sem dupla contagem), TypeScript/build Cloud/Desktop e sete smokes Electron aprovados. O contrato adicional verifica productName Cyro IA e preservacao de appId, executavel e pasta de dados JARVIS. Captura da tela inicial com marca C conferida visualmente.

O repositorio foi renomeado pela API autenticada do GitHub para rodrigojr09/Cyro-IA, com autorizacao explicita; origem local atualizada. Auditoria final e checksum registrados abaixo. A identidade comum passou a apresentar-se como Cyro IA. Dados, sessoes, IPC, cookies e identificadores internos existentes nao foram renomeados.

## Setup final Cyro IA 6.0.1

- Arquivo: `release/v6/Cyro-IA-Setup-6.0.1.exe`; 186,211,907 bytes.
- SHA-256: `43f189d5fc2657871c3c65f1496c5b1008844392cef2508c54dc8bb785c11728`. Arquivo `.exe.sha256` conferido com calculo independente.
- Setup ProductName/Version: Cyro IA / 6.0.1. Aplicativo: Cyro IA / 6.0.1.0; executavel JARVIS.exe mantido por compatibilidade.
- Authenticode: NotSigned; nenhuma assinatura digital adicionada.
- Pipeline completo, NSIS e auditoria ASAR/runtime aprovados; fontes conferidas e sem arquivos privados proibidos no pacote. Backend congelado passou em --self-check com identificacao Cyro IA. Sem chamada paga.
- Origem HTTPS preservada: https://cronosjarvis.vercel.app. Repositorio renomeado: https://github.com/rodrigojr09/Cyro-IA, destino de envio master, autorizado pelo proprietario.
- Artefatos intermediarios com marca JARVIS 6.0.1 foram movidos para release/v6/intermediate-jarvis. Artefatos v5 preservados. Log final: build/v6/cyro-setup-6.0.1.log.
- Nao foi executado o instalador no perfil pessoal. Windows limpo, atualizacao/desinstalacao reais, audio pago e OAuth real continuam sem homologacao. Inicio/reinicio do payload completo com PATH restrito nao foi repetido porque a porta 8765 esta ocupada pelo aplicativo instalado, preservado; o smoke Electron/FastAPI usa porta temporaria e passou.
- A alteracao preexistente cloud/next-env.d.ts foi restaurada apos a compilacao e permanece fora dos commits. Backup/ nao foi alterado. Sem migration, tag ou GitHub Release.

# Validacao 6.0.1 - otimizacao de banco e distribuicao

Em 27/10/2026: npm ci na raiz concluiu (485 pacotes instalados, 489 auditados, nenhuma vulnerabilidade reportada). Pipeline check:v6 aprovado: 88 testes Cloud, 161 Desktop, 195 backend Python, 34 iniciadores/empacotamento e 2 ferramentas Node (480 sem dupla contagem); TypeScript e builds Cloud/Desktop; sete smokes Electron e 40 verificacoes de layout. A falha inicial no mock de IPC foi corrigida com notificacao best-effort e regressao que impede falha de renderer de mascarar escrita concluida.

O primeiro setup 6.0.1 com a marca anterior foi compilado e auditado antes do pedido de renomeacao. A entrega final Cyro IA sera recompilada; nao confundir esse artefato intermediario com a entrega final. Logs locais: build/v6/setup-6.0.1-retry.log. Smokes usam perfis temporarios e servicos externos simulados. Nenhuma certificacao de audio pago, OAuth real ou Windows limpo.

A sonda SQL somente leitura para contagem de conexoes nao obteve resposta utilizavel; nao foi registrado zero como resultado. Metricas do provedor permanecem dependentes de observacao apos implantacao. Benchmark local e limites em [RESULTS.md](performance/RESULTS.md).

# Validação da migração v6.0.0 — em desenvolvimento

Execução atual em **27/10/2026**, branch `codex/jarvis-v6-architecture`. Resultados v5 abaixo são históricos e não certificam v6.

| Verificação atual | Resultado |
| --- | --- |
| npm ci na raiz | Concluído: 485 pacotes instalados, 489 auditados; nenhuma vulnerabilidade reportada. |
| Repositório / ferramentas Node | Versões e links aprovados; 2 testes aprovados. |
| Cloud | 84 testes, TypeScript e build de produção aprovados. |
| Desktop | 155 testes, TypeScript e bundle aprovados; inclui 13 testes de workspace. |
| Python backend | 193 testes aprovados, incluindo identidade comum; 42 testes Writer também executados separadamente. |
| Iniciadores/empacotamento | 34 testes aprovados; não equivale a gerar ou instalar um setup v6. |
| Electron | Principal, Quick, login Cloud, clipboard, Writer e Spotify aprovados com serviços externos simulados. |
| Layout administrativo | 40 verificações aprovadas em Chromium real, com dados sintéticos. |
| Electron/FastAPI sessão | Bloqueado: porta 8765 ocupada por jarvis-backend.exe já instalado. Não encerrado nem substituído. A execução agregada parou nesse ponto; os três smokes seguintes foram executados separadamente. |

Total sem dupla contagem: **468 testes automatizados**, mais seis smokes Electron. Logs locais em `build/v6/`. Layout administrativo: 40 verificações aprovadas. A alteração prévia de cloud/next-env.d.ts foi restaurada exatamente após o build e permanece fora dos commits.

Não houve implantação, migration de banco, chamada paga, OAuth real, instalação v6 ou teste em Windows limpo. A migração permanece parcial: memória GLOBAL_USER, React, registro/orquestração central completos, cache Writer/Quick compartilhado, eventos/revisões remotos e rascunhos ao F5 ainda pendentes. Veja o [plano incremental](architecture/MIGRATION_PLAN.md). Não marcar v6 estável ou pronta para distribuição.


## Refinamento visual do Desktop — 27/10/2026

155 testes Desktop passaram na execução inicial; após acrescentar a regressão da margem, os 32 testes direcionados de Quick/UI passaram. TypeScript Desktop, verificação do repositório e smokes Electron principal/Quick aprovados. O smoke principal verifica rolagem no topo e eyebrow visível em 1366×738; captura conferida visualmente com os seis cartões inteiros. O smoke Quick passou após ajustar a expectativa antiga de 20 DIP para a nova margem de 24 DIP. Dados de serviços simulados e perfis temporários; sombra física do shell depende do Windows. Sem novo instalador, alteração de perfil pessoal ou implantação Cloud. Esta mudança afeta o renderer Electron; o dashboard Cloud não contém a tela da imagem.

# Validação — JARVIS 5.1.0

Este documento acompanha a implementação atual. Evidências de versões anteriores estão no [arquivo histórico](history/README.md); o relato cronológico de desenvolvimento v5 está em [V5-DEVELOPMENT.md](history/V5-DEVELOPMENT.md).

## Reproduzir

Na raiz, após `npm ci` e a instalação dos requisitos Python:

```powershell
npm run check:v5
```

O comando verifica, em sequência:

1. Versões de manifests/locks, links locais da documentação e ausência de caminhos privados proibidos no índice Git.
2. Runner de testes, Cloud, TypeScript e build Next.js/Prisma.
3. TypeScript, bundle e testes Node do Desktop.
4. Descoberta completa de testes Python do backend e testes dos iniciadores/empacotamento.
5. Sete smokes Electron reais: principal, Quick Chat, Cloud, sessão, clipboard, Writer e Spotify.
6. Layout administrativo em cinco larguras, com cache, filtros, gráficos e formulários.

O runner Electron elimina `ELECTRON_RUN_AS_NODE` apenas no ambiente dos processos de teste que ele inicia. Isso permite rodar dentro de outro host Electron sem alterar o aplicativo pessoal. Os testes usam perfis temporários e serviços externos simulados; não acessam dados reais para provar cenários simulados.

Também é possível executar cada script separado: consulte `package.json` e `desktop/package.json`. Não existe lint ESLint configurado; formatação usa Prettier no JS/TS e Black nos módulos Python revisados. O build de distribuição exige a validação completa antes de empacotar.

## Registro da versão 5.1.0

Execução completa em **27/10/2026**, com os manifests, título, tela Sobre e backend sincronizados em **5.1.0**. O [registro da consolidação anterior](history/V5-CONSOLIDATION-5.0.md) preserva as evidências e o checksum 5.0.0, sem atribuí-los ao instalador novo.

| Verificação | Resultado |
| --- | --- |
| Repositório | Versões sincronizadas e 37 documentos com links locais válidos; índice sem caminhos privados proibidos. |
| Ferramentas de validação | 2 testes aprovados. |
| Cloud | 84 testes aprovados; TypeScript e build de produção aprovados. |
| Desktop | 149 testes aprovados; TypeScript e bundle aprovados. |
| Backend Python | 191 testes aprovados. |
| Iniciadores e empacotamento | 34 testes aprovados, incluindo versões visíveis e runtime. |
| Electron 44.9.1 | Sete smokes aprovados: principal, Quick Chat, Cloud, sessão, clipboard, Writer e Spotify. |
| Dashboard | 40 verificações de layout aprovadas, incluindo rodapé 5.1.0 e consumo. |

São **460 testes automatizados**, além dos sete smokes e das 40 verificações de layout. Provedores externos são simulados onde indicado nas fixtures. A rejeição IPC não autorizada impressa pelo smoke de clipboard é esperada. O runtime permanece fixado em Electron 44.9.1; a auditoria npm após essa correção não reportou vulnerabilidades conhecidas, e a mudança para 5.1.0 não altera as versões de dependências.

A compilação, auditoria e reinicialização do pacote 5.1.0 foram concluídas. Nenhum checksum 5.0.0 é reutilizado na entrega nova.

## Homologação externa pendente

- Clipboard manual entre aplicativos Windows, bolinha no shell, som/volume/mute no dispositivo físico, duas janelas abrindo em disputa e nova cópia durante edição.
- Conta autorizada Spotify: conectar/negar/expirar/repetir callback, reiniciar, refresh/revogação, conta sem Premium, isolamento real entre contas e diálogo de dispositivo nos três meios (chat, Quick Chat e voz).
- OpenAI real autorizado: texto, streaming, cancelar, cotas e voz paga. Conferir uso no provedor sem expor conteúdo ou credenciais.
- Writer com documentos reais escolhidos pelo usuário: perguntas sem alteração, revisão/aprovação, conflito externo, seleção, desfazer e atualização do original. Não sobrescrever documentos pessoais apenas para executar testes.
- Windows limpo: instalar, atualizar e desinstalar com dados temporários, conferir atalhos e preservação do perfil; DPI, múltiplos monitores, microfone e recuperação após falha.

A falta de homologação não é ocultada por mocks. Não criar tag ou afirmar certificação externa com base apenas nos resultados locais.

## Instalador final 5.1.0 — 27/10/2026

- Arquivo: `release/v5/JARVIS-Setup-5.1.0.exe`.
- Tamanho: **186.203.076 bytes**.
- FileVersion e ProductVersion: **5.1.0**; runtime Electron **44.9.1**.
- SHA-256: `bc4833f6e7a0123611b137658b6e395e0afa0a812e7dc75420a0e7ece21ce218`.
- Arquivo de verificação: `JARVIS-Setup-5.1.0.exe.sha256`.
- Assinatura Authenticode: **NotSigned**.
- Origem Cloud embutida e auditada: `https://cronosjarvis.vercel.app`.

O pipeline completo terminou com sucesso, incluindo PyInstaller e NSIS. O backend congelado passou em `--self-check`. A auditoria comparou fontes e configuração do ASAR/runtime e não encontrou arquivos privados proibidos. Depois de concluído o empacotamento, o payload 5.1.0 iniciou e reiniciou com perfil temporário e PATH sem Python/Node; identidade/versão 5.1.0, autenticação local e persistência passaram.

O executável foi recompilado; não se renomeou o setup 5.0.0. O log local desta execução fica em `build/v5/finalization-5.1.0.log`. Não houve instalação sobre o perfil pessoal, teste de Windows limpo, chamada paga ou OAuth real. Não foram criados tag ou upload de binário para GitHub Release. O artefato 5.0.0 anterior permanece identificado separadamente no histórico.
