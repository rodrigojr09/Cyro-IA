const form = document.getElementById('activation-form');
const button = document.getElementById('activate');
const status = document.getElementById('activation-status');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = 'Validando código e vinculando este computador…';
  try {
    await window.jarvisActivation.activate(document.getElementById('activation-code').value.trim());
    status.textContent = 'Ativação concluída. Abrindo seu JARVIS…';
  } catch {
    status.textContent =
      'Não foi possível ativar. Verifique o código, sua validade e a conexão. Se o limite de dispositivos foi atingido, contate o administrador.';
  } finally {
    button.disabled = false;
  }
});
window.jarvisActivation
  .state()
  .then((value) => {
    if (value.message) status.textContent = value.message;
  })
  .catch(() => {});
