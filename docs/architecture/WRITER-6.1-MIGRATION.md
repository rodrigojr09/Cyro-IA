# Cyro IA 6.1.0 — plano e auditoria do Writer

28/10/2026. Base Git b7da82d, versão 6.0.3. Única alteração preexistente: cloud/next-env.d.ts; preservar bytes e não incluir nos commits. Backup/ não será lido nem modificado.

## Auditoria

O renderer React atual apresenta blocos como editores separados e usa debounce de 350 ms. writer_nodes.blocks guarda uma lista JSON ordenada de Block(id,type,text) em SQLite por projeto. writer_revisions guarda snapshots comprimidos antes/depois, versão, origem e operação; writer_proposals guarda planos e revisões de origem; writer_messages é independente. writer_requests fornece idempotência. Existem arquivos vinculados com hash/conflito, pastas, exportação DOCX/MD/TXT, revisões, restauração, desfazer/refazer persistidos e aprovação de propostas. Writer utiliza system_prompt/identidade compartilhada, memória de projeto e o cliente Cloud existente, sem chave OpenAI local. O banco Prisma não armazena os documentos locais do Writer.

## Decisão e migração segura

TipTap/ProseMirror será o único editor visual. Um documento lógico possui nós de formatação internos, nunca controles individuais. Os identificadores técnicos servem somente para mapear operações e não serão exibidos. Acrescentar representação rica opcional aos nós persistidos mantém as colunas, identificadores, ordem, associações, snapshots e documentos anteriores. Dados legados são adaptados na leitura; somente uma edição explícita salva a representação rica numa revisão nova. Não haverá remoção de conteúdo ou migração destrutiva. A lista interna passa a ser a projeção serializada dos nós superiores de um documento ProseMirror, não uma coleção de editores.

## Etapas

1. Contrato rico validado, leitura legada e exportação fiel; testes Python.
2. Editor TipTap contínuo, formatação essencial e painel documento principal/chat lateral; remover implementação visual antiga.
3. Histórico de operações do editor, seleção precisa, comandos de chat e aprovação/conflitos; autosave de 1500 ms, recuperação e revisão otimista.
4. Testes de interação Electron, regressões, eficiência de requisições e compatibilidade de exportação.
5. Documentação, evidências reais e commits lógicos da v6.1.0. Sem push, tag ou publicação automática.

## Invariantes

Perguntas não escrevem. Respostas não viram conteúdo sem intenção clara. Aprovação não pode sobrescrever edição posterior à revisão da proposta. Histórico de mensagens não é apagado por undo. Undo específico de IA deve preservar edições manuais posteriores ou pedir esclarecimento. Editor não é reconstruído ao salvar. Não há chamada ao banco por tecla, IA duplicada ou segunda memória. Falha de gravação preserva o rascunho e impede navegação destrutiva. Restaurar versão exige confirmação.

## Validação prevista

Cobrir os 25 cenários solicitados em testes de contratos/store, editor real e Electron: vazio, digitação/parágrafos, seleção/clipboard/formatação, undo/redo chat/teclado, consulta, revisão e geração, autosave/reload/falha, legado, DOCX, restauração, conflito durante geração, projetos/isolamento e contagem de operações. Registrar limites externos; mocks não certificam IA paga ou Windows limpo.

## Checkpoint solicitado para envio ao GitHub

Em 28/10/2026, o proprietário interrompeu a implementação para solicitar o envio de todo o trabalho ao GitHub. Este checkpoint da v6.1.0 é parcial e não representa uma versão pronta: há contratos ricos, exportação inicial, editor TipTap e comandos de histórico em implementação. A instalação das dependências reportou zero vulnerabilidades e o bundle Desktop compilou, mas a nova interface, os estilos, a migração, os testes obrigatórios e a validação integrada ainda não foram concluídos. Os metadados de versão continuam na base 6.0.3 até a retomada do versionamento da 6.1.0. O setup 6.0.3 anterior não inclui estas alterações parciais.

O envio deste trabalho ocorre na branch de desenvolvimento, sem tag ou release. A alteração preexistente em cloud/next-env.d.ts permanece local, fora do commit, assim como dados, segredos, build/release e Backup/.

## Retomada da implementação — 28/10/2026

Estado inicial desta retomada: HEAD a6a7a55, árvore limpa, versão ainda 6.0.3. O checkpoint inclui alterações ricas parciais ainda não validadas. A atualização explícita do proprietário autoriza a versão 6.1.0. Preservar o checkpoint, concluir o layout documento/chat, reforçar validação e conflitos, substituir os testes dependentes da UI antiga e executar a matriz completa antes de declarar conclusão. Nenhuma leitura ou alteração de documentos pessoais será necessária: compatibilidade será verificada com fixtures legadas e novas. Exportação e histórico permanecem na mesma base local por projeto; não há migração de PostgreSQL nem destruição de colunas.

Referência técnica: https://tiptap.dev/docs/guides/performance — editor isolado e shouldRerenderOnTransaction=false para evitar reconstrução a cada caractere. O TipTap instalado no checkpoint é 3.32.0; a integração usa seus contratos e o histórico ProseMirror existentes.

## Contratos e persistência concluídos

O contrato rico opcional valida nós/marcas/links e coerência com o texto plano. Faixas de seleção simples e múltiplas preservam prefixos, sufixos, formatação e nós não selecionados. Correções pontuais sem Markdown reaproveitam os runs ricos não alterados. Exportação de recuperação usa um snapshot transitório sem gravar o documento. O teste backend/test_writer_continuous.py executou 13 cenários reais com SQLite e OOXML, incluindo legado, restauração, deduplicação, seleção múltipla, conflito durante geração e DOCX. Provedor editorial sintético, sem API paga. As 198 regressões anteriores do backend também passaram na execução de 206 casos anterior à ampliação final; a suíte completa será repetida no fechamento.

## Núcleo e memória compartilhados

O endpoint existente de completions reconhece a ferramenta writer_editorial e reutiliza summary/instructions da conversa geral do usuário autenticado. Não há tabela nova de memória, identidade alternativa ou segunda chamada ao modelo. Uma leitura owner-bound limitada é incluída na mesma requisição editorial e contabilizada na reserva de tokens. O teste de contexto verifica isolamento e limites, a suíte Cloud passou 92 casos e o TypeScript passou. Para ativar essa parte em produção será necessário publicar o Cloud 6.1.0 após autorização; não houve push ou deploy nesta tarefa.
