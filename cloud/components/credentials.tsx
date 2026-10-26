"use client";
import { useDashboardData } from "./dashboard-data";
import { useState } from "react";
type ProviderState = {
  revision: number;
  source: string;
  enabled: boolean;
  hasApiKey?: boolean;
  hasClientSecret?: boolean;
  allowedModels?: string[];
  voiceEnabled?: boolean;
  clientId?: string;
  redirectUri?: string;
};
type State = { openai: ProviderState; spotify: ProviderState };
export default function Credentials() {
  const {
    data,
    error: loadError,
    reload: load,
  } = useDashboardData<State>("/api/provider-settings");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  async function save(
    event: React.FormEvent<HTMLFormElement>,
    provider: "openai" | "spotify",
  ) {
    event.preventDefault();
    if (busy || !data) return;
    const form = event.currentTarget,
      values = new FormData(form);
    const secret = String(values.get("secret") || "").trim();
    form.querySelector<HTMLInputElement>("input[type=password]")!.value = "";
    const shared = {
      provider,
      revision: data[provider].revision,
      enabled: values.get("enabled") === "yes",
    };
    const payload =
      provider === "openai"
        ? {
            ...shared,
            ...(secret ? { apiKey: secret } : {}),
            allowedModels: String(values.get("models"))
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
            voiceEnabled: values.get("voice") === "yes",
          }
        : {
            ...shared,
            ...(secret ? { clientSecret: secret } : {}),
            clientId: String(values.get("clientId")).trim(),
            redirectUri: String(values.get("redirectUri")).trim(),
          };
    setBusy(provider);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/provider-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Não foi possível salvar.");
      await load();
      setNotice(
        "Credenciais salvas com proteção no servidor. As próximas solicitações usarão esta configuração. A conexão com o provedor não foi testada.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="credentials-page">
      <div className="card">
        <h2>Credenciais dos serviços</h2>
        <p className="muted">
          Configure os serviços utilizados pelo JARVIS. Estas configurações são
          globais e exclusivas do SUPER_ADMIN.
        </p>
        <p>
          Os segredos são criptografados no Cloud e não são exibidos novamente.
          Deixe o campo de segredo vazio para manter o valor atual.
        </p>
      </div>
      {(error || loadError) && (
        <p className="alert" role="alert">
          {error || loadError}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!data ? (
        <p>Carregando configurações…</p>
      ) : (
        <div className="credentials-grid">
          <section className="card">
            <h2>OpenAI</h2>
            <p className="muted">
              Chat e voz utilizam a mesma chave, respeitando as cotas e os
              limites existentes.
            </p>
            <p className="credential-state">
              {data.openai.hasApiKey
                ? "Chave configurada"
                : "Chave não configurada"}{" "}
              ·{" "}
              {data.openai.source === "dashboard"
                ? "Salva pela dashboard"
                : "Configuração do ambiente"}
            </p>
            <form
              key={"openai-" + data.openai.revision}
              className="form-grid"
              autoComplete="off"
              onSubmit={(e) => void save(e, "openai")}
            >
              <label>
                Serviço
                <select
                  name="enabled"
                  defaultValue={data.openai.enabled ? "yes" : "no"}
                >
                  <option value="yes">Habilitado</option>
                  <option value="no">Desativado</option>
                </select>
              </label>
              <label>
                Chave da API
                <input
                  name="secret"
                  type="password"
                  autoComplete="new-password"
                  maxLength={512}
                  spellCheck={false}
                  placeholder={
                    data.openai.hasApiKey
                      ? "Chave protegida — deixe vazio para manter"
                      : "Cole sua chave OpenAI"
                  }
                />
              </label>
              <label>
                Modelos permitidos
                <input
                  name="models"
                  defaultValue={data.openai.allowedModels?.join(", ")}
                  maxLength={2400}
                  required
                  aria-describedby="models-help"
                />
                <small id="models-help">
                  Separe por vírgulas. Preserve o modelo utilizado pelo Desktop.
                </small>
              </label>
              <label>
                Voz
                <select
                  name="voice"
                  defaultValue={data.openai.voiceEnabled ? "yes" : "no"}
                >
                  <option value="no">Desativada</option>
                  <option value="yes">Habilitada — pode gerar cobrança</option>
                </select>
              </label>
              <button disabled={!!busy}>
                {busy === "openai" ? "Salvando…" : "Salvar OpenAI"}
              </button>
            </form>
          </section>
          <section className="card">
            <h2>Spotify</h2>
            <p className="muted">
              Configure o aplicativo criado no Spotify Developer Dashboard. Cada
              cliente continuará conectando sua própria conta pelo Desktop.
            </p>
            <p className="credential-state">
              {data.spotify.hasClientSecret
                ? "Client Secret configurado"
                : "Client Secret não configurado"}{" "}
              ·{" "}
              {data.spotify.source === "dashboard"
                ? "Salvo pela dashboard"
                : "Configuração do ambiente"}
            </p>
            <form
              key={"spotify-" + data.spotify.revision}
              className="form-grid"
              autoComplete="off"
              onSubmit={(e) => void save(e, "spotify")}
            >
              <label>
                Integração
                <select
                  name="enabled"
                  defaultValue={data.spotify.enabled ? "yes" : "no"}
                >
                  <option value="yes">Habilitada</option>
                  <option value="no">Desativada</option>
                </select>
              </label>
              <label>
                Client ID
                <input
                  name="clientId"
                  defaultValue={data.spotify.clientId}
                  maxLength={32}
                  required
                  spellCheck={false}
                />
              </label>
              <label>
                Client Secret
                <input
                  name="secret"
                  type="password"
                  autoComplete="new-password"
                  maxLength={512}
                  spellCheck={false}
                  placeholder={
                    data.spotify.hasClientSecret
                      ? "Segredo protegido — deixe vazio para manter"
                      : "Cole o Client Secret do Spotify"
                  }
                />
              </label>
              <label>
                Redirect URI
                <input
                  name="redirectUri"
                  type="url"
                  defaultValue={data.spotify.redirectUri}
                  maxLength={2048}
                  required
                  aria-describedby="redirect-help"
                />
                <small id="redirect-help">
                  Use o callback HTTPS exato deste Cloud e cadastre o mesmo
                  endereço no Spotify.
                </small>
              </label>
              <button disabled={!!busy}>
                {busy === "spotify" ? "Salvando…" : "Salvar Spotify"}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
