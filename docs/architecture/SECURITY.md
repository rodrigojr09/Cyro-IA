# Segurança da migração

As fronteiras existentes estão em [SECURITY.md](../SECURITY.md). OpenAI/Postgres exclusivamente Cloud; produção HTTPS; sessão individual protegida; renderer sem Node privilegiado; IPC restrito; confirmação humana para ações.

Backup/ permanece intocado e fora de runtime/distribuição. Não executar reset de banco, migração destrutiva, publicação ou push. Nenhum segredo, perfil ou banco entra em commits.

Riscos v6: cache vazando entre contas, memória global absorvendo projeto privado, eventos IPC injetados, Writer interpretando documentos como instruções, regressão no congelamento do backend e troca de conta sem limpeza. Testar rejeição, não apenas caminho feliz. Identidade compartilhada não amplia permissões de ferramentas.

A auditoria estática não substitui revisão completa de segurança nem validação de OAuth real.
