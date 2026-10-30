# Anexos compactos e sugestões clicáveis — 30/10/2026

Entrega: runtime 3e51f8dfd17e3093ea3d1dbfa1ce70b98ec2e0ae enviado a master e codex/jarvis-v6-architecture; deploy Vercel success em 30/10/2026 às 09:17:18 America/Sao_Paulo (12:17:18 UTC): https://vercel.com/rodrigo-juniors-projects/cyro-ia/F7Ni94FA451kF5PpqNRuzLAJUcRK . Produção: login 200, última versão 200 e API administrativa sem sessão 401.

Setup recompilado: release/v6/Cyro-IA-Setup-6.3.0.exe, 183645146 bytes, versão PE/NSIS 6.3.0 validada, SHA256 `4bcb87a88cdc6ced2305ca23366bd40006417bf223b848f1276a65daefa48e28` conferido independentemente contra .sha256. Authenticode NotSigned. Instalador anterior e auxiliares preservados em release/v6/previous/6.3.0-a011c3b/. Backend inalterado reutilizado após novo self-check. Auditoria de fontes/ASAR/runtime aprovada. O payload final iniciou sem Python/Node no PATH, autenticou localmente e preservou dados após reiniciar em perfil temporário; não certifica instalação/atualização em Windows limpo nem IA paga. Evidências adicionais: v630-compact-setup.log, v630-compact-payload.log e v630-compact-deployment-runtime.json em build/v6/.


157 testes Desktop, TypeScript Desktop e sete cenários Electron aprovados. Validados salvamento pelo clique separado da remoção, importação explícita sem envio, preservação de sugestão na falha, bloqueio durante importação, limite de cinco arquivos, layout responsivo e digitação visível. Capturas clipboard-image.png/clipboard-options.png em jarvis-clipboard-smoke-MQJCMb e cyro-v621-attachment.png conferidas visualmente. O teste antigo que esperava rodapé/expansão foi atualizado para o novo contrato de clique, miniatura 36px, texto sublinhado e borda tracejada. A execução inicial falhou por expectativas antigas e seletor removido; a execução final dos sete cenários passou.

Logs: build/v6/v630-compact-tests-final.log, v630-compact-typecheck.log, v630-compact-electron-final.log e v630-compact-format-final.log. Sem alterações Cloud/backend/banco; testes desses serviços não foram repetidos. Catálogos paginas.html/styles.css regenerados. Backup/, dados e cloud/next-env.d.ts do proprietário preservados. Sem tags/releases.

# Entrega dos cartões e contexto temporal — 30/10/2026

Runtime a011c3b42f5219b1fc34408b32aa51e9d911c11b enviado a master e codex/jarvis-v6-architecture. Deploy Vercel success às 08:17:36 America/Sao_Paulo (11:17:36 UTC): https://vercel.com/rodrigo-juniors-projects/cyro-ia/CkvG3yyjiT4qgDQsmLsKbbXYWpih . O contexto temporal usa o relógio confiável por requisição; não foi acrescentada pesquisa web nem certificada resposta de IA paga.

Setup 6.3.0 recompilado: 183645883 bytes, ProductVersion 6.3.0, payload 6.3.0.0, SHA256 `177f78130faf7c6f4715c94616dc1e40f51498723a106f20003e0ee304d4716f`, conferido contra .sha256. Authenticode NotSigned. Validador PE/NSIS/versão aprovado. Auditoria de fontes/ASAR/runtime e novo self-check congelado aprovados. Backend e empacotador inalterados desde f212a0a; serviço congelado reutilizado. Instalador anterior e auxiliares preservados em release/v6/previous/6.3.0-f212a0a/.

104 testes Cloud, 156 Desktop, TypeScript/build Cloud, sete cenários Electron e repetição dos dois cenários afetados aprovados, conforme registro abaixo. O smoke final de abertura/reinício deste payload foi bloqueado antes de iniciar: porta 8765 ocupada pelo aplicativo existente. Nenhum processo externo foi encerrado. A porta é fixa no runtime; não se declara aprovado esse teste nem instalação/atualização real em Windows.

Evidências: build/v6/v630-time-cards-setup.log, v630-time-cards-payload.log e v630-time-cards-deployment-runtime.json. Backup/, dados e alteração prévia de cloud/next-env.d.ts preservados. Nenhuma tag, release ou migração criada nesta correção.

# Data atual e cartões — 30/10/2026

104 testes Cloud, 156 Desktop e TypeScript/build Cloud aprovados. Quatro testes novos validam o contexto temporal por requisição, virada UTC/São Paulo, fuso inválido, histórico imutável e mensagens de ferramenta sem texto. Não foi feita chamada paga para certificar a resposta final do modelo; o contexto confiável foi verificado diretamente.

Os sete cenários Electron passaram com o cartão novo; após adicionar estado ocupado e limitar a altura da área de anexos, os cenários principal e clipboard passaram novamente. Verificaram miniatura 56px, raio/padding 12px, aviso 12px, ações abaixo do cabeçalho, ausência de overflow e cinco cartões sem esconder a digitação. Capturas clipboard-image.png e cyro-v621-attachment.png conferidas visualmente com dados sintéticos. O teste React bloqueou botões durante Usar e confirmou que nenhuma mensagem foi enviada automaticamente. O teste antigo de irmãos diretos foi adaptado para verificar a ordem visual do anexo antes do campo, permitindo o contêiner de rolagem.

Logs locais: v630-clock-cloud-final.log, v630-clock-typecheck.log, v630-clock-build.log, v630-cards-desktop-final.log, v630-cards-electron.log, v630-cards-main-final.log e v630-cards-clipboard-final.log. Backend Python, dados, permissões e Backup/ não foram alterados; cloud/next-env.d.ts local preservado. Pesquisa web não foi implementada nesta correção.

