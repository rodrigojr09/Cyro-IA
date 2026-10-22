# Fronteiras de segurança

## Administração

Senhas usam scrypt com salt aleatório; não há credencial fixa. Sessões opacas de 256 bits têm validade de oito horas e somente HMAC no banco. Cookie HttpOnly, SameSite=Strict, Secure e prefixo __Host- em produção. Toda mutação web valida Origin contra APP_ORIGIN; todas as APIs consultam sessão, status e papel no servidor. ADMIN é limitado por managerId. Funcionários não acessam painel. Logout e desativação invalidam sessões. Não há autorização baseada somente na interface.

Rate limits persistem no Postgres e funcionam entre instâncias serverless: login administrativo/Desktop por conta e global e chamadas por funcionário. O limite global também permite negação de serviço por abuso; complementar com firewall/rate limiting na Vercel. Limpar RateLimit expirados e Session expiradas em manutenção autenticada periódica; não existe endpoint público de limpeza. IP arbitrário fornecido pelo cliente não é considerado identidade confiável.

## Login e sessões do Desktop

O acesso ao Desktop usa e-mail e senha; usuários EMPLOYEE, ADMIN e SUPER_ADMIN ativos podem entrar. O perfil Desktop é criado no primeiro login válido, sem alterar o papel da conta. A senha usa scrypt e nunca é salva pelo Desktop. Cada login cria uma sessão opaca de 90 dias ligada ao usuário e ao dispositivo; o servidor guarda somente o HMAC do identificador. Sessões administrativas não autorizam as APIs Desktop. Revogar usuário, trocar senha ou bloquear dispositivo invalida as sessões correspondentes.

A sessão é protegida com Electron safeStorage (DPAPI no Windows), sem exposição ao renderer. FastAPI a recebe em memória por endpoint privado autenticado, ausente da lista IPC. O Cloud verifica sessão, usuário e dispositivo em toda chamada. O Desktop verifica ao iniciar e a cada cinco minutos e renova a sessão nos sete dias anteriores à expiração. Falha de validação bloqueia o workspace e destrói o Quick Chat; falha de rede mantém somente a sessão protegida para nova tentativa. Não há modo de uso sem login. Fechar a janela encerra o processo.

A migration v4 remove credenciais antigas de Device e revoga códigos legados. Tabelas de códigos/licenças permanecem para histórico e não participam de nenhuma autorização ou rota ativa. O arquivo antigo de ativação não é carregado pela v4.

## OpenAI e custo

Somente Cloud carrega OPENAI_API_KEY. Modelos são permitidos por lista do servidor. Limites de corpo, mensagens, ferramentas, tokens de saída, frequência e timeout são aplicados no servidor. Chamadas usam store:false. Uso registrado vem exclusivamente do provedor. Reservas por funcionário e mês são serializadas por lock da linha de usuário; chamadas simultâneas não liberam o mesmo saldo duas vezes. Reserva conservadora usa bytes UTF-8 do contexto mais saída e margem; pode restringir uso antes do limite real.

Se o provedor não retornar uso por cancelamento, timeout ou falha, a reserva fica retida e a auditoria registra uso desconhecido. Não há liberação automática insegura; reconciliação operacional ainda é necessária. Preços configurados são estimativas em USD, não uma fatura. Voz retorna áudio binário sem tokens; registra caracteres em auditoria, mantém reserva conservadora e possui limite diário adicional. Não somar caracteres a UsageLog como se fossem tokens do provedor. Conteúdo de conversas/arquivos não é gravado pelo Cloud, mas é enviado ao provedor quando necessário; obedecer políticas do provedor e consentimento dos funcionários.

## Desktop/local

contextIsolation:true, nodeIntegration:false, sandbox:true, navegação/janelas externas bloqueadas e IPC por papel, tamanho, método e destino. Câmera é negada. Microfone exige suporte do runtime, clique, confirmação humana e concessão de áudio de uso único por dez segundos; não há acesso em segundo plano. Links externos existentes exigem confirmação humana. O protocolo de ativação foi removido.

Ferramentas continuam registradas com allowlists; ler contexto não concede autorização. Pastas exigem seleção e confirmação humanas; abrir apps/pastas exige confirmação expirada/uso único. Não há execução automática de comandos da IA. O serviço só escuta loopback e requer token local aleatório. Usuário ou malware com acesso à mesma sessão Windows ainda pode ler memória do processo; DPAPI não protege contra comprometimento da máquina ativa.

Histórico/memória SQLite v4 são locais e não têm criptografia integral adicionada por esta migração. Não confundir proteção da credencial com criptografia dos bancos. Perfis criptografados da edição portátil anterior exigem migração explícita ainda pendente. Não importar automaticamente dados privados do desenvolvimento, nem incluir Backup/legacy em Vercel ou instalador.
