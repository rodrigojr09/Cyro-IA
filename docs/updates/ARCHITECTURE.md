# Atualizações 6.3.0 — arquitetura e auditoria

Auditoria em 29/10/2026: Electron 44.9.1, electron-builder 26.15.3, NSIS assistido x64/per-user, appId com.jarvis.assistant e executável JARVIS preservados. Dados fora dos binários; deleteAppDataOnUninstall=false. O setup anterior tem aproximadamente 184 MB. Cloud Next.js 16/Prisma 7/PostgreSQL em Vercel. Admin usa cookies; Desktop usa sessão individual protegida e HTTPS. Repositório rodrigojr09/Cyro-IA confirmado privado por API real; tags existentes v5.1.0, v4.2.0 e v3.0.0. Nenhuma tag v6 criada por esta implementação.

O proprietário informou que ainda não tem bucket ou servidor externo: esta entrega prepara o serviço para implantação posterior. O Cloud não recebe os bytes do executável. Limite de corpo Vercel é 4,5 MB; upload direto e processamento duradouro são necessários. Fonte: [Vercel](https://vercel.com/docs/errors/function_payload_too_large).

Fluxo: SUPER_ADMIN seleciona tag real → Cloud reserva tentativa com lease e ticket HMAC limitado a tag/commit/tamanho → navegador envia diretamente ao publisher HTTPS externo → publisher recebe em diretório privado, calcula SHA-256 e valida PE/NSIS/ProductVersion → GitHub Release/Setup.exe → download integral do asset para confirmar checksum → callback assinado → transação publica CyroRelease e auditoria → cache invalidado.

O serviço externo é cloud/scripts/publisher-server.ts, um processo Node duradouro atrás de proxy HTTPS. Usa apenas um segredo de callback e a credencial restrita GitHub; não precisa de credencial do banco ou chave OpenAI. Cloud controla status e exclusão mútua por tentativa. Nenhuma rota de escrita de tags é implementada. A API Create Release pode criar uma tag ausente; por isso a referência existente é verificada imediatamente antes e após publicação. Exclusão/movimentação externa concorrente da tag é motivo de bloqueio; não configure automações externas para mudar tags durante o fluxo.

Modelo aditivo CyroRelease preserva demais tabelas: UUID local, IDs GitHub como strings, unicidade em versão/tag/release/asset, estados UPLOADING/PROCESSING/FAILED/PUBLISHED. Executável nunca entra no banco. Uma reserva de tentativa não é uma publicação. Clientes só veem PUBLISHED estável com metadados completos.

Latest usa SemVer e cache Next compartilhado de 300 segundos, invalidado no callback; resposta HTTP cacheada por até 60 segundos. Portanto não consulta o banco por verificação de cada Desktop. A distribuição privada emite ticket curto somente após autenticar o dispositivo; publisher transmite o asset sem fornecer token GitHub ao cliente.

Não existe migração destrutiva, importação de Backup/ ou alteração de caminhos de sessão. A infraestrutura externa, credenciais e teste de atualização instalada real permanecem requisitos de ativação. Não anunciar fechamento/homologação de toda a família v6 antes dessas evidências.

Tags usam cache compartilhado de cinco minutos; o acompanhamento de uma publicação não faz paginação GitHub a cada 15 segundos. Nova versão/atualização manual força consulta atual, limitada por administrador; o servidor sempre valida a referência novamente ao reservar e publicar.
