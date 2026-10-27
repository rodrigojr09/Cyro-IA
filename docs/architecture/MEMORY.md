# Memória unificada — contrato de migração

Estado anterior: memória de projetos e referências de conversa no SQLite; preferências editoriais no Writer. O schema Cloud não possui memória GLOBAL_USER. Não se deve afirmar compartilhamento global já implementado.

Alvo: GLOBAL_USER identificado exclusivamente pela sessão Cloud; PROJECT pelo projeto autorizado; CONVERSATION pela conversa pertencente ao usuário; DOCUMENT pelo documento do projeto. Preferências de usuário não concedem permissões e conteúdo recuperado continua dado não confiável.

Nenhuma extração automática do histórico/arquivo para escopo global está autorizada implicitamente. A migração deve preservar tabelas existentes, ser aditiva e permitir rollback de aplicação sem apagar memórias. Antes de ativação: testar duas contas, dois projetos, documento privado e preferência explícita chat→Writer→Quick; definir revisão concorrente, remoção, limites e recuperação contextual.

Pendentes: modelo persistente, API autenticada, UI de revisão das preferências e integração comum dos contextos. Não executar migração de produção nesta fase.
