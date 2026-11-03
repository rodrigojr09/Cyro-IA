// Public UI messages only. Never render HTTP bodies or network/driver errors.
const messages = Object.freeze({
  LOGIN_INVALID: 'E-mail ou senha inválidos. Confira os dados e tente novamente.',
  LOGIN_BLOCKED: 'Acesso bloqueado. Contate o administrador.',
  LOGIN_LIMIT: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
  LOGIN_UNAVAILABLE:
    'O serviço do Cyro está indisponível. Tente novamente em instantes ou contate o administrador.',
  LOGIN_NETWORK: 'Não foi possível conectar ao Cyro. Verifique sua conexão e tente novamente.',
});
function loginError(code) {
  const error = Error(messages[code] || messages.LOGIN_UNAVAILABLE);
  error.code = code;
  return error;
}
function loginErrorMessage(code) {
  return Object.hasOwn(messages, code) ? messages[code] : undefined;
}
function displayLoginError(error) {
  const message = String(error?.message || '');
  return (
    Object.values(messages).find((value) => message.endsWith(value)) ||
    'Login recusado. Confira e-mail, senha, acesso e conexão com o administrador.'
  );
}
module.exports = { loginError, loginErrorMessage, displayLoginError };
