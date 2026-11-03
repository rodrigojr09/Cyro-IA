# Desktop v8.1.0 — somente Espaços Virtuais

Escopo atualizado pelo proprietário em 03/11/2026: EVs substituem os projetos
locais. Este registro define a implementação; não declara a interface concluída.

- Retirar da navegação ativa o catálogo de projetos locais, Adicionar projeto,
  autorização de pasta, seleção de fontes e indexação de diretórios.
- A nova navegação usa exclusivamente os EVs persistidos pela Cyro API. Primeiro
  ambiente funcional: Logístico. Conversas gerais e ferramentas globais continuam.
- Requisições usam sessão individual protegida pelo processo nativo. Não fornecer
  credenciais à interface nem acessar diretamente PostgreSQL ou Cyro Files.
- Não criar EVs em SQLite nem interpretar um projeto local antigo como EV central.
- Preservar bancos, conversas, Writer, documentos, memória, fontes e Backup/.
  A retirada da funcionalidade ativa não executa limpeza, exclusão ou upload.
- Recuperação/importação do legado é explícita, com inventário e confirmação,
  destino vinculado à conta, integridade, idempotência e possibilidade de retomar.
  Não ativar o fluxo antigo de projetos como alternativa à falha da API.
- Cache e rascunhos protegidos podem continuar locais; não constituem projetos.
  Troca de EV, fechamento, falha e troca de conta devem preservar/isolar os dados.
- Bloquear caminhos antigos de criação também no IPC/runtime, além de remover os
  botões. Testar preservação do legado e regressão das conversas gerais.
- Não declarar Writer central entregue apenas por preservar o Writer local.

Alvo: **8.1.0**. Compilar o novo instalador em release/v8, preservando os anteriores.
Não alterar os registros históricos v6/v7/v8.0.1 para aparentar conclusão da v8.1.
