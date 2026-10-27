> Documento histórico de versões anteriores. Para o fluxo vigente de login e os testes da v4, consulte [V4.md](V4.md).

# Validação da implementação JARVIS 3.0.0

Data: 20/10/2026. Metadados sincronizados em 3.0.0. Nenhuma tag de release foi criada; ainda não é uma release homologada em produção.

## Resultados executados

- Correção do diagnóstico de voz em 21/10/2026: 16 testes Cloud e 87 testes Python de backend aprovados; regressão HTTP/SDK/ASGI verifica que voz desabilitada, limite e licença aparecem corretamente no Desktop e que mensagens desconhecidas do provedor são ocultadas. TypeScript, build Next.js, 65 testes Node, 19 testes de iniciador/build e três smokes Electron também aprovados. Sem chamada de síntese paga; a causa do incidente de produção depende da configuração/log da Vercel.
- Build com diagnóstico de voz: serviço congelado passou no `--self-check`. O smoke de inicialização/reinicialização do novo payload foi impedido pela porta 8765 ocupada; nenhum processo externo foi encerrado. O resultado anterior de reinicialização refere-se ao build anterior, não a este pacote atualizado.
- Revisão de responsividade em 21/10/2026: 45 combinações de nove páginas e cinco larguras (320, 390, 768, 1024 e 1440 px) aprovadas em Chromium/Electron. Componentes reais com respostas de API sintéticas, incluindo link de ativação gerado, nomes extensos, saída de sessão visível e limite de espaçamento dos campos no celular. Capturas de login, dashboard e clientes revisadas; esse teste não valida autenticação ou dados de produção.
- Reexecução em 21/10/2026: 15 testes Cloud, 65 testes Node Desktop, 86 testes Python de backend, 19 testes de iniciador/build, TypeScript, build de produção Next.js e três smokes Electron aprovados. Backend congelado também passou no `--self-check`. As chamadas externas dessas suítes permanecem simuladas.
- Instalador recompilado em 21/10/2026 para `https://cronosjarvis.vercel.app`: auditoria de ASAR/runtime aprovada e checksum em `release/v3/JARVIS-Setup-3.0.0.exe.sha256`. Payload final iniciou e reiniciou com perfil temporário e PATH restrito, preservando histórico e rejeitando acesso local sem token. Sem chamadas pagas. Instalador sem assinatura digital; instalação/atualização/desinstalação em Windows limpo continuam pendentes.
- Cloud: 15 testes aprovados, incluindo autorização por escopo, senha/token, códigos expirados/revogados/consumidos, licença/dispositivo/cliente bloqueados, associação de licença a outro cliente, proxy, streaming, cancelamento e uso retornado pelo provedor.
- Duas migrations SQL aplicadas em PostgreSQL embarcado PGlite; constraints de cliente/cota/código exercitadas. Vinte atualizações concorrentes enfileiradas do mesmo código produziram um único vencedor. Isso não substitui concorrência de conexões reais contra Prisma Postgres.
- Prisma Client 7.10.1 gerado; TypeScript e build Next.js de produção aprovados após alterações finais.
- Desktop: 65 testes Node aprovados. Formatação Prettier e verificações de sintaxe dos arquivos principais aprovadas.
- Backend: suíte completa anterior com 110 testes aprovada nesta raiz; validação final com 86 testes de chat, projetos, escopo, Quick Chat, Cloud e integração após a correção de mensagens de ferramentas. Mocks externos e dados temporários.
- Integração ASGI/Cloud adapter: deltas de resposta, persistência no histórico local e proteção do endpoint privado de credenciais aprovados, com provedor simulado.
- Iniciador/build: 24 testes aprovados; o pipeline final repetiu os 19 testes relevantes de iniciador/NSIS. Nenhum processo externo foi encerrado por usar a porta.
- Três smokes Electron reais aprovados: interface principal; Quick Chat/ícone independente; ativação com HTTP Cloud simulado e safeStorage real do Windows. Áudio de regressão usa amostra silenciosa; não houve API paga.
- Backend congelado passou --self-check, carregando dependências, SQLite e políticas de leitura sem Python instalado no PATH do processo de destino.
- NSIS gerou release/v3/JARVIS-Setup-3.0.0.exe e checksum SHA-256. Código não tem assinatura Authenticode.
- Payload empacotado iniciado e reiniciado com dados temporários e PATH restrito: saúde/identidade, rejeição sem token e persistência de conversa aprovadas. Não equivale a Windows limpo.
- Auditoria de ASAR/runtime confirmou fontes atuais e ausência de Backup, .env, bancos pessoais e arquivos privados proibidos. Revisão do índice Git não encontrou caminhos proibidos nem possíveis chaves OpenAI embutidas.

## Pendências externas obrigatórias antes da tag

1. Configurar URLs reais Prisma Postgres, AUTH_SECRET e chave OpenAI privadamente; aplicar migrations e criar o primeiro administrador por CLI.
2. Implantar na Vercel e testar cadastro, ativação, concorrência real, revogação, uso/limites e streaming/cancelamento através da infraestrutura hospedada. Não foi realizado deploy nesta tarefa.
3. Executar o instalador em Windows sem Python/Node, incluindo atalhos, protocolo aberto/fechado, desinstalação, atualização e preservação de dados. O teste com PATH restrito não comprova ausência de instalações no Windows do desenvolvedor.
4. Validar som real, entrada de voz quando suportada pelo runtime, DPI/monitores e eventuais políticas Windows. Não foi prometida sobreposição em jogos exclusivos.

## Limitações funcionais documentadas

- Listas administrativas mostram até 100 registros recentes; consumo tem filtros por cliente/período, sem paginação completa.
- Voz central é opt-in. O endpoint binário de síntese não retorna tokens; caracteres ficam em auditoria e reserva conservadora, sem inventar consumo de tokens.
- Reservas de chamadas sem uso confirmado permanecem retidas para impedir liberação indevida de quota; reconciliação operacional é necessária.
- Credencial individual é renovada antecipadamente; falha de disco depois de consumir código ou permanência offline além da validade exige suporte e nova ativação planejada.
- Um perfil não permite substituir silenciosamente o cliente ativado. Não há migração automática de cofres portáteis nem importação de dados privados do desenvolvimento.
- Recuperação de senha, MFA e transferência de clientes entre administradores são evoluções futuras, não funcionalidades verificadas desta implementação.
