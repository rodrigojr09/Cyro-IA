# Fluxos de dados

1. Electron restaura sessão protegida; Cloud revalida usuário/dispositivo.
2. Renderer usa preload/IPC autorizado; nunca recebe token ou chave de provedor.
3. Backend local fornece catálogo e histórico sob demanda. Conversas gerais seguem para `/api/device/chats`; projetos/Writer mantêm SQLite local.
4. Contexto selecionado segue pelo adaptador autenticado ao proxy Cloud. Cloud aplica autorização, orçamento, modelo e consumo antes do provedor.
5. Resultado editorial é dado validado, submetido à aprovação local; não é autorização de execução.

Fonte de verdade: Postgres para contas/conversas gerais/cotas; SQLite para projetos/documentos/revisões; cache de sessão é derivado e descartável. Configurações protegidas e rascunhos têm requisitos distintos de retenção.

Alvo: lista inicial + histórico apenas da conversa ativa; navegação reaproveita cache; mutação invalida apenas o recurso afetado; eventos entre janelas não transportam segredos. Sincronização remota incremental precisa contrato próprio e ainda não está concluída.
