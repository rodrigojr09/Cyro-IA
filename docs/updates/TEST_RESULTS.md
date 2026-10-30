# Testes da 6.3.0

Estado de implementação: em desenvolvimento. Não representa homologação final da família v6.

Executado em 29/10/2026: consulta real somente de leitura à API GitHub confirmou repositório privado e tags v5.1.0, v4.2.0, v3.0.0 (uma página). Não criou tags, releases ou assets. Evidência local build/v6/v630-github-audit.json. O setup 6.2.2 real passou na inspeção PE/NSIS/ProductVersion pelo validador novo.

Oito testes Cloud novos passaram: seleção da última estável, paginação com 101 tags e ordenação SemVer, tag inexistente, tickets inválidos/expirados e papéis administrativos, associação/criação de release sem escrita em refs, Setup.exe e verificação integral do asset, bloqueio/recuperação sem substituir arquivo, migration aditiva/duplicatas/publicação incompleta e serviço HTTP real local com bytes sintéticos/callback/GitHub simulados. Evidência build/v6/v630-release-tests.log. TypeScript Cloud passou após corrigir o tipo do corpo de Response no teste; o primeiro comando foi executado durante instalação incompleta e não é contado como aprovação.

Os testes iniciais do Desktop passaram em comparação SemVer, PE/NSIS/ProductVersion, comprimento exato/arquivo exclusivo, descoberta/download/cópia do link, integridade, adulteração antes da instalação e ignorar ambiente dev. A validação completa final incluirá o registro de instalação interrompida.

Npm ci inicial foi interrompido durante preparação das dependências. Uma reparação offline foi concluída preservando versões do lock, seguida de rebuild dos comandos e dos runtimes Electron/esbuild. A instalação reproduzível final e a regressão completa serão registradas após concluir. Não confundir testes de transporte sintético com publicação GitHub real.

Não executados por ausência da infraestrutura autorizada: upload real ao publisher externo, publicação real de Setup.exe no GitHub, download privado de uma release 6.3 publicada e atualização de uma instalação Windows para outra. O proprietário pediu deixar o servidor pronto para implementação posterior. Não há autorização para publicar uma release real ou criar uma tag nesta etapa. Instalação real não deve ser substituída por mocks na declaração de conclusão.

## Validação final executada

npm ci na raiz concluiu com sucesso, offline e sem auditoria remota, instalando 540 pacotes em 12 minutos (build/v6/v630-ci-final.log). A regressão final npm run check:v6 passou com 505 testes: 154 Desktop, 100 Cloud, 214 backend Python, 35 ferramentas Python e 2 ferramentas Node. TypeScript/build Cloud e Desktop, sete cenários Electron e 63 verificações administrativas em Chromium aprovados. O cenário Versões cobre cinco larguras, dois temas nas larguras representativas, formulário, tags utilizadas, informações do repositório e bloqueio sem publisher. Capturas versions-form-390.png e versions-form-1440.png em build/admin-layout.

O primeiro conjunto completo encontrou três falhas no simulador de sessão, que não implementava app.getVersion; o contrato do simulador foi corrigido e os 11 testes focados de sessão/atualizador passaram antes de repetir a regressão completa. A alteração não dispensou autenticação nem enfraqueceu as verificações reais.

Após o acabamento dos textos para repositório público/privado e do cache de tags, o build Cloud/TypeScript e as 63 verificações de layout passaram novamente. Logs v630-check-final.log, v630-session-updater.log, v630-cloud-final.log, v630-admin-cache-final.log, v630-format-check.log. A fixture visual e APIs remotas dos cenários são sintéticas; não constituem publicação real.

Migration 20261029190000_cyro_releases aplicada com sucesso no PostgreSQL configurado; somente a nova migration estava pendente. Não apagou dados existentes, não cadastrou uma publicação fictícia e não publicou instalador. Evidência v630-db-deploy.log. cloud/next-env.d.ts foi preservado byte a byte após os builds. Backup/ não foi alterado.

## Pacote e Cloud publicados

Runtime 204dc3f enviado e deploy Vercel validado em 29/10/2026; login HTTP 200, versões administrativas sem sessão HTTP 401 e latest HTTP 200/release:null. Cache HTTP real retornou HIT em duas consultas consecutivas. Não houve versão falsa nem release real anunciada. Setup 6.3.0 gerado/auditado, ProductVersion 6.3.0 e payload 6.3.0.0, 183643063 bytes, SHA256 244f5de4b98c2c17ea2b36f6ef0ebbac2e8533deced15352a6e7d710734824fa, Authenticode NotSigned. Validador PE/NSIS/ProductVersion e self-check congelado passaram no pacote real. O payload iniciou sem Python/Node no PATH, autenticou localmente e persistiu após reinício com perfil temporário.

Esse smoke não executa o instalador nem substitui o item 23 de atualização Windows instalada. Nenhum upload/release GitHub real ou tag nova foi criado. A primeira adoção da 6.3 é manual; o servidor externo e suas credenciais precisam ser configurados antes de publicar atualizações. A consulta anônima final ao repositório retornou 404; a informação autenticada inicial era privado. O código e a documentação já suportam a mudança para público informada pelo proprietário, sem mudar a visibilidade por conta própria.

## Proteção final de encerramento — 30/10/2026

Os 155 testes Desktop foram executados novamente e passaram, incluindo aprovação/cancelamento da instalação, bloqueio de rascunho/Writer/Quick Chat ocupado e janela desabilitada antes de sair. Os sete cenários Electron passaram novamente. O conjunto validado soma 506 testes (155 Desktop atuais e os demais 351 já aprovados), além das 63 verificações administrativas previamente aprovadas. Logs v630-close-guard-tests.log e v630-close-guard-electron.log. Os avisos de handler de updates ausente nos cenários Electron vêm dos preloads sintéticos desses testes; a inicialização real registra o IPC e o modo dev foi coberto separadamente.

A pasta de trabalho foi renomeada pelo proprietário para C:/Users/user/Desktop/Cyro. Os três junctions npm locais foram corrigidos para a nova pasta, sem mudar dependências ou dados. O setup anterior 204dc3f foi preservado em release/v6/previous/6.3.0-204dc3f. O serviço congelado poderá ser reutilizado na recompilação: fontes Python e empacotador não mudaram desde o build/self-check aprovados. A auditoria e o smoke do novo payload foram executados novamente e passaram.

Recompilação final concluída: 183643045 bytes, SHA256 ffdc9bf469800f60fabe3b489fc2e4161bbb391e82cea73b1ef8502ea4fd9876, ProductVersion 6.3.0/payload 6.3.0.0 e Authenticode NotSigned. Auditoria e inicialização/autenticação local/persistência após reinício do payload aprovadas, com perfil temporário. O serviço congelado foi reutilizado após verificar fontes inalteradas e executar novo self-check; não foi declarada nova compilação Python. Fonte f212a0a publicada no Cloud com sucesso. Não equivale à instalação/atualização Windows real; ativação externa permanece pendente.
