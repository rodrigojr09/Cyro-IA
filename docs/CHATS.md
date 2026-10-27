# Conversas Cloud e projetos locais

Alterações posteriores à publicação inicial da v4.0.0. Não publicar sem pedido do proprietário.

## Armazenamento

- Um único PostgreSQL Cloud: contas/sessões e novas tabelas Conversation/ChatMessage.
- Conversas gerais e Quick Chat geral pertencem exclusivamente ao usuário autenticado, incluindo administradores. A API não aceita userId, caminhos, project_id ou permissões no corpo.
- Uma conversa fixa `quick` por usuário, protegida por índice único `(userId, slot)`, reutilizada entre sessões, reinícios e computadores. A conversa `general` também é fixa. As duas são preservadas contra exclusão e arquivamento.
- Histórico paginado por ID de mensagem, resumo de conversa, renomeação, arquivamento e exclusão de conversas adicionais. Exclusão remove mensagens em cascata.
- Retentativas de criação/mensagens conservam o mesmo UUID; índices únicos impedem duplicação. Alterações de uma conversa usam bloqueio transacional para serializar dispositivos concorrentes.
- Projetos, arquivos, notas, memória, permissões e chats de projetos ficam locais. Quick Chat com projeto usa uma conversa local fixa por projeto; esses trechos não entram no histórico Cloud geral.
- Históricos locais anteriores permanecem intactos e não são enviados implicitamente, pois não possuem vínculo verificável com uma conta. Não há migração automática nem cache offline de históricos gerais nesta alteração. Sem rede, a interface apresenta erro e permite tentar novamente.
- As mensagens usadas em uma consulta ainda passam pelo proxy de IA Cloud conforme o funcionamento existente; manter chats de projeto locais significa não persistir esses históricos nas novas tabelas.

## Projetos de uso geral

A orientação da IA e a memória incluem estudos, escrita, planejamento, pesquisa, trabalho e software. A evidência técnica só é pertinente quando existe. Projetos sem arquivos selecionados podem usar notas e chats locais, sem chamada de IA na criação da memória vazia.

Leitura de texto UTF-8: formatos de código existentes, TXT, Markdown, CSV, TSV, RST, AsciiDoc, Org, TeX, BibTeX, SRT, VTT e ICS. PDF, imagens, documentos Office e outros formatos binários não possuem extrator nesta versão. Não se deve prometer leitura desses formatos.

## Limite de 5 MB

5 MB corresponde a 5.242.880 bytes. A soma considera todos os arquivos selecionados elegíveis na pasta, inclusive formatos que não possuem extrator; arquivos protegidos/gerados e links bloqueados não são fontes autorizadas. Inclusões sobrepostas contam uma vez e exclusões não contam.

O Desktop consulta apenas metadados por `/projects/selection/size` antes de salvar a seleção, enviar uma pergunta de projeto ou usar o projeto no Quick Chat. Excesso gera aviso sem enviar a pergunta à IA; o campo da janela principal é preservado. A API de tamanho não salva a seleção e não chama a IA.

O FastAPI local, que possui acesso ao sistema de arquivos, confere novamente ao salvar, atualizar a análise, analisar em segundo plano e enviar mensagens, inclusive antes de abrir o streaming. Excesso retorna HTTP 413. Crescimento dos arquivos após a seleção invalida a análise e bloqueia novas consultas; não pode ser contornado por aceitar análise parcial. Varredura incompleta por tempo, quantidade de entradas ou falha de leitura exige reduzir/verificar a seleção; não aprova um tamanho desconhecido.

O Cloud não recebe as pastas completas e não pode medir um disco remoto. Sua API continua limitando o corpo JSON a 128 KiB. O limite de arquivos do projeto é aplicado pelo backend local confiável, sem confiar em um total informado pelo renderizador.

## Ativação e validação

Aplicar a migration aditiva `20261022120000_cloud_chats` com `npm run db:deploy -w @jarvis/cloud`, então publicar o Cloud e distribuir o Desktop atualizado conjuntamente. Não exige apagar usuários ou mensagens. O instalador anterior não contém estas mudanças.

Testes automatizados incluem isolamento entre duas contas administrativas, uma conversa Quick fixa, duplicação por retentativa, paginação, restrições PostgreSQL em PGlite, separação de projetos locais, limite exato/ultrapassado, crescimento de arquivos, aviso Desktop e chamadas diretas ao backend sem preflight. PGlite, repositório em memória e provedor simulado não comprovam implantação de produção, áudio pago nem Windows limpo.

## Resultado em 22/10/2026

- Migration `20261022120000_cloud_chats` aplicada ao banco configurado privadamente em `cloud/.env`, com sucesso. Somente tabelas e índices novos; nenhum reset de dados.
- 19 testes Cloud, 77 testes Node do Desktop, 124 testes Python do backend e 25 testes de iniciadores/build aprovados. TypeScript e build Next.js de produção aprovados.
- Quatro verificações Electron aprovadas: interface principal, Quick Chat, login/safeStorage e integração Electron/FastAPI. Cloud e áudio de teste simulados; nenhuma chamada paga.
- Backend rejeita projeto acima de 5 MB com HTTP 413 em seleção, atualização, chat, Quick Chat e início do streaming. O Desktop bloqueia o envio antecipadamente e preserva a pergunta; erros 413 posteriores também mantêm o aviso de tamanho.
- Testes adicionais recusam anexar contexto de projeto a uma conversa Cloud geral ou mudar o projeto de um chat local comum.
- Na validação inicial, o código permaneceu local, sem push, deploy, tag ou novo instalador. A publicação posterior autorizada da v4.1.0 está documentada em [V4_1.md](history/V4_1.md). Portas locais 3000 e 8765 encerradas após os testes.
