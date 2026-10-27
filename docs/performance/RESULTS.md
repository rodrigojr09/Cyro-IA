# Resultados locais - 6.0.1

Execucao em 27/10/2026. PostgreSQL PGlite local, dados sinteticos, repositorio instrumentado; autenticacao, rate limit, rede e faturamento excluidos. Os dados da fixture sao restaurados antes de cada variante. Nenhuma credencial de producao foi utilizada.

| Cenario | SQL antes | SQL depois | Reducao SQL | p50 antes/depois (ms) | p95 antes/depois (ms) |
| --- | ---: | ---: | ---: | --- | --- |
| A: startup | 9 | 3 | 66.67% | 2.36/2.58 | 4.55/2.58 |
| B: 10min visible idle | 2100 | 20 | 99.05% | 5.18/0.98 | 18.86/1.62 |
| C: open main chat | 15 | 3 | 80.00% | 7.14/0.92 | 7.14/0.92 |
| D: five cold chats + return | 75 | 15 | 80.00% | 6.76/0.91 | 7.70/1.76 |
| E: ten messages + replies | 430 | 250 | 41.86% | 7.40/2.46 | 11.50/14.29 |
| F: open Quick | 21 | 4 | 80.95% | 9.01/1.61 | 9.01/1.61 |
| G: Writer existing local document | 0 | 0 | - | -/- | -/- |
| H: switch local projects | 0 | 0 | - | -/- | -/- |
| I: F5 | 9 | 3 | 66.67% | 2.18/1.37 | 2.93/1.37 |
| J: admin navigation | nao medido | nao medido | - | - | - |
| K: Desktop + admin | nao medido | nao medido | - | - | - |

Os percentis acima sao por chamada de servico na fixture, nao por HTTP; diferencas de aquecimento/ordem de execucao impedem prometer ganhos de latencia de producao. Zero em G/H significa nenhuma chamada a este servico Cloud; SQLite local nao foi contado. J/K nao foram medidos. D inclui cinco chats frios; o retorno quente e validado no teste de cache Desktop, sem nova busca de historico.

O teste Desktop com relogio controlado mediu 10 consultas de catalogo em 600 segundos equivalentes, comparadas a 300 previstas pelo intervalo anterior de 2s: reducao de 96,67% neste fluxo. A fixture PostgreSQL mediu 2.100 para 20 instrucoes no cenario de inatividade comprimido (99,05%). Essas sao metricas locais de escopo definido, nao uma reducao comprovada das 203.579 Operations do painel.

A meta de 80% foi superada nos fluxos de leitura/inatividade desta fixture, mas nao no envio de mensagens (41,86%), que conserva escritas/cotas. Nao se pode afirmar 80% no consumo total sem carga representativa e observacao de producao. A reducao real de faturamento continua pendente de implantacao e comparacao normalizada.

Seguranca: isolamento entre contas recusado no benchmark; verificacao de sessao continua em cada requisicao. Sem migration, indice novo, exclusao de dados pessoais ou mudanca de credencial.

Validacao completa: 481 testes, sete smokes Electron, TypeScript/build e 40 verificacoes de layout aprovados. Setup final Cyro IA 6.0.1 compilado e auditado; checksum e limites em docs/VALIDATION.md. Repositorio Cyro-IA, destino master autorizado. A v6 arquitetural completa continua com as pendencias de docs/architecture/MIGRATION_PLAN.md; setup 6.0.1 nao equivale a certificacao de todas essas etapas.

## Contadores adicionais da fixture

| Cenario | HTTP previstos antes/depois | Chamadas ORM/repositorio antes/depois | Duracao total local antes/depois (ms) |
| --- | --- | --- | --- |
| A: startup | 4/3 | 7/3 | 32.08/8.27 |
| B: 10min visible idle | 600/20 | 1500/20 | 4054.77/22.10 |
| C: open main chat | 2/2 | 11/3 | 16.35/2.76 |
| D: five cold chats + return | 10/10 | 55/15 | 69.66/13.36 |
| E: ten messages + replies | 60/60 | 330/210 | 423.10/330.70 |
| F: open Quick | 3/3 | 15/4 | 27.13/4.30 |
| G: Writer existing local document | 0/0 | 0/0 | 0.12/0.02 |
| H: switch local projects | 0/0 | 0/0 | 0.07/0.01 |
| I: F5 | 4/3 | 7/3 | 12.61/6.32 |

HTTP previstos sao entradas explicitas do cenario; nao uma captura de rede de producao. ORM/repositorio e a soma de metodos instrumentados na fixture, nao o contador de faturamento Prisma. Numero de conexoes de producao: nao mensurado; limite do pool por processo quente: 3. Auth/rate limit necessarios nao entram nestas tabelas.


## Medicoes de fluxo da 6.0.2

Testes com relogio controlado: duas sincronizacoes remotas de catalogo em dez minutos visiveis, contra dez na 6.0.1 (80% menos chamadas nesse fluxo, excluindo foco e alteracoes explicitas). A consulta de armazenamento a cada 30 segundos deixou de existir. Testes de cache confirmam zero consultas de historico ao navegar entre conversas pre-carregadas e depois de receber o comprovante de gravacao. O teste de exchange confirma uma transacao por par, contra as duas gravacoes separadas anteriores. Nao se extrapolam esses resultados para Operations faturadas ou latencia da rede.

A API foi exercitada com mais de 500 mensagens, mais de 50 conversas e textos UTF-8 grandes; os cursores percorrem todo o conjunto sem duplicar registros, sem carregar dados de outra conta e com respostas em lotes limitados. Esses testes usam dados sinteticos. Nao foram medidos ainda o painel Operations apos deploy nem o tempo de login com o historico real do proprietario.
