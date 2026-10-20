# Conectar ao novo repositório GitHub

O projeto está na branch master, com o histórico anterior preservado. O remoto que apontava para Backup/ foi removido. Nenhum push foi executado.

## Criar o repositório

No GitHub, crie um repositório privado chamado jarvis (ou outro nome de sua preferência). Deixe-o vazio: não adicionar README, .gitignore ou licença na criação, pois o projeto já tem arquivos e histórico próprios.

Copie a URL HTTPS do novo repositório. Na raiz do projeto, substitua o texto entre aspas pela URL real e execute:

```powershell
git remote add origin "COLE_A_URL_HTTPS_DO_REPOSITORIO_AQUI"
git push -u origin master
```

Esses comandos são para você executar quando o repositório existir. Não enviar Backup/, instaladores, bancos pessoais ou credenciais. Os modelos .env.example já estão no código; configure os valores reais privadamente no ambiente de desenvolvimento e na Vercel. Antes de publicar arquivos novos, confira git status para evitar adicionar dados privados.

## Conectar à Vercel

Importe o repositório criado, escolha a branch master e Root Directory cloud. Habilite a inclusão dos arquivos fora da Root Directory, pois packages/shared é uma dependência do Cloud.

As configurações de instalação/build já estão em cloud/vercel.json. Variáveis necessárias, migrations e criação do primeiro administrador estão documentadas em [VERCEL.md](VERCEL.md).
