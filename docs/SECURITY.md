# Fronteiras de segurança

## Administração

Senhas usam scrypt com salt aleatório; não há credencial fixa. Sessões opacas de 256 bits têm validade de oito horas e somente HMAC no banco. Cookie HttpOnly, SameSite=Strict, Secure e prefixo __Host- em produção. Toda mutação web valida Origin contra APP_ORIGIN; todas as APIs consultam sessão, status e papel no servidor. ADMIN é limitado por managerId. Funcionários não acessam painel. Logout e desativação invalidam sessões. Não há autorização baseada somente na interface.

Rate limits persistem no Postgres e funcionam entre instâncias serverless: login por conta e global, ativação global e por instalação, chamadas por funcionário. O limite global também permite negação de serviço por abuso; complementar com firewall/rate limiting na Vercel. Limpar RateLimit expirados e Session expiradas em manutenção autenticada periódica; não existe endpoint público de limpeza. IP arbitrário fornecido pelo cliente não é considerado identidade confiável.

## Ativações e licenças

Código aleatório de 32 bytes, exibido uma vez, armazenado como HMAC. Uso máximo um, validade até sete dias e funcionário ativo obrigatório. Consumo condicional dentro de transação serializável cria Device/License/auditoria atomicamente. Revogação e tentativas concorrentes não devem conceder segunda instalação. Colisões/falhas transacionais abortam; testes contra Postgres gerenciado continuam necessários. O código autoriza a instalação a agir como o funcionário: enviar por canal privado. Deep links nunca contêm chave OpenAI.

Credencial individual expira em 90 dias e é guardada com Electron safeStorage (DPAPI no Windows). Renderer não recebe a credencial; FastAPI a recebe em memória em endpoint privado autenticado, ausente da lista IPC. Licença/status/revogação são verificados em toda chamada Cloud. A credencial é renovada nos sete dias anteriores à expiração. Recuperação de ativação após falha de gravação local ou credencial já expirada exige suporte administrativo; a credencial não é silenciosamente substituída por outro cliente. Não há licença offline para inteligência artificial.

## OpenAI e custo

Somente Cloud carrega OPENAI_API_KEY. Modelos são permitidos por lista do servidor. Limites de corpo, mensagens, ferramentas, tokens de saída, frequência e timeout são aplicados no servidor. Chamadas usam store:false. Uso registrado vem exclusivamente do provedor. Reservas por funcionário e mês são serializadas por lock da linha de usuário; chamadas simultâneas não liberam o mesmo saldo duas vezes. Reserva conservadora usa bytes UTF-8 do contexto mais saída e margem; pode restringir uso antes do limite real.

Se o provedor não retornar uso por cancelamento, timeout ou falha, a reserva fica retida e a auditoria registra uso desconhecido. Não há liberação automática insegura; reconciliação operacional ainda é necessária. Preços configurados são estimativas em USD, não uma fatura. Voz retorna áudio binário sem tokens; registra caracteres em auditoria, mantém reserva conservadora e possui limite diário adicional. Não somar caracteres a UsageLog como se fossem tokens do provedor. Conteúdo de conversas/arquivos não é gravado pelo Cloud, mas é enviado ao provedor quando necessário; obedecer políticas do provedor e consentimento dos funcionários.

## Desktop/local

contextIsolation:true, nodeIntegration:false, sandbox:true, navegação/janelas externas bloqueadas e IPC por papel, tamanho, método e destino. Câmera é negada. Microfone exige suporte do runtime, clique, confirmação humana e concessão de áudio de uso único por dez segundos; não há acesso em segundo plano. Links externos existentes exigem confirmação humana. jarvis:// aceita somente activate e um único token base64url válido, sem fragmentos, usuário, senha ou caminho extra. A abertura do link pede confirmação antes de consumir o código.

Ferramentas continuam registradas com allowlists; ler contexto não concede autorização. Pastas exigem seleção e confirmação humanas; abrir apps/pastas exige confirmação expirada/uso único. Não há execução automática de comandos da IA. O serviço só escuta loopback e requer token local aleatório. Usuário ou malware com acesso à mesma sessão Windows ainda pode ler memória do processo; DPAPI não protege contra comprometimento da máquina ativa.

Histórico/memória SQLite v3 são locais e não têm criptografia integral adicionada por esta migração. Não confundir proteção da credencial com criptografia dos bancos. Perfis criptografados da edição portátil anterior exigem migração explícita ainda pendente. Não importar automaticamente dados privados do desenvolvimento, nem incluir Backup/legacy em Vercel ou instalador.
