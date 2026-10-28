# Cyro IA Desktop 6.1.0

A interface principal, o login e os três painéis do Quick Chat usam React.js. Electron e os preloads continuam em CommonJS com IPC restrito; React não recebe acesso a Node, banco ou credenciais Cloud.

## Organização

- `scripts/app`: janela principal, entrada React e preload.
- `scripts/session`: autenticação, configuração protegida, login e estado de carregamento.
- `scripts/workspace`: catálogo, histórico em cache, projetos e navegação.
- `scripts/chat`: mensagens, campo de entrada e transporte local.
- `scripts/quick`: controlador nativo, painéis React e preload.
- `scripts/clipboard`: captura local, exclusividade e revisão humana.
- `scripts/attachment`, `writer`, `voice`, `storage`, `integrations`, `computer`: recursos correspondentes.
- `scripts/ui` e `shared`: componentes, preferências e acesso às pontes permitidas.
- `tests/unit`, `tests/renderer`, `tests/electron`, `tests/helpers`: todos os testes e seus apoios.

Instale com `npm ci` na raiz. `npm run build -w jarvis-desktop` gera os bundles locais em `dist/`. `npm test -w jarvis-desktop` verifica regras e componentes; `npm run test:electron` na raiz executa os sete cenários Electron. As dependências do renderer são compiladas, sem CDN ou servidor de desenvolvimento em runtime.

O manifesto `electron/runtime-files.json` e os dois arquivos builder enumeram o código nativo permitido. Testes e fontes JSX ficam fora do instalador. As pastas de dados, o executável e os nomes IPC legados são mantidos por compatibilidade.

O envio permanece bloqueado até o bootstrap completo e a confirmação da janela principal. Revalidar a mesma sessão mantém esse estado; logout exige nova preparação. O Quick Chat permite preparar um rascunho durante a carga, mas só envia depois da liberação.

Clipboard não oferece conteúdo anterior à ativação/retomada. Conteúdos consumidos e cópias feitas dentro do Cyro são ignorados por uma janela limitada em memória, sem gravar texto ou hashes no disco. Uma nova cópia externa continua exigindo revisão e envio humano.

O Writer 6.1 utiliza TipTap 3.32.0 como único editor. A formatação e o histórico pertencem ao documento contínuo; operações inteligentes e desfazer/refazer ficam no chat. Autosave com debounce de 1,5 segundo, revisão e recuperação local protegida. Uso e limites em [WRITER.md](../docs/WRITER.md).
