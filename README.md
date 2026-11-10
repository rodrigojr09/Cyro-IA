> **Cyro v8.4.0-rc.1 — acesso público em homologação.** Plano pago ativado manualmente pelo administrador. [Arquitetura, contratos, migração e rollout](docs/public-access/V8_4_ARCHITECTURE.md); [testes](docs/public-access/TEST_RESULTS.md). Files mantém 0.4.0. Deploy automático autorizado por commit; abertura pública depende das configurações e validações indicadas. Os registros anteriores abaixo são históricos.

> **Cyro 8.3.0-rc.1 — estabilização, não liberado para produção.** Files mantém versão 0.4.0. [Relatório de prontidão e bloqueadores](docs/production/V8_3_READINESS.md). O trabalho 8.2 preservado foi incorporado à candidata; os registros abaixo são históricos. Sem push, release, tag ou implantação automática.

> **8.1.2 — Cyro memória persistente (04/11/2026).** Contexto real de conversa/EV no chat e gerenciamento em Configurações → Memória, usando exclusivamente a API central. [Histórico e validação](versions/8.1.2.md). Produção exige atualização/homologação pelo proprietário; registros abaixo são históricos.


## Referências anteriores (históricas)

> **Próxima versão do produto: v8.1.0.** EVs substituem projetos locais como
> forma ativa de organização, preservando os dados antigos. Primeiro ambiente:
> Logístico. [Escopo atualizado](docs/ev/V8_1_SCOPE.md). Implementação em andamento;
> os registros abaixo descrevem versões anteriores e não comprovam entrega da v8.1.0.

# Cyro Desktop — Cyro EV v8.0.1 em desenvolvimento

Versão de trabalho **8.0.1**. A migração aditiva do catálogo local atribui GENERAL
aos projetos existentes, preservando seus bancos, chats e Writer. O catálogo passa a v4;
binários anteriores recusam esse formato. O livro e a interface Logistics estão pendentes.
Veja [histórico e limites desta alpha](versions/8.0.1.md).
Não há importação automática de fontes/dados para a API. Compilação e envio desta versão autorizados em 03/11/2026; resultados em versions/8.0.1.md.
Validação: `npm run check:v8` (os aliases v7/v6 permanecem compatíveis).
Instaladores da v8 são gravados em `release/v8/`; `release/v6/` conserva os anteriores.

## Referência da arquitetura v7 preservada

# Cyro IA — Desktop v7

Versão 7.1.0. O repositório original permanece Desktop, com histórico/remoto, appId, executável JARVIS, perfis, sessões e IPC preservados. O Desktop comunica diretamente com **https://api.cyro-ia.tech** e não depende do painel Cloud.

## Código e funcionalidades

- desktop/: Electron/React, interface, Quick Chat, orb, notificações, clipboard, voz/captura local, Writer, integrações locais e atualizador.
- backend/: nome histórico do runtime Python local, para ferramentas Windows e acesso autorizado a arquivos/projetos; não é o Backend central da VPS. IA e integrações remotas usam a API com sessão individual.
- tools/: inicialização, verificações e Setup.exe. tools/platform reúne ferramentas opcionais de organização/teste dos quatro repositórios, sem acoplar o build Desktop aos demais.
- docs/v7/: mapa da plataforma, produção e resultados atuais. Os registros 6.x permanecem históricos.

Históricos/fontes de projetos locais e dados existentes são preservados. Esta etapa não os envia automaticamente ao servidor nem elimina confirmação humana para ações locais.

## Executar

Node 24 LTS (.nvmrc), Python e dependências de backend/requirements-dev.txt. npm ci na raiz; npm run dev ou start.bat. A origem pública padrão está em desktop/electron/backend-config.json. CYRO_BACKEND_ORIGIN permite substituição explícita; JARVIS_CLOUD_ORIGIN continua aceito por compatibilidade. HTTPS obrigatório no instalador. Segredos de serviços não são configurados no Desktop.

## Validar e compilar

Use npm run check:v7 para TypeScript/build, testes Desktop/Python, sete smokes Electron e verificações de organização. check:v6 permanece como alias operacional do pipeline. O build independente não precisa dos checkouts Backend/Cloud/Files.

Para compilar Setup.exe, instalar backend/requirements-build.txt e executar build.bat. O pipeline usa a origem pública da API, verifica antes de empacotar e não publica o instalador. Os instaladores anteriores são preservados. Nenhuma tag ou release real foi criada nesta etapa.

O atualizador v7 consulta, autoriza e baixa pela API. Ela entrega Files ou recupera GitHub no servidor. O Desktop confere tamanho, hash, NSIS/versão e assinatura antes de instalar, e verifica novamente no clique final. Falhas temporárias são repetidas após cinco minutos; um download alterado permite baixar novamente. Desenvolvimento continua com o atualizador desativado.

## Organização da pasta principal

Os quatro repositórios estão lado a lado. Execute python tools/platform/bootstrap.py para criar os atalhos cyro.py/cyro.bat e o índice público da pasta principal, sem criar um Git comum. Instalações e deploys continuam separados.

[Mapa e comandos](docs/v7/WORKSPACE.md) · [Produção e rollback](docs/v7/PRODUCTION.md). Resultados atuais em docs/v7/VALIDATION.md. Dados locais e instaladores não equivalem a homologação em Windows limpo ou serviços reais.
