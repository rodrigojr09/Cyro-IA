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
