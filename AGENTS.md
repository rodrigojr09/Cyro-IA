# JARVIS v5 — instruções vigentes

- Desenvolver Cloud Next.js/Prisma Postgres e Desktop Electron de forma integrada.
- Backup/ é arquivo manual do proprietário: somente leitura; nunca alterar, mover ou importar diretamente dele em runtime.
- Não publicar segredos, bancos, perfis locais, códigos ou credenciais. Não executar git push sem autorização.
- Reutilizar interface, Quick Chat, voz, memória e ferramentas autorizadas; preservar confirmação humana e IPC restrito.
- OpenAI e PostgreSQL exclusivamente no Cloud. Desktop utiliza sessão de login individual protegida e HTTPS em produção.
- Versão alvo 5.1.0, evolução v5 autorizada pelo proprietário. Não criar tag de release antes de validar os requisitos. Registrar testes reais e limitações externas.
- Instalar workspaces na raiz com npm ci; executar testes Cloud, TypeScript/build, Python e Electron.
- Não declarar implantação, áudio pago ou Windows limpo validados com mocks.
