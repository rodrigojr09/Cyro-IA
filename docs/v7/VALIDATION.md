# Validação da preparação v7 — 30/10/2026

Versões: Desktop/Backend/Cloud 7.0.0-alpha.0; Files 0.2.0; SDK Files 0.1.0. Os quatro projetos continuam instaláveis e compiláveis separadamente. Nenhum deploy, migration de produção, push, tag ou release real executado.

## Resultados locais

- Desktop: check:v7 aprovado, incluindo verificações de repositório/ferramentas, TypeScript/build, 161 testes JavaScript, 214 testes Python do runtime, 31 testes de inicialização/build, sete smokes Electron e quatro testes das ferramentas de plataforma.
- Backend: build de produção aprovado; suíte de 110 casos executada. Dois testes antigos de provider-settings exigiram atualizar a mensagem Backend e fornecer Client ID Spotify fictício explicitamente após remover o fallback embutido. A suíte de providers foi repetida com 11/11 aprovados; os demais 108 casos passaram na execução completa.
- Cloud: build de produção, nove testes e 63 verificações de layout em Chromium aprovados.
- Files: build e SDK build aprovados. 69 testes aprovados e sete de integração externa ignorados por ausência de serviços de teste dedicados. Dois testes de scripts Bash excederam cinco segundos sob execução concorrente; repetição completa com limite de 30 segundos passou, sem modificar código de produção.
- Contratos HTTP Backend/Cloud e protocolo do atualizador nos três projetos sincronizados.
- Auditoria local dos arquivos preparados e de todo histórico Git alcançável dos quatro repositórios: nenhum candidato a segredo pelos padrões revisados. .env preenchido, chaves privadas, bancos e perfis não são versionados. Valores nunca são exibidos no relatório.

Logs locais ficam em build/ ou arquivos v7-final-*.log ignorados. Relatórios de integração e auditoria ficam em .cyro/, fora dos repositórios dos produtos. Os smokes antigos emitem avisos de IPC sem handler em fixtures parciais; concluíram com código zero e assertions aprovadas. Não equivalem a certificação visual ou de áudio físico.

## Escopo do teste integrado

As 11 verificações integradas passaram. O teste em tools/platform/integration usa HTTP real de Backend/Cloud, Prisma com PostgreSQL embarcado, serviço Files/SDK/disco e cliente Electron com safeStorage real. Redis é um simulador RESP e GitHub é um simulador de protocolo. Não cria tags/releases reais, não executa Setup.exe e não lê configurações de produção.

Abrange login/sessão do painel, SSR autenticado, diagnóstico de serviços, configuração GitHub criptografada, publicação simulada com instalador validado, arquivos privados, isolamento entre proprietários, exclusão autorizada, sessão persistida do Desktop, download/verificação do atualizador e revogação no logout. Uma execução concorrente sofreu timeout no cliente Electron; a repetição sem os builds concorrentes passou integralmente.

## Limites para liberação

Ainda é necessário homologar Docker/Linux, HTTPS/rede privada, PostgreSQL 17 e Redis 7.2 reais, configuração dos domínios, permissões reais do token GitHub, provedores de IA/OAuth pagos e atualização instalada em Windows limpo. Não há produção validada apenas com estes testes.

Preservados dados e históricos locais. Importação/centralização desses históricos é uma etapa explícita posterior, sem upload automático. Nenhum instalador final de produção foi publicado nesta preparação. Os modelos .env.production.example precisam dos valores privados existentes, preservando chaves e volumes. Consulte PRODUCTION.md e PUBLICATION.md antes da transição.
