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