# Recompilação 6.3.0 — proteção final de encerramento, 30/10/2026

Runtime f212a0a6f02c8646f8f1df957762288abbd57795 enviado a master e codex/jarvis-v6-architecture. Deploy Vercel success em 30/10/2026 às 07:10:06 America/Sao_Paulo (10:10:06 UTC): https://vercel.com/rodrigo-juniors-projects/cyro-ia/BmSTKjkGD2xSbQioqsSoqcWvQ4EG . Login HTTP 200, latest HTTP 200/release:null e versões administrativas sem sessão HTTP 401. Não há atualização fictícia anunciada.

Instalador atual em release/v6/Cyro-IA-Setup-6.3.0.exe: 183643045 bytes, ProductVersion 6.3.0, payload 6.3.0.0, SHA256 `ffdc9bf469800f60fabe3b489fc2e4161bbb391e82cea73b1ef8502ea4fd9876`, conferido com .sha256. Authenticode NotSigned. O setup anterior 204dc3f e seus arquivos auxiliares foram preservados em release/v6/previous/6.3.0-204dc3f/.

A janela é desabilitada depois da confirmação e antes do encerramento seguro, evitando novas edições durante a parada do serviço. Os 155 testes Desktop e sete cenários Electron passaram novamente; o conjunto validado soma 506 testes com as verificações anteriores inalteradas de Cloud/Python/ferramentas, além das 63 verificações administrativas. TypeScript foi conferido novamente após a pasta local mudar para C:/Users/user/Desktop/Cyro e os três links de workspaces serem reparados. Fontes Python e empacotador inalterados desde 204dc3f; o serviço congelado já validado foi reutilizado após novo self-check. NSIS e auditoria de fontes/ASAR/runtime aprovados. O novo payload iniciou sem Python/Node no PATH, autenticou localmente e preservou dados após reinício com perfil temporário.

Isso não executou o instalador sobre uma instalação anterior nem homologa Windows limpo. Servidor externo ainda aguardando configuração; nenhuma tag/release real criada. Backup/ e alteração local prévia de cloud/next-env.d.ts preservados. Documentação final enviada sem nova mudança de runtime.

Evidências: build/v6/v630-close-guard-tests.log, v630-close-guard-electron.log, v630-renamed-workspace-typecheck.log, v630-close-guard-setup.log, v630-close-guard-payload.log, v630-close-guard-deployment-runtime.json e v630-close-guard-production.json.

# Entrega 6.3.0 — Cloud e instalador preparado para atualizações

Em 29/10/2026, por autorização contínua do proprietário, runtime 204dc3f899bca47dd03e10425d811f86684f70d9 enviado a master e codex/jarvis-v6-architecture. Vercel success às 17:11:41 America/Sao_Paulo (20:11:41 UTC): https://vercel.com/rodrigo-juniors-projects/cyro-ia/4WgWSHLDYHBA5Xm3TMkRRLWWfGqZ . Login de produção HTTP 200, /api/releases sem sessão HTTP 401, /api/updates/latest HTTP 200 com release:null (sem versão fictícia anunciada). Duas consultas posteriores retornaram x-vercel-cache:HIT, Age 35 e Cache-Control public,max-age=60. Isso comprova resposta do cache HTTP, não uma medição de Operations faturadas.

Instalador: release/v6/Cyro-IA-Setup-6.3.0.exe, 183643063 bytes, ProductVersion 6.3.0, payload 6.3.0.0. SHA256 `244f5de4b98c2c17ea2b36f6ef0ebbac2e8533deced15352a6e7d710734824fa`, conferido independentemente contra .sha256. Authenticode NotSigned. O próprio validador novo confirmou PE/NSIS/ProductVersion do setup real. PyInstaller, NSIS, auditoria de fontes/ASAR/runtime e self-check congelado aprovados. Empacotamento reutilizou a regressão aprovada de 505 testes, sete cenários Electron e 63 verificações administrativas, além do build Cloud/layout finais após acabamento de cache/textos.

Payload final iniciou sem Python/Node no PATH, autenticou localmente e preservou dados após reiniciar com perfil temporário. Não certifica atualização de uma instalação Windows para outra, Windows limpo, áudio físico ou IA paga. O proprietário pediu deixar o servidor externo pronto para implantação posterior: publicação real e teste instalado de atualização aguardam infraestrutura/credenciais. Nenhuma tag ou GitHub Release criada; instaladores anteriores e Backup/ preservados. A alteração local prévia em cloud/next-env.d.ts foi preservada e excluída dos commits. Documentação final enviada sem alterar o runtime validado.

Evidências locais: build/v6/cyro-setup-6.3.0.log, cyro-6.3.0-frozen-selfcheck.log, cyro-6.3.0-payload-smoke.log, v630-deployment-runtime.json, v630-deployment-latest.json, v630-production-check.json e v630-production-cache-pair.json. [Resultados completos e pendências](updates/TEST_RESULTS.md).

# Validação 6.3.0 — versões e atualizações

Em 29/10/2026, 505 testes, TypeScript/build Cloud/Desktop, sete cenários Electron e 63 verificações administrativas em Chromium passaram. Detalhes, execuções iniciais corrigidas e limitações em [resultados de atualizações](updates/TEST_RESULTS.md). A migration aditiva de CyroRelease foi aplicada ao banco configurado sem apagar dados. Upload/publicação GitHub foram testados com transportes sintéticos; consulta real apenas leu repositório/tags. O proprietário pediu preparar o servidor externo para instalação posterior. Não existe publicação real de Setup.exe ou tag v6.3.0 criada por esta implementação. Atualização de uma instalação Windows para outra permanece pendente de homologação.

# Recompilação 6.2.2 — campo compacto e sugestão de clipboard

