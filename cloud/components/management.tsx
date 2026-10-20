"use client";
import { useEffect, useState } from "react";
type State = {
  licenses: {
    id: string;
    user: { name: string };
    device: { name: string };
    status: string;
    expiresAt: string | null;
  }[];
  clients: { id: string; user: { name: string }; maxDevices: number }[];
  settings: { intelligenceEnabled: boolean; maxOutputTokens: number };
  canConfigure: boolean;
};
export default function Management({ section }: { section: string }) {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const result = await fetch("/api/management", { cache: "no-store" });
      if (!result.ok) throw Error("Consulta não autorizada ou indisponível.");
      setData(await result.json());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(input: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw Error((await response.json()).error);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p>Carregando…</p>
      ) : section === "licenses" ? (
        <>
          <h2>Licenças de utilização</h2>
          {!data.licenses.length && (
            <p className="muted">Nenhuma instalação ativada.</p>
          )}
          {data.licenses.map((license) => (
            <form
              className="employee-row"
              key={license.id}
              onSubmit={(event) => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                const expiration = String(values.get("expires") || "");
                void save({
                  action: "license.update",
                  id: license.id,
                  status: values.get("status"),
                  expiresAt: expiration
                    ? new Date(expiration + "T23:59:59Z").toISOString()
                    : null,
                });
              }}
            >
              <div>
                {license.user.name}
                <small>{license.device.name}</small>
              </div>
              <label>
                Estado
                <select name="status" defaultValue={license.status}>
                  <option value="ACTIVE">Ativa</option>
                  <option value="SUSPENDED">Revogada</option>
                </select>
              </label>
              <label>
                Expiração (UTC)
                <input
                  type="date"
                  name="expires"
                  defaultValue={license.expiresAt?.slice(0, 10)}
                />
              </label>
              <button disabled={busy}>Salvar licença</button>
            </form>
          ))}
        </>
      ) : (
        <>
          <h2>Limites de dispositivos por cliente</h2>
          {data.clients.map((client) => (
            <form
              key={client.id}
              className="employee-row"
              onSubmit={(event) => {
                event.preventDefault();
                void save({
                  action: "client.devices",
                  id: client.id,
                  maxDevices: Number(
                    new FormData(event.currentTarget).get("max"),
                  ),
                });
              }}
            >
              <div>{client.user.name}</div>
              <label>
                Instalações autorizadas
                <input
                  name="max"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={client.maxDevices}
                />
              </label>
              <button disabled={busy}>Salvar limite</button>
            </form>
          ))}
          {data.canConfigure && (
            <>
              <div className="divider" />
              <h2>Configurações globais</h2>
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  const values = new FormData(event.currentTarget);
                  void save({
                    action: "settings.update",
                    intelligenceEnabled: values.get("enabled") === "yes",
                    maxOutputTokens: Number(values.get("tokens")),
                  });
                }}
              >
                <label>
                  Inteligência artificial
                  <select
                    name="enabled"
                    defaultValue={
                      data.settings.intelligenceEnabled ? "yes" : "no"
                    }
                  >
                    <option value="yes">Habilitada</option>
                    <option value="no">Suspensa</option>
                  </select>
                </label>
                <label>
                  Máximo de tokens por resposta
                  <input
                    name="tokens"
                    type="number"
                    min={100}
                    max={3500}
                    defaultValue={data.settings.maxOutputTokens}
                  />
                </label>
                <button disabled={busy}>Salvar configuração</button>
              </form>
            </>
          )}
        </>
      )}
    </section>
  );
}
