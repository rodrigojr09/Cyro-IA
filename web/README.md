# Cyro IA Web

Interface Next.js da janela principal do Cyro IA Desktop. O build usa os componentes React e estilos de `desktop/` para que o instalador e a Vercel partam das mesmas fontes. A sessão, os arquivos e as ações nativas passam pela ponte do Electron. As janelas nativas de autenticação e Chat rápido são carregadas pelo instalador.

## Vercel

1. Importe o repositório `rodrigojr09/Cyro-IA` e escolha o branch que contém esta implementação.
2. Em **Root Directory**, selecione `web` e habilite **Include source files outside of the Root Directory in the Build Step**. O build lê as fontes de `desktop/`.
3. Use o preset **Next.js** e **Node.js 24.x**. Os comandos são `npm ci` e `npm run build`, definidos em `vercel.json`. Use o diretório de saída padrão.
4. Em **Domains**, adicione `web.cyro-ia.tech` e configure o registro DNS exibido pela Vercel. O domínio de produção precisa responder diretamente por HTTPS, com a rota `/` acessível ao Electron.

O build web usa a ponte do Desktop e dispensa variáveis de ambiente e segredos da API. No navegador comum, a página orienta a abrir o aplicativo.

## Teste local

Execute `npm ci` e `npm run build` dentro de `web/`. Para testar a integração, sirva esse build com `npm start -- --hostname 127.0.0.1 --port 3000` e inicie o Electron de desenvolvimento com `CYRO_WEB_DEVELOPMENT=1`. Atualizações das fontes em `desktop/` são incorporadas ao iniciar um novo build ou servidor de desenvolvimento.

Em produção, o instalador abre `https://web.cyro-ia.tech/`. Se a página ficar indisponível durante a abertura, ele usa a interface incluída no instalador. O contrato da ponte é anunciado em `window.cyroDesktop.workspaceProtocol`. Atualizações exclusivamente visuais aparecem ao reabrir a janela. Mudanças no contrato nativo exigem um instalador compatível.
