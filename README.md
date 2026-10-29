# Cyro IA v6.2.1 — em desenvolvimento

Cyro IA é o novo nome do JARVIS, autorizado pelo proprietário em 27/10/2026. Repositório: [Cyro-IA](https://github.com/rodrigojr09/Cyro-IA). Perfis, sessões, IPC e identificadores internos existentes permanecem compatíveis.

Evolução arquitetural da base 5.1.0 preservada no commit `631d0c7`. Consulte o [plano de migração](docs/architecture/MIGRATION_PLAN.md) e a [auditoria inicial](docs/architecture/AUDIT.md). A v6 ainda não está concluída nem homologada para distribuição. Auditoria e medição de banco em [docs/performance](docs/performance/DATABASE_AUDIT.md). Instalador local desta entrega: `release/v6/Cyro-IA-Setup-6.2.1.exe`. A validação de desenvolvimento usa `npm run check:v6`; `check:v5` permanece como alias de compatibilidade dos iniciadores.

O [Writer 6.1](docs/WRITER.md) usa um documento contínuo com chat lateral. A migração preserva os documentos e históricos existentes; sem atualização automática do aplicativo instalado.

A sidebar usa indentação limpa para conversas e projetos, destaque discreto do chat ativo e rodapé separado. Estilos em `desktop/styles/sidebar.css` e componente em `desktop/scripts/workspace/Sidebar.jsx`.

Consulta consolidada da interface: [paginas.html](paginas.html) reúne os HTMLs e fontes React, e [styles.css](styles.css) reúne os estilos com comentários de origem. São cópias de referência da v6.2.1, sem substituir os módulos de produção; não se atualizam automaticamente. Para regenerar ambos com todos os componentes/páginas e CSSs atuais, execute `python -X utf8 tools/generate_ui_catalog.py` na raiz. O gerador confere a integridade das fontes incluídas e identifica cada origem por comentário. Identidade do assistente em `backend/jarvis_identity.py`; estado da entrega em `docs/VALIDATION.md`.

Refinamento visual 6.2: raios e espaçamentos em `desktop/styles/tokens.css`, superfícies e foco em `desktop/styles/ui.css`, sidebar em `desktop/styles/sidebar.css`, menus compartilhados em `desktop/scripts/ui/AnchoredMenu.jsx` e tema Cloud em `cloud/app/globals.css`. As referências consolidadas foram atualizadas para a v6.2.1.

A v6.2.1 unifica cartões de anexos e clipboard, adiciona drop de arquivos e completa o menu das conversas. Configurações mantêm oito categorias e o banner de projeto separa seleção local de reindexação. Consulte [anexos](docs/ATTACHMENTS.md) e [clipboard](docs/CLIPBOARD.md). O Cloud 6.2.1 foi publicado e o instalador local recompilado com os ajustes de layout em 29/10/2026; consulte [instalação](INSTALL.md) e [validação](docs/VALIDATION.md).

# Base funcional v5

Assistente Windows com chat principal, Quick Chat, projetos locais, JARVIS Writer e comandos Spotify pelo chat. Versão **5.1.0**.

A implementação v5 está consolidada. A homologação externa de OAuth completo, áudio pago, microfone físico e instalação/atualização em Windows limpo permanece separada das verificações automatizadas. Não há tag de release homologada. Veja o [estado da v5](docs/V5.md) e as [evidências de validação](docs/VALIDATION.md).

## Começar

- **Usuário:** [instalar, atualizar e entrar no aplicativo](INSTALL.md).
- **Administrador:** [implantação Cloud](docs/DEPLOYMENT.md), [configuração Vercel](docs/VERCEL.md) e [credenciais OpenAI/Spotify](docs/CREDENTIALS.md).
- **Desktop React:** [organização dos módulos e testes](desktop/README.md).
- **Desenvolvedor:** [arquitetura e mapa do código](docs/ARCHITECTURE.md), [validação](docs/VALIDATION.md) e [índice de documentação](docs/README.md).

## O que a v5 reúne

| Área | Comportamento |
| --- | --- |
| Chats e Quick Chat | Conversas gerais no Cloud, isoladas por conta, com Quick Chat fixo e streaming/cancelamento. |
| Projetos | Chats, memória e fontes locais, com seleção autorizada e até 5 MB de arquivos por análise. |
| Clipboard | Opt-in, aviso sonoro e dois indicadores sincronizados; um único chat recebe as ações, com revisão antes de enviar. |
| Writer | Chat padrão dedicado a um arquivo, prévia lateral, alterações em azul e aprovação antes de aplicar revisões. |
| Integrações | Catálogo pesquisável. Spotify com OAuth individual; outros cinco serviços em breve. |
| Spotify | Comandos no chat e voz, interpretação no Cloud e escolha de dispositivo em diálogo. Sem painel de reprodução. |
| Administração | Usuários, dispositivos, limites, credenciais SUPER_ADMIN, cache compartilhado e gráficos de consumo. |

OpenAI, PostgreSQL e segredos dos provedores ficam no Cloud. O Desktop usa login individual e sessão protegida pelo Windows. O FastAPI local reaproveita projetos, memória e ferramentas autorizadas. Nenhuma cópia de clipboard é enviada automaticamente; detecção de possíveis credenciais não é infalível. `Backup/` é arquivo manual do proprietário: somente leitura e fora do runtime e da distribuição.

## Desenvolvimento

Requisitos: Node >=22.12, npm, Python compatível com os requisitos do backend e PostgreSQL Cloud configurado privadamente.

```powershell
npm ci
python -m pip install -r backend/requirements-dev.txt
npm run db:generate
npm run db:deploy -w @jarvis/cloud
npm run admin:bootstrap -w @jarvis/cloud
```

Crie `cloud/.env` a partir de `cloud/.env.example` somente se ele ainda não existir. Preencha os valores privadamente antes das operações de banco. O bootstrap exige `BOOTSTRAP_*` temporários, sem senha padrão; remova-os depois. Credenciais de provedor podem ser configuradas em **Dashboard → Credenciais** pelo SUPER_ADMIN.

Depois de configurar, `start.bat` inicia o Cloud local, aguarda o login e abre o Desktop. O iniciador não instala dependências nem aplica migrations, e encerra somente os processos que iniciou. Para usar o Cloud publicado em desenvolvimento, veja [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Validar e compilar

```powershell
npm run check:v6
```

O comando reúne consistência do repositório, testes Cloud/Desktop/Python, TypeScript, builds, sete smokes Electron e layout administrativo. Os testes usam serviços externos simulados; não substituem homologação real. Para compilar o instalador Windows x64, instale também `backend/requirements-build.txt` e configure `JARVIS_CLOUD_ORIGIN` com a origem HTTPS autorizada. Execute `build.bat`; a saída é `release/v6/Cyro-IA-Setup-6.2.1.exe`. O pipeline valida antes de empacotar e não publica o binário. Detalhes em [publicação](docs/PUBLISH.md).

## Documentação e autoria

O [índice documental](docs/README.md) separa guias atuais de [histórico](docs/history/README.md). Mudanças estão no [CHANGELOG](CHANGELOG.md). Guias antigos não descrevem a instalação vigente.

Desenvolvido por **Rodrigo Junior** · [GitHub](https://github.com/rodrigojr09) · [E-mail](mailto:rodrigo.macia019@gmail.com). © 2026.
