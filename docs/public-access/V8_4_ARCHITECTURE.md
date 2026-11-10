# Cyro v8.4.0-rc.1 — acesso público e ativação manual

Data: 09/11/2026. Candidata para homologação. Não equivale à aprovação para abertura pública.

## Responsabilidades e contratos

Desktop e Cloud usam a Cyro API. A API valida identidade, autorização, plano e consumo antes do provedor ou do Files. Files mantém seu contrato privado UUID/contexto assinado e versão independente 0.4.0; não classifica memórias, planos ou IA. Nenhum frontend recebe conexão PostgreSQL, segredo SMTP ou chave administrativa.

- `GET /api/public/account`: disponibilidade, versão dos documentos, chave pública Turnstile e ativação `ADMIN_MANUAL`.
- `POST /api/public/account`: register, resend, forgot, verify, reset. Corpo estrito; nenhum papel/plano aceito do cadastro.
- `GET /api/account`: somente identidade autenticada, plano efetivo, consumo e reserva do dia UTC, próxima renovação, dispositivos e consentimentos.
- `POST /api/account`: encerrar sessões e registrar solicitações de exportação/exclusão. Não apaga dados automaticamente.
- `GET /api/commercial`: listagem paginada (30, máximo 100), filtros, perfil de metadados, configuração, indicadores e CSV auditado da página autorizada.
- `POST /api/commercial`: comandos administrativos confirmados, motivo obrigatório, UUID idempotente e revisão esperada. API é a autoridade.

ADMIN mantém o escopo de usuários atribuídos; SUPER_ADMIN administra o conjunto. Cadastros públicos não se tornam administradores. Último SUPER_ADMIN ativo não pode ser suspenso. Perfil administrativo não expõe mensagens, memórias, nomes de arquivos, hashes de sessões ou respostas do provedor.

## Plano pago manual

Não existe checkout, integração de cobrança ou webhook financeiro. Em `/admin/users`, abrir o usuário, escolher PAID + ACTIVE, definir validade opcional e confirmar com justificativa. A concessão gera auditoria; papel administrativo permanece inalterado. Expiração é avaliada na API em cada acesso, sem depender de timer do cliente. ACTIVE/TRIALING válido usa PAID; cancelamento, suspensão ou expiração retorna a FREE. Conteúdo anterior permanece armazenado, sem upload automático ou exclusão. Exceções de quota PAID não sobrevivem à expiração.

FREE: 5 chamadas efetivas de IA/dia, 8.000 tokens/dia, entrada 1.500, saída 400; chat, Quick Chat e memória MAIN. PAID: 100.000 tokens/dia, entrada 8.000, saída 2.000, sem limite fixo diário de chamadas; EV, ferramentas, imagens e voz conforme configuração. Writer comercial permanece bloqueado por padrão até homologação específica; o fluxo legado é preservado com rollout desligado. Defaults de armazenamento: 50 MiB / 1 GiB; até 20 EVs no PAID. Limites existentes por arquivo, aplicação e Files continuam valendo. Quotas e capacidades são configuráveis e validadas novamente no backend.

SUPER_ADMIN mantém isenção da antiga quota mensal durante rollout legado. Não há isenção implícita das novas quotas comerciais: exceções individuais exigem alteração auditada. Reserva administrativa financeira não remove limites por usuário.

## Consumo e custos

A reserva transacional PostgreSQL ocorre antes do provedor, com bloqueio global de envelope financeiro e bloqueio do usuário. Buckets por usuário/dia, dia global, mês, provedor e modelo. Períodos e renovação usam 00:00 UTC; interfaces mostram horário local. Redis auxilia rate limits, não é fonte financeira.

A entrada inclui mensagens, instruções, memória, anexos/imagens e schemas das ferramentas pelo tokenizer existente. Contexto antigo pode ser removido por turnos completos; instruções essenciais e pergunta atual não são descartadas. Excesso essencial gera 413 antes da chamada. Saída é limitada no servidor.

Ledger durável por usuário/operação/fingerprint/modelo: retentativa concluída reproduz resposta limitada a 512 KiB sem nova chamada; em andamento ou incerta gera 409. Reutilizar UUID com outra pergunta não contorna a contagem de chamadas. Resposta com uso real libera sobra da reserva; raciocínio já incluso na saída e cache já incluso na entrada não são cobrados duas vezes. Rejeições explícitas 400/401/403/404/422/429 antes da geração liberam reserva e chamada. Timeout, desconexão, interrupção ou uso ausente ficam UNKNOWN, com reserva conservadora. Envios DISPATCHED há mais de dez minutos também podem ser conciliados após interrupção do processo; envios ainda ativos são recusados. SUPER_ADMIN pode liberar mediante verificação de que não houve cobrança, com motivo e auditoria; nunca presumir custo zero em falhas ambíguas.

Tarifas por modelo são valores configurados em micro-USD/milhão, com validade e revisão. Voz por caracteres usa unidade própria e não inventa tokens faturáveis. Preço ausente/expirado bloqueia inferência quando o rollout comercial está ligado. Custo é estimativa, não fatura. A reserva inclui margem de arredondamento de um micro-USD. Excesso inesperado coloca conta em retenção para investigação.

