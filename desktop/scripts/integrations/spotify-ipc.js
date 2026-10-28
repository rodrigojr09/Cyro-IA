const DESKTOP_ROOT = require('node:path').resolve(__dirname, '../..');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
function installSpotifyIPC({ electron, service }) {
  const { ipcMain, BrowserWindow, shell, dialog } = electron;
  ipcMain.handle('spotify:request', async (event, input) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const mainURL = pathToFileURL(path.join(DESKTOP_ROOT, 'index.html')).href;
    const quickURL = pathToFileURL(path.join(DESKTOP_ROOT, 'quick.html')).href + '?panel=composer';
    const url = event.senderFrame?.url;
    if (
      !win ||
      event.senderFrame !== event.sender.mainFrame ||
      ![mainURL, quickURL].includes(url) ||
      !service()?.current() ||
      process.env.JARVIS_AUTHENTICATED !== '1'
    )
      throw Error('Entre no Cyro para usar o Spotify.');
    const credential = service().current().credential;
    if (
      input?.operation === 'open-track' &&
      typeof input.url === 'string' &&
      /^https:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]{22}$/.test(input.url)
    ) {
      await shell.openExternal(input.url);
      return { ok: true };
    }
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      JSON.stringify(input).length > 2048 ||
      !['status', 'start', 'poll', 'cancel', 'disconnect', 'control'].includes(input.operation)
    )
      throw Error('Operação Spotify inválida.');
    if (['start', 'cancel', 'disconnect'].includes(input.operation) && url !== mainURL)
      throw Error('Abra as integrações na janela principal.');
    if (input.operation === 'disconnect') {
      const decision = await dialog.showMessageBox(win, {
        type: 'question',
        message: 'Desconectar sua conta Spotify?',
        detail:
          'Os tokens serão apagados do Cyro. Você também pode revogar o acesso nas configurações da sua conta Spotify.',
        buttons: ['Cancelar', 'Desconectar'],
        defaultId: 0,
        cancelId: 0,
      });
      if (decision.response !== 1) return { cancelled: true };
    }
    if (service()?.current()?.credential !== credential || process.env.JARVIS_AUTHENTICATED !== '1')
      throw Error('Sessão alterada. Entre novamente.');
    try {
      const result = await service().request('/api/integrations/spotify', 'POST', input);
      if (
        service()?.current()?.credential !== credential ||
        process.env.JARVIS_AUTHENTICATED !== '1'
      )
        throw Error('Sessão alterada.');
      if (input.operation === 'start') {
        const url = new URL(result.authorizationUrl);
        if (
          url.origin !== service().current().origin ||
          url.pathname !== '/api/integrations/spotify/authorize' ||
          url.username ||
          url.password ||
          url.hash ||
          !/^[\w-]{43}$/.test(url.searchParams.get('ticket') || '') ||
          [...url.searchParams].length !== 1
        )
          throw Error('Autorização Spotify inválida.');
        await shell.openExternal(url.href);
        return { transactionId: result.transactionId, expiresAt: result.expiresAt };
      }
      if (
        input.operation === 'disconnect' ||
        (input.operation === 'poll' && result.status === 'completed') ||
        (input.operation === 'control' &&
          ['pause', 'resume', 'next', 'previous', 'volume', 'volume_delta', 'transfer'].includes(
            input.command?.action,
          ))
      ) {
        for (const window of BrowserWindow.getAllWindows?.() || []) {
          if (!window.isDestroyed()) window.webContents.send('spotify:changed');
        }
      }
      return result;
    } catch (error) {
      return {
        error: error.spotify
          ? error.message
          : 'Não foi possível acessar a integração Spotify. Confira a conexão e sua sessão.',
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
      };
    }
  });
}
module.exports = { installSpotifyIPC };
