> Spotify: a implementação de OAuth/controles está no código, mas ainda depende de configuração privada, migration e teste real autorizado. Consulte [a configuração completa](docs/SPOTIFY.md). Não há conexão fictícia nem aprovação de distribuição pública.

# JARVIS 5 — Cloud administrativo + Desktop

Versão alvo 5.0.0, em desenvolvimento e validação. A v5 foi autorizada pelo proprietário; não representa nova implantação ou release. O histórico da base 4.2.0 permanece documentado. Requisitos, testes e limitações estão em [docs/V4_2.md](docs/V4_2.md), [docs/ATTACHMENTS.md](docs/ATTACHMENTS.md) e [docs/STORAGE-SETTINGS.md](docs/STORAGE-SETTINGS.md). Histórico em [docs/V4_1.md](docs/V4_1.md).

O Cloud possui somente o administrativo e as APIs do aplicativo. A raiz e o painel exigem autenticação; a única página de entrada é `/login`. Não há site público, cadastro público, códigos de ativação, deep links ou gestão de licenças.

O administrador cadastra nome, e-mail e senha e libera ou bloqueia o usuário. Contas ADMIN e SUPER_ADMIN ativas também entram no Desktop com o mesmo e-mail e senha do painel. O Desktop exige login antes de abrir o workspace ou criar o Quick Chat. A sessão é salva com Electron safeStorage (DPAPI no Windows); a senha não é salva. Ao iniciar e a cada cinco minutos, o Desktop valida a sessão no Cloud. Falha de validação fecha o Quick Chat e retorna ao login; indisponibilidade de rede preserva a sessão protegida para nova tentativa. Fechar a janela principal encerra o aplicativo. Minimizar mantém o aplicativo aberto.

OpenAI e PostgreSQL ficam exclusivamente no Cloud. Chats gerais e Quick Chat geral ficam no mesmo PostgreSQL, isolados pela conta; o Quick Chat usa uma conversa fixa por usuário. Projetos, seus chats, memória e permissões permanecem no componente local FastAPI/SQLite. Projetos podem tratar de estudos, escrita, planejamento, pesquisa ou software, com até 5 MB de arquivos selecionados no total. Desktop verifica o tamanho antes do envio e o backend local rejeita excessos com HTTP 413. Confirmações humanas e IPC restrito são preservados. `Backup/` é arquivo manual somente leitura e não participa do runtime.

As alterações de chats Cloud exigem a migration `20261022120000_cloud_chats` e publicação conjunta do Cloud e Desktop. Consulte [armazenamento de conversas e limites](docs/CHATS.md). Históricos locais antigos não são enviados automaticamente.

## Assistente de área de transferência — v5

Em Configurações → Área de transferência, marque o consentimento e salve para ativar. Desativado por padrão, com pausa, desativação, descarte, som opcional e volume. A voz global desligada também silencia a notificação. Ao iniciar ou retomar o monitoramento autorizado, o conteúdo já copiado fica disponível sem tocar som; não é necessário limpar a área de transferência antes de copiar novamente.

Uma cópia válida de texto, código ou link gera um aviso sonoro discreto e indicadores vermelhos no ícone da barra de tarefas e no Quick Chat, sem abrir janelas nem mudar o foco. O primeiro chat aberto reivindica o conteúdo no Electron e remove ambos os indicadores. As ações aparecem em uma faixa compacta acima do campo de mensagem, com prévia editável somente após a escolha e confirmação antes de enviar. Clique em “Texto copiado”, “Código copiado”, “Link copiado” ou “Imagem copiada” para expandir/recolher o conteúdo original. O link também pode ser aberto no navegador, após confirmação e validação local.

