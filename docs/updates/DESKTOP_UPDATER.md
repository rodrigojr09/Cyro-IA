# Atualizador Desktop

Desenvolvimento é ignorado: app.isPackaged=false não consulta o Cloud, não baixa nem instala atualizações. A consulta manual informa que atualizações estão desativadas nesse ambiente. O renderer não pode habilitar o mecanismo alterando uma opção.

O processo principal consulta /api/updates/latest ao autenticar/iniciar, no máximo uma vez a cada seis horas em segundo plano, e por solicitação em Configurações → Sobre. Respostas estáveis mais recentes usam SemVer; igualdade e versões locais maiores não oferecem downgrade. A mesma notificação é atualizada sem abrir janelas repetidas.

Atualizar Automaticamente: preparar → obter autorização curta do Cloud → baixar pacote completo diretamente do publisher (privado) ou GitHub (público) → conferir tamanho/SHA-256/PE/NSIS/ProductVersion → Authenticode no Windows → pronto para instalar. Nada abre o navegador nesse fluxo. Download incompleto/corrompido é descartado. Antes de instalar o hash e a assinatura são verificados novamente.

Somente Valid e NotSigned são aceitos; uma assinatura presente porém inválida bloqueia. Os setups atuais são NotSigned: o fluxo não alega assinatura digital validada. A confiança vem do metadata HTTPS/autorização de publicação e SHA-256, não do nome original. Uma assinatura de código confiável é recomendada antes de distribuição ampla.

Instalar e encerrar pede confirmação nativa, bloqueia rascunhos/anexos ainda não enviados, geração ativa, Quick Chat ocupado e Writer não salvo. Encerra o serviço local pelo mecanismo existente e abre o NSIS assistido somente durante will-quit. O assistente Windows conclui a atualização; reabertura depende da opção final do NSIS. Não força perda de edições. Dados continuam fora dos binários e deleteAppDataOnUninstall=false. Instalação em Windows limpo/atualização real de uma versão instalada para outra ainda precisa de homologação.

Foi avaliado electron-updater: seu mecanismo NSIS exige metadados do mesmo build (latest.yml e, para diferencial, blockmap). [Documentação oficial](https://www.electron.build/v26/docs/features/auto-update/). Não geramos latest.yml fictício nem declaramos compatibilidade nativa. Esta implementação usa download integral verificado e instalação NSIS assistida, sem dependência de electron-updater. O administrador continua enviando somente o setup; a verificação não depende de arquivos auxiliares fabricados. Não é uma atualização silenciosa/diferencial já homologada.

Link para Baixar abre o asset oficial se público. Se privado, o Cloud autentica o cliente e entrega um link temporário do publisher para o mesmo asset. Não distribui token GitHub privilegiado. Versões anteriores à 6.3 não possuem este mecanismo; a primeira adoção da 6.3 exige instalação manual.

Uma tentativa de instalação deixa um marcador local contendo somente a versão pretendida. Se o aplicativo reiniciar na versão antiga, informa instalação anterior não concluída; ao iniciar na versão esperada ou superior, remove o marcador. Esse registro não toca sessões, documentos ou bancos.

Após confirmar a instalação e validar que não há trabalho pendente, a janela é desabilitada antes do encerramento do serviço. Isso impede novas edições durante a espera pelo fechamento, sem forçar descarte de conteúdo.
