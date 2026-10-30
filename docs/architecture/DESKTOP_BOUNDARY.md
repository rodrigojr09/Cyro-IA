# Limite do Desktop

O repositório Cyro-IA mantém seu histórico, appId, executável, caminhos JARVIS, sessões e IPC. Não é um monorepo dos três produtos.

- desktop/: Electron e interface, Quick Chat, notificações, clipboard, voz, ferramentas Windows e atualizador.
- backend/: nome histórico do runtime Python **local**; ferramentas e acesso autorizado a fontes/projetos/Writer locais. Não é o projeto cyro-backend.
- tools/: inicialização, validação e geração do Setup.exe. npm ci é executado na raiz. A pasta desktop contém o pacote Electron interno do mesmo produto, sem workspace Cloud.
- JARVIS_CLOUD_ORIGIN: origem da API central do cyro-backend; conservar nome da variável para compatibilidade. HTTPS obrigatório em distribuição, loopback permitido em desenvolvimento. Nenhuma chave administrativa deve ser configurada aqui.

Inicie Backend e Cloud em seus próprios projetos. Defina JARVIS_CLOUD_ORIGIN e execute start.bat ou npm run dev. O iniciador Desktop não inicia nem encerra outros projetos. Login e atualizações conservam URLs /api/device/* e /api/updates/*.

Validação local: npm run check:v6 (compatibilidade do nome); instalação e build não devem depender de Vercel, banco, Redis ou diretórios dos outros projetos. Setup: configurar origem HTTPS e executar build.bat. Não sobrescrever instaladores anteriores antes de nova versão validada.

O modo distribuído e os iniciadores oficiais utilizam exclusivamente a API central, com sessão individual. Existem módulos e testes legados de execução local com chave pessoal que continuam precisando de revisão para retirar completamente esse modo do código; isso não deve ser confundido com uma homologação da centralização integral. Fontes locais não podem ser movidas ou enviadas à VPS sem respeitar autorização do usuário.

Para distribuição dos três produtos, seguir o plano de transição e rollback no README do Backend: API paralela, homologação, painel e depois Desktop; manter API/instaladores anteriores durante a transição. Nenhuma produção é alterada automaticamente.
