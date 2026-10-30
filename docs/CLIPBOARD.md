# Sugestões de imagem 6.3.1

A miniatura usa exatamente o mesmo quadrado 64px do anexo, sem textos ou ícones. Apenas a sugestão recebe opacidade de 70% e borda tracejada destacada. Clique continua aplicando ao rascunho, respeitando cinco anexos; texto sugerido continua sublinhado. Nenhum aviso fixo é exibido no cartão. Consentimento do monitor, TTL, isolamento e envio explícito mantidos. Quick Chat continua recebendo texto; imagem é anexada no chat principal. Histórico abaixo.

# Cartão compartilhado — refinamento 6.3.0

Sugestões usam AttachmentCard compacto com borda tracejada. Imagem mostra miniatura local de 36px; clicar no cartão importa para os anexos do chat principal. Texto/código/link mostram conteúdo sublinhado com fundo sutil; clicar acrescenta o texto completo entre parênteses e uma nova linha ao rascunho. Não há mais Usar separado nem expansão de prévia. Falha ou limite mantém a sugestão com erro; controles bloqueiam durante importação. Quick Chat continua recebendo texto, enquanto anexos de imagem são usados no chat principal. Consentimento, exclusividade, TTL e ausência de envio automático preservados. As seções abaixo registram comportamentos anteriores.

# Sugestão de clipboard — ajuste 6.2.2

O conteúdo recém-copiado aparece como sugestão com um botão Usar abaixo. Usar não chama a IA nem envia mensagens: texto, código e links entram no rascunho entre parênteses, seguidos de uma quebra de linha. Um rascunho existente é preservado, com uma quebra antes do conteúdo adicionado. Se ultrapassar 6.000 caracteres, a sugestão permanece disponível e informa o limite, sem truncar.

Na janela principal, Usar em uma imagem importa a prévia PNG como anexo local acima do campo; ela só é enviada após o envio explícito da mensagem. Falhas e limites mantêm a sugestão. O aviso de privacidade, consentimento, TTL, deduplicação e exclusividade continuam. O Quick Chat recebe texto no próprio rascunho; imagens continuam limitadas à prévia/cópia local e ao anexo no chat principal, conforme o contrato existente.

Os anexos pendentes ficam acima da linha compacta de digitação, com miniaturas de 40 px. Clipe à esquerda; à direita, áudio quando vazio e envio quando há texto ou anexos. Durante a resposta há cancelamento. A indicação Somente leitura foi removida do campo, sem alterar permissões de arquivos. Copiar mensagem abre exclusivamente no menu contextual da mensagem, também acessível pelo comando de contexto do teclado. As seções abaixo são histórico de versões anteriores.

# Clipboard e anexos unificados — 6.2.1

O monitor e os anexos do chat usam AttachmentCard e attachment-card, com o mesmo fundo, borda, padding e miniaturas 64×64. Textos copiados continuam permitindo revisão antes de confirmar; imagens monitoradas podem ser adicionadas ao chat principal pelo botão explícito Adicionar ao chat, sem enviar a mensagem. A imagem monitorada é uma prévia PNG reduzida, identificada como tal; para usar o arquivo original, anexe pelo clipe ou arraste-o. Ctrl+V de imagem também produz o cartão de anexo com aviso de privacidade local.

Salvar cópia abre o diálogo nativo e revalida a posse da cópia após escolher o destino. O monitor continua sem gravar conteúdo automaticamente; a gravação só acontece por Salvar cópia ou Adicionar ao chat. Os anexos importados são protegidos por conta no armazenamento local existente. Clipe, colagem e drop respeitam cinco arquivos de até 5 MB, validam conteúdo real e não chamam IA durante a importação. Texto comum colado na digitação continua texto.

Quick Chat usa o mesmo cartão para texto/imagem e permite salvar cópia local; o envio de anexos de imagem continua no chat principal. No monitor, os originais não são retidos. TTL, deduplicação, exclusividade entre janelas e ausência de captura antiga permanecem. Nenhuma cópia é enviada automaticamente. As seções abaixo registram o histórico anterior e não substituem este comportamento 6.2.1.

