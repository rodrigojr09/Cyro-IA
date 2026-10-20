# JARVIS Portable Edition — 2.0.1-dev.0

**Prévia em validação; não é a release v2.0.1 concluída.** Não há tag de release. O sufixo de desenvolvimento diferencia os artefatos dos binários anteriores. Windows 10/11 x64 é o alvo; testes nesta máquina não substituem os testes em outro Windows e em USB físico descritos em PORTABLE-VALIDATION.md.

## Instalar a prévia

1. Abra `JARVIS Setup-2.0.1-dev.0.exe`. Não precisa instalar Python ou Node.js.
2. Leia os requisitos e escolha explicitamente o dispositivo. Nenhuma unidade vem selecionada. A tabela mostra nome, letra, capacidade, espaço e sistema de arquivos. Se necessário escolha manualmente um destino externo e confirme. A unidade do Windows é recusada.
3. Configure sua chave OpenAI API e uma senha mestra de pelo menos 12 caracteres. O teste autenticado é opcional: verifica autenticação/conectividade, não saldo ou todos os modelos. Assinatura ChatGPT não inclui créditos da API. Em uma atualização, desbloqueie o cofre existente; ele será preservado.
4. Escolha nome, tema, voz, Quick Chat, privacidade e retenção de backups. A interface disponível é português do Brasil. Voz começa desativada; Quick Chat começa ativado. Confirme o envio de mensagens/fontes autorizadas à API.
5. Aguarde a cópia e a verificação. O Setup não formata o dispositivo nem apaga arquivos pessoais. Recusa pastas JARVIS sem identificação de instalação.
6. Use `Iniciar JARVIS.exe` no destino. A senha mestra é solicitada antes de carregar seus dados.

A senha não é recuperável pelo aplicativo. Guarde-a fora do dispositivo. Não compartilhe o pendrive desbloqueado ou a senha. Nunca use chaves reais nos diagnósticos.

## Organização

```text
Iniciar JARVIS.exe
JARVIS/
  app/JARVIS.exe
  data/
    config/credentials.vault
    config/settings.json
    config/browser-state.json
    registry.db
    general/project.db
    projects/{UUID}/project.db
    projects/{UUID}/IDEIA.md
    projects/{UUID}/arquivos/
    window-state.json
    quick-state.json
    cache/
    logs/
  backups/*.jbackup
  portable-install.json
  VERSION
```

Apesar das extensões `.db`, `.json` e `.md`, os arquivos pessoais da edição portátil têm conteúdo criptografado e devem ser acessados pelo JARVIS. Não abra os bancos diretamente com SQLite nem edite os documentos internos em um editor. A memória é consultada pela interface. O modo fonte conserva a configuração privada em backend/.env e seus bancos de desenvolvimento; ele não é automaticamente convertido em edição criptografada.

O executável externo define a pasta de dados, não o diretório temporário de extração. O Electron e o backend já integram os runtimes necessários. O empacotador extrai código e bibliotecas em diretório temporário local: isso não contém o perfil pessoal. As janelas portáteis usam sessão Chromium em memória; preferências, seleção e rascunhos são salvos criptografados pelo processo principal no USB. Diretórios técnicos do Electron, cache e logs são direcionados ao dispositivo. A limpeza de temporários de execução precisa ser conferida no teste físico.

## Proteção dos dados

O cofre de senha usa scrypt (N=131072, r=8, p=1, salt aleatório de 16 bytes) e AES-256-GCM. Ele guarda a chave da API e uma chave de dados aleatória de 32 bytes. Alterar a senha ou a chave da API preserva a chave dos dados; o cofre anterior exige a senha atual para ser substituído. A chave não é passada em argumentos nem em ambientes de aplicativos abertos.

Cada arquivo pessoal usa AES-256-GCM com nonce aleatório e autenticação do caminho relativo. Trocar um arquivo de nome ou adulterar seu conteúdo causa falha de autenticação. O SQLite opera em RAM: lê a imagem autenticada, executa a transação e publica outra imagem criptografada por substituição atômica. Journals e temporários SQLite ficam em memória; ATTACH em disco é bloqueado. Escritas entre threads são serializadas. Não se usa um banco SQLite descriptografado temporário.

Backups `.jbackup` criptografam o arquivo completo e autenticam o cabeçalho que contém uma cópia criptografada do cofre. A restauração pode pedir a senha usada na época do backup. Assim, mudar a senha atual não torna as cópias anteriores irrecuperáveis. A verificação usa autenticação, hashes, integridade SQLite e limites de extração. Temporários do backup/restauração contêm arquivos já criptografados.

Limites desta arquitetura: 128 MiB por arquivo protegido e 512 MiB por backup/migração em memória. Bancos grandes implicam mais RAM, custo de regravação e desgaste do dispositivo. Operações envolvendo mais de um banco não são uma transação global. Remoção durante uma gravação, defeitos do USB ou perda física ainda podem causar perda de dados. Use backups externos e remoção segura.

A proteção é de dados em repouso. Windows pode paginar memória, produzir dumps ou manter vestígios do sistema operacional. Um computador comprometido pode capturar senha, mensagens e chave enquanto o programa está desbloqueado. O aplicativo não impede esses ataques nem contorna políticas do Windows. Nomes de diretórios, UUIDs e tamanhos de arquivos não são ocultados. O token local de sessão é temporário e removido no encerramento normal; não é uma chave de descriptografia.

