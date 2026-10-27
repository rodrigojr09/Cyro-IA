const form = document.getElementById('login-form');
const button = document.getElementById('login-submit');
const status = document.getElementById('login-status');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = 'Validando seu acesso…';
  const password = document.getElementById('login-password');
  try {
    await window.jarvisAuth.login({
      email: document.getElementById('login-email').value.trim(),
      password: password.value,
    });
    status.textContent = 'Conectado. Abrindo Cyro…';
  } catch (error) {
    status.textContent = String(error?.message).includes('Conta autenticada.')
      ? 'Sua conta foi autenticada, mas o serviço local não conectou. Reinicie o Cyro.'
      : 'Login recusado. Confira e-mail, senha, acesso e conexão com o administrador.';
  } finally {
    password.value = '';
    button.disabled = false;
  }
});
window.jarvisAuth
  .state()
  .then((value) => {
    if (value.message) status.textContent = value.message;
  })
  .catch(() => {});