Em 29/10/2026, runtime 7f3b27a22a82b37289b82c2a7bcdb349771cbf47 enviado a master e codex/jarvis-v6-architecture. Vercel success às 14:54:44 America/Sao_Paulo (17:54:44 UTC): https://vercel.com/rodrigo-juniors-projects/cyro-ia/SbffKnbQ4qJ9ksevp4cgLFxjdNN2 . Login de produção HTTP 200; API de configurações sem sessão HTTP 401. Autorização contínua de envio/compilação registrada no AGENTS.md, conforme pedido do proprietário.

Setup release/v6/Cyro-IA-Setup-6.2.2.exe: 183637089 bytes, ProductVersion 6.2.2, SHA256 `d149cb9360ad79a9e8e9d27e5ac89a7c7adee2a0ec312189b056f3b43d541d1c` conferido independentemente com .sha256; Authenticode NotSigned. PyInstaller, NSIS, auditoria de fontes/ASAR/runtime e self-check congelado aprovados. O empacotamento reutilizou a validação completa de 490 testes, sete cenários Electron e 56 verificações de layout, já aprovada na mesma revisão. Uma leitura inicial de log falhou por codificação antes de compilar; a leitura foi corrigida sem mudar fontes.

O payload final iniciou sem Python/Node no PATH, autenticou localmente e preservou dados após reiniciar com perfil temporário. Não equivale a instalar/atualizar em Windows limpo nem valida IA paga, áudio físico ou Spotify real. Versão anterior preservada em release/v6/previous/6.2.2-9914b0f/. Sem migrations, segredos publicados, alterações em Backup/, tag ou GitHub Release. cloud/next-env.d.ts local preservado e excluído dos commits.

Evidências: build/v6/compact-setup-6.2.2.log, compact-frozen-selfcheck.log, compact-payload-smoke.log, compact-deployment-runtime.json, compact-production-check.json e compact-verified-check.log. A documentação final é enviada sem alterar o runtime validado.

# Ajuste 6.2.2 — campo compacto, clipboard e menu de mensagem

Em 29/10/2026, o campo foi reduzido a uma linha inicial de 36 px, crescendo até 140 px. Anexos compactos ficam acima, com prévias de 40 px. Clipe à esquerda e áudio/envio alternados à direita; removido o rótulo Somente leitura da digitação, sem alterar permissões de arquivos. Copiar mensagem só aparece no menu do botão direito, com navegação e fechamento do AnchoredMenu existente.

Clipboard oferece Usar: texto é acrescentado ao rascunho entre parênteses seguido de nova linha; imagem é importada como anexo local no chat principal. Não envia mensagem automaticamente. Falha mantém a sugestão; sucesso a descarta. Quick Chat recebe texto no rascunho; imagens continuam sendo usadas no chat principal. Consentimento, exclusividade e isolamento por conversa preservados.

Validação completa executada: npm run check:v6 aprovado, com 490 testes (147 Desktop, 214 backend Python, 92 Cloud, 35 ferramentas Python e 2 ferramentas Node), TypeScript/build Cloud e Desktop, sete cenários Electron e 56 verificações administrativas em Chromium. Prettier e git diff --check aprovados. Evidências: build/v6/compact-verified-check.log e compact-verified-format.log. Integrações externas sintéticas não certificam IA paga, áudio físico, Spotify real ou Windows limpo.

As alterações locais existentes foram preservadas, incluindo cloud/next-env.d.ts byte a byte após o build. Capturas cyro-v622-copy-action.png e cyro-v621-attachment.png conferidas visualmente. O instalador anteriormente publicado não contém este ajuste; sem novo push, deploy ou compilação de setup nesta etapa. Backup/ intacto.

# Entrega 6.2.2 — Cloud e instalador Windows

Em 29/10/2026, por autorização explícita do proprietário, o runtime 9914b0f3999ad51a2b61418b4e91f4524e24c000 foi enviado a origin/master e origin/codex/jarvis-v6-architecture. Vercel success às 10:57:49 America/Sao_Paulo (13:57:49 UTC): https://vercel.com/rodrigo-juniors-projects/cyro-ia/FR4BmCciwK2XZBtXWm4bxCaf2QAz . Produção https://cronosjarvis.vercel.app/login respondeu 200 com marca Cyro; /api/provider-settings sem sessão retornou 401. A documentação final também é enviada, sem alterar o runtime validado. Sem migrations ou alterações de credenciais.

Instalador: release/v6/Cyro-IA-Setup-6.2.2.exe, 183639810 bytes, ProductVersion 6.2.2 e payload 6.2.2.0. SHA256 `cc322cbe5ec7c289573b2262de391d952006b8cac3079afc1057ecf5137d9fe9`, conferido independentemente contra .exe.sha256. Authenticode NotSigned. PyInstaller, NSIS e auditoria de fontes/ASAR/runtime aprovados. O empacotamento reutilizou os 489 testes, sete cenários Electron e 56 verificações de layout já aprovados na mesma revisão, sem repeti-los.

Self-check congelado aprovado. O payload final iniciou sem Python/Node no PATH, autenticou localmente e preservou dados após reiniciar com perfil temporário. Não certifica instalação/atualização em Windows limpo, login manual de produção, áudio físico, Spotify real ou IA paga. Nenhum perfil pessoal ou Backup/ foi alterado. Instaladores anteriores preservados; sem tag ou GitHub Release.

Evidências locais: build/v6/cyro-setup-6.2.2.log, cyro-6.2.2-frozen-selfcheck.log, cyro-6.2.2-payload-smoke.log, v622-deployment-runtime.json, v622-deployment-latest.json e v622-production-check.json.

# Validação 6.2.2 — controle flutuante Copiar mensagem

