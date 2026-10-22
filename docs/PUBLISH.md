# Publicação do JARVIS v4

Destino atual: repositório privado `rodrigojr09/Jarvis`, branch `master`, com integração automática ao projeto Vercel `jarvis-v0-1`. Domínio Cloud: `https://cronosjarvis.vercel.app`. Em 22/10/2026, o proprietário autorizou o envio da v4.0.0 à nuvem e a compilação do instalador. Publicar somente o código revisado, sem `.env`, bancos, perfis, `Backup/`, `build/` ou `release/`. Não criar tag antes das validações exigidas. Evidências e limitações em [V4.md](V4.md).

O instalador usa a origem HTTPS de produção e é gerado localmente pelo pipeline `tools/build_cloud_desktop.py`, com saída `release/v4/JARVIS-Setup-4.0.0.exe` e checksum SHA-256. O envio ao GitHub não substitui a confirmação de que a Vercel concluiu o deploy do mesmo commit.

## Histórico de configuração

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
