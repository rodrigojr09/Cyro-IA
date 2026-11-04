# Cyro IA v6 — instruções vigentes

- Arquitetura autorizada em 30/10/2026: este repositório é Cyro Desktop; cyro-backend e cyro-cloud são projetos independentes, sem monorepo ou imports entre checkouts.
- Backup/ é arquivo manual do proprietário: somente leitura; nunca alterar, mover ou importar diretamente dele em runtime.
- Não publicar segredos, bancos, perfis locais, códigos ou credenciais. Não executar git push sem autorização.
- Reutilizar interface, Quick Chat, voz, memória e ferramentas autorizadas; preservar confirmação humana e IPC restrito.
- OpenAI, PostgreSQL, Redis, Cyro Files e credenciais privilegiadas exclusivamente no cyro-backend. Cyro Cloud é apresentação/cliente HTTP. Desktop utiliza sessão individual protegida e HTTPS em produção.
- Versão alvo 6.4.0 em desenvolvimento, evolução arquitetural da v5 autorizada pelo proprietário em 27/10/2026. Não criar tag de release antes de validar os requisitos. Registrar testes reais e limitações externas.
- Desktop: npm ci na raiz; executar TypeScript/build, testes Desktop, Python e Electron. Backend e Cloud instalam, testam e compilam em suas próprias raízes.
- Não declarar implantação, áudio pago ou Windows limpo validados com mocks.

- Cyro IA é o nome público autorizado em 27/10/2026 (antes JARVIS). Preservar caminhos de dados JARVIS, appId, executável e IPC existentes para compatibilidade. Repositório: rodrigojr09/Cyro-IA.

- Marca: usar Cyro em mensagens, textos de apoio, botões e conversas; reservar Cyro IA para logos e títulos.

- Autorização contínua do proprietário em 29/10/2026: após concluir e validar alterações, criar commits, enviar ao GitHub/Cloud e compilar o instalador atualizado, salvo instrução posterior em contrário. Preservar os instaladores anteriores e registrar os resultados reais.

- v6.3: Cloud apenas consulta tags existentes; nunca criar, mover ou excluir tags. Não publicar releases reais automaticamente. Servidor externo de upload será configurado posteriormente. Ignorar atualizador quando app.isPackaged=false; preservar informações/links do repositório mesmo ao torná-lo público.

- Instrução mais recente de 30/10/2026 prevalece sobre autorização contínua anterior: não publicar repositórios, executar push, criar tags/releases ou alterar produção sem autorização específica. Preservar histórico/remoto do Desktop e instaladores anteriores.

## Autorização vigente — 03/11/2026

O proprietário definiu esta etapa como v8.0.1 e autorizou continuamente compilar e enviar
as versões/alterações a partir de agora. Após validar cada alteração, criar commits e
executar push normal para os remotos/branches existentes, sem pedir nova autorização.
Compilar e entregar o instalador atualizado, preservando todos os instaladores anteriores.
Esta instrução prevalece sobre as restrições anteriores de compilação/envio. Não autoriza
force push, migrações destrutivas, exposição de segredos ou eliminação de dados.
Manter o estado real das funcionalidades documentado; mudar a versão não conclui os EVs.

## Escopo vigente — v8.1.0, 03/11/2026

O proprietário renumerou a próxima implementação para v8.1.0 e determinou remover
projetos locais como funcionalidade ativa, mantendo apenas EVs centrais.
Retirar projetos locais da navegação e dos caminhos de criação; usar EVs pela API central.
Preservar todos os dados legados e Backup/; não enviar conteúdo antigo automaticamente.
A autorização contínua de compilação/envio permanece; não anunciar conclusão antes
dos testes e da entrega efetiva. Escopo detalhado em docs/ev/V8_1_SCOPE.md.

## Instrução posterior do proprietário — continuação v8.1.0

Não executar push sem nova autorização. Não gerar instalador nem declarar v8.1.0
concluída enquanto os critérios funcionais não forem atendidos. Continuar código,
testes e documentação preservando todas as alterações e os dados legados.

## Interação EV aprovada posteriormente

Todas as funcionalidades do EV devem ser acionadas por mensagens ao mesmo Cyro.
Não reintroduzir barras de ferramentas, painéis de operações ou dezenas de botões.
Tabelas, resultados e arquivos aparecem na conversa; alterações existentes exigem
proposta e confirmação por mensagem. Preservar autorização central e idempotência.

## Ajustes v8.1.1 — 04/11/2026

O proprietário pediu o campo do EV igual ao chat normal, incluindo clipe de anexo
e microfone, mantendo as operações do espaço por mensagem. Essa instrução autoriza
os controles usuais de composição. Solicitou gerar instalador; entregar em release/v8
preservando anteriores. Não autoriza push, publicação ou mudança de produção.
