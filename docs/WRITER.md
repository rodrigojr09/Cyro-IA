# JARVIS Writer — v5

## Uso

Abra um projeto existente e clique em **JARVIS Writer**. O botão não aparece nas conversas gerais. Na primeira abertura, escolha o nome do arquivo; o botão **+** cria outros chats Writer, cada um associado ao próprio documento. A extensão `.docx` identifica o nome usado na exportação: o conteúdo de trabalho permanece no banco local do projeto.

A árvore fica à esquerda, a conversa ao centro e a prévia do documento na sidebar à direita, conforme a preferência do proprietário. Na prévia, adições aparecem em azul; remoções ficam azuis e riscadas. O texto confirmado continua salvo até a aplicação. **Aprovar**, **Rejeitar** e **Ajustar** controlam a proposta. Ajustar permite editar o texto e comparar novamente antes de aplicar. Para alterar a classificação de uma proposta pendente, use **Interpretar como**. Em respostas de conversa, a classificação prepara uma nova mensagem para reenvio explícito.

**Editar** habilita blocos estruturados, títulos, subtítulos, listas, negrito e itálico. As edições manuais são salvas automaticamente; aguarde **Salvo neste computador**. Uma falha preserva a edição aberta e impede trocar de documento ou fechar o Writer. **Comparar edição** mostra a versão salva e a edição pendente; salvar sobre a versão comparada exige confirmação explícita e cria uma revisão, validando novamente o número da versão. Desfazer/refazer funciona em sequência e operações sobre vários documentos são recuperadas em conjunto. **Revisões** compara versões e restaura criando uma revisão nova. **Itens removidos** permite selecionar um item e desfazer a remoção.

Em **Preferências**, também acessível nas configurações do projeto, autorize o envio à IA Cloud. Essa autorização não envia o documento por si só: o envio ocorre ao clicar em **Enviar ao Writer**. O aviso do compositor explica o compartilhamento de mensagem e contexto seletivo. Revisão linguística, inserção automática conservadora, intervalo de cancelamento, estilo, largura e retenção são persistidos por projeto. Nenhuma configuração exige guardar uma chave OpenAI no Desktop.

**Exportar** oferece Word, Markdown e TXT, com arquivo atual, seleção de capítulos/documentos ou projeto completo. O destino é escolhido no diálogo nativo. Somente conteúdo confirmado é exportado, sem modificar a fonte.

## Arquitetura e contratos

- `writer_models.py`: schemas Pydantic estritos, blocos com UUID e operações fechadas; campos extras são recusados.
- `writer_store.py`: tabelas no SQLite existente de cada projeto: documentos, revisões, propostas, mensagens específicas do documento, configurações e solicitações idempotentes. Não existe outro cadastro de projetos.
- `writer_intelligence.py`: contexto seletivo, revisão e classificação híbrida pelo cliente Cloud autenticado existente. O proxy atual não aceita `response_format`; o prompt fornece schema JSON e a saída é validada estritamente no backend antes de preparar qualquer operação. Não há ferramentas ou comandos neste fluxo.
- `writer_api.py`: API local protegida pelo mesmo token e middleware do FastAPI. `/writer`, `/writer/cancel` e `/writer/export` não são endpoints públicos do Cloud.
- `writer-ipc.js` e preload: IPC dedicado, somente janela principal autenticada, frame e origem existentes; nenhuma exposição de caminhos arbitrários. Exportação requer diálogo nativo e recusa links, destinos redirecionados/compartilhados e diretórios chamados Backup.
- `writer-ui.js` e `writer.css`: documento estruturado independente da disponibilidade da IA, fila serial de salvamento, estados pendentes, árvore, chat e comparação visual segura. Texto do modelo é renderizado por nós de texto, sem executar HTML.
- `writer_export.py`: OOXML real com python-docx, gravado inicialmente em memória e escrito atomicamente após escolha do destino.

O comando IPC usa `{project_id, action, payload}`. Salvamentos incluem `id`, `base_version`, `blocks` e `request_id`; ações repetidas não duplicam o mesmo salvamento. A IA recebe a mensagem, documento ativo, seleção e blocos próximos, estrutura limitada, pequenos excertos confirmados, memória/instruções existentes e preferências. Conversas são identificadas como contexto que não constitui fatos aprovados. Documentos de outro projeto não são recuperados.

Uma proposta armazena UUID, documento, versão-base, plano, versões afetadas, hash estrutural quando necessário, original, instrução, intenção, elegibilidade automática, estado, datas e resultado. Os estados são PENDING, APPROVED, APPLIED, REJECTED, CONFLICTED e EXPIRED. APPROVED/APPLIED acontecem na mesma transação. Propostas expiram após 24 horas e são revalidadas no momento da decisão; não substituem edições mais recentes.

## Regras de aplicação e recuperação

WRITE, INSTRUCT, ORGANIZE e CHAT são classificados com mensagem, seleção, contexto e preferências. Confiança do modelo não autoriza operações. CHAT não produz proposta. Alterações estruturais, substituições, exclusões e mudanças substantivas exigem confirmação.

Inserção automática exige WRITE inequívoco, documento ativo, adição de parágrafos ao final, ausência de seleção/conflito e conteúdo lexical preservado. Apenas pontuação, acentos e caixa podem acompanhar essa inserção; outras correções linguísticas ou criativas são propostas para aprovação. Nomes e números são protegidos por verificações adicionais. Essa política é conservadora: uma redação ambígua pode pedir confirmação. A preservação semântica de uma revisão gerada por IA não é infalível; a prévia continua sendo a referência para aprovar mudanças importantes.

