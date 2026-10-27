"use client";
import { useState } from "react";
export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <section className="login-card">
        <div className="brand">
          C<span>YRO IA</span>
          <i>CLOUD</i>
        </div>
        <p className="eyebrow">CENTRAL ADMINISTRATIVA</p>
        <h1>
          Seu sistema.
          <br />
          Sob controle.
        </h1>
        <p className="muted">
          Gerencie pessoas, instalações e o acesso à inteligência artificial.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const form = new FormData(event.currentTarget);
            try {
              const result = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: form.get("email"),
                  password: form.get("password"),
                }),
              });
              if (!result.ok) throw Error((await result.json()).error);
              location.assign("/dashboard");
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Não foi possível entrar.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={12}
              maxLength={256}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button disabled={busy}>
            {busy ? "Entrando…" : "Acessar painel →"}
          </button>
        </form>
        <small>Acesso exclusivo para administradores autorizados.</small>
      </section>
      <div className="login-orbit" aria-hidden="true">
        <b>C</b>
      </div>
    </main>
  );
}