Em 29/10/2026, check:v6 passou com 489 testes (146 Desktop, 214 backend Python, 92 Cloud, 35 iniciadores/empacotamento e 2 ferramentas Node), TypeScript/build Cloud e Desktop, sete cenários Electron e 56 verificações administrativas em Chromium. Prettier Desktop aprovado. Nenhuma dependência nova; npm ci da raiz já havia sido executado. cloud/next-env.d.ts restaurado byte a byte após a compilação.

O controle Copiar mensagem usa ícone de cópia, min-width 160 px, width max-content e white-space nowrap tanto no botão quanto na legenda. A borda tem raio de 10 px e sombra suave; os estados de hover, foco, pressionado, Copiado e falha preservam o envio somente ao clipboard local. O espaçamento entre mensagens é 48 px e a margem inferior reserva lugar para a ação de 36 px, sem cobrir o próximo balão. Uma área transparente de 6 px mantém o hover ao cruzar o pequeno intervalo entre balão e botão.

O cenário Electron usou a mensagem curta Oi e validou texto em uma linha, largura mínima, permanência dentro da área da conversa e espaço suficiente em 1366×738 e 800×600. Também acionou a cópia, conferiu o texto exato recebido pelo IPC e o retorno Copiado. A captura cyro-v622-copy-action.png foi conferida visualmente. O controle continua disponível no hover/foco e em superfícies sem hover. Copiar não envia conteúdo à IA.

Evidências locais: build/v6/v622-check.log, v622-copy-electron.log e v622-format.log; captura no diretório temporário. As integrações Cloud/IA/OAuth dos cenários são sintéticas; não certificam OpenAI paga, áudio físico, Spotify real, Operations de produção ou Windows limpo. Sem migrations ou alterações em Backup/. Publicação/compilação da 6.2.2 autorizadas pelo proprietário; os resultados de entrega serão registrados separadamente. Referências paginas.html/styles.css regeneradas.

# Recompilação 6.2.1 — correções de layout

Em 29/10/2026, mediante autorização explícita, dcb411edc08a53c476f15de48544b776a6971ce5 foi enviado a master e à branch de desenvolvimento. Vercel success às 08:24:16 America/Sao_Paulo (11:24:16 UTC): https://vercel.com/rodrigo-juniors-projects/cyro-ia/7cGUxHJY5cKwZSA6CWTJYnRAdQQN . Login de produção respondeu 200 com marca Cyro; /api/provider-settings sem sessão respondeu 401. Nenhuma mudança de banco, credenciais ou permissões.

O setup release/v6/Cyro-IA-Setup-6.2.1.exe foi recompilado com os novos layouts da sidebar, configurações da conversa e Quick Chat. 183637277 bytes; ProductVersion 6.2.1 e payload 6.2.1.0; Authenticode NotSigned. SHA256 `ddb3d5c7869f448142bdf2cb79e4b70aba79e15f7bf739f2683b606f4e3371c6`, conferido independentemente contra .exe.sha256. O instalador anterior, de SHA256 11098f0e0f43f0bc7552435ca22d04a535216eb6d79c6fb2d2749187972520ac, foi preservado em release/v6/previous/6.2.1-b9c88e5/ com checksum e blockmap.

O renderer foi recompilado e as etapas oficiais de ícones/NSIS/auditoria executadas. Reutilizados os 146 testes Desktop e três cenários Electron aprovados, além da validação Cloud/Python anterior sem alterações. O backend congelado foi reutilizado somente após confirmar ausência de diferenças em backend, Cloud e dependências desde b9c88e5 e executar self-check. Auditoria de fontes/ASAR/runtime aprovada. O payload final iniciou com PATH sem Node/Python, autenticou localmente e preservou dados após reinício, usando exclusivamente perfil temporário. Sem instalação sobre o perfil pessoal, chamadas pagas, tag ou GitHub Release. Não equivale a Windows limpo.

Evidências locais: build/v6/cyro-setup-6.2.1-layout.log, cyro-6.2.1-layout-selfcheck.log, cyro-6.2.1-layout-payload-smoke.log, layout-deployment-runtime.json, layout-deployment-latest.json e layout-production-check.json. A documentação final também foi enviada ao GitHub; o runtime permanece o mesmo validado. Backup/ preservado.

# Ajustes de layout após a entrega 6.2.1

Configurações da conversa organizadas em campos e rodapé: Salvar conversa separado das quatro ações secundárias, grid com gap de 8 px, margem de 24 px após os campos, redução controlada em janelas baixas e foco/cores preservados. Sidebar usa cabeçalhos de 44 px com coluna fixa de 32 px para adição, padding simétrico, fundo de grupo unificado e gutter de rolagem estável. Textos/ícones e ações dos projetos seguem as mesmas colunas.

Quick Chat media scrollHeight da área flexível, acumulando altura que não pertencia ao texto. Agora mede um bloco interno de conteúdo mais o cabeçalho/rodapé/padding reais, com ResizeObserver e deduplicação. O intervalo fixo de 8 px entre as janelas foi removido, e a geometria limita os dois painéis à área útil em telas baixas. Opacidade, leitura, áudio e fixação foram preservados.

Validação executada: TypeScript/build Desktop, 146 testes Desktop e cenários Electron principal, Quick Chat e clipboard aprovados. A geometria confirmou ações de adição alinhadas, nenhum botão sobreposto no modal, 24 px de separação dos campos, resposta curta abaixo de 200 px e janelas adjacentes sem faixa vazia. Também verificou monitores com coordenadas negativas e painel de clipboard grande em área útil de 600 px. Capturas cyro-manage-dialog-layout.png e cyro-quick-compact-response.png conferidas visualmente. Logs build/v6/layout-desktop.log, layout-main-final.log, layout-quick-final.log e layout-clipboard-final.log. Um teste que forçava resize nativo fora da UI foi substituído por uma verificação da estabilidade do layout realmente exposto ao usuário.

