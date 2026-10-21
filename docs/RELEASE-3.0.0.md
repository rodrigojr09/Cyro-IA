# JARVIS v3.0.0

Release aprovada pelo proprietário em 21/10/2026. Cloud de produção: https://cronosjarvis.vercel.app.

## Entrega

- Desktop Electron para Windows x64, com instalador NSIS, ativação por código ou protocolo jarvis:// e credencial individual protegida pelo Windows.
- Cloud Next.js na Vercel com painel administrativo, usuários/clientes, dispositivos, licenças, ativações, consumo e auditoria.
- Prisma ORM + Prisma Postgres para administração central; OpenAI e chave exclusivamente no Cloud.
- Interface de chat, projetos, histórico, memória, ferramentas locais autorizadas, Quick Chat e voz preservados. Histórico local por perfil do Windows, sem sincronização central de conversas.
- Correções de responsividade e de diagnóstico da síntese de voz.

## Artefato local

Arquivo: `release/v3/JARVIS-Setup-3.0.0.exe`.

SHA-256:

```text
285db851057817068699b8c9fe7bf0203d0750fbadabdc751bad3cf60954183b
```

Instalador auditado, sem assinatura digital. O executável e seu checksum permanecem fora do Git; enviar código por Git não distribui o instalador. Backup, ambientes privados e dados locais também ficam fora da publicação.

## Validação

O proprietário confirmou funcionamento do Desktop, Cloud, ativações, voz e validação do instalador. Essa confirmação é distinta dos testes automatizados com serviços externos simulados. A matriz de Windows limpo, atualização/desinstalação e cenários avançados não foi detalhada. Resultados executados e limitações em [VALIDATION.md](VALIDATION.md).

## Git

Tag anotada local: `v3.0.0`, apontando para o commit de finalização. O proprietário fará o push manual do branch e da tag; nenhuma publicação remota automática é executada.