# Área de transferência — atualização 6.1.1

As configurações agora ocupam uma página inteira. A exceção ao abrir a categoria foi corrigida e falhas de renderização ficam limitadas à seção, preservando a navegação e o chat.

No campo de mensagem do chat principal, Ctrl+V de uma imagem cria um anexo local com prévia. Não é necessário ativar o monitoramento automático. Texto colado normalmente não muda. PNG, JPEG, WebP e GIF estático são validados pelo conteúdo; limite de 5 MB por imagem e cinco anexos por mensagem. A imagem só vai para a IA ao enviar a mensagem. Não há download de URLs/HTML de clipboard. Writer e Quick Chat mantêm os contratos anteriores; essa colagem de anexos está disponível nas conversas comuns da janela principal.

# Área de transferência — Cyro IA 6.0.3

## Uso

O monitor começa **desativado**. Em Configurações → Área de transferência, leia o consentimento, ative e salve. Há pausa, desativação, som opcional e volume; voz global desativada também silencia o aviso. Ao iniciar ou retomar o monitor autorizado, o conteúdo já existente é usado apenas como referência e não gera aviso. Textos consumidos e cópias do próprio Cyro são ignorados por até dez minutos com fingerprints limitados à memória; não há histórico persistente.

Uma cópia válida produz aviso curto e indicadores vermelhos no ícone da barra de tarefas e no ícone flutuante. Não abre janelas nem rouba foco. O primeiro ambiente acessado recebe a faixa de ações e remove os dois indicadores. Se o Quick Chat já estiver visível, recebe as ações diretamente. A janela principal recebe ao ser acessada com o Quick Chat fechado.

Clique em Texto copiado, Código copiado, Link copiado ou Imagem copiada para expandir a prévia. Ações suportadas preparam uma mensagem editável; o conteúdo só é enviado ao confirmar. Não há envio automático de clipboard à IA.

Uma nova cópia substitui a notificação pendente ou o card ainda sem ação escolhida. Depois de escolher uma ação, a edição atual é preservada e a nova cópia fica pendente. Descartar sempre está disponível. Trocar de chat não envia a prévia para a conversa errada.

## Implementação e limites

- `desktop/scripts/clipboard/manager.js`: fonte única de estado e reivindicação síncrona no processo principal.
- `desktop/scripts/clipboard/service.js`: Electron clipboard, polling único de 850 ms, overlay Windows, preferências e IPC restrito. Não exige foco Chromium para detectar mudanças.
- `desktop/scripts/clipboard/Clipboard.jsx` e `desktop/clipboard.css`: faixa compacta, ações contextuais e expansão local nos dois chats.
- Uma referência expira em até dez minutos e é limpa ao descartar, pausar, desativar, encerrar ou sair da conta. Conteúdo fica apenas em RAM; somente preferências são persistidas.
- Texto: até 5.400 unidades UTF-16 / 21.600 bytes UTF-8; mensagens preparadas continuam no limite de 6.000 caracteres. Excesso é recusado, sem truncamento silencioso.
- Imagem: PNG até 5 MB e 50 MP; prévia reduzida até 1.536 px / 350 KB. Somente visualização local, sem análise/envio de imagem pelo clipboard. Não há OCR nem filtro de credenciais nos pixels.
- URLs: apenas HTTP/HTTPS, sem credenciais e com validação local. Abrir exige confirmação; preparar análise não afirma que a página já foi lida.
- Possíveis senhas/tokens são filtrados preventivamente, sem promessa de detecção infalível. Não há histórico permanente nem conteúdo copiado nos logs.

## Verificação

Testes cobrem conteúdo repetido, atualização pendente, edição preservada, disputa entre janelas, pausa, expiração, URLs, credenciais, limites e IPC. O smoke usa Electron real, leitura nativa sem escrever no clipboard pessoal e mudanças sintéticas com ClipboardItem/Blob. Overlay e áudio silencioso automatizados não certificam aparência do shell Windows ou som físico. Roteiro manual em [VALIDATION.md](VALIDATION.md); histórico das correções em [V5-DEVELOPMENT.md](history/V5-DEVELOPMENT.md).
