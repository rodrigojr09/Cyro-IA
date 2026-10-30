# Publicação dos repositórios

Os quatro diretórios têm Git independente. A pasta principal não deve receber git init. Os commits são locais; nenhum push, tag, release ou deploy foi autorizado nesta preparação.

## Desktop público

Preservar o remoto e o histórico existentes. Antes de tornar o repositório público, revisar também configurações do GitHub, logs e artifacts de Actions, releases, issues e segredos cadastrados no provedor: a auditoria local cobre arquivos rastreados e objetos Git alcançáveis, não esses serviços. Não incluir .env preenchido, bancos, perfis, chaves ou instaladores particulares no commit.

O Desktop contém apenas a origem pública da API. Segredos administrativos nunca devem ser colocados em variáveis que serão empacotadas pelo cliente. URLs públicas, Application ID e nome do repositório de atualizações não são credenciais.

## Backend e Cloud

Criar cyro-backend e cyro-cloud no GitHub, preferencialmente privados, sem README/licença iniciais para evitar histórico concorrente. Em cada checkout, conferir git status, git log e git remote -v. Adicionar origin somente se ausente, usando a URL fornecida pelo GitHub, e enviar a branch atual com upstream. Não substituir remotes existentes nem usar force push.

Files mantém seu remoto próprio. Cada projeto tem sua versão e versions/. Este início de v7 é 7.0.0-alpha.0; Files é 0.2.0 e seu SDK permanece 0.1.0. Nenhuma tag está sendo criada. As futuras tags do Desktop continuam sendo criadas no seu repositório; o painel apenas seleciona tags existentes.

## Segredos e operação

Preencher as variáveis reais somente no ambiente privado de cada serviço, a partir dos exemplos. .env é ignorado. Cloud/Vercel recebe somente CYRO_BACKEND_ORIGIN; Backend/Coolify recebe banco, Redis, Files e chaves. Files mantém seus próprios segredos e volume. Credenciais editadas pelo painel ficam criptografadas no banco do Backend, sob AUTH_SECRET, e não em arquivos do frontend.

Executar python cyro.py audit após qualquer inclusão de arquivos. O relatório mostra caminhos e identificadores, sem imprimir valores. Um resultado sem candidatos reduz riscos, mas não substitui revisão humana nem cobre objetos já apagados do GitHub. Se um segredo real for encontrado no histórico, interromper a publicação e revogá-lo; não reescrever o histórico original sem autorização.

Deploy e rollback: PRODUCTION.md. Validar configuração privada com production-check e homologar os fluxos reais antes de liberar a v7 aos usuários.
