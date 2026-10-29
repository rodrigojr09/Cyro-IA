# Publicar uma versão

1. Solicitar explicitamente ao Codex a criação/envio da tag depois de validar o build. O Cloud nunca cria, move ou exclui tags.
2. Implantar/configurar o publisher conforme [GitHub e servidor](GITHUB.md), aplicar a migration aditiva e confirmar HTTPS/CORS. Sem isso, Nova versão fica indisponível.
3. Entrar como SUPER_ADMIN em Sistema · Versões (/system/versions).
4. Clicar Nova versão, pesquisar/selecionar uma tag real não utilizada. A versão vem da tag, não do nome do arquivo. Tags não SemVer ficam fora da seleção.
5. Selecionar o setup .exe correspondente, independentemente de seu nome original, e notas opcionais. O serviço usa Setup.exe sem alterar o arquivo original.
6. Publicar versão. Acompanhar o progresso de upload e o estado do histórico. O painel atualiza a cada 15 segundos somente enquanto existe tentativa ativa; também oferece atualização manual.
7. Conferir status PUBLISHED, SHA-256, tamanho, data e link da release no GitHub. Setup.exe existente bloqueia publicação normal.
8. Abrir um Desktop anterior, conferir notificação e testar o download. Repositório privado usa distribuição autenticada; o link oficial do GitHub no histórico exige acesso GitHub ao repositório.

Recuperação: após falha ou expiração da lease de duas horas, clicar Recuperar com conferência e reenviar o mesmo instalador. A referência da tag precisa permanecer igual. Se Setup.exe existir, só será adotado após baixar e comparar integralmente SHA-256 e tamanho com o arquivo validado. Não há exclusão/substituição automática de asset, release ou tag. Se os arquivos divergirem, interromper e investigar; usar outra tag validada ou uma operação manual explicitamente autorizada. Upload em estado starter/interrompido permanece bloqueado para investigação, nunca anunciado ao cliente.

Falha do banco/callback após upload não duplica release: a recuperação encontra release por tag e verifica asset existente. Callback final repetido da mesma tentativa é idempotente. Callback antigo é rejeitado após uma recuperação. Reenviar um ticket já consumido não passa da transição atômica UPLOADING → PROCESSING.

Uma reserva ainda em UPLOADING pode ser recuperada explicitamente antes da expiração, revogando a tentativa anterior. PROCESSING ativo continua bloqueado até falha ou expiração, para não disputar o mesmo asset.
