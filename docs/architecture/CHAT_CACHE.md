# Cache de conversas — requisitos e validação

A base v5 busca histórico em cada openChat. A v6 exige cache em memória durante a sessão, por identidade autenticada e conversa, sem persistir histórico pessoal em localStorage.

Entrada alvo: messages, loaded, lastFetchedAt, revision, pendingChanges, error. Falhas não contam como loaded; solicitações simultâneas devem compartilhar a promessa. Navegação A→B→A não busca novamente histórico completo. Envio/recebimento, limpeza, exclusão e alterações externas devem atualizar ou invalidar a entrada. Paginação antiga não pode ser perdida ao reabrir.

Não usar apenas TTL como sincronização. Eventos de janelas precisam origem/role validados e IDs; mudanças de outros dispositivos precisam revisões/cursor no Cloud. F5 revalida sessão e carrega somente lista e conversa ativa, preservando rascunho. Logout limpa cache e cancela solicitações em andamento.

Este documento descreve critérios; consultar o registro de migração para distinguir entrega de pendência. A consistência entre janelas e dispositivos é condição para ativar cache de histórico em produção.
