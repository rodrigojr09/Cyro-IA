> Estado vigente: candidata de estabilização Cyro 8.3.0-rc.1, Files0.4.0. Snapshots canônicos são TXT; captura e uso possuem controles separados e gerenciamento por mensagem exige confirmação real. MAIN acompanha chats/Quick; EV acrescenta apenas seu contexto autorizado. Os registros abaixo são históricos 8.1.2. Consulte o relatório local docs/production/V8_3_READINESS.md.

# Desktop — memória 8.1.2

A memória persistente pertence à Cyro API, não ao perfil local. Chat geral propaga conversationId real e operationId por requisição, isolados entre tarefas; EV usa os IDs autorizados da API. Não injeta novamente o resumo antigo da conversa geral. Histórico recente continua existindo. Quick Chat sem conversa central explicitada recebe somente MAIN.

Configurações → Memória permite MAIN e EV ativo: buscar/listar, adicionar, corrigir com revisão, esquecer com confirmação, ver origem/histórico, sincronizar e importar lote de mensagens antigas. Falhas preservam rascunho; respostas tardias de outro escopo são descartadas. Repetir a mesma escrita após falha conserva operationId. Reabrir consulta o servidor, sem cópia independente em localStorage/SQLite. Memória funciona entre dispositivos autenticados.

IPC exige janela principal autenticada, comandos permitidos e destino fixo /api/memory. Falhas recuperáveis não apagam a sessão; sessão revogada continua encerrando o acesso. Não há acesso direto a PostgreSQL/Files. JSONs locais e Backup/ não são enviados automaticamente.

O EV continua com Composer normal (anexos/microfone) e menu lateral solicitado de notas, observações e análises já persistidas. Consulta de notas não dispara IA. Operações continuam disponíveis por mensagem. O painel de memória fica nas configurações, sem poluir a conversa.

Servidor: primeiro Files 0.3.1, depois migration 20261104000100_shared_memory e API 8.1.2 com CYRO_MEMORY_ENABLED=1. A configuração detalhada está em cyro-backend/docs/memory/COOLIFY.md (repositório independente, sem import entre checkouts). Sem ativação, a interface informa indisponibilidade e preserva rascunhos.
