# Migração e reaproveitamento v3

Em 20/10/2026 o proprietário colocou manualmente todo o projeto anterior em Backup/. A pasta é somente leitura e não foi movida, renomeada, apagada ou editada na reconstrução atual. O conteúdo inclui a implementação anterior e o trabalho preliminar Cloud. O manifesto histórico dentro do arquivo pertence à etapa anterior; não representa um backup novo criado nesta etapa.

Foram copiados para a nova raiz 163 arquivos de fontes/configuração/documentação reaproveitáveis, sem .git, node_modules, ambientes virtuais, builds, caches, .env, bancos pessoais, arquivos de contexto privados ou inventários locais. Dependências foram reinstaladas na nova raiz. O histórico Git anterior foi clonado localmente sem hardlinks e mantido no novo .git, sem executar push. Nenhum código de produção importa módulos diretamente de Backup/.

## Componentes reaproveitados

- desktop/: janela nativa, sidebar, chats/projetos, Markdown sanitizado, configurações/temas, Quick Chat e ícone independentes, áudio, bandeja, IPC por papel e validação de links.
- backend/: ProjectStore/SQLite, contexto, indexador, IDEIA.md por projeto, leitura somente autorizada, políticas de fontes e confirmações humanas com prazo e uso único.
- O FastAPI local foi mantido por preservar armazenamento, migrações, análise e ferramentas já testados, e não apenas por conveniência. Ele é empacotado; não exige Python instalado no cliente. Não roda na Vercel.
- desktop/electron/ e services/: entrada v3, credencial DPAPI, ativação/código/deep link, conexão/renovação e transmissão segura para a interface.

A entidade Client é uma especialização de User com a mesma chave: User guarda identidade, papel e status; Client guarda os limites de dispositivos e tem relações próprias com dispositivos e ativações. Administradores não recebem Client. IDs de dados locais não são IDs administrativos: os dados de clientes diferentes não são mesclados; um perfil ativado não permite trocar silenciosamente de cliente.

## Dados e histórico

Nenhum perfil externo foi importado. O padrão novo é APPDATA/JARVIS, fora dos binários. Backup/ contém segredos e memória antiga e é integralmente ignorado pelo Git. Não publicar nem incluir no instalador/Vercel. Backups locais devem ser feitos com todos os processos do aplicativo encerrados.

Para reutilizar memória SQLite anterior não criptografada, fazer cópia externa offline e selecionar explicitamente JARVIS_DATA_DIR absoluto. Não usar bancos de cofre portátil como SQLite comum: sua migração exige fluxo humano separado. Não apagar nem sobrescrever originais. O instalador NSIS mantém dados fora da instalação e preserva-os na desinstalação; validar esse fluxo com dados temporários em Windows limpo antes de declarar release.

Metadados atuais: 3.0.0, sem tag de release até validação externa. As referências portáteis remanescentes são históricas/testes e não são o pipeline de distribuição vigente.
