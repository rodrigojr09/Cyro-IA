# Validação da migração v6.0.0 — em desenvolvimento

Execução atual em **27/10/2026**, branch `codex/jarvis-v6-architecture`. Resultados v5 abaixo são históricos e não certificam v6.

| Verificação atual | Resultado |
| --- | --- |
| npm ci na raiz | Concluído: 485 pacotes instalados, 489 auditados; nenhuma vulnerabilidade reportada. |
| Repositório / ferramentas Node | Versões e links aprovados; 2 testes aprovados. |
| Cloud | 84 testes, TypeScript e build de produção aprovados. |
| Desktop | 155 testes, TypeScript e bundle aprovados; inclui 13 testes de workspace. |
| Python backend | 193 testes aprovados, incluindo identidade comum; 42 testes Writer também executados separadamente. |
| Iniciadores/empacotamento | 34 testes aprovados; não equivale a gerar ou instalar um setup v6. |
| Electron | Principal, Quick, login Cloud, clipboard, Writer e Spotify aprovados com serviços externos simulados. |
| Layout administrativo | 40 verificações aprovadas em Chromium real, com dados sintéticos. |
| Electron/FastAPI sessão | Bloqueado: porta 8765 ocupada por jarvis-backend.exe já instalado. Não encerrado nem substituído. A execução agregada parou nesse ponto; os três smokes seguintes foram executados separadamente. |

Total sem dupla contagem: **468 testes automatizados**, mais seis smokes Electron. Logs locais em `build/v6/`. Layout administrativo: 40 verificações aprovadas. A alteração prévia de cloud/next-env.d.ts foi restaurada exatamente após o build e permanece fora dos commits.

Não houve implantação, migration de banco, chamada paga, OAuth real, instalação v6 ou teste em Windows limpo. A migração permanece parcial: memória GLOBAL_USER, React, registro/orquestração central completos, cache Writer/Quick compartilhado, eventos/revisões remotos e rascunhos ao F5 ainda pendentes. Veja o [plano incremental](architecture/MIGRATION_PLAN.md). Não marcar v6 estável ou pronta para distribuição.


# Validação — JARVIS 5.1.0

Este documento acompanha a implementação atual. Evidências de versões anteriores estão no [arquivo histórico](history/README.md); o relato cronológico de desenvolvimento v5 está em [V5-DEVELOPMENT.md](history/V5-DEVELOPMENT.md).

## Reproduzir

Na raiz, após `npm ci` e a instalação dos requisitos Python:

```powershell
npm run check:v5
```

O comando verifica, em sequência:

1. Versões de manifests/locks, links locais da documentação e ausência de caminhos privados proibidos no índice Git.
2. Runner de testes, Cloud, TypeScript e build Next.js/Prisma.
3. TypeScript, bundle e testes Node do Desktop.
4. Descoberta completa de testes Python do backend e testes dos iniciadores/empacotamento.
5. Sete smokes Electron reais: principal, Quick Chat, Cloud, sessão, clipboard, Writer e Spotify.
6. Layout administrativo em cinco larguras, com cache, filtros, gráficos e formulários.

O runner Electron elimina `ELECTRON_RUN_AS_NODE` apenas no ambiente dos processos de teste que ele inicia. Isso permite rodar dentro de outro host Electron sem alterar o aplicativo pessoal. Os testes usam perfis temporários e serviços externos simulados; não acessam dados reais para provar cenários simulados.

Também é possível executar cada script separado: consulte `package.json` e `desktop/package.json`. Não existe lint ESLint configurado; formatação usa Prettier no JS/TS e Black nos módulos Python revisados. O build de distribuição exige a validação completa antes de empacotar.

## Registro da versão 5.1.0

Execução completa em **27/10/2026**, com os manifests, título, tela Sobre e backend sincronizados em **5.1.0**. O [registro da consolidação anterior](history/V5-CONSOLIDATION-5.0.md) preserva as evidências e o checksum 5.0.0, sem atribuí-los ao instalador novo.

