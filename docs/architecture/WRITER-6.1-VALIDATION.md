# Matriz de validação — Writer 6.1.0

28/10/2026. Cenários com TipTap/ProseMirror, Electron e FastAPI/SQLite reais; respostas editoriais sintéticas e dados temporários. As referências abaixo identificam os testes executados, não certificam qualidade de um modelo pago ou Windows limpo. Resultado consolidado e limites em [VALIDATION.md](../VALIDATION.md).

| # | Cenário solicitado | Evidência |
|---|---|---|
| 1 | Documento vazio | backend/test_writer_continuous.py, criação e geração inicial |
| 2 | Digitação contínua | desktop/tests/renderer/editor.test.cjs e tests/electron/writer-smoke.cjs |
| 3 | Múltiplos parágrafos | Enter no Electron e splitBlock no editor real |
| 4 | Seleção | TextSelection do ProseMirror, Ctrl+A nativo e faixas validadas no backend |
| 5 | Copiar e colar | ClipboardEvent/DataTransfer no Electron, sem alterar clipboard pessoal |
| 6 | Formatação | editor.test.cjs: títulos, listas, bold/italic/underline/alinhamento; paste HTML no Electron |
| 7 | Desfazer pelo chat | editor.test.cjs e comando nativo “desfaça sua última alteração” |
| 8 | Refazer pelo chat | mesmas operações reaplicadas sem assist/modelo |
| 9 | Desfazer pelo teclado | Ctrl+Z e Ctrl+Shift+Z no Electron |
| 10 | Perguntar sem alterar | comparação de documentos antes/depois no backend e Electron |
| 11 | Correção gramatical | test_grammar_correction_is_pointed_and_keeps_existing_formatting, ferramenta sintética |
| 12 | Alterar trecho | correção pontual conserva outro nó e runs ricos |
| 13 | Alterar seleção | testes de seleção simples, múltiplos parágrafos e lista aninhada |
| 14 | Gerar seção | conclusão anexada preservando os nós anteriores |
| 15 | Gerar documento | conteúdo inicial mediante aprovação; não grava a resposta automaticamente |
| 16 | Autosave | 40 edições → uma gravação após 1,5 s; checkpoint de dois parágrafos no Electron |
| 17 | Recarregar | roundtrip SQLite, recuperação de rascunho e reload da janela Electron |
| 18 | Conexão instável | falha de save/reload, retry idempotente, recuperação sem sobrescrita |
| 19 | Documentos antigos | IDs/ordem/revisões preservados na leitura e exportação legada |
| 20 | DOCX | OOXML real de títulos/listas/marcas/links/tabela/alinhamento/quebras e arquivo PK nativo |
| 21 | Restaurar versão | confirmação RESTAURAR no Electron e checkpoints SQLite |
| 22 | Editar durante geração | WriterConflict antes da proposta atrasada; edição manual fica intacta |
| 23 | Associação a projetos | bind_chat real e abertura de arquivo autorizado no Electron |
| 24 | Isolamento entre clientes | regressões Cloud, contexto com userId autenticado e rejeição de documento de outro projeto |
| 25 | Requisições ao banco | contagem de saves e ausência de assist por tecla; uma leitura limitada adicional de memória por requisição editorial |

## Limites técnicos

O histórico de operações é do editor; o chat persiste mensagens CONTROL sem apagá-las; revisões SQLite são checkpoints separados. Não existe novo backend de conversas ou banco de memória do Writer. A migração é uma adaptação de leitura seguida de gravação somente quando o usuário edita/aprova; nenhum documento pessoal precisou ser aberto para testar isso.

O teste com 300 parágrafos verifica continuidade, mesma instância do editor e cursor preservado após confirmação de save. Não é um benchmark de digitação de qualquer tamanho. Os limites existentes de 512 KB por documento e 5 MB por projeto Writer permanecem explícitos.

As contagens de testes não representam a métrica Operations do provedor. Não foi medido consumo real após deploy. A memória de conta usa os campos existentes da conversa geral autenticada e exige Cloud 6.1.0 publicado após autorização. Sem push, tag, release, deploy ou instalador novo neste pedido.
