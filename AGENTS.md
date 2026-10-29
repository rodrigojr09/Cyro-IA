# Cyro IA v6 — instruções vigentes

- Desenvolver Cloud Next.js/Prisma Postgres e Desktop Electron de forma integrada.
- Backup/ é arquivo manual do proprietário: somente leitura; nunca alterar, mover ou importar diretamente dele em runtime.
- Não publicar segredos, bancos, perfis locais, códigos ou credenciais. Não executar git push sem autorização.
- Reutilizar interface, Quick Chat, voz, memória e ferramentas autorizadas; preservar confirmação humana e IPC restrito.
- OpenAI e PostgreSQL exclusivamente no Cloud. Desktop utiliza sessão de login individual protegida e HTTPS em produção.
- Versão alvo 6.3.0 em desenvolvimento, evolução arquitetural da v5 autorizada pelo proprietário em 27/10/2026. Não criar tag de release antes de validar os requisitos. Registrar testes reais e limitações externas.
- Instalar workspaces na raiz com npm ci; executar testes Cloud, TypeScript/build, Python e Electron.
- Não declarar implantação, áudio pago ou Windows limpo validados com mocks.

- Cyro IA é o nome público autorizado em 27/10/2026 (antes JARVIS). Preservar caminhos de dados JARVIS, appId, executável e IPC existentes para compatibilidade. Repositório: rodrigojr09/Cyro-IA.

- Marca: usar Cyro em mensagens, textos de apoio, botões e conversas; reservar Cyro IA para logos e títulos.

- Autorização contínua do proprietário em 29/10/2026: após concluir e validar alterações, criar commits, enviar ao GitHub/Cloud e compilar o instalador atualizado, salvo instrução posterior em contrário. Preservar os instaladores anteriores e registrar os resultados reais.

- v6.3: Cloud apenas consulta tags existentes; nunca criar, mover ou excluir tags. Não publicar releases reais automaticamente. Servidor externo de upload será configurado posteriormente. Ignorar atualizador quando app.isPackaged=false; preservar informações/links do repositório mesmo ao torná-lo público.