Nenhuma alteração Cloud/Python, dependência, permissão, dado de usuário ou Backup/. Serviços externos dos cenários são sintéticos. Sem novo instalador, push, tag ou deploy; a entrega publicada 6.2.1 anterior não inclui este ajuste. Referências paginas.html/styles.css regeneradas.

# Entrega 6.2.1 — publicação Cloud e instalador Windows

Em 29/10/2026, por autorização explícita do proprietário, o runtime b9c88e58aad776e0100cd551ee24cd1d72a958a2 foi enviado a origin/master e origin/codex/jarvis-v6-architecture. Vercel success às 07:49:31 America/Sao_Paulo (10:49:31 UTC): https://vercel.com/rodrigo-juniors-projects/cyro-ia/9aZ9jV7ASkxYEECsRkAnWn4eCq3j . Produção https://cronosjarvis.vercel.app/login respondeu 200 e o CSS confirmou os tokens --accent:#38bdf8 e --surface:#1b2432; /api/provider-settings sem sessão retornou 401. Sem migrations, alteração de banco/segredos ou chamadas pagas. A documentação final de entrega também foi enviada, sem alterar o runtime validado.

Instalador: release/v6/Cyro-IA-Setup-6.2.1.exe, 183636952 bytes, ProductVersion 6.2.1 e payload 6.2.1.0. SHA256 `11098f0e0f43f0bc7552435ca22d04a535216eb6d79c6fb2d2749187972520ac`, conferido independentemente contra .exe.sha256. Authenticode NotSigned. PyInstaller, NSIS e auditoria de fontes/ASAR/runtime aprovados. As etapas oficiais de empacotamento reutilizaram os 489 testes, sete cenários Electron e 56 verificações de layout, além das verificações focadas finais já aprovadas, sem repeti-las. Uma primeira conferência dos logs foi interrompida antes da compilação por codificação de console; a leitura foi corrigida, sem alterar fontes ou testes.

Self-check do serviço congelado aprovado. O payload final iniciou sem Node/Python no PATH, autenticou localmente e preservou dados após reiniciar com perfil temporário. Não houve instalação sobre o perfil pessoal. Não certifica Windows limpo, login manual em produção com credenciais do proprietário, áudio físico, conta Spotify real ou qualidade de IA paga. Instaladores anteriores e Backup/ preservados; sem tag ou GitHub Release.

Evidências locais: build/v6/cyro-setup-6.2.1.log, cyro-6.2.1-frozen-selfcheck.log, cyro-6.2.1-payload-smoke.log, v621-deployment-runtime.json, v621-deployment-latest.json e v621-production-check.json.

# Validação 6.2.1 — anexos, menus, configurações e escopo

Em 29/10/2026, check:v6 passou com 489 testes: 146 Desktop, 214 backend Python, 92 Cloud, 35 iniciadores/empacotamento e 2 ferramentas Node. Também passaram TypeScript/build Cloud e Desktop, sete cenários Electron e 56 verificações administrativas em Chromium (40 originais e 16 adicionais em tema claro). Prettier Desktop e git diff --check aprovados. Após identificar o gatilho antigo de indexação no salvamento do escopo, foram executados novamente os 25 testes de projetos e o cenário principal Electron, todos aprovados. Os 25 não são somados novamente ao total de 489. Após fixar a tipografia e o estilo dos botões do cartão para evitar herança diferente no Quick Chat, os 19 testes React e os cenários Electron de clipboard/principal passaram novamente; também não são somados em duplicidade.

AttachmentCard agora é compartilhado por clipe, Ctrl+V de imagem, drop e monitor de clipboard para textos/imagens. Electron verificou raio 10 px, padding 8 px, ações e ausência de overflow; a miniatura usa 64×64/contain/raio 6 px. Imagem colada tem aviso de privacidade local. Testes verificaram contagem de cinco, tamanho máximo, descarte após trocar contexto, formato real, caminhos/nomes inválidos, isolamento por conta e importação sem chamada ao modelo. Drop usa bytes e nome simples em IPC dedicado e validado; o serviço genérico não admite a rota. Prévia de documento é texto local limitado a 4.000 caracteres; prévia indisponível não elimina anexos antigos.

O monitor conserva TTL, baseline e exclusividade; só Salvar cópia grava em destino escolhido nativamente e revalidado. Adicionar ao chat importa a prévia PNG reduzida para anexos protegidos, sem enviar a mensagem. A versão original pode ser anexada pelo clipe/drop. Quick Chat compartilha a aparência e cópia local, mantendo envio de imagens no chat principal. O painel foi conferido dentro de 480 px sem overflow; o limite antigo de 340 px do teste foi atualizado por causa do cartão comum, sem alterar o limite real do controlador.

Menus da sidebar e dos três pontos contêm Editar, Mensagens anteriores, Arquivar/Restaurar, Limpar e Excluir. Confirmações nativas existentes foram preservadas. Teste de cancelamento mantém conversa e rascunho; abrir edição na mesma conversa não navega nem limpa a digitação. Destruição de conversas fixas e ações incompatíveis com Writer permanecem bloqueadas. Limpar preserva título/instruções pelo serviço existente. As oito categorias de Settings permanecem; armazenamento bloqueado alerta, títulos arquivados têm itálico e Sobre mostra 6.2.1 e link do repositório.

Os tokens Desktop e Cloud correspondem às cores especificadas para os dois temas. Capturas do cartão principal, clipboard Quick e painel Cloud claro foram conferidas visualmente. Nas combinações calculadas, os contrastes variam de 4,67:1 (hover de botão claro) a 7,49:1; não é auditoria WCAG integral. Abrir/selecionar/salvar escopo usa metadados locais e não enfileira IA. Reabrir projeto em estado selecting também não enfileira; Atualizar memória é a ação explícita de análise. Aceite de parcial e seleção de documentos Writer continuam existentes. O teste de projetos confirma zero chamadas do provedor antes do refresh e uso do cache na reutilização.

