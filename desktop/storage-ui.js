window.jarvisStorageUsage = (() => {
  let blocked = false,
    cleaning = false,
    snapshot = null,
    refreshing = null;
  const $ = (id) => document.getElementById(id);
  const format = (bytes) =>
    new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(bytes / 1048576) + ' MB';
  function render() {
    const container = $('storage-usage');
    if (!container || !snapshot) return;
    container.replaceChildren();
    for (const [key, label] of [
      ['local', 'Neste computador'],
      ['cloud', 'Na nuvem'],
    ]) {
      const item = snapshot[key],
        section = document.createElement('section');
      const title = document.createElement('h4');
      title.textContent = label;
      section.appendChild(title);
      const detail = document.createElement('p');
      detail.textContent = item
        ? format(item.usedBytes) +
          (item.limitBytes ? ' de ' + format(item.limitBytes) : ' utilizados')
        : snapshot.cloudError || 'Nuvem indisponível nesta edição.';
      section.appendChild(detail);
      if (item?.limitBytes) {
        const meter = document.createElement('progress');
        meter.max = item.limitBytes;
        meter.value = item.usedBytes;
        meter.setAttribute('aria-label', 'Armazenamento na nuvem utilizado');
        section.appendChild(meter);
      }
      if (item) {
        const button = document.createElement('button');
        button.textContent = key === 'cloud' ? 'Apagar chats na nuvem' : 'Limpar dados locais';
        button.className = 'danger';
        button.disabled = cleaning || !window.jarvisWorkspace?.canNavigate;
        button.onclick = () => clear(key, button);
        section.appendChild(button);
      }
      container.appendChild(section);
    }
  }
  function apply(value) {
    blocked = value;
    let banner = $('storage-blocked');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'storage-blocked';
      banner.className = 'storage-blocked';
      banner.setAttribute('role', 'alert');
      document.querySelector('.main-panel')?.prepend(banner);
    }
    banner.hidden = !blocked;
    banner.textContent = blocked
      ? 'Limite de memória na nuvem atingido. Apague alguns chats para liberar memória e continuar usando o Cyro IA.'
      : '';
    if (blocked) window.jarvisUI?.stopVoice();
    window.jarvisWorkspace?.controls();
  }
  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      snapshot = await api('/storage');
      if (!snapshot.cloudError) apply(!!snapshot.cloud?.blocked);
      render();
      return snapshot;
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }
  async function clear(scope, button) {
    if (cleaning) return;
    cleaning = true;
    const status = $('storage-status');
    button.disabled = true;
    try {
      const result = await window.jarvisWindow.clearStorage(scope);
      if (result.canceled) return;
      if (!result.ok) throw Error(result.data?.detail || 'Não foi possível limpar os dados.');
      document.getElementById('settings-dialog')?.close();
      window.jarvisAttachments?.clear();
      await refresh();
      await window.jarvisWorkspace.catalog('', null);
      document.getElementById('status').textContent = 'Dados apagados.';
      if (status?.isConnected)
        status.textContent = 'Dados apagados. Sua conta e os arquivos originais foram preservados.';
    } catch (error) {
      if (status?.isConnected) status.textContent = error.message;
    } finally {
      cleaning = false;
      render();
    }
  }
  async function show() {
    try {
      await refresh();
    } catch (error) {
      if ($('storage-status')) $('storage-status').textContent = error.message;
    }
  }
  window.addEventListener('DOMContentLoaded', () => {
    void show();
    setInterval(() => {
      void refresh().catch(() => {});
    }, 30000);
  });
  return {
    refresh,
    show,
    get blocked() {
      return blocked;
    },
    block() {
      apply(true);
    },
  };
})();
