# Inventário de módulos

IMPLEMENTED indica código funcional e cobertura local, não homologação de serviço externo. PARTIAL indica lacuna concreta para o alvo v6.

| Módulo | Responsabilidade / localização | Dependências | Estado / problema / destino |
| --- | --- | --- | --- |
| Autenticação | `cloud/lib/auth.ts`, `desktop/scripts/session/cloud.js`, `desktop/electron/main.cjs` | Prisma, safeStorage, HTTPS | IMPLEMENTED; manter sessão única e contratos. |
| Licenciamento | `cloud/lib/policy.ts`, schema Prisma | usuário/dispositivo/cotas | IMPLEMENTED; preservar limites e autorização. |
| Administração | `cloud/components/`, `cloud/app/(admin)/` | auth, dashboard-store | IMPLEMENTED; cache existente não é cache de mensagens. |
| Chat principal | `desktop/scripts/app/App.jsx`, `backend/main.py`, `cloud/lib/conversations.ts` | sessão, proxy, SQLite/Postgres | PARTIAL para v6; carregamento e orquestração precisam consolidação. |
| Quick Chat | `desktop/quick-controller.js`, `quick-renderer.js` | IPC, mesmas APIs locais/Cloud | IMPLEMENTED na v5; sincronização de cache entre janelas pendente v6. |
| Projetos | `backend/project_store.py`, `project_scope.py`, `project_index.py` | SQLite, política de leitura | IMPLEMENTED; preservar caminhos, escopo e limite de 5 MB. |
| Memória | `backend/programming/context.py`, `project_store.py` | projeto/chat | PARTIAL; GLOBAL_USER Cloud ainda não existe. |
| Writer | `backend/writer_*.py`, `desktop/scripts/writer/WriterPreview.jsx`, `desktop/scripts/writer/ipc.js` | store de projeto, cliente Cloud | IMPLEMENTED editorial; identidade/orquestração compartilhada incompleta. |
| Voz | `desktop/voice-input.js`, `backend/main.py`, APIs audio Cloud | captura nativa, provedor Cloud | IMPLEMENTED; áudio pago/microfone físico pendentes. |
| Clipboard | `desktop/clipboard-service.js`, `clipboard-manager.js`, `clipboard-ui.js` | processo principal, IPC | IMPLEMENTED; opt-in e envio humano preservados. |
| Integrações | `desktop/integration-catalog.ts`, `integrations-ui.ts` | catálogo | PARTIAL; cinco serviços apenas planejados, sem conexão fictícia. |
| Spotify | `cloud/lib/spotify*.ts`, `backend/spotify_commands.py`, `desktop/spotify*` | OAuth, tokens cifrados, Web API | IMPLEMENTED; homologação com conta real pendente. |
| Configurações | `backend/local_storage.py`, `desktop/storage-ui.js`, `initial-settings.js` | persistência protegida e Cloud | IMPLEMENTED; consolidação por domínio pendente. |
| Notificações | clipboard e quick-controller | Electron | IMPLEMENTED; preservar exclusividade de canais. |
| Ferramentas | `backend/ai_tools.py`, `computer.py`, `programming/tools.py` | validação Pydantic, permissões | PARTIAL para registro v6; dispatch e definições distribuídos. |
| Atualizações | `tools/build_cloud_desktop.py`, guias de instalação | instalador | PARTIAL; distribuição manual, sem presumir atualização automática. |
| Instalador | `desktop/electron/builder.json`, `tools/build_setup.py` | PyInstaller, NSIS | IMPLEMENTED v5; pacote v6 ainda não validado. |
| Cloud | `cloud/app/api/`, `cloud/lib/` | Next, Prisma, PostgreSQL, provedores | IMPLEMENTED; separar regras extensas em serviços existentes. |
| Mobile | contratos compartilhados | API HTTPS | PLANNED; não implementar nesta tarefa. |

Em 28/10/2026, a v6.0.3 migrou todo o renderer Desktop para React e separou scripts por função. Layout e comandos locais em [desktop/README.md](../../desktop/README.md). Auditorias anteriores descrevem os caminhos existentes na data da coleta.
