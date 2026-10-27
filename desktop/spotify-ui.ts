export function spotifyLogo() {
  const picture = document.createElement('picture');
  const image = document.createElement('img');
  image.src = 'assets/spotify-white.svg';
  image.alt = 'Spotify';
  image.className = 'spotify-logo spotify-logo-white';
  const black = document.createElement('img');
  black.src = 'assets/spotify-black.svg';
  black.alt = 'Spotify';
  black.className = 'spotify-logo spotify-logo-black';
  picture.append(image, black);
  return picture;
}
type Bridge = {
  onChanged?: (callback: () => void) => void;
  request: (input: Record<string, unknown>) => Promise<any>;
};
const bridge = () => (window as unknown as { jarvisSpotify?: Bridge }).jarvisSpotify;
bridge()?.onChanged?.(() => window.dispatchEvent(new Event('jarvis:spotify-changed')));
export async function spotifyRequest(input: Record<string, unknown>) {
  const api = bridge();
  if (!api) throw Error('Abra o Cyro Cloud para usar esta integração.');
  const result = await api.request(input);
  if (result?.error) {
    const error = Error(result.error) as Error & { retryAfter?: number };
    error.retryAfter = result.retryAfter;
    throw error;
  }
  return result;
}
export function mountSpotifySettings(container: HTMLElement, changed: (value: any) => void) {
  const root = document.createElement('div');
  root.className = 'spotify-settings';
  const note = document.createElement('p');
  note.setAttribute('role', 'status');
  const actions = document.createElement('div');
  actions.className = 'spotify-actions';
  const legal = document.createElement('p');
  legal.textContent =
    'Controle suas músicas pelo chat principal ou Quick Chat. Os comandos exigem uma conta/dispositivo elegível. No modo de desenvolvimento, sua conta precisa estar autorizada no Dashboard Spotify. Busca por nome e playlists não estão disponíveis. Desconectar apaga os tokens no Cyro; a revogação adicional pode ser feita na sua conta Spotify.';
  root.append(note, actions, legal);
  container.append(root);
  let transactionId: string | null = null,
    timer: ReturnType<typeof setTimeout> | null = null,
    busy = false,
    refreshing = false;
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  function button(label: string, action: () => Promise<void>) {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = label;
    node.onclick = async () => {
      if (busy) return;
      busy = true;
      node.disabled = true;
      try {
        await action();
      } catch (error) {
        note.textContent = (error as Error).message;
      } finally {
        busy = false;
        node.disabled = false;
      }
    };
    actions.append(node);
  }
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      root.setAttribute('aria-busy', 'true');
      stop();
      const state = await spotifyRequest({ operation: 'status' });
      if (!root.isConnected) return;
      changed(state);
      actions.replaceChildren();
      note.textContent =
        state.status === 'connected'
          ? `Conectado · ${state.displayName}`
          : state.status === 'error'
            ? 'Reconexão necessária.'
            : 'Não conectado.';
      if (state.status === 'connected') {
        button('Testar conexão', async () => {
          await spotifyRequest({ operation: 'control', command: { action: 'test' } });
          note.textContent = 'Conexão confirmada pelo Spotify.';
        });
        button('Reconectar', start);
        button('Desconectar', async () => {
          const result = await spotifyRequest({ operation: 'disconnect' });
          if (!result.cancelled) {
            note.textContent =
              'Conexão removida. Você também pode revogar o acesso nas configurações da conta Spotify.';
            await refresh();
            window.dispatchEvent(new Event('jarvis:spotify-changed'));
          }
        });
      } else {
        button(state.status === 'error' ? 'Reconectar' : 'Conectar', start);
        if (!state.configured) {
          note.textContent =
            state.configurationError || 'Spotify aguarda configuração pelo administrador no Cloud.';
          actions.querySelector('button')!.disabled = true;
        }
      }
      button('Atualizar conexão', refresh);
    } finally {
      refreshing = false;
      root.setAttribute('aria-busy', 'false');
    }
  }
  const onFocus = () => {
    if (!transactionId && !busy && root.isConnected && root.getClientRects().length)
      void refresh().catch((error) => {
        note.textContent = error.message;
      });
  };
  window.addEventListener('focus', onFocus);
  const cleanup = new MutationObserver(() => {
    if (!root.isConnected) {
      stop();
      window.removeEventListener('focus', onFocus);
      cleanup.disconnect();
    }
  });
  cleanup.observe(document.body, { childList: true, subtree: true });
  async function poll() {
    if (!root.isConnected || !transactionId) {
      stop();
      return;
    }
    try {
      const value = await spotifyRequest({ operation: 'poll', transactionId });
      if (value.status === 'completed') {
        transactionId = null;
        await refresh();
        window.dispatchEvent(new Event('jarvis:spotify-changed'));
        return;
      }
      if (['denied', 'cancelled', 'expired', 'failed'].includes(value.status)) {
        transactionId = null;
        await refresh();
        note.textContent =
          'A conexão não foi concluída. Confira a autorização, as permissões e tente novamente.';
        return;
      }
      timer = setTimeout(() => void poll(), 4000);
    } catch (error) {
      note.textContent = (error as Error).message;
      transactionId = null;
      actions.replaceChildren();
      button('Tentar novamente', refresh);
    }
  }
  async function start() {
    const value = await spotifyRequest({ operation: 'start' });
    transactionId = value.transactionId;
    root.setAttribute('aria-busy', 'true');
    note.textContent = 'Conectando… autorize na página oficial do Spotify aberta no navegador.';
    actions.replaceChildren();
    button('Cancelar', async () => {
      if (transactionId) await spotifyRequest({ operation: 'cancel', transactionId });
      transactionId = null;
      await refresh();
    });
    timer = setTimeout(() => void poll(), 3000);
  }
  void refresh().catch((error) => {
    note.textContent = error.message;
    button('Tentar novamente', refresh);
  });
}