Evidências locais: build/v6/v621-check.log, v621-desktop-second.log, v621-attachments-second.log, v621-projects-final.log, v621-main-final.log, v621-clipboard-electron-final.log, v621-admin-layout.log, v621-format-final.log e v621-contrast.json. O Cloud/IA/OAuth dos cenários é sintético; não certifica conta Spotify real, áudio físico, modelo pago, Operations em produção ou Windows limpo. Dependências não mudaram; npm ci da raiz já havia sido concluído. cloud/next-env.d.ts foi restaurado byte a byte após o build. Sem migrations, alterações em Backup/, push, deploy, tag, release ou novo instalador nesta etapa. Referências paginas.html/styles.css regeneradas.

# Entrega 6.2.0 — Cloud e instalador Windows

Em 28/10/2026, mediante autorização explícita do proprietário, b527b56f737104928e280474cd13b11423c80a14 foi enviado a origin/master e origin/codex/jarvis-v6-architecture. Vercel success às 17:01:18 America/Sao_Paulo (20:01:18 UTC): https://vercel.com/rodrigo-juniors-projects/cyro-ia/5CEHNofgLSFwxwnzjex2ScRoajA7 . Login em https://cronosjarvis.vercel.app/login respondeu 200; CSS de produção confirmou --muted:#a6afbd e --accent:#7dd3fc; /api/provider-settings sem sessão respondeu 401. Sem alterações de segredos, banco ou migrations; nenhuma chamada paga.

Instalador local: release/v6/Cyro-IA-Setup-6.2.0.exe, 183634624 bytes, ProductVersion 6.2.0 e payload 6.2.0.0. SHA256 `3a2ef365c041d31ee6ae9bf4df11538c13a424a1805b6d4ed40450911c416fe2`, conferido independentemente contra .exe.sha256. Authenticode NotSigned. Compilação PyInstaller, montagem NSIS e auditoria de fontes/ASAR/runtime aprovadas. O pipeline de empacotamento reutilizou explicitamente os 483 testes, sete cenários Electron e 40 verificações de layout já aprovados nesta revisão, executando as etapas oficiais de freeze, ícones, empacotamento e auditoria sem repetir a validação.

Self-check do serviço congelado aprovado. O payload final iniciou com PATH sem Node/Python, autenticou localmente e preservou dados após reiniciar, usando somente perfil temporário. Não equivale a instalar/atualizar em Windows limpo, testar login manual com credenciais de produção, auditar todos os leitores de tela ou validar áudio/IA pagos. Nenhum perfil pessoal ou conteúdo de Backup/ foi alterado. Instaladores anteriores preservados. Sem tag/GitHub Release. O registro final de entrega é local para não iniciar novo deploy sem mudança de runtime.

Evidências: build/v6/cyro-setup-6.2.0.log, cyro-6.2.0-frozen-selfcheck.log, cyro-6.2.0-payload-smoke.log, v620-deployment-latest.json e v620-production-check.json.

# Validação 6.2.0 — refinamento visual global

Em 28/10/2026, foram aprovados 483 testes (142 Desktop, 212 backend Python, 92 Cloud, 35 iniciadores/empacotamento e 2 ferramentas Node), TypeScript/build Cloud e Desktop, sete cenários Electron e 40 verificações administrativas em Chromium. O pipeline check:v6 concluiu testes/builds/Python e parou em uma expectativa antiga do foco do Quick Chat; a expectativa foi atualizada para exigir contorno sólido de 2 px sem sombra. Todos os sete cenários Electron e a matriz administrativa foram então executados novamente e aprovados. Não foi repetida a parte já aprovada de testes/builds. A consistência final do repositório confirmou 6.2.0. Prettier Desktop e git diff --check aprovados.

Sidebar: ícones SVG de adição/expansão e colunas fixas. Chromium confirmou alinhamento dos botões de conversas/projetos e menus fora da sidebar, sem cortes em 1366×738 e 800×600, além de setas e Escape. Popovers usam AnchoredMenu por portal no body, medição real, inversão de lado/altura, limite à janela e fechamento por clique externo, Escape, Tab, redimensionamento ou rolagem de ancestral da âncora. A rolagem automática do chat não fecha o menu do Writer. O menu Arquivo foi validado antes de exportar DOCX; fluxos de versões, edição, conflito, recuperação e persistência continuaram aprovados.

Raios de controles/painéis em 8/12 px, escala de espaçamento comum, foco sem glow e composer com ações separadas por 12 px. Cloud, login e Quick Chat receberam a mesma família visual e tipográfica. A folha do Writer mantém o documento claro; blocos de código continuam escuros nos dois temas. Seis combinações calculadas apresentaram contraste de 5,70:1 a 9,62:1: Desktop escuro 7,05; Desktop claro 5,70; Cloud 8,07; cabeçalho de código 8,88; comentários 8,55; botão Cloud 9,62. Não equivale a auditoria integral WCAG.

Capturas de menus, chat compacto e Writer foram conferidas visualmente. Referências paginas.html/styles.css atualizadas para 3 HTMLs, 33 fontes React e 18 CSSs, sem substituir as entradas do aplicativo. Dependências não alteradas; npm ci da raiz já executado no ciclo anterior. Sem migrations, alterações em Backup/ ou chamadas pagas. Os cenários usam Cloud/IA/OAuth sintéticos; não certificam Windows limpo, audição física, qualidade paga de IA ou Operations reais. Publicação e compilação 6.2.0 autorizadas pelo proprietário após esta validação; resultados da entrega serão registrados separadamente.

Evidências locais: build/v6/ui-polish-check.log, ui-polish-electron-final.log, ui-polish-admin-final.log, ui-polish-format-final.log e ui-polish-contrast.json. Capturas do Writer em jarvis-writer-smoke-6bEuBg, sidebar/chat em cyro-sidebar-*.png e cyro-v603-chat-*.png no diretório temporário. cloud/next-env.d.ts foi restaurado byte a byte após o build.

