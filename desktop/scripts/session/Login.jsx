import React, { useEffect, useRef, useState } from 'react';
export function Login() {
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(
      'Entre para continuar. Sua sessão será salva com proteção do Windows.',
    ),
    password = useRef(null),
    inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    void window.jarvisAuth
      .state()
      .then((value) => {
        if (active && value.message) setStatus(value.message);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <main>
      <section>
        <div className="brand">
          C<span>YRO IA</span>
          <small>DESKTOP</small>
        </div>
        <h1>
          Pronto para
          <br />
          começar?
        </h1>
        <p className="intro">
          Entre com o e-mail e a senha cadastrados pelo seu administrador. Suas conversas e projetos
          continuam disponíveis na sua conta.
        </p>
        <form
          id="login-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (inFlight.current) return;
            inFlight.current = true;
            setBusy(true);
            setStatus('Validando seu acesso…');
            const data = new FormData(event.currentTarget);
            try {
              await window.jarvisAuth.login({
                email: String(data.get('email')).trim(),
                password: password.current.value,
              });
              setStatus('Conectado. Abrindo Cyro…');
            } catch (error) {
              setStatus(
                String(error?.message).includes('Conta autenticada.')
                  ? 'Sua conta foi autenticada, mas o serviço local não conectou. Reinicie o Cyro.'
                  : 'Login recusado. Confira e-mail, senha, acesso e conexão com o administrador.',
              );
            } finally {
              if (password.current) password.current.value = '';
              inFlight.current = false;
              setBusy(false);
            }
          }}
        >
          <label htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            name="email"
            type="email"
            required
            autoComplete="username"
            maxLength={254}
            disabled={busy}
          />
          <label htmlFor="login-password">Senha</label>
          <input
            id="login-password"
            ref={password}
            name="password"
            type="password"
            required
            autoComplete="current-password"
            minLength={12}
            maxLength={256}
            disabled={busy}
          />
          <button id="login-submit" type="submit" disabled={busy}>
            Entrar no Cyro →
          </button>
        </form>
        <p id="login-status" role="status" aria-live="polite">
          {status}
        </p>
        <div className="privacy">
          ◇ Credencial individual protegida pelo Windows
          <br />◇ A chave OpenAI permanece no servidor
        </div>
      </section>
      <div className="orb" aria-hidden="true">
        <b>C</b>
      </div>
    </main>
  );
}
