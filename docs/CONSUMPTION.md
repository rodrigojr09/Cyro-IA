# Consumo no painel — JARVIS v5

A página **Consumo** agrupa chamadas por usuário, em vez de misturar até 100 chamadas de toda a conta. Mostra 5 chamadas recentes por usuário por padrão; o seletor permite 10 ou 20. Cada página contém até 10 usuários, ordenados pelo total de tokens, com desempate pelo identificador. As chamadas são ordenadas pela data mais recente, com desempate pelo identificador.

Acima dos registros, o resumo mostra tokens, chamadas e usuários com consumo no período. O gráfico geral separa tokens de entrada e saída de **todo o conjunto filtrado**. O gráfico por usuário apresenta os totais completos dos usuários da página atual, com navegação para os demais. O tamanho das barras é relativo ao maior consumo dessa página. Os totais gerais não mudam ao paginar ou alterar a quantidade de chamadas recentes.

Os filtros de datas em UTC e usuário são compartilhados pelos gráficos e detalhes, ficam na URL e são preservados na paginação. Aplicar filtros reinicia a paginação. Limpar filtros retorna ao conjunto completo autorizado. Sem registros, a página informa que não há consumo; não cria valores fictícios.

## Consulta e acesso

- `GET /api/admin?usage=1` acrescenta `usageReport` à resposta administrativa existente. `from`, `to` e `clientId` são opcionais; `perUser` aceita somente 5, 10 ou 20; `usagePage` começa em 1.
- A agregação ocorre no banco por usuário, sem carregar cada chamada do histórico. Os detalhes consultam apenas os usuários da página atual: até 200 registros com o limite máximo.
- Todas as consultas mantêm o escopo autenticado: SUPER_ADMIN vê o conjunto permitido global; ADMIN vê apenas seus usuários EMPLOYEE. O filtro por ID não amplia esse escopo.
- A página usa o cache compartilhado da dashboard, com chave própria para cada combinação de filtros e botão Atualizar existente. As outras páginas mantêm suas consultas existentes.
- Datas impossíveis, períodos invertidos, identificadores inválidos e limites fora da lista são recusados. Páginas além do fim apontam para a última página disponível.
- Não há mudança de schema, migration, cotas, cálculo de cobrança ou versão. `Backup/` permanece somente leitura.

## O que os números representam

Os tokens vêm de `UsageLog`, com uso retornado pelo provedor. Não incluem reservas sem uso confirmado nem o consumo de síntese de áudio, que possui limite separado. Custos em USD são estimativas registradas, não faturas. Chamadas sem estimativa são indicadas explicitamente, sem custo zero inventado; quando só parte das chamadas tem preço, o valor representa essa parte conhecida.

## Validação

Testes do relatório cobrem totais independentes do limite visual, paginação sem repetir usuários, limites 5/10/20, datas UTC, escopo administrativo, registros vazios, custos desconhecidos e parâmetros inválidos. As consultas desse relatório usam dados simulados nesses testes.

A verificação de layout usa os componentes reais em Electron/Chromium com respostas sintéticas: gráficos antes da lista, 5 chamadas por usuário, até 10 usuários, filtros preservados, paginação, estado vazio e ausência de overflow horizontal em janelas de 320, 390, 768, 1024 e 1440 pixels. Capturas locais ficam em `build/admin-layout/usage-*.png`. Isso não valida a sessão ou os números de uma conta real em produção.

Validação da entrega: 84 testes Cloud, 149 Desktop e 190 Python/backend aprovados; TypeScript Cloud/Desktop, builds Cloud/Desktop, formatação e 40 verificações de layout Electron/Chromium aprovados. Não exige novo instalador nem migration.
