window.jarvisUI = (() => {
  const $ = (id) => document.getElementById(id);
  let preferences = { voice: true, collapsed: false, largeText: false },
    audioGeneration = 0;
  try {
    preferences = {
      ...preferences,
      ...JSON.parse((window.jarvisStorage || localStorage).getItem('jarvis.preferences') || '{}'),
    };
  } catch {}
  window.jarvisWindow
    .initialSettings?.()
    .then((value) => {
      if (!(window.jarvisStorage || localStorage).getItem('jarvis.setup-applied')) {
        if (typeof value.voice === 'boolean') preferences.voice = value.voice;
        preferences.theme = value.theme || 'dark';
        (window.jarvisStorage || localStorage).setItem('jarvis.setup-applied', '1');
        apply();
      }
      if (value.displayName)
        $('welcome').querySelector('h2').textContent =
          `Olá, ${value.displayName}. Como posso ajudar?`;
    })
    .catch(() => {});
  function persist() {
    try {
      (window.jarvisStorage || localStorage).setItem(
        'jarvis.preferences',
        JSON.stringify(preferences),
      );
    } catch {}
  }
  function icons() {
    window.jarvisVendor.refreshIcons();
  }
  function apply() {
    window.jarvisWindow.voicePreference?.(!!preferences.voice).catch(() => {});
    document.body.classList.toggle('sidebar-collapsed', !!preferences.collapsed);
    document.body.classList.toggle('large-text', !!preferences.largeText);
    document.documentElement.dataset.theme = preferences.theme || 'dark';
    $('sidebar-toggle').setAttribute('aria-expanded', String(!preferences.collapsed));
    $('voice-toggle').setAttribute('aria-pressed', String(preferences.voice));
    $('voice-toggle').querySelector('span').textContent = preferences.voice
      ? 'Voz ativa'
      : 'Voz desativada';
    persist();
  }
  function copy(button, text) {
    button.onclick = async () => {
      try {
        await window.jarvisWindow.copyCode(text);
        button.textContent = 'Copiado';
      } catch {
        button.textContent = 'Falha ao copiar';
      }
    };
  }
  function render(el, text) {
    el.classList.add('markdown');
    // HTML nunca é confiável, incluindo atributos e URLs gerados pelo modelo.
    el.innerHTML = window.jarvisVendor.DOMPurify.sanitize(
      window.jarvisVendor.marked.parse(text, { gfm: true, breaks: true }),
      {
        ALLOWED_TAGS: [
          'p',
          'br',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'ul',
          'ol',
          'li',
          'strong',
          'em',
          'del',
          'blockquote',
          'hr',
          'table',
          'thead',
          'tbody',
          'tr',
          'th',
          'td',
          'pre',
          'code',
          'a',
        ],
        ALLOWED_ATTR: ['href', 'title', 'class'],
        ALLOW_DATA_ATTR: false,
      },
    );
    for (const link of el.querySelectorAll('a')) {
      const href = link.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) {
        link.removeAttribute('href');
        continue;
      }
      link.onclick = (event) => {
        event.preventDefault();
        window.jarvisWindow.openLink(href).catch(() => {});
      };
    }
    for (const pre of el.querySelectorAll('pre')) {
      const code = pre.querySelector('code');
      if (!code) continue;
      const text = code.textContent,
        language = code.className.replace('language-', '').trim().split(/\s/)[0];
      const block = document.createElement('div');
      block.className = 'code-block';
      const label = document.createElement('div');
      label.textContent = language || 'código';
      const button = document.createElement('button');
      button.textContent = 'Copiar código';
      copy(button, text);
      if (window.jarvisVendor.hljs.getLanguage(language))
        window.jarvisVendor.hljs.highlightElement(code);
      pre.replaceWith(block);
      block.append(label, pre, button);
    }
  }
  function decorate(el, text) {
    const button = document.createElement('button');
    button.className = 'message-copy';
    button.textContent = 'Copiar mensagem';
    copy(button, text);
    el.appendChild(button);
  }
  function nearBottom() {
    const area = $('conversation-scroll');
    return area.scrollHeight - area.scrollTop - area.clientHeight < 110;
  }
  function scroll(force = false) {
    if (force || nearBottom())
      $('conversation-scroll').scrollTop = $('conversation-scroll').scrollHeight;
  }
  function welcome(show) {
    $('welcome').hidden = !show;
  }
  function stopVoice() {
    audioGeneration++;
    if (window.jarvisStopAudio) window.jarvisStopAudio();
    voiceState('');
  }
  function voiceState(text) {
    $('voice-state').textContent = text;
    $('voice-state').hidden = !text;
    $('voice-stop').hidden = !text;
  }
  function resize() {
    const area = $('input');
    area.style.height = 'auto';
    area.style.height = Math.min(area.scrollHeight, 200) + 'px';
  }
  function empty() {
    welcome(true);
    $('messages').replaceChildren();
  }
  const settings = {
    Aparência: () =>
      '<h3>Aparência</h3><p>JARVIS Dark · um espaço focado no seu trabalho.</p><label><input type="checkbox" id="setting-large">Texto ampliado nas respostas</label><button id="setting-sidebar">Alternar barra lateral</button>',
    Voz: () =>
      '<h3>Voz</h3><p>Respostas de programação usam uma explicação falada resumida.</p><label><input type="checkbox" id="setting-voice">Reproduzir respostas automaticamente</label><button id="setting-stop">Interromper reprodução</button>',
    Armazenamento: () =>
      '<h3>Armazenamento</h3><p>Chats gerais ficam na nuvem. Projetos, seus chats e anexos ficam neste computador. O espaço exibido mede dados salvos, não a memória RAM.</p><div id="storage-usage"></div><p id="storage-status" role="status"></p><p>A cota na nuvem considera textos e informações dos chats. Uma pequena reserva permite concluir a última resposta. Apagar dados é permanente e sempre exige confirmação.</p>',
    'Chats arquivados': () =>
      '<h3>Chats arquivados</h3><p>Restaure uma conversa para que ela apareça novamente na barra lateral.</p><div id="archived-chat-list"></div><p id="archived-status" role="status"></p>',
    'Quick Chat': () =>
      '<h3>JARVIS Quick Chat</h3><p>O ícone permanece disponível sobre as janelas. Use Escape para recolher.</p><label>Opacidade dos painéis (%)<input id="quick-opacity" type="number" min="40" max="95"></label><label>Palavras por minuto<input id="quick-wpm" type="number" min="80" max="600"></label><label>Tempo mínimo (segundos)<input id="quick-min" type="number" min="3" max="60"></label><label>Tempo máximo (segundos)<input id="quick-max" type="number" min="3" max="120"></label><label><input id="quick-voice" type="checkbox">Respostas faladas no Quick Chat (respeita a voz global)</label><p>Ao fechar a janela principal, o JARVIS será encerrado.</p><button id="quick-save">Salvar preferências</button><p id="quick-config-status" role="status"></p>',
    'Área de transferência': () => '<p>Carregando preferências...</p>',
    Integrações: () => '',
    Conta: () =>
      '<h3>Conta e acesso</h3><p>Use o login cadastrado pelo administrador. Acesso, modelos e limites são gerenciados no painel administrativo.</p><p>Ao fechar a janela principal, o JARVIS é encerrado. Para trocar de conta, use Sair da conta na barra lateral.</p>',
    Sobre: () =>
      '<h3>Sobre o JARVIS</h3><p>JARVIS · v5.1.0</p><p>Desenvolvido por <strong>Rodrigo Junior</strong>.</p><p>Contato: rodrigo.macia019@gmail.com</p><button id="about-github">GitHub: rodrigojr09</button><p id="about-status" role="status"></p><p>© 2026 Rodrigo Junior.</p>',
  };
  function category(name) {
    $('settings-content').innerHTML = settings[name]();
    $('settings-dialog').classList.toggle('settings-integrations', name === 'Integrações');
    if (name === 'Integrações') window.jarvisVendor.mountIntegrations($('settings-content'), icons);
    if (name === 'Área de transferência') void window.jarvisClipboardSettings?.();
    if (name === 'Armazenamento') void window.jarvisStorageUsage?.show();
    if (name === 'Chats arquivados') void window.jarvisWorkspace?.showArchived();
    for (const button of $('settings-tabs').children) {
      button.classList.toggle('active', button.textContent === name);
      button.setAttribute('aria-current', button.textContent === name ? 'page' : 'false');
    }
    if (name === 'Quick Chat' && window.jarvisWindow.quickSettings) {
      const container = $('settings-content');
      window.jarvisWindow
        .quickSettings()
        .then((value) => {
          if (!container.querySelector('#quick-save')) return;
          $('quick-opacity').value = Math.round(value.opacity * 100);
          $('quick-wpm').value = value.wpm;
          $('quick-min').value = value.minSeconds;
          $('quick-max').value = value.maxSeconds;
          $('quick-voice').checked = value.voice;
        })
        .catch(() => {
          if ($('quick-config-status'))
            $('quick-config-status').textContent = 'Não foi possível carregar as preferências.';
        });
      $('quick-save').onclick = async () => {
        try {
          await window.jarvisWindow.configureQuick({
            opacity: Number($('quick-opacity').value) / 100,
            wpm: Number($('quick-wpm').value),
            minSeconds: Number($('quick-min').value),
            maxSeconds: Number($('quick-max').value),
            voice: $('quick-voice').checked,
            closeToTray: false,
          });
          $('quick-config-status').textContent = 'Preferências salvas.';
          $('settings-dialog').close();
        } catch {
          if ($('quick-config-status'))
            $('quick-config-status').textContent = 'Confira os valores e tente novamente.';
        }
      };
    }
    const bind = (id, fn) => {
      if ($(id)) $(id).onclick = fn;
    };
    bind('about-github', async () => {
      try {
        await window.jarvisWindow.openLink('https://github.com/rodrigojr09');
      } catch {
        if ($('about-status')) $('about-status').textContent = 'Não foi possível abrir o GitHub.';
      }
    });
    if ($('setting-large')) {
      $('setting-large').checked = preferences.largeText;
      bind('setting-large', () => {
        preferences.largeText = $('setting-large').checked;
        apply();
      });
    }
    if ($('setting-voice')) {
      $('setting-voice').checked = preferences.voice;
      bind('setting-voice', toggleVoice);
    }
    bind('setting-sidebar', () => {
      preferences.collapsed = !preferences.collapsed;
      apply();
    });
    bind('setting-stop', stopVoice);
  }
  function toggleVoice() {
    preferences.voice = !preferences.voice;
    if (!preferences.voice) stopVoice();
    apply();
    if ($('setting-voice')) $('setting-voice').checked = preferences.voice;
  }
  $('sidebar-toggle').onclick = () => {
    preferences.collapsed = !preferences.collapsed;
    apply();
  };
  $('voice-toggle').onclick = toggleVoice;
  $('voice-stop').onclick = stopVoice;
  $('manage-open').onclick = () => window.jarvisWorkspace?.openSettings();
  $('settings-open').onclick = () => {
    category('Aparência');
    $('settings-dialog').showModal();
  };
  for (const name of Object.keys(settings)) {
    const button = document.createElement('button');
    button.textContent = name;
    if (name === 'Integrações') {
      const icon = document.createElement('i');
      icon.dataset.lucide = 'plug';
      icon.setAttribute('aria-hidden', 'true');
      button.prepend(icon);
    }
    button.onclick = () => category(name);
    $('settings-tabs').appendChild(button);
  }
  for (const button of document.querySelectorAll('[data-close]'))
    button.onclick = () => $(button.dataset.close).close();
  $('input').addEventListener('input', resize);
  $('conversation-scroll').onscroll = () => {
    $('jump-bottom').hidden = nearBottom();
  };
  $('jump-bottom').onclick = () => scroll(true);
  $('suggest-project').onclick = () => $('add-project').click();
  $('suggest-continue').onclick = () => {
    preferences.collapsed = false;
    apply();
    $('nav-search').focus();
  };
  for (const button of document.querySelectorAll('[data-prompt]'))
    button.onclick = async () => {
      if (!window.jarvisWorkspace.chat) await window.jarvisWorkspace.newChat();
      $('input').value = button.dataset.prompt;
      resize();
      $('input').focus();
    };
  for (const dialog of document.querySelectorAll('dialog')) {
    const heading = dialog.querySelector('h2');
    if (heading) {
      heading.id = heading.id || dialog.id + '-title';
      dialog.setAttribute('aria-labelledby', heading.id);
    }
  }
  $('manage-open').setAttribute('aria-label', 'Gerenciar conversa e memória');
  apply();
  icons();
  return {
    render,
    decorate,
    icons,
    nearBottom,
    scroll,
    welcome,
    empty,
    resize,
    stopVoice,
    voiceState,
    get voice() {
      return preferences.voice;
    },
    get audioGeneration() {
      return audioGeneration;
    },
    busy(value) {
      $('thinking').hidden = !value;
    },
    knowledge(text) {
      render($('knowledge-content'), text);
      $('knowledge-dialog').showModal();
    },
  };
})();
