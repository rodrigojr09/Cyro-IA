# Configurações, armazenamento e arquivamento — 23/10/2026

## Interface

As configurações gerais contêm Aparência, Voz, Armazenamento, Chats arquivados,
Quick Chat e Conta. Configurações técnicas de modelos, chaves e implantação não
são apresentadas ao usuário do Desktop.

O chat normal possui nome e instruções próprias. O projeto possui nome e
instruções compartilhadas por seus chats, em um diálogo separado. Cada chat de
projeto pode acrescentar instruções; a consulta recebe as duas orientações,
sempre subordinadas às regras de segurança e confirmação humana existentes.

O botão direito (ou Shift+F10) sobre um chat abre opções de navegação, nome e
instruções, limpeza de mensagens, arquivamento e exclusão. Conversas fixas
continuam protegidas contra exclusão/arquivamento, mas permitem limpar as
mensagens para liberar espaço.

Chats arquivados desaparecem da sidebar, inclusive da busca. A aba Chats
arquivados lista chats gerais e de projetos com ação Restaurar. Arquivar não
libera armazenamento; apagar mensagens ou chats libera.

Diálogos de gerenciamento fecham após uma ação concluída: salvar chat/projeto,
arquivar, restaurar, excluir, limpar, salvar anotação ou preferências do Quick
Chat. Cancelamento e erro preservam o diálogo para permitir nova tentativa.

## Cota Cloud

O padrão é **50 MiB por usuário** (52.428.800 bytes), também para administradores.
O administrador pode ajustar a cota das pessoas dentro do seu escopo no painel,
entre 1 e 1.024 MiB. O Desktop não altera sua própria cota.

A métrica é o tamanho lógico UTF-8 de títulos, instruções, resumos, mensagens e
escopos, acrescido de 128 bytes por conversa e 64 bytes por mensagem. Não mede
RAM, índices físicos, espaço total do PostgreSQL, dados de outras contas ou
originais de anexos. Uma reserva de 64 KiB bloqueia novas consultas perto do
limite, reduzindo o risco de faltar espaço para a última resposta.

Inserções, alterações e limpezas são serializadas por um bloqueio da linha do
usuário no Cloud. O tamanho é recalculado no banco, sem aceitar contadores do
Desktop; crescimento acima da cota causa rollback. O proxy de chat e voz e o
backend do Desktop bloqueiam consultas com HTTP 507 e a mensagem:

> Limite de memória na nuvem atingido. Apague alguns chats para liberar memória e continuar usando o JARVIS.

O usuário continua autenticado e pode consultar, restaurar e apagar históricos.
O Desktop atualiza a medição a cada 30 segundos e após limpezas. A checagem do
servidor continua obrigatória em cada nova consulta. A sessão mantém sua
verificação independente a cada cinco minutos.

## Limpeza

As duas limpezas exigem confirmação nativa em uma janela autenticada. A API
genérica do renderer e as ferramentas da IA não possuem acesso à rota privada
de limpeza.

- Nuvem: remove apenas as conversas e mensagens da conta autenticada, incluindo
  as conversas fixas, recriadas vazias ao serem usadas novamente. Preserva
  conta, login, acesso, registros de consumo e dados de outras contas.
- Local: apaga o cadastro e a memória interna dos projetos/chats deste
  computador e os anexos da conta atual. Projetos locais são compartilhados
  neste computador; a confirmação informa esse efeito. Preserva anexos de
  outras contas, sessão, preferências e pastas originais. Marcadores de migração
  permanecem para impedir a reimportação automática de históricos apagados.

Os destinos internos são resolvidos e validados antes da remoção. Backup/ não
é modificado. A limpeza local também fica disponível quando o Cloud está sem
conexão; nesse caso a interface informa a indisponibilidade da medição Cloud.

## Atualização necessária

Aplicar as migrations `20261022150000_local_attachment_notice` e
`20261023100000_storage_settings` e atualizar Cloud e Desktop juntos. Nenhuma
delas foi aplicada ao banco remoto nesta etapa. Não houve push, implantação,
tag ou geração de novo instalador na etapa inicial de implementação. A publicação
e a compilação posteriores, autorizadas em 23/10/2026, estão registradas em
[V4_2.md](history/V4_2.md).

## Verificações

- npm ci executado na raiz: 483 pacotes instalados, zero vulnerabilidades.
- Cloud: 24 testes aprovados; TypeScript e compilação Next.js aprovados.
- Painel administrativo: 35 verificações de layout aprovadas em Chromium real,
  com dados sintéticos e o novo campo de cota visível.
- PostgreSQL embarcado: migrations, contagem UTF-8, isolamento por conta,
  rollback do crescimento excessivo, concorrência serializada no adaptador de
  teste e recuperação após limpeza. Isso não substitui um ensaio com várias
  conexões no PostgreSQL remoto.
- Rotas Cloud de chat e voz recusam a conta com cota esgotada antes de acessar
  configuração ou provedor, verificado com requisições autenticadas simuladas.
- Desktop: 84 testes aprovados; testes adicionais cobrem arquivar/restaurar,
  menu contextual, diálogos, limpeza autenticada e bloqueio/recuperação da cota.
- Backend: suíte completa de 137 testes aprovada; os seis testes específicos
  de armazenamento também passaram após acrescentar os casos de Cloud offline
  e limpeza com armazenamento criptografado configurado.
- Inicialização e empacotamento: 25 testes aprovados em execução isolada. Houve
  um timeout do backend no primeiro ensaio concorrente com outros testes.
- Quatro verificações no Electron real aprovadas, com dados Cloud simulados.
  A verificação principal inclui menu contextual, configurações separadas,
  arquivamento/restauração, fechamento de diálogos e bloqueio/recuperação da
  cota, com capturas inspecionadas visualmente.

Não foram validados implantação, análise/áudio pagos ou instalação limpa do
Windows nesta etapa. Testes de limpeza usam exclusivamente dados temporários.