## Migrar uma instalação anterior

No primeiro início, o JARVIS procura o local padrão anterior (`LOCALAPPDATA/JARVIS`). Dados antigos no próprio destino também são detectados. Em Configurações → Aplicativo → Migrar memória anterior é possível selecionar outra origem após encerrar o backend.

O assistente mostra a origem, o destino e a lista de arquivos reconhecidos: catálogo, chats gerais, projetos UUID, bancos de memória, IDEIA.md, conhecimento e configurações próprias do aplicativo. Pede confirmação; não importa `.env`, tokens, caches Chromium ou projetos de código externos. Preferências antigas armazenadas exclusivamente no Chromium não são importadas automaticamente; nome/tema/voz podem ser ajustados novamente no Setup. Esta limitação é explícita para evitar copiar caches contendo dados sem proteção.

A migração exige a versão anterior encerrada. Um WAL pendente impede o processo: abra e encerre corretamente a versão anterior antes de tentar de novo. Um backup criptografado da origem é criado antes de transformar os dados; uma cópia normalizada também é validada antes da troca do destino. Bancos muito antigos de mensagens gerais são importados em memória. Uma origem já criptografada deve ser transferida pela restauração de backup.

O destino é preparado separadamente, com conteúdo criptografado. Antes de substituir um perfil existente é criado seu backup. A pasta anterior é preservada e um diário permite recuperar interrupções. **Originais antigos continuam sem criptografia onde já estavam**, inclusive uma pasta antiga preservada na conversão local. Eles não são apagados automaticamente. Não prometemos apagamento seguro em memória flash; proteja fisicamente esses dispositivos e originais.

Projetos externos continuam referenciados como externos. Quando indisponíveis, sua memória e chats permanecem, sem afirmar leitura atual do código. Projetos cadastrados no mesmo volume portátil usam referências relativas ao volume para acompanhar mudança de letra. Não há autorização automática de novas pastas.

## Backups e atualização

Configurações → Memória → Backups e restauração encerra o backend antes de abrir a manutenção. Desbloqueie o cofre novamente. É possível criar cópia manual, exportar e restaurar após confirmação. A restauração prepara outra pasta, valida os bancos e preserva o perfil anterior. O processo Electron permanece vivo enquanto a GUI utiliza seus componentes extraídos.

Há backup no encerramento gracioso e antes de atualizar. A retenção configurável é de 1 a 100 (padrão 5) e sempre preserva a cópia recém-criada. Se houver falha de gravação ou desconexão, não há garantia de cópia nova. Backups no mesmo USB não protegem contra perda/defeito físico: exporte para outro dispositivo.

Atualizações substituem somente o aplicativo e seu iniciador identificado. Mantêm configuração e dados, recusam versões futuras dos bancos e verificam a cópia por SHA-256. O catálogo suporta esquema 3 e as memórias esquema 2. O diário restaura aplicativo, iniciador e referência de versão se a troca falhar antes de ser concluída. Diretórios `.app-before-*`, `data-before-*` e cópias interrompidas são preservados; não os remova durante recuperação.

## Inicialização autorizada neste computador

Por padrão, conecte o USB e execute Iniciar JARVIS.exe. Não há USB AutoRun.

Em Configurações → Aplicativo → Inicialização autorizada neste computador, um diálogo separado explica a opção e exige consentimento. O monitor identificado `JARVIS USB autorizado` é registrado em HKCU/Software/Microsoft/Windows/CurrentVersion/Run, somente para o usuário atual, sem administrador. Um auxiliar e sua identificação do volume ficam em LOCALAPPDATA/JARVIS Device Startup; não levam senha, chave ou conversas.

Após ativação, o auxiliar observa o volume autorizado a cada três segundos. Confere o identificador estável do volume, o caminho e o SHA-256 do executável antes de abrir o aplicativo uma vez por conexão. A senha ainda é obrigatória. O auxiliar também inicia no próximo logon; políticas ou bloqueios da inicialização do Windows podem impedir isso. Após atualizar o executável, desative e autorize novamente. Não funciona automaticamente em outros computadores sem configurar cada um.

O botão Desativar remove o registro e o consentimento; o monitor encerra e seu executável é removido quando possível. Também é possível bloquear a entrada nas opções de inicialização do Windows. Os testes automatizados usam Registro simulado; nenhum consentimento foi ativado na máquina de desenvolvimento durante os testes.

## Desenvolvimento e diagnóstico

`build.bat` executa as suítes, compila backend e auxiliar, empacota Electron, gera Setup e checksums. Dependências são instaladas previamente pelo desenvolvedor; o pipeline não instala ferramentas nem publica. A lista de arquivos do pacote continua explícita e dados pessoais não são incluídos.

Testes adicionais: `test_portable`, `test_protection` e `test_startup` no backend; `test_setup` na raiz. O backend compilado oferece `--self-check` (dependências) e `--fixture-check` (FastAPI, memória criptografada, persistência e restauração em perfil temporário próprio, sem API externa). O diagnóstico não aceita caminho de dados de usuário.

O smoke completo continua exigindo `--interactive-unlock`, uma chave fictícia e interação humana. Siga PORTABLE-VALIDATION.md para não confundir PATH restrito com ausência real de instalações, nem testes de diretórios temporários com desconexão física de USB. Os artefatos dev não devem ser apresentados como v2.0.1 aprovada.
