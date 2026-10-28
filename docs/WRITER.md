# Cyro IA Writer 6.1.0

O Writer é o modo de documentos do Cyro. Um documento contínuo ocupa a área principal; o mesmo chat fica ao lado e pode ser redimensionado pelo separador ou pelo teclado. Em janelas estreitas os painéis são empilhados. Não há botões, identificadores ou editores individuais por parágrafo.

## Escrever e conversar

Clique no documento e digite normalmente. TipTap/ProseMirror fornece cursor, seleção, colagem, títulos, listas, negrito, itálico, sublinhado, links, alinhamento e tabelas. A barra compacta contém somente formatação; o menu Arquivo reúne exportação, versões e preferências. Ctrl+Z e Ctrl+Y/Ctrl+Shift+Z funcionam no editor.

Peça no chat: “Desfazer”, “Refazer”, “Desfaça sua última alteração”, “Qual o objetivo deste documento?”, “Corrija a gramática”, “Melhore esse texto”, “Acrescente uma conclusão” ou “Gere um relatório”. A seleção ativa é transmitida como contexto sem copiar o texto manualmente. Perguntas não aplicam alterações. Propostas ficam no chat para aprovação; geração não substitui silenciosamente um documento existente. Se uma proposta estiver pendente, aprove ou descarte antes de solicitar outra.

Uma alteração pontual preserva o restante do documento. As faixas selecionadas são validadas contra o texto e a revisão de origem. Mudanças manuais durante a resposta invalidam a aprovação da versão antiga. Desfazer especificamente uma alteração do Cyro preserva edições posteriores fora do trecho; se houver sobreposição ou reorganização ambígua, o chat explica e pede esclarecimento. Refazer reaplica operações existentes, sem chamar a IA novamente nem apagar mensagens.

## Salvamento e recuperação

O salvamento ocorre após 1,5 segundo sem digitação, não a cada tecla. A revisão de origem protege contra sobrescrita; retries na mesma sessão reutilizam o identificador da gravação. Estado de salvamento é separado da existência de propostas. Uma recuperação local protegida preserva alterações não sincronizadas. Falha de gravação impede navegação que descartaria a edição; use Tentar salvar, Copiar edição ou Exportar recuperação. Exportar recuperação utiliza o rascunho atual sem sobrescrever a versão persistida.

Há três históricos distintos: operações recentes do editor, mensagens do chat e checkpoints persistidos. Arquivo → Versões salvas permite consultar e restaurar checkpoints; restauração exige digitar RESTAURAR e preserva a versão atual no histórico. Recarregar descartando alterações exige RECARREGAR. As pastas/fontes originais só são sincronizadas por ação explícita e autorização nativa.

## Dados e compatibilidade

O documento lógico é um ProseMirror doc. Os nós superiores são serializados na coluna existente writer_nodes.blocks com id/type/text e rich opcional. IDs técnicos não são exibidos. Documentos legados são adaptados na leitura e não são regravados simplesmente por abrir. As colunas, ordem, associações, histórico e documentos removidos recuperáveis permanecem; não há migração destrutiva nem novo banco do Writer.

SQLite por projeto conserva documentos, revisões comprimidas, propostas, mensagens e recibos idempotentes. OpenAI e PostgreSQL permanecem exclusivamente no Cloud. Writer usa identidade, autenticação, permissões, contexto de projeto e cliente Cloud existentes. A memória/preferências da conversa geral do mesmo usuário são reutilizadas no endpoint comum, em uma leitura limitada por solicitação editorial, sem outro armazenamento de memória ou segunda chamada ao modelo.

Exportação DOCX produz Word editável com títulos, parágrafos, listas, marcas, links, alinhamento, tabelas simples e quebras. Arquivos antigos continuam exportáveis. Recursos Word não representáveis na importação são recusados explicitamente para proteger o original; não há promessa de fidelidade arbitrária a qualquer arquivo externo.

## Mapa

- desktop/scripts/writer/WriterPreview.jsx: editor e controles essenciais.
- desktop/scripts/writer/editor.js: esquema, adaptação legada, operações e histórico do editor.
- desktop/scripts/writer/store.js: revisão, autosave, recuperação e orquestração.
- backend/writer_rich.py: validação rica, alterações de faixas e DOCX.
- backend/writer_store.py: persistência e histórico existentes.
- backend/writer_intelligence.py: ferramenta editorial no mesmo Cyro.
- cloud/lib/writer-context.ts: leitura da memória da conta autenticada.

Plano em [WRITER-6.1-MIGRATION.md](architecture/WRITER-6.1-MIGRATION.md). Evidências em [VALIDATION.md](VALIDATION.md). O histórico anterior permanece em [WRITER-DEVELOPMENT.md](history/WRITER-DEVELOPMENT.md).