O conteúdo fica somente em memória, por até 10 minutos, sem histórico ou envio automático. Se o Quick Chat estiver aberto, novas cópias aparecem diretamente nele, mesmo sem foco; com ele fechado, a janela principal recebe ao ser acessada. Os indicadores são removidos juntos ao apresentar as ações. Uma nova cópia atualiza o card aberto enquanto nenhuma ação foi escolhida. Depois de escolher uma ação, a prévia em edição é preservada e a nova cópia fica pendente. Limite local de 5.400 caracteres/21.600 bytes; a mensagem preparada mantém o limite existente de 6.000 caracteres. Anexos, cotas e limites de projetos continuam no fluxo existente. Conteúdo grande é recusado, sem corte silencioso. Possíveis credenciais são filtradas, mas a detecção não é infalível. Imagens oferecem somente prévia local ao clicar no título: PNG de até 5 MB e 50 MP, reduzido para até 1.536 px e 350 KB. Não há envio/análise de imagens pelo clipboard; conteúdo visual não passa por OCR ou filtro de credenciais. Outros formatos não oferecem ações.

Consulte [implementação e validação v5](docs/V5.md) para cobertura, verificações reais e limitações.

## Integrações nas configurações

Em **Configurações → Integrações**, explore o catálogo de Spotify, Discord, Google Calendar, GitHub, Notion e Google Drive. Spotify possui conexão por OAuth e controles Cloud, sujeitos à configuração privada e à validação real descritas em [SPOTIFY.md](docs/SPOTIFY.md). Os outros cinco serviços continuam **Em breve**. Pesquisa, filtros e detalhes mostram estados reais, sem conexões simuladas. A página reutiliza a janela atual e mantém as demais configurações. Consulte [a arquitetura e o escopo das integrações](docs/INTEGRATIONS.md).

## JARVIS Writer — exclusivo dos projetos

O campo de mensagem é limpo ao enviar. Você pode preparar o próximo rascunho enquanto aguarda; ele é preservado ao receber a resposta. Em caso de falha, a mensagem pode ser recuperada sem apagar o novo rascunho.

Escreva seus pedidos e correções diretamente no chat. O Writer interpreta cada mensagem automaticamente, sem menus de modo; as alterações continuam destacadas para aprovação.

Comentários curtos como “Muito resumido” preparam uma revisão no arquivo ativo, limitada ao trecho selecionado quando houver. Alterações continuam pendentes de aprovação; o arquivo e a posição conhecidos não precisam ser informados novamente.

Use **+** ao lado de **Conversas** para criar uma conversa geral. No **+** ao lado do nome do projeto, escolha **Chat do projeto** ou **JARVIS Writer**. O botão grande Novo Chat foi removido. O Writer é uma conversa padrão com prévia à direita, dedicada a um arquivo criado ou escolhido no diálogo do Windows; não abre uma tela separada. A conversa ocupa o centro; a sidebar direita mostra o documento e destaca em azul as alterações propostas, com remoções riscadas. Aprovar, rejeitar, ajustar, editar manualmente, desfazer/refazer e recuperar revisões ficam no mesmo ambiente.

A IA requer consentimento nas preferências do projeto e reutiliza o Cloud autenticado. Só escrita inequívoca pode ser adicionada automaticamente; pedidos como “crie um texto sobre IA” geram uma proposta em azul para aprovação; comentários como “muito resumido” pedem uma revisão mais desenvolvida do texto atual, assim como revisões importantes e organização. Enviar a próxima mensagem aprova a proposta pendente antes de consultar a IA; para descartá-la, use Rejeitar. Sem blocos selecionados, o Writer considera o documento inteiro; se exceder o limite de contexto, prioriza o final de baixo para cima e informa a leitura parcial. A edição manual funciona sem a IA, respeitando a autenticação existente. Documentos e histórico ficam no SQLite do projeto, com limites e transações; as edições aprovadas atualizam o arquivo original escolhido, com proteção por hash contra alterações externas. Perguntas sobre o documento geram respostas sem modificá-lo. Edições manuais ficam salvas no JARVIS; **Salvar no arquivo** confirma a atualização do original. Exportação real para Word (.docx), além de Markdown/TXT, permite arquivo atual, seleção ou projeto completo.

