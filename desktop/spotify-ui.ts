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
  if (!api) throw Error('Abra o JARVIS Cloud para usar esta integração.');
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
    'Controles exigem uma conta/dispositivo elegível. No modo de desenvolvimento, sua conta precisa estar autorizada no Dashboard Spotify. Busca por nome e playlists não estão disponíveis. Desconectar apaga os tokens no JARVIS; a revogação adicional pode ser feita na sua conta Spotify.';
  root.append(note, actions, legal);
  container.append(root);
  let transactionId: string | null = null,
    timer: ReturnType<typeof setTimeout> | null = null,
    busy = false;
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
    root.setAttribute('aria-busy', 'false');
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
        note.textContent = 'Spotify aguarda configuração pelo administrador no Cloud.';
        actions.querySelector('button')!.disabled = true;
      }
    }
  }
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
export function mountSpotifyPlayer(container: HTMLElement) {
  if (!bridge()) return;
  const root = document.createElement('aside');
  root.className = 'spotify-player';
  root.setAttribute('aria-label', 'Player Spotify');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.append(spotifyLogo());
  toggle.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('div');
  panel.hidden = true;
  panel.className = 'spotify-player-panel';
  const info = document.createElement('p');
  info.setAttribute('role', 'status');
  const track = document.createElement('button');
  track.type = 'button';
  track.className = 'spotify-track';
  track.hidden = true;
  const controls = document.createElement('div');
  controls.className = 'spotify-actions';
  const devices = document.createElement('select');
  devices.setAttribute('aria-label', 'Selecionar dispositivo Spotify');
  devices.hidden = true;
  const volume = document.createElement('input');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '100';
  volume.setAttribute('aria-label', 'Volume Spotify');
  volume.hidden = true;
  panel.append(info, track, controls, devices, volume);
  root.append(toggle, panel);
  container.append(root);
  let timer: ReturnType<typeof setTimeout> | null = null,
    playing = false,
    updating = false,
    busy = false;
  function layout() {
    window.dispatchEvent(new Event('jarvis:spotify-layout'));
  }
  function visible() {
    return (
      root.isConnected && !document.hidden && root.getClientRects().length > 0 && !panel.hidden
    );
  }
  function schedule(wait = 30000) {
    if (timer) clearTimeout(timer);
    if (visible()) timer = setTimeout(() => void refresh(), wait);
  }
  async function run(command: Record<string, unknown>) {
    if (busy) return;
    busy = true;
    try {
      await spotifyRequest({ operation: 'control', command });
      await refresh();
    } catch (error) {
      info.textContent = (error as Error).message;
      schedule(Math.max(30000, ((error as any).retryAfter || 0) * 1000));
    } finally {
      busy = false;
      layout();
    }
  }
  for (const [label, action] of [
    ['Anterior', 'previous'],
    ['Pausar / continuar', 'toggle'],
    ['Próxima', 'next'],
    ['Dispositivos', 'devices'],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.onclick = async () => {
      if (action === 'devices') {
        try {
          const result = await spotifyRequest({
            operation: 'control',
            command: { action: 'devices' },
          });
          devices.replaceChildren();
          const prompt = document.createElement('option');
          prompt.textContent = 'Selecione um dispositivo';
          prompt.value = '';
          devices.append(prompt);
          for (const d of result.devices) {
            if (!d.id || d.restricted) continue;
            const option = document.createElement('option');
            option.value = d.id;
            option.textContent = d.name;
            devices.append(option);
          }
          devices.hidden = false;
          info.textContent = result.devices.length
            ? 'Escolha onde reproduzir.'
            : 'Abra o Spotify em um dispositivo.';
          layout();
        } catch (error) {
          info.textContent = (error as Error).message;
        }
      } else await run({ action: action === 'toggle' ? (playing ? 'pause' : 'resume') : action });
    };
    controls.append(button);
  }
  devices.onchange = () => {
    if (devices.value) void run({ action: 'transfer', deviceId: devices.value });
  };
  volume.onchange = () => void run({ action: 'volume', volume: Number(volume.value) });
  track.onclick = () => {
    const url = track.dataset.url;
    if (url)
      void spotifyRequest({ operation: 'open-track', url }).catch((error) => {
        info.textContent = error.message;
      });
  };
  async function refresh() {
    if (updating) return;
    if (!visible()) {
      schedule();
      return;
    }
    updating = true;
    try {
      const state = await spotifyRequest({ operation: 'status' });
      if (!visible()) return;
      if (state.status !== 'connected') {
        info.textContent = 'Conecte o Spotify em Configurações → Integrações.';
        controls.hidden = true;
        track.hidden = true;
        volume.hidden = true;
        return;
      }
      const result = await spotifyRequest({
        operation: 'control',
        command: { action: 'playback' },
      });
      if (!visible()) return;
      const playback = result.playback;
      playing = playback?.playing === true;
      controls.hidden = false;
      info.textContent = playback
        ? playing
          ? 'Reproduzindo no Spotify'
          : 'Spotify pausado'
        : 'Abra o Spotify e selecione um dispositivo.';
      track.hidden = !playback?.track;
      if (playback?.track) {
        track.textContent = `${playback.track.name} — ${playback.track.artist} · Abrir no Spotify`;
        track.dataset.url = playback.track.url;
      }
      volume.hidden = !playback?.device?.supportsVolume;
      if (!volume.hidden) volume.value = String(playback.device.volume ?? 50);
      schedule();
    } catch (error) {
      info.textContent = (error as Error).message;
      schedule(Math.max(30000, ((error as any).retryAfter || 0) * 1000));
    } finally {
      updating = false;
      layout();
    }
  }
  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    layout();
    void refresh();
    if (panel.hidden && timer) clearTimeout(timer);
  };
  document.addEventListener('visibilitychange', () => {
    if (visible()) void refresh();
    else if (timer) clearTimeout(timer);
  });
  window.addEventListener('jarvis:spotify-changed', () => void refresh());
  requestAnimationFrame(layout);
}
