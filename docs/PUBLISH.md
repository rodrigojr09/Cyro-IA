# Publicação e distribuição — Cyro IA v6.1.0 em desenvolvimento

O código está em `rodrigojr09/Cyro-IA`, branch `master`, com Cloud em `https://cronosjarvis.vercel.app`. O envio de código depende de autorização do proprietário; o envio ao GitHub pode acionar a implantação Vercel configurada. Verifique o status do mesmo commit antes de declarar o deploy concluído.

## Antes de publicar código

1. Execute `npm ci` na raiz e `npm run check:v6` com requisitos Python disponíveis.
2. Revise o diff, a documentação e o índice. Não incluir `.env`, segredos, bancos, perfis, `Backup/`, `build/` ou `release/`.
3. Registre o commit e envie somente quando autorizado. Não publicar o diretório local inteiro na Vercel; ela deve usar o checkout revisado.
4. Se houver migrations novas, aplicá-las separadamente no ambiente autorizado; build não deve migrar o banco de previews ou produção automaticamente.
5. Confira a implantação e execute o roteiro humano aplicável em [VALIDATION.md](VALIDATION.md).

O Desktop 6.1.0 depende dos comandos Cloud `bootstrap` e `exchange`. Esses comandos já existem no Cloud 6.0.2; o transporte básico continua compatível com Cloud 6.0.2 ou posterior. O compartilhamento de memória da conta no endpoint comum requer publicar o Cloud 6.1.0 após autorização. Esta revisao nao adiciona migrations.

## Compilar o setup Windows x64

Requisitos de compilação: dependências npm da raiz, Python com `backend/requirements-dev.txt` e `backend/requirements-build.txt`, Windows x64 e origem HTTPS real autorizada.

```powershell
$env:JARVIS_CLOUD_ORIGIN = 'https://cronosjarvis.vercel.app'
python tools/build_cloud_desktop.py
```

`build.bat` chama o mesmo pipeline. A validação completa precede PyInstaller e electron-builder. O destino é `release/v6/Cyro-IA-Setup-6.1.0.exe` com `.exe.sha256`. O backend é empacotado; usuários finais não precisam instalar Node/Python. O artefato não tem assinatura digital adicionada nesta tarefa.

A auditoria é automática ao compilar. Depois da conclusão do empacotamento:

```powershell
python tools/audit_cloud_artifact.py
python tools/smoke_cloud_release.py
```

O smoke inicia e reinicia o payload com perfil temporário e PATH restrito, sem chamadas pagas. A porta local 8765 precisa estar livre; não encerre serviço de outro aplicativo para liberar a porta. Não executar o setup sobre o perfil pessoal para substituir uma VM de teste.

## Dependências do pacote Desktop

As bibliotecas do renderer são compiladas em dist/ por esbuild. O hook beforeBuild verifica que todos os arquivos do manifesto existem e que o grafo nativo usa somente Electron, módulos internos do Node e os arquivos explicitamente autorizados. Somente após essa validação ele declara as dependências já tratadas, evitando o hoister de workspaces do empacotador. Se surgir uma dependência externa no código nativo, a compilação falha em vez de gerar um pacote incompleto. O hook é ferramenta de build e fica fora do instalador; usuários continuam sem precisar de Node/npm.

Esse contrato foi exercitado com dois testes (aplicativo completo e incompleto) e pela geração do pacote Windows. A auditoria do ASAR e o teste do payload permanecem obrigatórios.

## O que não é automático

A compilação não faz push, upload do instalador, GitHub Release, tag, assinatura ou certificação de Windows limpo. O verificador de índice/caminhos e a auditoria não substituem revisão de segredos no diff. Guarde os segredos somente no servidor e mantenha `AUTH_SECRET` estável.

Origem Cloud, variáveis e bootstrap: [DEPLOYMENT.md](DEPLOYMENT.md), [VERCEL.md](VERCEL.md) e [CREDENTIALS.md](CREDENTIALS.md). Evidências do artefato vigente: [VALIDATION.md](VALIDATION.md).
