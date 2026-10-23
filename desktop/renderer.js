const messages = document.getElementById('messages');
const input = document.getElementById('input');
const send = document.getElementById('send');
const status = document.getElementById('status');
document.getElementById('minimize').onclick = () => window.jarvisWindow.minimize();
document.getElementById('close').onclick = () => window.jarvisWindow.close();
let audio;
let analyzing = false;
let pollTimer;
let streamingMessage = null;
window.jarvisWindow.onDelta?.((delta) => {
  if (!send.disabled || typeof delta !== 'string') return;
  if (!streamingMessage) {
    streamingMessage = document.createElement('div');
    streamingMessage.className = 'message assistant';
    messages.appendChild(streamingMessage);
  }
  streamingMessage.textContent += delta;
  window.jarvisUI?.scroll(false);
});
const cancelChat = document.getElementById('cancel-response');
cancelChat.hidden = true;
cancelChat.onclick = () => window.jarvisWindow.cancelChat?.().catch(() => {});
window.jarvisAuth?.onState?.((value) => {
  if (!send.disabled && value.status !== 'active') status.textContent = value.message;
});
const programmingMode = document.getElementById('programming-mode');

function renderContent(el, content) {
  if (window.jarvisUI) {
    window.jarvisUI.render(el, content);
    return;
  }
  const blocks = /```([^\n`]*)\n([\s\S]*?)(?:```|$)/g;
  let match,
    cursor = 0;
  while ((match = blocks.exec(content)) !== null) {
    if (match.index > cursor) {
      const paragraph = document.createElement('span');
      paragraph.textContent = content.slice(cursor, match.index);
      el.appendChild(paragraph);
    }
    const container = document.createElement('div');
    container.className = 'code-block';
    const label = document.createElement('div');
    label.textContent = match[1].trim() || 'código';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    const snippet = match[2];
    code.textContent = snippet;
    pre.appendChild(code);
    const copy = document.createElement('button');
    copy.textContent = 'Copiar código';
    copy.onclick = async () => {
      try {
        await window.jarvisWindow.copyCode(snippet);
        copy.textContent = 'Copiado';
      } catch {
        copy.textContent = 'Falha ao copiar';
      }
    };
    container.appendChild(label);
    container.appendChild(pre);
    container.appendChild(copy);
    el.appendChild(container);
    cursor = blocks.lastIndex;
  }
  if (cursor === 0) el.textContent = content;
  else if (cursor < content.length) {
    const rest = document.createElement('span');
    rest.textContent = content.slice(cursor);
    el.appendChild(rest);
  }
}
function addMessage(role, content) {
  const follow = window.jarvisUI?.nearBottom();
  window.jarvisUI?.welcome(false);
  const el = document.createElement('div');
  el.className = 'message ' + role + (content.startsWith('Erro:') ? ' error' : '');
  renderContent(el, content);
  if (window.jarvisUI) window.jarvisUI.decorate(el, content);
  messages.appendChild(el);
  if (window.jarvisUI) {
    if (follow) window.jarvisUI.scroll(true);
  } else messages.scrollTop = messages.scrollHeight;
}
function showProject(data) {
  if (!data) return;
  const selected = window.jarvisWorkspace?.project || data.project;
  if (!window.jarvisUI)
    document.getElementById('project-name').textContent = selected
      ? 'Projeto: ' + selected.name
      : 'Nenhum projeto selecionado';
  const roots = document.getElementById('authorized-roots');
  const previous = roots.value;
  roots.replaceChildren();
  for (const root of data.roots || []) {
    const option = document.createElement('option');
    option.value = root.path;
    option.textContent = root.name;
    option.title = root.path;
    roots.appendChild(option);
  }
  if (Array.from(roots.children).some((option) => option.value === previous))
    roots.value = previous;
  document.getElementById('revoke-root').disabled = !(data.roots || []).length || analyzing;
}
async function refreshProject() {
  try {
    const data = await api('/programming/status');
    showProject(data);
    if (analyzing && data.progress !== 'Pronto') status.textContent = data.progress;
  } catch {
    /* O envio principal informa erros de conexão. */
  } finally {
    if (analyzing) pollTimer = setTimeout(refreshProject, 650);
  }
}
document.getElementById('authorize-project').onclick = async () => {
  try {
    const result = await window.jarvisWindow.authorizeFolder();
    if (result.canceled) return;
    if (!result.ok) throw new Error(result.data.detail || 'Não foi possível autorizar a pasta.');
    await refreshProject();
    addMessage(
      'assistant',
      'Pasta autorizada para leitura. Informe o nome do projeto que deseja analisar.',
    );
  } catch (err) {
    addMessage('assistant', 'Erro: ' + err.message);
  }
};
document.getElementById('revoke-root').onclick = async () => {
  try {
    const data = await api('/programming/revoke', {
      method: 'POST',
      body: JSON.stringify({ path: document.getElementById('authorized-roots').value }),
    });
    showProject(data);
  } catch (err) {
    addMessage('assistant', 'Erro: ' + err.message);
  }
};
programmingMode.onchange = () => {
  document.getElementById('computer-controls').hidden = programmingMode.checked;
};
programmingMode.onchange();
async function api(route, options) {
  const response = await window.jarvisWindow.api(route, options);
  const data = response.data;
  if (!response.ok) {
    if (response.status === 507 || /Limite de memória na nuvem/.test(data.detail || ''))
      window.jarvisStorageUsage?.block();
    throw new Error(data.detail || 'Erro de conexão');
  }
  return data;
}
function showConfirmation(action) {
  const card = document.createElement('div');
  card.className = 'message assistant';
  const label = document.createElement('p');
  label.textContent =
    action.description + ' — confirme em até ' + action.expires_in_seconds + ' segundos.';
  card.appendChild(label);
  const buttons = [];
  const timer = setTimeout(() => {
    buttons.forEach((button) => {
      button.disabled = true;
    });
    label.textContent = action.description + ' — confirmação expirada.';
  }, action.expires_in_seconds * 1000);
  for (const [text, approved] of [
    ['Confirmar abertura', true],
    ['Cancelar', false],
  ]) {
    const button = document.createElement('button');
    button.textContent = text;
    buttons.push(button);
    button.onclick = async () => {
      buttons.forEach((item) => {
        item.disabled = true;
      });
      clearTimeout(timer);
      try {
        const result = await api('/action/confirm', {
          method: 'POST',
          body: JSON.stringify({ confirmation_id: action.confirmation_id, approved }),
        });
        addMessage('assistant', result.result);
        await speak(result.result);
      } catch (err) {
        addMessage('assistant', 'Erro: ' + err.message);
      }
    };
    card.appendChild(button);
  }
  messages.appendChild(card);
  window.jarvisUI?.welcome(false);
  window.jarvisUI?.scroll(true);
  messages.scrollTop = messages.scrollHeight;
}
window.jarvisWindow.onStopAudio?.(() => window.jarvisUI?.stopVoice());
window.jarvisStopAudio = () => {
  if (audio) {
    audio.pause();
    audio = null;
  }
};
async function speak(text) {
  const ui = window.jarvisUI;
  if (ui && !ui.voice) return;
  ui?.stopVoice();
  const generation = ui?.audioGeneration;
  ui?.voiceState('Preparando áudio...');
  try {
    const data = await api('/speak', { method: 'POST', body: JSON.stringify({ message: text }) });
    if (ui && (generation !== ui.audioGeneration || !ui.voice)) return;
    window.jarvisStopAudio();
    audio = new Audio('data:audio/mp3;base64,' + data.audio_base64);
    audio.onended = () => ui?.voiceState('');
    audio.onerror = () => ui?.voiceState('');
    await window.jarvisWindow.claimAudio?.();
    if (ui && generation !== ui.audioGeneration) {
      audio?.pause();
      return;
    }
    const playing = audio;
    await playing.play();
    if (generation !== ui?.audioGeneration && ui) {
      playing.pause();
      return;
    }
    ui?.voiceState('JARVIS está falando');
  } catch (err) {
    if (!ui || generation === ui.audioGeneration) {
      status.textContent = 'Áudio indisponível: ' + err.message;
      ui?.voiceState('');
    }
  }
}
let preflighting = false;
async function submit(clipboardText, expectedContext) {
  const fromClipboard = typeof clipboardText === 'string';
  if (fromClipboard && (!window.jarvisWorkspace || window.jarvisAttachments?.has())) return false;
  if (window.jarvisStorageUsage?.blocked) return;
  const text =
    (fromClipboard ? clipboardText : input.value).trim() ||
    (window.jarvisAttachments?.has() ? 'Analise os anexos.' : '');
  if (
    !text ||
    text.length > 6000 ||
    send.disabled ||
    preflighting ||
    window.jarvisAttachments?.loading()
  )
    return false;
  preflighting = true;
  try {
    const project = window.jarvisWorkspace?.project;
    if (project) await window.jarvisScope.check(project.id);
    if (
      fromClipboard &&
      expectedContext &&
      (window.jarvisWorkspace.chat?.id ||
        'draft:' + (window.jarvisWorkspace.project?.id || 'general')) !== expectedContext
    )
      return false;
    if (window.jarvisWorkspace && !window.jarvisWorkspace.chat)
      await window.jarvisWorkspace.newChat(true);
  } catch (error) {
    addMessage('assistant', 'Erro: ' + error.message);
    return;
  } finally {
    preflighting = false;
  }
  const currentChat = window.jarvisWorkspace?.chat;
  if (window.jarvisWorkspace && !currentChat) return;
  const attachmentIds = window.jarvisAttachments?.ids() || [];
  window.jarvisAttachments?.busy(true);
  if (!fromClipboard) input.value = '';
  window.jarvisUI?.resize();
  window.jarvisUI?.stopVoice();
  window.jarvisUI?.busy(true);
  addMessage('user', text);
  window.jarvisAttachments?.renderHistory(
    messages.lastElementChild,
    window.jarvisAttachments.selected(),
  );
  window.jarvisUI?.scroll(true);
  send.disabled = true;
  cancelChat.hidden = false;
  window.jarvisWorkspace?.begin();
  analyzing = programmingMode.checked;
  document.getElementById('authorize-project').disabled = true;
  document.getElementById('revoke-root').disabled = true;
  programmingMode.disabled = true;
  if (analyzing) {
    status.textContent = 'Localizando projeto...';
    pollTimer = setTimeout(refreshProject, 300);
  }
  status.textContent = analyzing ? 'Localizando projeto...' : 'JARVIS está pensando...';
  try {
    const data = await api('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        mode: programmingMode.checked ? 'programming' : 'chat',
        ...(currentChat ? { chat_id: currentChat.id } : {}),
        ...(attachmentIds.length ? { attachments: attachmentIds } : {}),
      }),
    });
    analyzing = false;
    clearTimeout(pollTimer);
    showProject(data.programming);
    window.jarvisUI?.busy(false);
    addMessage('assistant', data.reply);
    window.jarvisAttachments?.clear();
    streamingMessage?.remove();
    streamingMessage = null;
    for (const action of data.pending_actions || []) showConfirmation(action);
    status.textContent = 'Gerando resposta em áudio...';
    await speak(data.speech_text || data.reply.slice(0, 4000));
    if (!status.textContent.startsWith('Áudio indisponível')) status.textContent = 'Pronto';
    return true;
  } catch (err) {
    addMessage('assistant', 'Erro: ' + err.message);
    status.textContent = 'Falha';
    if (attachmentIds.length && !input.value) input.value = text;
  } finally {
    cancelChat.hidden = true;
    streamingMessage?.remove();
    streamingMessage = null;
    analyzing = false;
    clearTimeout(pollTimer);
    send.disabled = false;
    window.jarvisAttachments?.busy(false);
    programmingMode.disabled = false;
    document.getElementById('authorize-project').disabled = false;
    await refreshProject();
    window.jarvisUI?.busy(false);
    window.jarvisWorkspace?.end();
    input.focus();
  }
}
send.onclick = submit;
window.jarvisClipboardSend = (text, context) => submit(text, context);
document.getElementById('computer-run').onclick = async () => {
  document.getElementById('computer-dialog')?.close();
  const button = document.getElementById('computer-run');
  button.disabled = true;
  try {
    const selected = document.getElementById('computer-action').value;
    let data;
    if (selected.startsWith('app:') || selected.startsWith('folder:')) {
      const [kind, target] = selected.split(':');
      const route = kind === 'app' ? '/action/open' : '/action/folder';
      data = await api(route, {
        method: 'POST',
        body: JSON.stringify({ [kind === 'app' ? 'app' : 'folder']: target }),
      });
      showConfirmation(data.pending_action);
    } else if (selected === 'processes') {
      data = await api('/computer/processes');
      addMessage(
        'assistant',
        'Processos (' +
          data.total +
          ' no total' +
          (data.truncated ? ', primeiros 200' : '') +
          '):\n' +
          data.processes.map((item) => item.pid + ' — ' + (item.name || 'Sem nome')).join('\n'),
      );
    } else if (selected === 'system') {
      data = await api('/computer/system');
      const gb = (value) => (value / 1024 ** 3).toFixed(1) + ' GB';
      addMessage(
        'assistant',
        `${data.os} ${data.release} (${data.architecture})\nCPUs lógicas: ${data.cpu_logical_count}\nMemória: ${gb(data.memory_available_bytes)} disponíveis de ${gb(data.memory_total_bytes)}\nDisco: ${gb(data.system_disk_free_bytes)} livres de ${gb(data.system_disk_total_bytes)}`,
      );
    }
    status.textContent = 'Pronto';
  } catch (err) {
    addMessage('assistant', 'Erro: ' + err.message);
  } finally {
    button.disabled = false;
  }
};
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submit();
  }
});
let quickToOpen = null,
  quickOpenTimer;
async function openQueuedQuick() {
  clearTimeout(quickOpenTimer);
  if (!quickToOpen) return;
  try {
    await window.jarvisWorkspace.init();
    if (!window.jarvisWorkspace.canNavigate) {
      quickOpenTimer = setTimeout(openQueuedQuick, 200);
      return;
    }
    const id = quickToOpen;
    quickToOpen = null;
    const result = await api('/chats/history?chat_id=' + encodeURIComponent(id));
    await window.jarvisWorkspace.catalog(result.chat.project_id || '', id);
  } catch {
    quickToOpen = null;
    status.textContent = 'Não foi possível abrir o Quick Chat. Confira o backend.';
  }
}
window.jarvisWindow.onOpenChat?.((id) => {
  quickToOpen = id;
  void openQueuedQuick();
});
(async () => {
  try {
    await api('/health');
    if (window.jarvisWorkspace) {
      await window.jarvisWorkspace.init();
      status.textContent = 'Conectado';
      return;
    }
    const history = await api('/history');
    messages.replaceChildren();
    for (const item of history) addMessage(item.role, item.content);
    if (!history.length) addMessage('assistant', 'Sistema inicializado. Como posso ajudar?');
    status.textContent = 'Conectado';
    await refreshProject();
  } catch {
    status.textContent = 'Serviço local indisponível — reinicie o JARVIS';
  }
})();

document.getElementById('logout')?.addEventListener('click', async () => {
  await window.jarvisAuth.logout();
});
