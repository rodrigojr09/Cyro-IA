# Decisões arquiteturais

- 27/10/2026: proprietário autorizou alterar alvo de 5.1.0 para 6.0.0 em desenvolvimento; sem tag/estabilidade implícita.
- Manter monorepo npm e caminhos existentes. Não introduzir ferramenta de workspace nem pacotes vazios.
- Compartilhar identidade e regras da IA; modos acrescentam somente contexto e contrato. Writer conserva armazenamento/revisões como ferramentas especializadas.
- Não migrar SQLite privado para memória global por conveniência. Exige escopos e consentimento definidos.
- React + TypeScript é candidato para renderer, mas conversão integral sem cobertura de IPC/voz/clipboard não é segura. Migrar por superfícies após contratos; Electron permanece.
- Cache precisa invalidação entre janelas e contas antes de ativação; protótipo isolado não basta.
- Preservar v5 no histórico pelo commit existente; commits incrementais e sem push/tag.

- 27/10/2026: nome público Cyro IA, repositório Cyro-IA, setup Cyro-IA-Setup-6.0.1.exe. Mantidos appId com.jarvis.assistant, executableName JARVIS, dados em JARVIS e canais jarvis:*; esses identificadores não são a marca visível e preservam atualização, sessões e isolamento. Não renomear pastas persistidas sem migração. Origem Cloud existente permanece; mudar o nome do produto não configura um novo domínio.
