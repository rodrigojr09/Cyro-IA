# Anexos 6.3.0 — componente único

O chat principal usa o mesmo AttachmentCard para clipe, drop e Ctrl+V de imagem. O monitor também reutiliza o componente para textos/imagens, com ações locais e revisão humana. A raiz usa border 1px var(--border), raio/padding de 12px, gap 10px e var(--surface). Miniatura à esquerda em uma caixa 56×56/contain/raio 10px; nome e metadados em coluna e remoção no cabeçalho. Salvar cópia e Ver prévia ficam no rodapé como botões com ícones. O aviso tem ícone, contraste por tokens e fonte de 12px. Foco visível, hover/pressionado e entrada suave respeitam movimento reduzido. A área acima da digitação tem altura limitada/rolagem para até cinco cartões não esconderem o campo. Documentos mostram extração local limitada a 4.000 caracteres ao pedir prévia; indisponibilidade da prévia não remove dados antigos.

Drop recebe bytes e nome simples, não caminhos de leitura/escrita fornecidos pelo renderer. O IPC dedicado e o serviço local recusam nomes com separadores, drives, campos extras, formatos inválidos e arquivos acima de 5 MB. As validações existentes de imagem/documento continuam no backend; o limite de cinco por mensagem é compartilhado com o clipe. Conteúdo só é enviado à IA no envio explícito da mensagem. Não há nova API Cloud nem nova conversa para importar arquivos.

# Anexos locais nos chats

O compositor principal aceita até cinco anexos por mensagem, com até 5 MiB
(5.242.880 bytes) cada. O seletor do Desktop avisa antes da importação e o
backend local repete a validação. Esse limite é independente dos 5 MiB totais
dos arquivos selecionados de um projeto.

Os originais ficam na pasta de dados local do JARVIS, separados por conta e
vinculados à mensagem. O banco Cloud guarda apenas a quantidade de anexos,
além das mensagens normais do chat. Não recebe nomes, caminhos, originais,
miniaturas ou extrações como registros de anexos.

Ao carregar o histórico em outro computador, a mensagem exibe exatamente:

> Salvo localmente em outro Computador

O arquivo não é transferido entre computadores. Na máquina de origem, o usuário
pode visualizar uma miniatura de imagem ou salvar uma cópia do original.

Para análise pela IA, o Desktop encaminha ao Cloud, durante a requisição,
imagens otimizadas e texto extraído localmente. O Cloud encaminha esse conteúdo
ao provedor; não utiliza armazenamento de arquivos nem a Files API. As respostas
normais da IA continuam no histórico e podem mencionar o conteúdo analisado.

Formatos: imagens estáticas PNG, JPEG, WebP e GIF; PDF com texto; DOCX, XLSX,
PPTX; texto e extensões de código já aceitas pelo leitor local. Documentos não
são executados. A extração limita-se a 6.000 caracteres por documento e às
primeiras 30 páginas de PDF, com indicação de extração parcial quando aplicável.
Imagens são reduzidas para análise, preservando o original local. PDF digitalizado
sem texto deve ser anexado como imagens das páginas.

Os anexos disponíveis da última mensagem com anexos podem ser reutilizados em
perguntas seguintes da mesma conversa. Outra conta não recebe acesso ao acervo
local. O seletor de anexos está no chat principal; o Quick Chat mantém sua
interface atual.

Esta funcionalidade exige o Cloud e o Desktop atualizados juntos e a migration
`20261022150000_local_attachment_notice`. Os testes de transporte ao provedor
usam simulação e não comprovam análise paga em produção.

## Verificação local em 22/10/2026

- Cloud: 22 testes aprovados, incluindo validação das imagens, limites do corpo,
  isolamento de contas e migration em PostgreSQL embarcado.
- Desktop: 81 testes aprovados, incluindo seleção nativa, limites, IPC privado
  autenticado e a frase exata no histórico de outro computador.
- Backend Python: 132 testes aprovados na execução completa; após a correção
  adicional do contexto de projeto, 34 testes de anexos e projetos aprovados,
  incluindo o novo caso que preserva a identidade da conta ao vincular anexos.
- Inicialização e empacotamento: 25 testes aprovados.
- TypeScript e compilação de produção Next.js aprovados.
- Quatro verificações no Electron real aprovadas: interface principal, Quick
  Chat, sessão protegida e integração com FastAPI. A última passou na repetição
  isolada após uma falha de asserção durante a execução concorrente das suítes.
- Extração de PDF e documentos e processamento de imagens executados localmente
  com arquivos de teste reais; chamadas pagas à IA simuladas.

Não houve publicação, aplicação da nova migration ao banco remoto, geração de
novo instalador ou validação em uma instalação limpa do Windows nesta etapa.
