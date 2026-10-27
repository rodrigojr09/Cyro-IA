# JARVIS Writer — v5

## Criar e conversar

No **+** ao lado do nome do projeto, escolha **JARVIS Writer**. Dê nome ao arquivo novo ou escolha um arquivo existente pelo diálogo do Windows. Cada Writer é uma conversa padrão ligada a um arquivo, com preview no lado direito; não há página separada nem seletor Escrita/Conversa. Chats gerais continuam no **+** ao lado de Conversas.

Escreva o pedido diretamente no chat. Perguntas sobre o documento podem receber resposta sem alterá-lo. Pedidos de geração ou revisão preparam alterações; o preview destaca inclusões em azul e remoções riscadas. Comentários como “muito resumido” usam o documento atual sem pedir novamente arquivo e posição já conhecidos. O campo de mensagem é limpo ao enviar, preserva o próximo rascunho durante a resposta e permite recuperar a mensagem em caso de falha.

Selecione texto no preview para limitar o contexto. A seleção permanece ao clicar no chat. Clique em **Trecho selecionado · limpar ×** para voltar a **Documento inteiro**; apenas focar um bloco não o seleciona. Sem seleção, considera o documento inteiro. Ao ultrapassar o limite de contexto, prioriza o final, de baixo para cima, e informa a leitura parcial. Não amplia o limite de contexto por causa de um documento grande.

## Aprovação e arquivo original

- **Aprovar** aplica a proposta; **Rejeitar** a descarta. Ajustar permite revisar antes de confirmar.
- Enviar a próxima mensagem aprova a proposta pendente anterior antes de consultar a IA. Para descartá-la, rejeite antes de continuar. Conflitos bloqueiam aprovação/envio; falha posterior da IA não desfaz uma aprovação já concluída.
- Edições aprovadas atualizam o arquivo original escolhido, com verificação de hash para evitar sobrescrever mudanças feitas fora do JARVIS.
- **Editar** permite edição manual com campos claros e largura completa. Aguarde **Salvo neste computador**; **Salvar no arquivo** confirma a atualização do original. Falha de gravação preserva a edição e impede o fechamento que a perderia.
- Desfazer/refazer e Revisões ficam na prévia. Restauração gera nova revisão; não remove silenciosamente o histórico confirmado.
- Exportar permite Word real (.docx), Markdown e TXT, com destino no diálogo nativo e somente conteúdo confirmado. A exportação não modifica a origem.

A inserção automática é conservadora e opt-in nas preferências: exige escrita inequívoca, adição simples ao final, ausência de seleção/conflito e preservação lexical. Mudanças criativas, estruturais ou substantivas continuam como proposta. O intervalo de cancelamento configurável é revalidado no backend. A confiança da IA não substitui autorização humana.

## Contexto, dados e limites

O consentimento do projeto autoriza uso da IA pelo Cloud, não envio automático. Só ao enviar a mensagem o contexto seletivo segue pelo cliente autenticado existente, com cotas e limites de corpo/saída mantidos. Documentos, propostas, revisões e preferências ficam no SQLite do projeto; não há mistura entre projetos. O documento continua limitado a 512 KB. Propostas expiram após 24 horas e são revalidadas antes da aplicação.

O salvamento inclui versão-base e identificador idempotente. Escritas usam transações; conflitos e alterações externas são recusados. Teclas ainda sem confirmação de salvamento podem se perder em encerramento abrupto. O preview é um editor estruturado, não uma reprodução completa do Microsoft Word. Nenhum caminho fornecido pelo modelo é executado.

## Mapa da implementação

| Módulo | Responsabilidade |
| --- | --- |
| `backend/writer_models.py` | Schemas estritos, blocos e operações permitidas. |
| `backend/writer_store.py` | Documentos, propostas, revisões e configurações no SQLite do projeto. |
| `backend/writer_intelligence.py` | Contexto seletivo e contrato editorial validado, via Cloud existente. |
| `backend/writer_files.py` | Importação, validação de arquivo e proteção contra alteração externa. |
| `backend/writer_api.py` | API local autenticada; não é uma API pública do Cloud. |
| `backend/writer_export.py` | DOCX com python-docx, Markdown/TXT e publicação atômica. |
| `desktop/writer-ipc.js` | IPC restrito à janela principal e diálogos de arquivo. |
| `desktop/writer-ui.js` e `writer.css` | Integração com chat, preview, seleção e comparação segura. |

O contrato `writer_editorial` usa função nominal, schema estrito e apenas uma chamada validada. A resposta é dado editorial, não permissão para executar ferramentas. O frontend renderiza texto sem executar HTML retornado pelo modelo.

## Validação e limitações

A suíte completa inclui testes transacionais, conflito, escopo, contexto parcial, seleção, aprovação ao continuar, falha de rede e contratos inválidos. O smoke usa Electron, IPC, FastAPI, SQLite, arquivos e exportação DOCX reais, com IA sintética e dados temporários. Testes OOXML reabrem documentos para verificar conteúdo e formatação; isso não equivale a inspeção visual no Word/LibreOffice. Não houve certificação da IA paga ou Windows limpo.

Execute `npm run check:v5` ou o smoke específico `npm run test:writer -w jarvis-desktop`. Resultados vigentes em [VALIDATION.md](VALIDATION.md). O [histórico de desenvolvimento](history/WRITER-DEVELOPMENT.md) registra a evolução e testes anteriores, inclusive comportamentos substituídos.