O intervalo de cancelamento padrão é três segundos, configurável entre zero e dez. A troca de documento, fechamento, edição, preferências ou correção de intenção interrompe a contagem. Ao aplicar automaticamente, o backend verifica novamente as preferências atuais. Cada alteração aplicada gera revisão com antes/depois, origem, original, operação e referência. SQLite usa transação imediata e o mecanismo existente com `synchronous=FULL`; revisões maiores são comprimidas. A criptografia segue a configuração de armazenamento já existente.

A retenção é explícita: a limpeza manual remove somente revisões manuais antigas, preserva as recentes, a última de cada documento e todas as importantes. Operações da IA, organização e recuperação não são removidas silenciosamente. Exclusão de documentos é recuperável; remoção definitiva do projeto/dados continua no fluxo existente de armazenamento. Não há sincronização editorial entre computadores nesta versão.

## Limites e privacidade

Os limites anteriores permanecem: até 5 MB de fontes selecionadas do projeto, anexos no fluxo existente e mensagem de até 6.000 caracteres. O Writer verifica o tamanho das fontes antes de consultar a IA e não utiliza a exportação para ampliar esse escopo.

O Writer acrescenta tetos locais: 512 KB de JSON UTF-8 por documento, 12.000 caracteres por bloco, 200 itens incluindo removidos e 5 MB de conteúdo editorial por projeto incluindo revisões comprimidas, propostas, mensagens e resultados idempotentes. O orçamento é lógico; a estrutura física SQLite tem sobrecarga. O limite rejeita e reverte a transação, sem truncar documentos ou apagar histórico. Exportações têm teto de 15 MB e cada comando de escrita tem teto de 1 MB. Contexto para IA é seletivo, limitado a 64 KB de pacote; saída de até 3.500 tokens segue cotas e permissões do proxy Cloud existente.

Nenhum arquivo original do projeto é alterado. Backup/ permanece somente leitura. Não há envio em segundo plano de documentos nem logs com seu conteúdo. O uso confirmado de IA é contabilizado pelo fluxo Cloud existente. A edição manual não depende da OpenAI; o Desktop continua sujeito à política de autenticação já existente, que pode retornar ao login se a sessão não puder ser validada durante indisponibilidade de rede.

## Validação e limitações

Testes de core/API cobrem persistência, reinício, UUIDs/caminhos, isolamento, conteúdo repetido, versões simultâneas, escrita automática conservadora, classificação corrigida, instruções/conversa sem aplicação automática, confirmação estrutural, conflitos, cancelamento, falha de rede/schema, movimentação/divisão, desfazer/refazer em sequência, remoção recursiva recuperável, retenção e limites.

Testes Desktop cobrem nome do arquivo, comparação azul, aprovação, edição sem IA, falha de salvamento com texto preservado, exportação selecionada, HTML inerte e IPC restrito. O smoke do Writer usa Electron, preload, IPC, FastAPI, SQLite e exportação reais, com provedor editorial sintético e dados temporários. Ele verifica edição/reabertura, proposta/aprovação, desfazer, criação pelo formulário nativo e DOCX com cabeçalho ZIP. O teste OOXML reabre o DOCX com python-docx e verifica títulos, negrito, itálico, listas, acentos, ordem e quebras de página.

A IA paga e uma implantação nova não foram validadas. A tentativa de renderizar DOCX pelo renderer da skill documents encontrou ausência de `soffice.exe`; portanto não se declara inspeção visual do Word/LibreOffice nem Windows limpo. A interface Electron foi capturada e inspecionada visualmente. O editor é estruturado com Markdown inline, não uma reprodução completa do Microsoft Word. `content-visibility` reduz trabalho de layout na prévia longa; o documento continua limitado a 512 KB. Teclas ainda não confirmadas pelo indicador de salvamento podem se perder numa queda abrupta de energia/processo; revisões confirmadas permanecem transacionais.

Resultados registrados em 23/10/2026: `npm ci` concluído sem vulnerabilidades reportadas; 117 testes Desktop e 24 Cloud aprovados; TypeScript e build Next.js aprovados; 23 testes específicos de Writer aprovados; 30 testes dos iniciadores, setup e contratos de build aprovados. As seis suítes Electron (interface, Quick Chat, Cloud, sessão, clipboard e Writer) passaram, com as simulações de provedor/Cloud descritas acima. `git diff --check`, compilação Python e formatação dos arquivos alterados passaram. A suíte Python completa passou com 162 testes. Uma verificação adicional com o armazenamento criptografado real confirmou ausência de texto em claro no banco, reabertura e exportação DOCX.

### Comandos

```powershell
npm ci
python -m pip install -r backend/requirements-dev.txt
npm test -w jarvis-desktop
npm run test:writer -w jarvis-desktop
npm run test:cloud
npm run typecheck
npm run build:cloud
# dentro de backend:
python -m unittest discover -v
```

Para conferir manualmente, abra um projeto, crie um arquivo com nome próprio, use Editar e reabra para confirmar persistência. Autorize a IA e envie uma narrativa; verifique a contagem e Desfazer. Peça uma revisão, confira o azul e rejeite; o original deve permanecer. Depois aprove outra proposta e restaure uma revisão. Exporte uma seleção para DOCX e abra no Word/LibreOffice instalado. Repita alternando projetos e com a IA indisponível. Não envie conteúdo confidencial durante a validação.

### Arquivos envolvidos

Criados: seis módulos/fixture `backend/writer_*.py` e `backend/test_writer.py`; UI, CSS, IPC e testes/smoke `desktop/writer-*`; este documento e `WRITER-PLAN.md`. Integração: `backend/main.py`, `backend/requirements.txt`, `desktop/main.js`, `desktop/preload.js`, `desktop/index.html`, `desktop/package.json`, `desktop/security.test.js`, `tools/audit_cloud_artifact.py`, README e CHANGELOG. A versão continua 5.0.0, sem tag ou push.
