// Progressive enhancement: no microphone access unless the user clicks and consents.
(() => {
  const button = document.getElementById('microphone');
  const input = document.getElementById('input');
  const status = document.getElementById('status');
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition || !window.jarvisWindow.permitMicrophone) {
    button.title = 'Entrada de voz indisponível neste Windows/runtime. Use o teclado.';
    return;
  }
  const recognition = new Recognition();
  recognition.lang = 'pt-BR';
  recognition.interimResults = false;
  let listening = false;
  button.disabled = false;
  button.title = 'Ditar mensagem';
  button.setAttribute('aria-label', 'Ditar mensagem');
  recognition.onresult = (event) => {
    input.value += (input.value ? ' ' : '') + event.results[0][0].transcript;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  };
  recognition.onend = () => {
    listening = false;
    button.setAttribute('aria-pressed', 'false');
    status.textContent = 'Pronto';
  };
  recognition.onerror = () => {
    listening = false;
    status.textContent = 'Entrada de voz indisponível. Use o teclado.';
  };
  button.onclick = async () => {
    if (listening) {
      recognition.stop();
      return;
    }
    try {
      if (!(await window.jarvisWindow.permitMicrophone())) return;
      recognition.start();
      listening = true;
      button.setAttribute('aria-pressed', 'true');
      status.textContent = 'Ouvindo… Clique no microfone para parar.';
    } catch {
      status.textContent = 'Não foi possível iniciar o microfone.';
    }
  };
})();
