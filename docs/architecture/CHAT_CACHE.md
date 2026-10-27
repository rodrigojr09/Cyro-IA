# Cache de conversas — requisitos e validação

A base v5 busca histórico em cada openChat. A v6 exige cache em memória durante a sessão, por identidade autenticada e conversa, sem persistir histórico pessoal em localStorage.

Entrada alvo: messages, loaded, lastFetchedAt, revision, pendingChanges, error. Falhas não contam como loaded; solicitações simultâneas devem compartilhar a promessa. Navegação A→B→A não busca novamente histórico completo. Envio/recebimento, limpeza, exclusão e alterações externas devem atualizar ou invalidar a entrada. Paginação antiga não pode ser perdida ao reabrir.

Não usar apenas TTL como sincronização. Eventos de janelas precisam origem/role validados e IDs; mudanças de outros dispositivos precisam revisões/cursor no Cloud. F5 revalida sessão e carrega somente lista e conversa ativa, preservando rascunho. Logout limpa cache e cancela solicitações em andamento.

Este documento descreve critérios; consultar o registro de migração para distinguir entrega de pendência. A consistência entre janelas e dispositivos é condição para ativar cache de histórico em produção.

## Implementação inicial

`desktop/workspace.js` mantém um Map em memória para históricos comuns. A→B→A no mesmo projeto reutiliza dados sem buscar catálogo ou histórico; mudança de projeto ainda informa o backend para preservar seleção/indexação. A chave é o ID da conversa, dentro do renderer da sessão. Writer continua recarregando seu contexto editorial e não entra neste cache inicial.

Iniciar envio e alterações confirmadas invalidam a entrada. Paginação é incorporada com deduplicação por ID. O catálogo existente compara last_message_at/archived/writer_document_id e invalida mudanças observadas; conversa ativa é recarregada. A abertura a partir do Quick invalida o alvo e busca seu histórico uma vez, sem a consulta preliminar duplicada.

Limitações: ainda utiliza polling preexistente, não revisões/cursor/eventos. Não garante detecção instantânea de outro dispositivo. Writer, persistência de rascunhos ao F5, deduplicação de buscas simultâneas e cache comum a ambos os renderers continuam pendentes. Este estágio não fecha todos os requisitos v6.

Verificação específica: 13 testes em desktop/workspace.test.js passaram em 27/10/2026, incluindo A→B→A, invalidação no envio, mudança de catálogo, abertura do Quick, falha de rede e exclusão externa. Serviços sintéticos; sem medição de tempo de rede real.
