# Fronteiras de segurança

## Administração

Senhas usam scrypt com salt aleatório; não há credencial fixa. Sessões opacas de 256 bits têm validade de oito horas e somente HMAC no banco. Cookie HttpOnly, SameSite=Strict, Secure e prefixo __Host- em produção. Toda mutação web valida Origin contra APP_ORIGIN; todas as APIs consultam sessão, status e papel no servidor. ADMIN é limitado por managerId. Funcionários não acessam painel. Logout e desativação invalidam sessões. Não há autorização baseada somente na interface.

Rate limits persistem no Postgres e funcionam entre instâncias serverless: login administrativo/Desktop por conta e global e chamadas por funcionário. O limite global também permite negação de serviço por abuso; complementar com firewall/rate limiting na Vercel. Limpar RateLimit expirados e Session expiradas em manutenção autenticada periódica; não existe endpoint público de limpeza. IP arbitrário fornecido pelo cliente não é considerado identidade confiável.

## Login e sessões do Desktop

O acesso ao Desktop usa e-mail e senha; usuários EMPLOYEE, ADMIN e SUPER_ADMIN ativos podem entrar. O perfil Desktop é criado no primeiro login válido, sem alterar o papel da conta. A senha usa scrypt e nunca é salva pelo Desktop. Cada login cria uma sessão opaca de 90 dias ligada ao usuário e ao dispositivo; o servidor guarda somente o HMAC do identificador. Sessões administrativas não autorizam as APIs Desktop. Revogar usuário, trocar senha ou bloquear dispositivo invalida as sessões correspondentes.

A sessão é protegida com Electron safeStorage (DPAPI no Windows), sem exposição ao renderer. FastAPI a recebe em memória por endpoint privado autenticado, ausente da lista IPC. O Cloud verifica sessão, usuário e dispositivo em toda chamada. O Desktop verifica ao iniciar e a cada cinco minutos e renova a sessão nos sete dias anteriores à expiração. Falha de validação bloqueia o workspace e destrói o Quick Chat; falha de rede mantém somente a sessão protegida para nova tentativa. Não há modo de uso sem login. Fechar a janela encerra o processo.

A migration v4 remove credenciais antigas de Device e revoga códigos legados. Tabelas de códigos/licenças permanecem para histórico e não participam de nenhuma autorização ou rota ativa. O arquivo antigo de ativação não é carregado pela v4.

## OpenAI e custo

Somente Cloud carrega a chave OpenAI, configurada por variável ou pela dashboard SUPER_ADMIN. Segredos de provedores salvos no banco usam AES-256-GCM com chave derivada do AUTH_SECRET; não devolvem valores à interface. Modelos são permitidos por lista do servidor. Limites de corpo, mensagens, ferramentas, tokens de saída, frequência e timeout são aplicados no servidor. Chamadas usam store:false. Uso registrado vem exclusivamente do provedor. Reservas por funcionário e mês são serializadas por lock da linha de usuário; chamadas simultâneas não liberam o mesmo saldo duas vezes. Reserva conservadora usa bytes UTF-8 do contexto mais saída e margem; pode restringir uso antes do limite real.

Se o provedor não retornar uso por cancelamento, timeout ou falha, a reserva fica retida e a auditoria registra uso desconhecido. Não há liberação automática insegura; reconciliação operacional ainda é necessária. Preços configurados são estimativas em USD, não uma fatura. Voz retorna áudio binário sem tokens; registra caracteres em auditoria, mantém reserva conservadora e possui limite diário adicional. Não somar caracteres a UsageLog como se fossem tokens do provedor. Chats gerais e Quick Chat geral ficam no PostgreSQL, isolados por conta e sujeitos à cota de armazenamento; projetos e Writer persistem localmente. O contexto autorizado é enviado ao provedor conforme o pedido e os consentimentos existentes. `store:false` refere-se às chamadas do provedor e não significa ausência de armazenamento de chats no JARVIS.

## Desktop/local

contextIsolation:true, nodeIntegration:false, sandbox:true, navegação/janelas externas bloqueadas e IPC por papel, tamanho, método e destino. Câmera é negada. Microfone exige suporte do runtime, clique, confirmação humana e concessão de áudio de uso único por dez segundos; não há acesso em segundo plano. Links externos existentes exigem confirmação humana. O protocolo de ativação foi removido.

Ferramentas continuam registradas com allowlists; ler contexto não concede autorização. Pastas exigem seleção e confirmação humanas; abrir apps/pastas exige confirmação expirada/uso único. Não há execução automática de comandos da IA. O serviço só escuta loopback e requer token local aleatório. Usuário ou malware com acesso à mesma sessão Windows ainda pode ler memória do processo; DPAPI não protege contra comprometimento da máquina ativa.

Projetos, memória e Writer usam SQLite local; essa edição Cloud não adiciona criptografia integral aos bancos locais. Não confundir proteção da sessão com criptografia dos documentos. Perfis criptografados da edição portátil anterior exigem migração explícita ainda pendente. O nome `cloud-session-v4.bin` é preservado por compatibilidade. Não importar automaticamente dados privados do desenvolvimento, nem incluir `Backup/` em Vercel ou instalador.

## Clipboard, Writer e Spotify

Clipboard é opt-in e mantém conteúdo somente em RAM, com expiração, descarte, limites e filtro preventivo de credenciais. Não envia automaticamente; o filtro não é infalível e não analisa pixels. Writer valida propostas, versões e conflitos antes de atualizar um arquivo escolhido; continuar uma conversa aprova a proposta anterior conforme o fluxo visível. Fontes de contexto não autorizam comandos.

OAuth Spotify vincula uma transação curta e de uso único à sessão individual. Tokens e Client Secret permanecem criptografados no Cloud; comandos usam endpoints fixos e a conta do usuário, não URLs fornecidas pelo modelo. Metadados não retornam ao modelo de interpretação nem à memória de chats; com voz habilitada, a resposta exibida passa pelo serviço de síntese configurado, a pedido do proprietário. Consulte [SPOTIFY.md](SPOTIFY.md), [CREDENTIALS.md](CREDENTIALS.md), [CLIPBOARD.md](CLIPBOARD.md) e [WRITER.md](WRITER.md).

## Runtime da finalização

Electron atualizado de 44.9.0 para 44.9.1 para incluir a mitigação de certificados intermediários comprometidos, conforme [GHSA-jr5w-w6x2-84p9](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9). A correção do runtime não altera a versão 5.1.0 do produto.
