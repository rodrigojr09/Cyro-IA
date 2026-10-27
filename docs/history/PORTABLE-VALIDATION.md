# Validação reproduzível — JARVIS 2.0.1-dev.0

Este procedimento usa um USB de teste e dados fictícios. Não formate nem apague arquivos existentes. Preserve os checksums dos instaladores, a versão do Windows, o sistema de arquivos, a letra inicial/final e o resultado de cada caso. Não registre chaves nem senhas em evidências. Marque **não executado** quando o ambiente não estiver disponível.

## Testes automatizados de desenvolvimento

Na raiz, execute:

```powershell
backend\.venv\Scripts\python.exe -m unittest -v test_start test_build test_setup
cd backend
.\.venv\Scripts\python.exe -m unittest -v test_jarvis test_programming test_projects test_scope test_quick test_portable test_protection test_startup
cd ../desktop
npm test
npm run test:electron
npm run test:quick
npm run format:check
```

Na raiz, verifique também `backend\.venv\Scripts\python.exe -m black --check backend start.py test_start.py test_build.py test_setup.py tools` e a sintaxe dos arquivos JS. Testes de OpenAI, áudio e ações do computador usam simulações. Testes do Registro do Windows são simulados e não ativam a inicialização. Testes nativos Tk verificam widgets, campos protegidos e seleção vazia sem instalar em dispositivos reais.

## Backend compilado sem ferramentas no PATH

Use um processo filho com o PATH limitado a System32, sem PYTHONHOME/PYTHONPATH, executando o caminho completo do backend compilado com `--self-check` e `--fixture-check`. Não altere o PATH permanente do Windows. O segundo diagnóstico cria seu próprio perfil temporário, verifica autenticação HTTP, histórico em dois ciclos, conteúdo criptografado, backup e restauração. Não recebe pasta pessoal nem chama a API.

**Interpretação:** isso prova que esse processo não precisou invocar python.exe, node.exe ou npm pelo PATH. Não prova que todas as DLLs estariam disponíveis em um Windows limpo. Faça o teste abaixo em VM ou outro computador para comprovar a ausência real de instalações.

## Instalação completa em outro Windows

Prepare uma VM Windows 10 ou 11 x64 sem Python, Node.js, npm, Electron ou ferramentas de desenvolvimento. Registre a versão e faça snapshot antes dos testes. Transfira somente Setup, seu checksum e arquivos de teste, sem .env ou perfil do desenvolvedor.

1. Confira SHA-256 com Get-FileHash. Abra o Setup por dois cliques, sem terminal. Registre eventual SmartScreen: a prévia não é assinada com Authenticode.
2. Conecte um USB de teste com um arquivo pessoal fictício, registrando seu hash. Confirme que nenhuma unidade está pré-selecionada e que nome, letra, espaço e formato estão corretos. Teste seleção manual quando aplicável.
3. Configure uma chave fictícia `sk-` de pelo menos 20 caracteres para os testes locais. Crie senha de teste com 12 ou mais caracteres. Não use esse perfil para chamada paga. Confira campos ocultos, mostrar/ocultar e cancelamento.
4. Instale no USB. Confira Iniciar JARVIS.exe, JARVIS/app, data, backups e VERSION. Confirme que o arquivo pessoal manteve o hash. Abra pelo iniciador e desbloqueie. Cancele o desbloqueio e confirme que nenhum chat abre.
5. Crie conversas gerais e de projeto fictício. Verifique voz, Quick Chat, bandeja, X e encerramento. Reinicie o JARVIS e o Windows; confira persistência e senha obrigatória.
6. Use mensagens, notas e rascunhos contendo um marcador único de teste. Com o aplicativo fechado, confira que ele não aparece como texto em data ou backups. A busca textual é complementar: os testes de autenticação criptográfica também são obrigatórios.
7. Faça backup manual e exporte para outro dispositivo. Crie outra conversa; restaure o backup após confirmação. Confira o histórico anterior e a pasta preservada. Teste senha incorreta e uma cópia adulterada do backup: a memória atual deve permanecer intacta.
8. Troque a senha e a chave da API nas configurações. Abra novamente, confirme o histórico e restaure uma cópia anterior com a senha antiga do backup. A senha antiga não deve desbloquear o cofre atual.

## Mudança real da letra e fontes externas

Encerre o JARVIS pela bandeja e remova com segurança. Conecte o USB a outro computador ou altere sua letra pelas ferramentas normais do Windows, sem mexer em volumes pessoais. Execute o iniciador. Confira configurações, chats e memória. Cadastre fontes fictícias no mesmo USB e fontes em outro computador: as primeiras devem acompanhar a letra; as externas devem ser indicadas como indisponíveis, preservando a memória histórica e as restrições de leitura.

## Falhas e atualização

- Espaço insuficiente: use volume/arquivo de disco virtual de teste com pouco espaço ou simulação automatizada. Não preencha um dispositivo pessoal. O Setup deve recusar sem alterar seus arquivos.
- Sem escrita: use um destino de teste sem permissão. Deve haver erro compreensível, sem instalação marcada como completa.
- Interrupção de cópia: encerre somente o Setup de teste no meio da operação. Abra novamente; confira que o diário recupera a instalação anterior e que a nova não é apresentada como completa.
- Atualização: instale outra compilação de desenvolvimento no mesmo perfil, com histórico fictício e backup externo prévio. Confirme dados, senha, preferências e iniciador preservados/atualizados. Teste falha entre a troca do aplicativo e a conclusão.
- Desconexão inesperada: faça somente em USB descartável/de teste, com cópia externa. Desconecte durante uma operação com dados fictícios. Registre o comportamento, a recuperação e se o Windows pede reparo. Não afirme que substituição atômica elimina falhas do sistema de arquivos.
- Encerramento: feche pela bandeja e confirme que o backend próprio encerrou. Um serviço externo na porta 8765 deve impedir a abertura sem ser encerrado pelo JARVIS.
- Migração: use uma cópia de um perfil antigo fictício. Confira a lista antes de confirmar, backup criptografado prévio, mensagens e memórias migradas, origem com hashes intactos e recuperação de falha. Perfis com WAL pendente devem ser recusados. Caches Chromium antigos não são migrados.

## API e áudio reais — validação separada

Em um perfil temporário apropriado, use uma chave própria com autorização para possíveis custos. Confira: autenticação aceita, chave inválida, internet desconectada, limite/cota e resposta de chat. O teste de modelos não comprova saldo ou permissão em todos os modelos. Teste voz nos alto-falantes e coordenação com Quick Chat. Nunca coloque a chave em capturas, logs ou relatório.

## Inicialização autorizada — somente em VM/computador de teste

Sem ativação, conectar USB não deve executar o aplicativo. Ative explicitamente pelo diálogo e confirme a entrada identificada JARVIS USB autorizado na inicialização do usuário do Windows. Reconecte o volume, altere sua letra e reinicie o Windows. A senha deve continuar obrigatória. Atualize o executável e confira que o hash diferente exige nova autorização. Desative pelo aplicativo e confirme remoção do registro e encerramento do auxiliar. Verifique também um usuário sem privilégios administrativos e um cenário em que políticas bloqueiam a inicialização.

## Registro de resultados e decisão de release

Para cada caso registre: ambiente, versão/checksum, procedimento, resultado esperado/observado, evidência sem segredos e status (aprovado, falhou, não executado). Os testes físicos, Windows limpo, integração paga, som real e inicialização registrada continuam pendentes até haver evidência específica. Somente então retire o sufixo dev, gere novamente os artefatos, revise o commit e crie a tag v2.0.1. Não publique nem faça push automaticamente.
