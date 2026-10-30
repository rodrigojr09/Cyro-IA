# Relógio contextual do Cyro

O Cloud acrescenta data, hora, fuso e instante UTC confiáveis a cada requisição de chat, Quick Chat ou Writer, em cloud/lib/current-time.ts. O padrão é America/Sao_Paulo; CYRO_TIME_ZONE aceita outro fuso IANA válido. Um fuso inválido usa o padrão. O relógio vem do servidor, não da memória do modelo ou do horário informado no histórico.

O contexto é acrescentado depois das mensagens originais, preservando o prefixo para cache do provedor. Não é persistido no histórico e não exige consulta SQL nem uma segunda chamada à IA. A reserva de tokens inclui o texto acrescentado.

A versão do aplicativo não atualiza automaticamente os conhecimentos do modelo. O relógio corrige a referência de hoje/ontem/amanhã, mas não é uma pesquisa de notícias ou cotações. O Cyro é orientado a não afirmar consulta/atualidade sem uma ferramenta e fonte reais. Nenhuma pesquisa web nova foi habilitada nesta correção.

Quatro testes determinísticos verificam virada UTC/local, fuso inválido, renovação por requisição, preservação do histórico e mensagens de ferramentas sem conteúdo. Cloud completo: 104 testes aprovados; sem validar uma resposta paga do modelo. Após o deploy, a correção de contexto alcança os aplicativos instalados na próxima requisição, sem exigir reinstalação para a data.
