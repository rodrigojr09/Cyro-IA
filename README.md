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
