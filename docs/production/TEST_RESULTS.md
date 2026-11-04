# Resultados de validação — Cyro 8.3.0-rc.1

Execução local em 04/11/2026, Windows 8 GB/i5-2400; Node 24, Python 3.14. Dados sintéticos e perfis temporários. Não acessa credenciais ou dados reais.

| Verificação | Evidência atual |
| --- | --- |
| API | 134 testes passaram no código final; teste TCP de indisponibilidade/recuperação Redis e validação de schema incluídos; typecheck, build final e smoke HTTP passaram |
| Files | 77 passaram, 7 ignorados por falta de PostgreSQL/Redis de teste; build e SDK passaram |
| Desktop | 173 JS passaram; 219 testes Python passaram após corrigir streaming legado e atualizar Pillow13.0.0/cryptography50.0.2; 31 testes de inicialização/build, 4 plataforma e 2 ferramentas passaram |
| Cloud | 15 testes, typecheck, build e 70 verificações Chromium passaram |
| Electron | 8 cenários passaram; sessão Electron + FastAPI real com API sintética, Writer, clipboard, Quick, EV, memória e atualizador |
| Segurança | npm audit final retornou zero alertas nos quatro projetos; pip-audit final não encontrou vulnerabilidades conhecidas nas dependências resolvidas. Não substitui testes de autorização |
| Backup | Teste read-only de volume sintético passou; restauração pg_dump/pg_restore de dados reais NÃO EXECUTADA |
| Infraestrutura pública | Somente /health e /ready: 200; API/Cloud identificam 8.1.2 |
| Instalador RC | NÃO GERADO; último instalador 8.1.2 preservado |

Não existe lint configurado nos quatro projetos. Typecheck/build e testes são os verificadores disponíveis. Não houve publicação real, migration de produção, assinatura de código nova ou teste de Windows limpo.

## Falhas encontradas durante esta execução

- Files: um teste excedeu 5 s com arquivos paralelos; os 77 testes passaram com execução sequencial configurada, sem aumentar o timeout.
- Python: um teste de streaming falhou ao passar request_id para store legado; corrigido e 3 testes focados passaram. Regressão completa posterior registrada ao final.
- Electron: teste esperava ausência física do EV que fica montado/oculto para preservar estado; corrigido para exigir oculto e zero leitura de histórico. Fixture de sessão precisava responder catalog/Quick. Cenário isolado voltou a passar.
- Verificador de links executado antes da criação deste arquivo apontou link pendente; não é falha de runtime. Reexecutar após documentação completa.

## Limites das evidências

PostgreSQL embarcado e HTTP real comprovam transações/constraints/corridas nas fixtures, não disponibilidade ou backup da VPS. Provedores/Redis/Files/GitHub simulados não comprovam serviço real. Sete testes Files externos permanecem sem execução. Não inferir economia monetária com preços ausentes, usuários simultâneos com esta amostra ou ausência de vazamento com medição curta.

Integração da plataforma: 13 verificações passaram via tools/platform/integration, com HTTP real dos quatro projetos, Prisma/bancos embarcados, volume temporário, sessão Electron, publicação/atualização simuladas, autenticação/isolamento e logout. Redis é fixture RESP, GitHub/provedor não são serviços pagos reais.

Resiliência Redis: conexão TCP aceita que deixa de responder falhou no prazo integral em aproximadamente 3,1 s. Foram detectados e corrigidos durante o ensaio o timeout limitado apenas à fila do cliente Redis e a espera de encerramento. Um teste de criação EV também trocou espera fixa por aguardar a conclusão real do hash assíncrono; suíte JS completa posterior passou (173). Build do verificador de backup incluiu o script no typecheck e corrigiu a tipagem da paginação.

Auditoria de arquivos e histórico Git: Desktop3244/API654/Cloud235/Files234 objetos percorridos. Três candidatos da API foram revisados: todos eram o mesmo placeholder sintético do exemplo de healthcheck, sem credencial real; exemplo atual recebeu prefixo test-only para reduzir falso positivo, histórico preservado. Nenhum valor candidato foi impresso no relatório.
