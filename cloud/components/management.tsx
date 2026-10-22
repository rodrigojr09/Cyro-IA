"use client";
import { useEffect, useState } from "react";
type State = {
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
      ) : (
        <>
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
