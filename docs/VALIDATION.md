# Validação — JARVIS 5.0.0

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

## Registro desta finalização

Execução de consolidação em **27/10/2026**:

| Verificação | Resultado |
| --- | --- |
| Instalação dos workspaces | `npm ci` na raiz concluído; depois aplicada a correção Electron 44.9.1 e sincronizados os dois locks. |
| Auditoria npm após a correção | Zero vulnerabilidades conhecidas reportadas. |
| Repositório | Versões e 36 documentos com links locais válidos; índice sem caminhos privados proibidos. |
| Ferramentas de validação | 2 testes aprovados. |
| Cloud | 84 testes aprovados; TypeScript e build de produção aprovados. |
| Desktop | 149 testes aprovados; TypeScript e bundle aprovados. |
| Backend Python | 191 testes aprovados. |
| Iniciadores e empacotamento | 34 testes aprovados. |
| Electron 44.9.1 | Sete smokes aprovados: principal, Quick Chat, Cloud, sessão, clipboard, Writer e Spotify. |
| Dashboard | 40 verificações de layout aprovadas, incluindo versão 5.0.0 e consumo. |
| Formatação | Prettier dos JS/TS/JSON revisados e Black dos seis módulos Python revisados aprovados. |

São **460 testes automatizados**, além dos sete smokes e das 40 verificações de layout. Cloud/IA/Spotify são simulados onde indicado nas fixtures. O smoke de clipboard imprime uma rejeição IPC esperada ao testar uma solicitação não autorizada; isso não é uma falha da suíte.

Uma execução preliminar dos testes de iniciador, durante a reinstalação de dependências, excedeu a espera de dez segundos para o backend de teste. A execução completa posterior passou nos 34 testes; a mensagem de timeout também foi corrigida para informar a duração efetivamente configurada. Nenhuma validação externa foi inferida dessa reexecução.

O empacotamento encontrou a dependência Electron instalada na raiz do workspace e recusou a faixa ^44.9.1. A versão foi fixada em 44.9.1 nos manifests/locks e um teste impede regressão. A suíte de iniciadores/compilação foi reexecutada com 34 testes aprovados; o empacotamento foi retomado sobre o backend e os bundles já validados. A auditoria e o teste de reinício do payload final passaram, conforme os dados abaixo.

## Homologação externa pendente

- Clipboard manual entre aplicativos Windows, bolinha no shell, som/volume/mute no dispositivo físico, duas janelas abrindo em disputa e nova cópia durante edição.
- Conta autorizada Spotify: conectar/negar/expirar/repetir callback, reiniciar, refresh/revogação, conta sem Premium, isolamento real entre contas e diálogo de dispositivo nos três meios (chat, Quick Chat e voz).
- OpenAI real autorizado: texto, streaming, cancelar, cotas e voz paga. Conferir uso no provedor sem expor conteúdo ou credenciais.
- Writer com documentos reais escolhidos pelo usuário: perguntas sem alteração, revisão/aprovação, conflito externo, seleção, desfazer e atualização do original. Não sobrescrever documentos pessoais apenas para executar testes.
- Windows limpo: instalar, atualizar e desinstalar com dados temporários, conferir atalhos e preservação do perfil; DPI, múltiplos monitores, microfone e recuperação após falha.

A falta de homologação não é ocultada por mocks. Não criar tag ou afirmar certificação externa com base apenas nos resultados locais.

## Artefato final — 27/10/2026

- Arquivo: `release/v5/JARVIS-Setup-5.0.0.exe`.
- Tamanho: **186.202.959 bytes**.
- FileVersion/ProductVersion: **5.0.0**; runtime Electron **44.9.1**.
- SHA-256: `9b6f7911a6d157c2b2ee0aadaf425355f70efc82f820c6c928749ca632448239`.
- Verificação ao lado do arquivo: `JARVIS-Setup-5.0.0.exe.sha256`.
- Assinatura Authenticode: **NotSigned**.
- Origem Cloud embutida e auditada: `https://cronosjarvis.vercel.app`.

PyInstaller concluiu a compilação e o backend congelado passou em `--self-check` com dados de teste. O empacotamento NSIS terminou com sucesso depois da fixação da versão Electron. A auditoria comparou fontes e configuração Cloud no ASAR/runtime e recusou arquivos privados proibidos. O payload final iniciou e reiniciou com perfil temporário e PATH sem Python/Node; identidade, autenticação local e persistência passaram. A execução ocorreu depois de concluída a compactação. O setup não foi instalado sobre o perfil pessoal, nem certificado em Windows limpo. Não houve chamada paga ou OAuth real nessa validação.

Logs locais não versionados: `build/v5/finalization.log` e `build/v5/finalization-package.log`. Artefato e checksum permanecem locais; não há upload automático, assinatura digital ou tag de release.
