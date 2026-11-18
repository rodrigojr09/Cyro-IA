# EVs como chats de extensões — 18/11/2026

Incluído na candidata 8.5.0-rc.1. Interface implementada:

- Novo EV somente na barra lateral, abaixo do Quick Chat.
- Menu de criação com nome e tipo instalado na conta; catálogo acessível pelo menu.
- Cada EV abre seu chat único e aparece na barra lateral. Não há chat de entrada
  dos EVs nem criação de conversas adicionais dentro deles.
- Um ícone de pasta no canto do cabeçalho abre notas e arquivos. O painel começa
  fechado; não há botões Extensões/Novo EV no cabeçalho.
- Memória privada do EV + memória MAIN da conta. Arquivos privados por EV.
- Histórico buscado somente ao abrir o chat; cache limitado por sessão e EV.

Host e SDK: `cyro-backend/docs/ev/EXTENSIONS.md` no workspace. Fontes independentes:
`cyro-ev-sdk`, `cyro-ev-logistics` e `cyro-ev-example`. O Desktop só recebe
metadados do catálogo e resultados; não carrega JavaScript de extensão enviado
pelo usuário, não contém segredos e não decide autorização.

Validação: 174 testes Desktop, 221 Python, 31 de iniciadores/build, quatro de
plataforma, dois Node, typecheck/build e oito cenários Electron aprovados.
Autoteste do backend congelado e smoke do payload com autenticação local,
reinício e histórico legado sintético aprovados. Uma tentativa inicial do smoke
encerrou antes do serviço local e falhou na limpeza do cache Chromium; a repetição
completa passou. Não foi usado perfil pessoal ou serviço de IA pago. Não equivale
a homologação em Windows limpo. Capturas locais em build/v8/ev-create-menu.png,
ev-logistics-chat.png e ev-notes-panel.png.

A API precisa aplicar a migration 20261118000100_ev_extensions antes do uso.
O catálogo fica ativo junto com CYRO_EV_ENABLED=1; CYRO_EV_EXTENSIONS_ENABLED=0
permite desativá-lo explicitamente. Ver o guia do host e o registro da candidata
em versions/8.5.0-rc.1.md para o estado real da entrega.
