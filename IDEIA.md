# JARVIS — Ideia e visão do projeto

Referência da versão 1.0.1, em 20/10/2026. Este documento do próprio JARVIS é versionado com o código; não se confunde com os IDEIA.md privados gerados para cada projeto cadastrado.

## Objetivo

Oferecer um assistente pessoal para tarefas gerais, escritório, estudos e programação, com acesso rápido e memória duradoura, mantendo o usuário no controle das permissões e dos seus dados.

A fase 2 tem destino v2.0.1 e pretende levar preferências, conversas e memória em um dispositivo portátil. Está em desenvolvimento; [INSTALL](INSTALL.md) distingue o código implementado das funcionalidades e validações ainda pendentes. A programação permanece uma capacidade, sem exigir que todas as conversas pertençam a projetos.

## Implementado e verificável no código

- Electron com janela nativa redimensionável, sidebar de projetos/chats, busca e preferências persistentes.
- FastAPI local, OpenAI para inteligência e síntese de voz; mensagens em SQLite.
- Cadastro por identidade de pasta, múltiplos chats e bases independentes, sem mistura automática de contexto.
- Seleção de fontes pelo usuário antes da análise; leitura progressiva, cache por hashes, resumos e atualização incremental do projeto ativo.
- Documentos de conhecimento internos, incluindo IDEIA.md e índice de arquivos; notas humanas separadas de inferências.
- Ferramentas somente leitura para descoberta, estrutura, leitura e busca de código.
- Controles locais limitados, sem comandos arbitrários e com confirmação humana nas aberturas.
- Quick Chat independente, transparente, com histórico próprio, temporizador pausável e coordenação de voz.
- Acesso à configuração privada de IA pelas configurações, sem mostrar ou embutir a chave no executável.
- Inicialização de desenvolvimento com start.py/start.bat e pipeline de compilação Windows portátil com build.bat.

A existência de uma função ou de um teste não prova que todas as combinações de Windows, hardware, projetos e serviços externos funcionam. A cobertura prática e as limitações são registradas no CHANGELOG e no DOCUMENT.

## Arquitetura confirmada

O processo principal do Electron controla janelas e permissões IPC. Os renderers isolados exibem a interface e usam uma ponte restrita. O backend autentica solicitações e aplica políticas de leitura; SQLite mantém o catálogo e as bases por UUID na área privada do aplicativo. A OpenAI recebe contexto limitado e nunca autoriza a si própria a executar ações.

## Decisões do usuário

- Projetos originais permanecem estritamente somente leitura; exemplos de correção são aplicados manualmente pelo usuário.
- Escolher as fontes relevantes é prioridade para economia de tokens. Seleção local não usa a API; análise semântica e chat não são gratuitos.
- Interface principal ampla, organizada por projetos e conversas; Quick Chat discreto e com transparência constante.
- Memória e histórico devem sobreviver a atualizações e reinicializações.
- Versionamento, testes, commits e tags locais automáticos. Publicação/push exigem autorização.
- A versão 1.0.0 deve ter documentação e um único executável de distribuição Windows.

## Fluxos principais

**Projeto:** autorizar pasta → selecionar fontes → analisar em lotes → publicar memória interna → conversar com contexto daquele projeto → revalidar mudanças por hashes.

**Quick Chat:** abrir campo → enviar pergunta → consultar backend/memória autorizada → exibir resposta breve → pausar timer durante interação/voz → preservar histórico.

**Distribuição:** instalar ferramentas de desenvolvimento uma vez → build.bat → testes → backend compilado → Electron portátil → checksum. Sem chave pessoal no artefato.

## Limitações conhecidas

Sem edição de código dos projetos, terminal arbitrário, reconhecimento de voz ou cancelamento da geração no backend. Análise estática é limitada e pode ser parcial; imports dinâmicos e projetos muito grandes exigem orientação adicional. A API tem custo e depende de conectividade. Bases locais não são criptografadas. O portátil não é assinado digitalmente. Validação em máquina Windows limpa, áudio real e múltiplos monitores físicos permanece separada dos testes automatizados.

## Propostas ainda não implementadas

- Assinatura Authenticode, instalador e atualização distribuída após validação em Windows limpo.
- Atalho global configurável para Quick Chat.
- Reconhecimento de voz com consentimento e indicação clara de captura.
- Cancelamento real de geração e apresentação detalhada do consumo de API.
- Melhor reconhecimento de aliases/imports dinâmicos e métricas de cobertura da análise.

Esses itens são sugestões, não funcionalidades entregues ou promessas de prazo.

## Manutenção deste documento

Atualizar com evidências do código e decisões humanas confirmadas. Não transformar hipótese em fato, sugestão em implementação ou resultado de testes simulados em validação real de serviços externos. Consultar DOCUMENT.md para contratos técnicos e CHANGELOG.md para a evolução cronológica.
