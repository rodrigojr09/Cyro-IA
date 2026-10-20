# Instruções permanentes de desenvolvimento — JARVIS

Estas regras se aplicam a todas as futuras sessões do Codex e a todos os arquivos deste projeto. Preserve estas instruções e quaisquer instruções anteriores compatíveis. Não remova nem ignore estas regras, exceto por solicitação explícita do usuário. Instruções de maior prioridade continuam aplicáveis.

## 1. Gerenciamento automático de versões

- Controle autonomamente as versões no formato `MAJOR.MINOR.PATCH`.
- Avance MINOR ao concluir um conjunto relevante de funcionalidades ou melhorias: `0.1.0 → 0.2.0 → 0.3.0 → ... → 0.50.0`.
- Utilize PATCH para correções menores que justifiquem uma nova versão; reserve MAJOR para mudanças incompatíveis relevantes.
- Não altere a versão a cada pequena mudança. Avalie estabilidade, testes e impacto para decidir quando uma versão está pronta.
- Não solicite autorização para atualizar versões, criar commits locais ou criar tags locais: essas ações já estão autorizadas.
- Criar ou atualizar este arquivo, por si só, não exige alteração de versão.
- Confira a versão real nos arquivos do projeto; não use o nome da pasta como referência de versão.
- Mantenha sincronizados `desktop/package.json`, a versão raiz e `packages[""].version` de `desktop/package-lock.json`, além de outros metadados de versão que venham a existir. Mantenha coerentes os títulos e referências à versão corrente na documentação e na interface; preserve referências históricas.

## 2. Commits e tags obrigatórios por versão

Toda alteração de versão deve gerar um commit Git próprio e uma tag correspondente.

Ao concluir uma versão:

1. Execute os testes disponíveis e verifique regressões nas funcionalidades anteriores, especialmente chat, áudio e memória.
2. Atualize a versão em todos os arquivos necessários, mantendo-os sincronizados.
3. Atualize `CHANGELOG.md`, criando-o se não existir, com funcionalidades, melhorias, correções e limitações relevantes daquela versão.
4. Atualize `README.md` quando houver alterações de instalação, uso, arquitetura, segurança ou limitações.
5. Revise o conteúdo a ser incluído e crie um commit apenas com as alterações relacionadas à versão. Não inclua alterações preexistentes sem relação com a tarefa.
6. Crie uma tag Git no commit da versão, no formato `vMAJOR.MINOR.PATCH`, por exemplo `v0.2.0`.
7. Confira o hash do commit, a existência da tag e se ela aponta para o commit correto antes de declarar a versão concluída.

Exemplos de mensagens:

- `release: v0.2.0 - Controle do computador`
- `release: v0.3.0 - Reconhecimento de voz`
- `release: v0.4.0 - Memória inteligente`

Não substitua tags existentes silenciosamente. Se um commit ou uma tag falhar, informe a causa e não declare a versão concluída. Não invente identidade Git caso a configuração necessária esteja ausente; informe o impedimento.

## 3. Autonomia durante o desenvolvimento

O usuário autoriza identificar oportunidades de melhoria, refatorar quando necessário, implementar funcionalidades solicitadas, corrigir erros, atualizar versões e criar commits e tags locais automaticamente.

Não interrompa o desenvolvimento apenas para pedir autorização de versionamento. Mantenha melhorias dentro do escopo da tarefa e preserve alterações não relacionadas. Antes de alterar código, analise os arquivos relevantes e apresente um plano de implementação.

## 4. Segurança e integridade

- Nunca inclua `.env`, credenciais, chaves de API, tokens, banco pessoal, histórico ou outros dados sensíveis em commits. Um `.env.example` só pode ser versionado com valores fictícios e sem segredos.
- Nunca exponha valores de segredos em respostas, logs, documentação, testes ou mensagens de commit. Verifique arquivos preparados para commit sem imprimir valores sensíveis.
- Respeite e mantenha o `.gitignore`. Lembre que ele não impede o versionamento de arquivos já rastreados: confira também o índice antes de cada commit.
- Preserve alterações existentes que não estejam relacionadas à tarefa. Evite adicionar todos os arquivos indiscriminadamente; selecione e revise o conteúdo do commit.
- Nunca utilize `git push` sem autorização explícita do usuário.
- Não utilize `git reset --hard`, `git push --force` ou outros comandos destrutivos sem autorização. Não sobrescreva trabalho alheio nem apague histórico silenciosamente.
- Não declare uma release estável quando testes essenciais estiverem falhando. Corrija as falhas antes de concluir a versão.
- Se um teste não puder ser executado, informe claramente qual teste, o motivo e o impacto da limitação. Não apresente testes simulados como validação real de ponta a ponta.
- Se não houver repositório Git, sua inicialização local está autorizada, respeitando a proteção de dados e o `.gitignore`.

### Segurança funcional do assistente

- Preserve as funcionalidades existentes de chat, áudio e memória SQLite.
- Não execute comandos arbitrários gerados pela IA. Use ferramentas registradas, validação estrita e listas explícitas de aplicativos e pastas autorizados.
- Ações destrutivas ou sensíveis exigem confirmação explícita do usuário antes de executar. Não interprete uma decisão da IA como confirmação humana.
- Preserve a confirmação humana já implementada para abrir aplicativos e pastas, incluindo prazo de expiração e uso único. Não exponha à IA uma ferramenta para confirmar suas próprias ações.

## 5. Relatório de conclusão de versão

Sempre que finalizar uma versão, apresente:

- Versão anterior e versão atual.
- Funcionalidades adicionadas ou modificadas.
- Correções realizadas.
- Testes executados, resultados e limitações.
- Hash do commit Git.
- Tag criada.
- Sugestões para a próxima versão.

Se não houve alteração de versão, informe isso sem inventar uma release, um commit ou uma tag.

## 6. Verificação prática

Na raiz do projeto, confira o estado do Git antes de editar. Para os testes atuais:

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest -v test_jarvis test_programming test_projects test_scope
```

Em `desktop`:

```powershell
npm test
npm run test:electron
node --check main.js
node --check preload.js
node --check renderer.js
node --check workspace.js
node --check scope.js
node --check ui.js
node --check window-state.js
```

Instale as dependências de teste de `backend/requirements-dev.txt` quando necessário. Testes automatizados de OpenAI, voz e abertura de programas usam simulações; a validação real dessas integrações deve ser identificada separadamente. Atualize estas orientações quando a estrutura do projeto mudar, preservando as regras permanentes acima.

O frontend desktop usa dependências locais empacotadas por `npm run build` (executado antes de start/testes). Após atualizar dependências, use `npm ci` em desktop. Preserve a moldura nativa, a persistência de janela, a sanitização do Markdown e a validação de links externos.