# Entrega 6.1.2 — Cloud e instalador Windows

Em 28/10/2026, por autorização explícita do proprietário, a revisão e4c4f3b2e1a9b63a502fa1a3913dfb83fc686122 foi enviada a origin/master e origin/codex/jarvis-v6-architecture. A Vercel confirmou success às 16:30:10 America/Sao_Paulo (19:30:10 UTC): https://vercel.com/rodrigo-juniors-projects/cyro-ia/9MNGAvei8tYFX3XAtGos43JoSxre . Produção https://cronosjarvis.vercel.app/login respondeu 200 com marca Cyro; /api/provider-settings sem sessão respondeu 401. Não houve alteração de banco, migrations, segredos ou configurações privadas.

O pipeline oficial tools/build_cloud_desktop.py passou check:v6 com 483 testes (142 Desktop, 212 Python backend, 92 Cloud, 35 iniciadores/empacotamento e 2 ferramentas Node), TypeScript/build Cloud e Desktop, sete cenários Electron e 40 verificações administrativas em Chromium. Prettier final aprovado após normalizar quebras de linha, sem alteração semântica. Dependências não foram alteradas; npm ci na raiz havia sido executado na etapa 6.1.0. cloud/next-env.d.ts restaurado byte a byte após a compilação.

Instalador: release/v6/Cyro-IA-Setup-6.1.2.exe, 183632802 bytes. ProductVersion 6.1.2 e payload 6.1.2.0. SHA256 `8d9d7f63defb2b0009144b17ae28f27e285e10c48b37935cabf3f2817073e264`, conferido independentemente contra .exe.sha256. Authenticode NotSigned. Auditoria de fontes/ASAR/runtime e self-check congelado aprovados. Smoke do payload final passou: inicialização sem Python/Node no PATH, autenticação local e persistência após reinício, exclusivamente com perfil temporário. Sem chamadas pagas ou instalação sobre o perfil pessoal.

Inclui as correções 6.1.1 e todos os ajustes posteriores da sidebar, busca das integrações, remoção de Computador/Conta, cabeçalho ciano e X, e ícone azul. Nenhum conteúdo de Backup/ foi modificado. Instaladores anteriores preservados. Não certifica Windows limpo, atualização de atalhos fixados/cache Windows, áudio físico, OpenAI paga, login manual de produção ou Operations do provedor. Sem tag ou GitHub Release. O registro de entrega posterior é local para evitar novo deploy sem mudança de runtime.

Evidências locais: build/v6/cyro-setup-6.1.2.log, v612-format-final.log, v612-deployment-latest.json, v612-production-check.json, cyro-6.1.2-frozen-selfcheck.log e cyro-6.1.2-payload-smoke.log.

# Ícone Windows — 6.1.1