| Verificação | Resultado |
| --- | --- |
| Repositório | Versões sincronizadas e 37 documentos com links locais válidos; índice sem caminhos privados proibidos. |
| Ferramentas de validação | 2 testes aprovados. |
| Cloud | 84 testes aprovados; TypeScript e build de produção aprovados. |
| Desktop | 149 testes aprovados; TypeScript e bundle aprovados. |
| Backend Python | 191 testes aprovados. |
| Iniciadores e empacotamento | 34 testes aprovados, incluindo versões visíveis e runtime. |
| Electron 44.9.1 | Sete smokes aprovados: principal, Quick Chat, Cloud, sessão, clipboard, Writer e Spotify. |
| Dashboard | 40 verificações de layout aprovadas, incluindo rodapé 5.1.0 e consumo. |

São **460 testes automatizados**, além dos sete smokes e das 40 verificações de layout. Provedores externos são simulados onde indicado nas fixtures. A rejeição IPC não autorizada impressa pelo smoke de clipboard é esperada. O runtime permanece fixado em Electron 44.9.1; a auditoria npm após essa correção não reportou vulnerabilidades conhecidas, e a mudança para 5.1.0 não altera as versões de dependências.

A compilação, auditoria e reinicialização do pacote 5.1.0 foram concluídas. Nenhum checksum 5.0.0 é reutilizado na entrega nova.

## Homologação externa pendente

- Clipboard manual entre aplicativos Windows, bolinha no shell, som/volume/mute no dispositivo físico, duas janelas abrindo em disputa e nova cópia durante edição.
- Conta autorizada Spotify: conectar/negar/expirar/repetir callback, reiniciar, refresh/revogação, conta sem Premium, isolamento real entre contas e diálogo de dispositivo nos três meios (chat, Quick Chat e voz).
- OpenAI real autorizado: texto, streaming, cancelar, cotas e voz paga. Conferir uso no provedor sem expor conteúdo ou credenciais.
- Writer com documentos reais escolhidos pelo usuário: perguntas sem alteração, revisão/aprovação, conflito externo, seleção, desfazer e atualização do original. Não sobrescrever documentos pessoais apenas para executar testes.
- Windows limpo: instalar, atualizar e desinstalar com dados temporários, conferir atalhos e preservação do perfil; DPI, múltiplos monitores, microfone e recuperação após falha.

A falta de homologação não é ocultada por mocks. Não criar tag ou afirmar certificação externa com base apenas nos resultados locais.

## Instalador final 5.1.0 — 27/10/2026

- Arquivo: `release/v5/JARVIS-Setup-5.1.0.exe`.
- Tamanho: **186.203.076 bytes**.
- FileVersion e ProductVersion: **5.1.0**; runtime Electron **44.9.1**.
- SHA-256: `bc4833f6e7a0123611b137658b6e395e0afa0a812e7dc75420a0e7ece21ce218`.
- Arquivo de verificação: `JARVIS-Setup-5.1.0.exe.sha256`.
- Assinatura Authenticode: **NotSigned**.
- Origem Cloud embutida e auditada: `https://cronosjarvis.vercel.app`.

O pipeline completo terminou com sucesso, incluindo PyInstaller e NSIS. O backend congelado passou em `--self-check`. A auditoria comparou fontes e configuração do ASAR/runtime e não encontrou arquivos privados proibidos. Depois de concluído o empacotamento, o payload 5.1.0 iniciou e reiniciou com perfil temporário e PATH sem Python/Node; identidade/versão 5.1.0, autenticação local e persistência passaram.

O executável foi recompilado; não se renomeou o setup 5.0.0. O log local desta execução fica em `build/v5/finalization-5.1.0.log`. Não houve instalação sobre o perfil pessoal, teste de Windows limpo, chamada paga ou OAuth real. Não foram criados tag ou upload de binário para GitHub Release. O artefato 5.0.0 anterior permanece identificado separadamente no histórico.
