# Segurança de distribuição

- SUPER_ADMIN obrigatório nas APIs e navegação; requisições administrativas validam Origin, schema estrito, limite do corpo e rate limit.
- Repositório fixo. Tag real validada por GitHub; nome/commit não aceitos livremente do formulário. Tentativa e lease conferidas atomicamente. GitHub IDs e URL do asset têm contrato limitado.
- Cloud emite somente tickets HMAC de finalidade específica; callbacks de publicação são assinados pelo serviço. Download exige sessão individual ativa antes de emitir capacidade temporária. Tokens não ficam em respostas, logs ou Prisma.
- Sem corpo grande na Vercel. Publisher limita tamanho declarado e bytes recebidos, usa arquivos exclusivos, valida assinatura PE/NSIS e ProductVersion e renomeia somente a cópia de staging.
- Publicação não confia no SHA enviado pelo navegador: calcula do arquivo recebido e baixa o asset remoto inteiro para conferir. Banco só muda a PUBLISHED após callback completo; clientes não recebem reservas, falhas, drafts ou betas.
- Setup.exe existente nunca é apagado/substituído. Recuperação precisa ser explícita e conserva integridade. Não há endpoints de mutação de tags.
- Download automático fica no main process, não recebe caminho/URL/comando arbitrário do renderer. Origem HTTPS, redirects limitados e sem repassar segredo para CDN, tamanho/hash/versão e Authenticode verificados. Instalação exige estado pronto, nova verificação e fechamento seguro.
- Hash protege integridade, não substitui assinatura de código ou integridade das contas administrativas. Revogar/rotacionar credenciais comprometidas e retirar publicação de circulação por procedimento administrativo manual auditado; não apagar histórico automaticamente.
- Proxy externo precisa de limites de conexão/taxa e logs sem tickets/segredos. Sem infraestrutura configurada, publicação permanece indisponível. Não habilitar com endpoints de teste públicos.