Fórmula: `(entrada_sem_cache * tarifa_entrada + entrada_cache * tarifa_cache + saída * tarifa_saída) / 1.000.000`; raciocínio não é somado novamente. Exemplo de teste usa tarifas fictícias: 80 entrada (40 cache), 20 saída (10 raciocínio), tarifas 1/0,5/2 USD/milhão → 100 tokens faturáveis, 100 micro-USD. Não é preço de produção. Sem tarifas reais informadas, estimativa monetária por usuário/modelo de produção é **indisponível**. Limite superior diário por usuário é o orçamento de tokens multiplicado pela maior tarifa ativa de token; envelopes global/provedor/modelo podem reduzir a disponibilidade. Indicadores mostram custo estimado, reservas e alerta visual ao atingir o percentual financeiro configurado; não foi criado serviço externo de alertas. Não há medição de capacidade real de usuários simultâneos. O ledger novo mede o período comercial após habilitação; UsageLog anterior permanece na visão de consumo legada. Ao habilitar no meio de um período, ajustar o envelope ao orçamento financeiro ainda disponível, sem tratar estimativas antigas como preços confirmados.

## Cadastro, sessão e recuperação

Cadastro cria EMPLOYEE + FREE + Client, sem acesso administrativo. Senha scrypt com salt; confirmação obrigatória e consentimentos separados/versionados. Novos usuários exigem verificação de e-mail; contas antigas preservam compatibilidade, sem confirmação fictícia. Links guardam somente HMAC no banco, são temporários e de uso único: verificação 24 h, reset 30 min. Segredo no fragmento do endereço evita envio em URL de servidor; interface remove fragmento e exige ação humana. Reset revoga sessões. Respostas de cadastro/recuperação são genéricas, sem confirmar existência ou entrega. Turnstile validado no servidor (hostname/action), limites global/IP/e-mail e cooldown de reenvio.

SMTP configurável, TLS validado e timeouts. Nenhum provedor de e-mail foi escolhido pelo proprietário. Falha de entrega preserva conta pendente e permite reenvio após cooldown; envio atual é assíncrono no processo, sem outbox durável de e-mail. Logs não contêm senha, token de link ou conteúdo privado. Não declarar entrega real sem teste SMTP.

## Migração e implantação automática autorizada

Migration nova da API: `20261109000100_public_access_plans`. Aditiva, preserva IDs, papéis, conversas, EVs, arquivos e memória. Cria planos, assinaturas FREE para usuários existentes, consentimentos, tokens temporários, ledger, buckets, tarifas e política pausada. Nunca concede PAID em massa. Normaliza e-mails somente após preflight de duplicatas; conflito de e-mails normalizados aborta transação sem mesclar/excluir contas. `lock_timeout=5s` evita bloquear indefinidamente escritas. Migrations anteriores não foram alteradas.

O proprietário autorizou envio, compilação, publicação e alterações dos servidores e informou deploy automático por commit. A imagem Docker da API executa `prisma migrate deploy` antes de iniciar o servidor; falha impede subir código incompatível. Não usa db push/reset/seed. Files não tem migration nova. Cloud continua sem banco. Se Coolify sobrescrever o CMD da imagem, sua configuração deve preservar essa etapa. Não foi presumida nem alterada a configuração do painel.

Manter inicialmente `CYRO_PUBLIC_ENABLED=0`, `PUBLIC_REGISTRATION_ENABLED=0`, `CYRO_LEGAL_APPROVED=0`: funcionalidade nova fica desativada e fluxo legado permanece. Aplicar e verificar migration/readiness antes de habilitar. Configurar tarifas, envelopes, concessões manuais necessárias, SMTP e Turnstile. Ligar CYRO_PUBLIC_ENABLED só após validar política financeira; ligar cadastro somente após revisão jurídica e teste real de verificação/reset. Não alterar segredos de sessão/criptografia atuais. Ver `.env.production.example` na API.

PostgreSQL: preservar volume e backup, migration aplicada pela API. Redis: manter rede privada e credenciais; nenhum flush. Files: preservar volume, contextos e quotas, sem mudança de IA/planos. Backend: rollout, SMTP, captcha e migração acima. Vercel: somente CYRO_BACKEND_ORIGIN; sem SMTP/DB/OpenAI no frontend. Instalador usa a mesma origem API e portal público fixo `https://admin.cyro-ia.tech`, sem segredo embutido.

## Rollback e pendências reais

Preferir correção ou imagem anterior compatível com schema aditivo; desligar flags públicas para restaurar o comportamento legado. Não remover tabelas/colunas, não restaurar banco sem incidente aprovado. A migração 8.2 de slots general já restringia rollback a 8.1.2: continua incompatível sem ensaio. Não apagar volumes ou snapshots. Preservar Backup e instaladores.

Persistem bloqueadores externos da 8.3: restauração real de backups, homologação Linux/Coolify/Redis/PostgreSQL/Files, Windows limpo/atualização e assinatura de código quando aplicável. Cadastro depende de SMTP/Turnstile e aprovação jurídica, ainda não fornecidos/configurados nesta etapa. Solicitações LGPD entram em fila OPEN e exigem atendimento humano; exportação/exclusão integral automática não é implementada. Retenção de ledger/replay exige política operacional antes de abertura pública. Conciliação de uso efetivamente cobrado e liberação de quotaHold estão disponíveis ao SUPER_ADMIN com confirmação, motivo, ausência de pendências e auditoria. Gráficos temporais administrativos e quotas por recurso individual além dos campos expostos permanecem melhorias pendentes. Não existe teste de carga com custo real.

Dependências Python efetivamente empacotadas foram auditadas: pypdf 6.10.0 e certifi 2026.7.22 foram substituídos por 6.21.4 e 2026.10.23; auditoria da resolução instalada após correção não encontrou alertas conhecidos. A primeira saída local anterior à correção foi isolada e não publicada.

Recomendação: **NO-GO para abertura pública** enquanto esses bloqueadores não tiverem evidência. Deploy técnico com rollout desligado não significa lançamento público aprovado.
