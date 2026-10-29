# Instalação e atualização — Cyro IA 6.3.0 em desenvolvimento

O setup 6.3.0 foi gerado e auditado localmente em release/v6, e o Cloud correspondente foi publicado em 29/10/2026. Inclui o painel Sistema → Versões e o atualizador do aplicativo instalado, ignorado em desenvolvimento. A publicação de instaladores permanece indisponível até configurar o servidor externo preparado nesta entrega. Consulte [o guia de publicação](docs/updates/PUBLISHING.md). A primeira adoção da 6.3 requer este instalador manual. Feche o Cyro antes de atualizar. Checksums e limites reais em docs/VALIDATION.md.

## Aplicativo Windows

1. Obtenha o `Cyro-IA-Setup-6.3.0.exe` e seu arquivo `.sha256` da entrega autorizada pelo proprietário. Os artefatos locais ficam em `release/v6/`; não são publicados automaticamente no GitHub.
2. Confira o SHA-256 do instalador com `Get-FileHash` e compare com o arquivo de verificação da mesma entrega. O instalador atual não tem assinatura Authenticode.
3. Feche o Cyro IA antes de atualizar. Faça uma cópia externa dos dados locais com o aplicativo encerrado. Não apague o perfil nem use `Backup/` como origem automática.
4. Execute o instalador Windows x64, escolha o destino e abra o Cyro IA. Python e Node são dependências de desenvolvimento/compilação, não do usuário instalado.
5. Entre com a conta individual criada pelo administrador. É necessária conexão com o Cloud. Não há ativação por código, senha padrão ou chave OpenAI para digitar no Desktop.

O perfil e os dados ficam fora da pasta dos binários. A configuração NSIS preserva AppData na desinstalação. Essa configuração e os testes com perfil temporário não comprovam atualização/desinstalação em Windows limpo: consulte [as validações pendentes](docs/VALIDATION.md).

## Primeiro uso

- Use **+** ao lado de Conversas para criar um chat geral.
- No **+** de um projeto, crie um chat ou um Writer dedicado a um arquivo.
- Configure aparência, voz e Quick Chat na página de configurações.
- Cole imagens com Ctrl+V no campo do chat principal e revise os anexos antes de enviar; até cinco arquivos de 5 MB cada.
- Ative o monitoramento da área de transferência somente após ler e aceitar o consentimento. Ele começa desligado.
- Em **Configurações → Integrações → Spotify**, conecte sua própria conta. O administrador precisa configurar o aplicativo Spotify no Cloud e a conta precisa ser elegível.
- Credenciais OpenAI/Spotify são administradas exclusivamente pelo SUPER_ADMIN na dashboard. Nunca coloque Client Secret, chave OpenAI ou URL de banco no Electron.

## Dados existentes

Chats gerais e Quick Chat são associados à conta Cloud; projetos e documentos Writer continuam locais. Não importar bancos criptografados de edições portáteis antigas como SQLite comum. A migração dessas edições exige tratamento explícito. Veja [migração](docs/MIGRATION.md).

O `start.bat` é o iniciador do ambiente de desenvolvimento local; ele não é o instalador. Para desenvolver ou publicar o servidor, consulte [DEPLOYMENT.md](docs/DEPLOYMENT.md). O antigo guia portátil foi arquivado em [histórico](docs/history/INSTALL-PORTABLE.md).
