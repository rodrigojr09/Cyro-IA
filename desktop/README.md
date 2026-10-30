> Após a separação 6.4.0, instruções de workspace/Cloud integrado abaixo são históricas. Consulte o README da raiz e os READMEs independentes de cyro-backend/cyro-cloud para configuração e deploy atuais.

# Cyro IA Desktop 6.3.0

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

## Padrão visual 6.2

Use tokens.css para espaçamentos/raios, ui.css para superfícies e foco e sidebar.css para a navegação. AnchoredMenu.jsx renderiza popovers por portal, mede a janela, protege bordas e oferece Escape/setas/Home/End. A sidebar ancora o menu lateralmente; o Writer usa abaixo do botão, com inversão quando necessário. Rolagem só fecha o menu se mover sua âncora. Não reintroduzir menus absolutos dentro de painéis com overflow nem hover específico por símbolo Unicode.

Os blocos de código mantêm fundo escuro nos dois temas; textos secundários são controlados por tokens. A folha clara do Writer preserva a aparência de documento.

## Fluxos 6.3.0

AttachmentCard é a única apresentação de anexos e clipboard; importações locais por clipe/colagem/drop não chamam IA. A análise só acontece no envio explícito. Salvar cópia do monitor exporta texto ou a prévia reduzida, com diálogo nativo e verificação de posse. As oito categorias permanecem sem Computador/Conta. O menu dos três pontos agora compartilha as cinco ações da sidebar.

ScopeDialog salva apenas seleção local; Atualizar memória inicia indexação. Reabrir um projeto com seleção nova não inicia IA automaticamente. Atualize a mensagem de interface junto ao contrato do endpoint se esse fluxo mudar.
