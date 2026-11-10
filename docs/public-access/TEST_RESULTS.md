# Validação v8.4.0-rc.1 — 09/11/2026

Ambiente local Windows, Node 24.22.1, Python 3.14. Banco PostgreSQL embarcado PGlite e fixtures HTTP/SMTP sintéticas; nenhum uso de IA pago nos testes.

- API: 143 testes passaram na regressão; build de produção passou. Suite comercial cobre migration, FREE/PAID manual, expiração, CAS/auditoria, quota, idempotência, uso incerto, bloqueio financeiro, escopo, cadastro, consentimento, verificação e reset. Provedor e entrega SMTP simulados, não uma validação dos serviços reais.
- Cloud: 16 testes passaram; typecheck e build passaram. 70 verificações Chromium da interface anterior e 10 das novas páginas públicas/conta/ativação manual passaram. Testes usam HTTP sintético, sem modificar usuários reais.
- Desktop: validação completa e geração do instalador em execução. Não considerar aprovadas até atualização deste registro.
- Files: regressão da compatibilidade ainda pendente nesta execução. Versão 0.4.0 preservada.
- Infraestrutura antes do envio: API /health e /ready 200, Cloud /health 200, ambos identificam 8.1.2. Não prova deploy novo nem backup recuperável.

Instaladores anteriores preservados. Abertura pública continua NO-GO pelas condições operacionais documentadas em V8_4_ARCHITECTURE.md. Resultados finais serão registrados após conclusão dos verificadores.
