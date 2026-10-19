const messages = document.getElementById('messages');
const input = document.getElementById('input');
const send = document.getElementById('send');
const status = document.getElementById('status');
document.getElementById('minimize').onclick = () => window.jarvisWindow.minimize();
document.getElementById('close').onclick = () => window.jarvisWindow.close();
let audio;
function addMessage(role, content) {
  const el = document.createElement('div');
  el.className = 'message ' + role;
  el.textContent = content;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}
async function api(route, options) {
  const response = await window.jarvisWindow.api(route, options);
  const data = response.data;
  if (!response.ok) throw new Error(data.detail || 'Erro de conexão');
  return data;
}
function showConfirmation(action) {
  const card = document.createElement('div');
  card.className = 'message assistant';
  const label = document.createElement('p');
  label.textContent = action.description + ' — confirme em até ' + action.expires_in_seconds + ' segundos.';
  card.appendChild(label);
  const buttons = [];
  const timer = setTimeout(() => {
    buttons.forEach(button => { button.disabled = true; });
    label.textContent = action.description + ' — confirmação expirada.';
  }, action.expires_in_seconds * 1000);
  for (const [text, approved] of [['Confirmar abertura', true], ['Cancelar', false]]) {
    const button = document.createElement('button');
    button.textContent = text;
    buttons.push(button);
    button.onclick = async () => {
      buttons.forEach(item => { item.disabled = true; });
      clearTimeout(timer);
      try {
        const result = await api('/action/confirm', {method: 'POST', body: JSON.stringify({confirmation_id: action.confirmation_id, approved})});
        addMessage('assistant', result.result);
        await speak(result.result);
      } catch (err) { addMessage('assistant', 'Erro: ' + err.message); }
    };
    card.appendChild(button);
  }
  messages.appendChild(card);
  messages.scrollTop = messages.scrollHeight;
}
async function speak(text) {
  try {
    const data = await api('/speak', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message:text})});
    if (audio) { audio.pause(); audio = null; }
    audio = new Audio('data:audio/mp3;base64,' + data.audio_base64);
    await audio.play();
  } catch (err) { status.textContent = 'Áudio indisponível: ' + err.message; }
}
async function submit() {
  const text = input.value.trim();
  if (!text || send.disabled) return;
  input.value = '';
  addMessage('user', text);
  send.disabled = true;
  status.textContent = 'JARVIS está pensando...';
  try {
    const data = await api('/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message:text})});
    addMessage('assistant', data.reply);
    for (const action of data.pending_actions || []) showConfirmation(action);
    status.textContent = 'Gerando resposta em áudio...';
    await speak(data.reply);
    if (!status.textContent.startsWith('Áudio indisponível')) status.textContent = 'Pronto';
  } catch (err) { addMessage('assistant', 'Erro: ' + err.message); status.textContent = 'Falha'; }
  finally { send.disabled = false; input.focus(); }
}
send.onclick = submit;
document.getElementById('computer-run').onclick = async () => {
  const button = document.getElementById('computer-run');
  button.disabled = true;
  try {
    const selected = document.getElementById('computer-action').value;
    let data;
    if (selected.startsWith('app:') || selected.startsWith('folder:')) {
      const [kind, target] = selected.split(':');
      const route = kind === 'app' ? '/action/open' : '/action/folder';
      data = await api(route, { method: 'POST', body: JSON.stringify({[kind === 'app' ? 'app' : 'folder']: target}) });
      showConfirmation(data.pending_action);
    } else if (selected === 'processes') {
      data = await api('/computer/processes');
      addMessage('assistant', 'Processos (' + data.total + ' no total' + (data.truncated ? ', primeiros 200' : '') + '):\n' +
        data.processes.map(item => item.pid + ' — ' + (item.name || 'Sem nome')).join('\n'));
    } else if (selected === 'system') {
      data = await api('/computer/system');
      const gb = value => (value / 1024 ** 3).toFixed(1) + ' GB';
      addMessage('assistant', `${data.os} ${data.release} (${data.architecture})\nCPUs lógicas: ${data.cpu_logical_count}\nMemória: ${gb(data.memory_available_bytes)} disponíveis de ${gb(data.memory_total_bytes)}\nDisco: ${gb(data.system_disk_free_bytes)} livres de ${gb(data.system_disk_total_bytes)}`);
    }
    status.textContent = 'Pronto';
  } catch (err) { addMessage('assistant', 'Erro: ' + err.message); }
  finally { button.disabled = false; }
};
input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
(async () => {
  try {
    await api('/health');
    const history = await api('/history');
    messages.replaceChildren();
    for (const item of history) addMessage(item.role, item.content);
    if (!history.length) addMessage('assistant', 'Sistema inicializado. Como posso ajudar?');
    status.textContent = 'Conectado';
  } catch { status.textContent = 'Backend offline — inicie o Python'; }
})();
