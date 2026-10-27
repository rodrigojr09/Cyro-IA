# Integrações — JARVIS v5

Configurações → Integrações reúne o catálogo tipado, pesquisa por nome/categoria/descrição, filtros por estado e detalhes na janela atual. Discord, Google Calendar, GitHub, Notion e Google Drive continuam **Em breve**, sem conexões simuladas.

Spotify possui implementação própria de OAuth e controles Cloud, com estado consultado pela sessão individual, conectar/cancelar, testar e desconectar. Veja [SPOTIFY.md](SPOTIFY.md) para configuração, arquitetura, scopes, segurança, testes e limitações. A validação real depende das credenciais e de uma conta autorizada; não foi realizada nesta entrega.

O catálogo fica em `desktop/integration-catalog.ts`, a página em `desktop/integrations-ui.ts`, a interface de conta Spotify em `desktop/spotify-ui.ts` e o transporte restrito em `desktop/spotify-ipc.js`. Tokens e Client Secret permanecem exclusivamente no Cloud. `vendor-entry.js` compila a interface das configurações. Os painéis e o bundle antigo de reprodução do Quick Chat foram removidos: o controle é pelo chat, usando o mesmo serviço Cloud para os dois ambientes. Pesquisa/filtros usam estados reais; mudar o status de uma definição não cria uma conexão.

Os estilos reutilizam temas, bordas, foco e responsividade existentes. A marca Spotify vem do kit oficial local; os outros ícones seguem Lucide. Backup/ permanece intocado e a versão global é 5.0.0.