Ícone da janela de desenvolvimento definido explicitamente por desktop/assets/cyro.png; produção continua usando o recurso jarvis.png e o ICO do executável. O gerador existente foi atualizado para a paleta do Quick Chat (#8ee0ff sobre #122b3b). PNG/ICO gerados e PNG conferido visualmente. Build e 142 testes Desktop passaram (build/v6/v611-taskbar-tests.log). Não foi alterado appId, nome do executável ou perfil. Não validada a atualização de atalhos fixados/cache de ícones do Windows. Instalador anterior não recompilado, sem push/deploy.

# Cabeçalho das configurações — 6.1.1

Marca CYRO IA em ciano no tema escuro e fechamento por X com área de 44×44 px, nome acessível e tooltip. Mantidos onClose e Escape. TypeScript, build Desktop e cenário Electron Spotify com fechamento/reabertura das configurações passaram (build/v6/v611-settings-header.log). Sem recompilar instalador, push ou deploy.

# Correção visual da busca de integrações — 6.1.1

O seletor geral de inputs da página de configurações sobrepunha o estilo da busca composta das integrações, criando borda e fundo internos limitados a 680 px. A exceção específica remove a borda/fundo internos e o limite de largura, mantendo o contorno externo e o foco acessível. Build Desktop e cenários Electron principal e Spotify passaram; captura cyro-v603-integrations.png conferida visualmente. Logs build/v6/v611-integrations-search.log e v611-integrations-search-main.log. Apenas CSS, sem mudança de serviços ou dependências; sem recompilação do instalador, push ou deploy.

# Ajuste visual da sidebar — 6.1.1

Sidebar refatorada com indentação sem conectores, conversa ativa com borda interna de 2 px, grupo de projeto discreto, títulos truncados e tooltip, espaçamento uniforme e rodapé separado. Mantidos busca, navegação, menu de contexto, projetos recolhíveis e preferências existentes. A paleta usa variáveis de tema e hover suave, sem glow.

Validação executada: TypeScript Desktop, build, 142 testes Desktop e cenário principal Electron com navegação/temas e layouts 1366×738 e 800×600 aprovados. Capturas finais cyro-v603-chat-1366.png e cyro-v603-chat-800.png conferidas visualmente. Logs locais build/v6/v611-sidebar-unit.log e v611-sidebar-electron-final.log. Não foram adicionados testes que apenas reproduzem CSS. Cloud/Python não foram alterados; a validação completa anterior está registrada abaixo. Instalador 6.1.1 anterior não foi recompilado com este ajuste. Sem push, deploy ou alteração de Backup/.

# Validação 6.1.1 — configurações e colagem de imagens

Em 28/10/2026, o pipeline oficial check:v6 passou com 483 testes: 142 Desktop, 212 backend Python, 92 Cloud, 35 iniciadores/empacotamento e 2 ferramentas Node. Também passaram TypeScript/build Cloud e Desktop, sete cenários Electron e 40 verificações administrativas em Chromium real. Prettier Desktop aprovado. Não houve mudança de dependências; a instalação npm ci da raiz já havia sido concluída na etapa 6.1.0.

O erro de Área de transferência era uma referência indevida a orb no componente de configurações; a referência foi removida, preservando o comportamento do botão flutuante. O limite de erro por categoria mantém navegação, retorno e tentativa de recuperação. Testes React cobrem os controles, falha de renderização, recuperação e troca de categoria. O cenário Electron abriu e salvou preferências com monitoramento desativado e confirmou a página inteira em 1000×800 e 640×600, sem overflow horizontal do documento/conteúdo. Capturas settings-full-1000.png e settings-full-640.png foram conferidas visualmente no diretório temporário jarvis-clipboard-smoke-gXvvgw.

Ctrl+V de imagem foi validado no chat principal com PNG real gerado no teste, miniatura carregada, remoção e ausência de envio automático. Texto comum mantém o comportamento nativo. A importação local valida formato, bytes e limite de 5 MB, usa armazenamento existente por conta e respeita cinco anexos. Testes recusam caminhos, URLs, tipos indevidos, conteúdo inválido, excesso de tamanho e acesso entre contas; uma resposta tardia após limpar/trocar contexto é descartada. Writer e Quick Chat não recebem esta função nesta entrega. Não há leitura automática do clipboard nem chamada ao Cloud/IA na colagem.

Evidências locais: build/v6/cyro-setup-6.1.1.log, v611-desktop.log, v611-attachments.log, v611-main-electron.log e v611-clipboard-electron.log. Cloud/IA/OAuth dos cenários são sintéticos; não certificam envio de imagem a modelo pago, áudio físico, Windows limpo ou Operations reais. Sem migrations, alterações em Backup/, push, tag, release ou deploy nesta revisão.

Instalador local 6.1.1 concluído pelo pipeline oficial: release/v6/Cyro-IA-Setup-6.1.1.exe, 183631868 bytes, ProductVersion 6.1.1 e payload 6.1.1.0. SHA256 `fadbc9233d8bdd93602d87db0688058695e82b093c6a76ec48ff6ed199dfd3fa`, conferido independentemente contra .exe.sha256. Authenticode NotSigned. Auditoria de fontes/ASAR/runtime aprovada. O self-check do backend congelado e o smoke do payload final passaram: inicialização com PATH restrito sem Python/Node, autenticação local e persistência após reinício, exclusivamente com perfil temporário. Logs adicionais: build/v6/cyro-6.1.1-frozen-selfcheck.log e cyro-6.1.1-payload-smoke.log. Não equivale a instalar/atualizar em Windows limpo. O perfil pessoal e os instaladores anteriores foram preservados. O arquivo cloud/next-env.d.ts foi restaurado byte a byte após a compilação. Cloud permanece na entrega 6.1.0 compatível, sem publicação desta revisão.

# Entrega do instalador e publicação Cloud 6.1.0

Em 28/10/2026, mediante pedido explícito do proprietário para gerar o instalador e publicar o Cloud, a revisão efd44eb foi enviada à master e implantada pela integração Vercel. O ajuste posterior de empacotamento d7fcfc2 também foi enviado e recebeu status Vercel success às 14:31:01 de America/Sao_Paulo. Deploy: https://vercel.com/rodrigo-juniors-projects/cyro-ia/Bmk2ahHATqbi9v2AUw28XdBv8AvU . Produção https://cronosjarvis.vercel.app/login respondeu HTTP 200 com a marca Cyro, e /api/provider-settings sem sessão retornou 401. Não foram alteradas variáveis privadas, AUTH_SECRET ou banco, nem executadas migrations, chamadas pagas ou autenticação manual com credenciais do proprietário.

Instalador local: release/v6/Cyro-IA-Setup-6.1.0.exe, 183631899 bytes. ProductVersion 6.1.0; payload Cyro IA 6.1.0.0. SHA256 `480fbb371e9dc1df3018af8bc691c6b9ac3641ac25913d7ea1e059842b34902e`, conferido independentemente contra .exe.sha256. Authenticode NotSigned. A auditoria do ASAR/runtime e o self-check do backend congelado passaram. O setup 6.0.3 anterior foi preservado.

O pipeline oficial repetiu check:v6 com 475 testes, sete cenários Electron e 40 verificações de layout. A coleta de dependências do empacotador consumia CPU por vários minutos apesar dos bundles prontos; somente o processo de empacotamento desta tarefa foi encerrado. Foi adicionado um hook suportado que valida o grafo nativo e a presença dos arquivos antes de declarar as dependências tratadas. Dois testes adicionais passaram. A etapa de empacotamento foi retomada com o runtime congelado já validado, sem repetir a compilação Python. A montagem NSIS e a auditoria concluíram normalmente.

O smoke de inicialização/reinício do payload final foi tentado, mas recusou executar porque 127.0.0.1:8765 estava ocupada. Nenhum processo externo foi encerrado. Portanto, abertura/reinício desta entrega empacotada, exportação rica no serviço congelado e Windows limpo NÃO foram declarados aprovados. Os cenários equivalentes de Writer em Electron/FastAPI de desenvolvimento passaram conforme a matriz abaixo. Feche o Cyro antes de instalar; o setup não foi executado sobre o perfil pessoal.

Evidências locais: build/v6/cyro-setup-6.1.0.log (validação e freeze), cyro-setup-6.1.0-packaging.log (NSIS final), cyro-6.1.0-artifact-audit.log, cyro-6.1.0-frozen-selfcheck.log, cyro-6.1.0-payload-smoke.log (bloqueio de porta) e v610-deployment-latest.json. Publicação por Git autorizada para esta entrega, sem tag ou GitHub Release. O registro de entrega posterior é local para não disparar outro deploy sem mudança de runtime.

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