O formato editorial usa contrato estrito no mesmo proxy Cloud. Para esta atualização, reinicie o ambiente completo pelo `start.bat`, incluindo o serviço Cloud local e o aplicativo; apenas reabrir o Writer não recarrega o serviço Python. Em distribuição, Cloud e Desktop precisam da atualização correspondente.

Marcar um trecho mantém a seleção destacada ao focar o chat. Clique em **Trecho selecionado · limpar ×** para voltar ao **Documento inteiro**; apenas clicar ou focar um parágrafo não limita o contexto. O editor integrado usa campos claros e largura completa.

Consulte [uso, arquitetura, limites, testes e limitações do Writer](docs/WRITER.md). Para a exportação Word, instale os requisitos Python atualizados (`python-docx`); o aplicativo instalado precisa de um novo empacotamento para incorporar o recurso.

## Desenvolvimento

Para iniciar o ambiente local já configurado, dê dois cliques em `start.bat`. Ele inicia o Cloud em `http://localhost:3000`, aguarda a página de login responder e abre o JARVIS Desktop conectado a essa origem. Ao fechar o JARVIS, o iniciador encerra também o Cloud que iniciou. Se a porta 3000 estiver ocupada, avisa sem encerrar serviços existentes. As configurações privadas permanecem em `cloud/.env`; o Desktop não recebe os segredos do Cloud. O iniciador não instala dependências nem aplica migrations.

Node 22.12+, npm e Python com `backend/requirements-dev.txt`. Na raiz:

```powershell
npm ci
# Se cloud/.env ainda não existir, copie cloud/.env.example e preencha privadamente.
npm run db:generate
npm run db:deploy -w @jarvis/cloud
npm run admin:bootstrap -w @jarvis/cloud
npm run dev:cloud
```

O bootstrap usa BOOTSTRAP_EMAIL, BOOTSTRAP_NAME e BOOTSTRAP_PASSWORD temporários; não existe senha padrão. Remova essas variáveis após criar o primeiro SUPER_ADMIN. O Desktop não recebe OPENAI_API_KEY nem DATABASE_URL.

Em outro terminal, com os requisitos Python instalados:

```powershell
$env:JARVIS_CLOUD_ORIGIN = 'http://localhost:3000'
python tools/start_cloud.py
```

## Atualização da v3

Aplicar todas as migrations, incluindo `20261022000000_desktop_login`, antes de usar o Desktop v4. Essa migration adiciona sessões por dispositivo, remove as credenciais antigas de Device e revoga códigos antigos. Usuários existentes sem senha precisam receber uma nova senha no administrativo. Cadastros, consumo, auditoria e registros históricos de licenças são preservados; esses registros não concedem acesso na v4. O arquivo protegido antigo não autentica a v4.

## Verificação e build

```powershell
npm run test:cloud
npm run typecheck
npm run build:cloud
npm test -w jarvis-desktop
npm run test:electron -w jarvis-desktop
npm run test:quick -w jarvis-desktop
npm run test:cloud-electron -w jarvis-desktop
npm run test:admin-layout
python -m unittest discover -s backend -p 'test_*.py'
python -m unittest -q test_start test_cloud_build test_build test_setup
```

O pipeline Windows `tools/build_cloud_desktop.py` exige uma origem HTTPS real e gera `release/v5/JARVIS-Setup-5.0.0.exe`, sem publicar. Consulte [validação da v4](docs/V4.md) e [implantação](docs/DEPLOYMENT.md). O build local não comprova implantação, áudio pago ou funcionamento em Windows limpo.

## Autoria

Desenvolvido por **Rodrigo Junior**.

- E-mail: [rodrigo.macia019@gmail.com](mailto:rodrigo.macia019@gmail.com)
- GitHub: [rodrigojr09](https://github.com/rodrigojr09)

© 2026 Rodrigo Junior.
