"use client";
import { useEffect, useState } from "react";
import { useDashboardData } from "./dashboard-data";
import { compare, semver } from "../../desktop/scripts/updates/protocol.js";
type Row = {
  repositoryPrivate: boolean;
  id: string;
  version: string;
  githubTag: string;
  status: string;
  setupUrl: string | null;
  githubReleaseId: string | null;
  publishedAt: string | null;
  fileSize: number;
  checksum: string | null;
  changelog: string;
  error: string | null;
  leaseUntil: string | null;
};
type Catalog = {
  configured: boolean;
  warning: string;
  history: Row[];
  tags: { name: string; version: string; used: boolean }[];
};
export default function Releases() {
  const { data, error, reload } = useDashboardData<Catalog>("/api/releases");
  const [open, setOpen] = useState(false),
    [tag, setTag] = useState(""),
    [search, setSearch] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [notice, setNotice] = useState(""),
    [recover, setRecover] = useState<Row | null>(null),
    [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (
      !data?.history.some(
        (x) =>
          ["UPLOADING", "PROCESSING"].includes(x.status) &&
          x.leaseUntil &&
          Date.parse(x.leaseUntil) > Date.now(),
      )
    )
      return;
    const timer = setInterval(() => void reload(), 15_000);
    return () => clearInterval(timer);
  }, [data, reload]);
  async function freshTags() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const response = await fetch("/api/releases?fresh=1", {
          cache: "no-store",
        }),
        result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Não foi possível consultar as tags.");
      setNotice(result.warning || "Tags atualizadas do GitHub.");
      await reload();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "GitHub indisponível.",
      );
    } finally {
      setRefreshing(false);
    }
  }
  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setProgress(0);
    setNotice("Preparando upload direto…");
    try {
      const response = await fetch("/api/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          recover
            ? { action: "recover", id: recover.id, size: file.size }
            : {
                action: "create",
                tag,
                name: file.name,
                size: file.size,
                changelog: notes,
              },
        ),
      });
      const attempt = await response.json();
      if (!response.ok) throw Error(attempt.error);
      const destination = new URL(attempt.url);
      if (destination.protocol !== "https:")
        throw Error("Servidor externo inválido.");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", destination.href);
        xhr.setRequestHeader("Authorization", "Bearer " + attempt.ticket);
        xhr.setRequestHeader(
          "Content-Type",
          "application/vnd.microsoft.portable-executable",
        );
        xhr.timeout = 2 * 3600_000;
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onerror = () =>
          reject(
            Error("Upload interrompido. Consulte o histórico e use Recuperar."),
          );
        xhr.ontimeout = xhr.onerror;
        xhr.onload = () =>
          xhr.status === 202
            ? resolve()
            : reject(
                Error(
                  "Servidor externo recusou o upload. Consulte o histórico.",
                ),
              );
        xhr.send(file);
      });
      setNotice(
        "Upload recebido. O servidor está verificando e publicando o Setup.exe no GitHub.",
      );
      setOpen(false);
      setFile(null);
      setRecover(null);
      await reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Publicação interrompida.");
      await reload();
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="panel">
        <h2>Sistema · Versões</h2>
        <p role="status">{error || "Consultando versões…"}</p>
        <button onClick={() => void reload()}>Tentar novamente</button>
      </section>
    );
  const published = data.history
    .filter(
      (x) => x.status === "PUBLISHED" && semver(x.version)?.pre.length === 0,
    )
    .sort((a, b) => compare(b.version, a.version));
  return (
    <section className="release-manager" aria-label="Sistema — Versões">
      <p>
        Repositório:{" "}
        <a
          href="https://github.com/rodrigojr09/Cyro-IA"
          target="_blank"
          rel="noreferrer"
        >
          rodrigojr09/Cyro-IA
        </a>{" "}
        ·{" "}
        <a
          href="https://github.com/rodrigojr09/Cyro-IA/tags"
          target="_blank"
          rel="noreferrer"
        >
          Tags
        </a>{" "}
        ·{" "}
        <a
          href="https://github.com/rodrigojr09/Cyro-IA/releases"
          target="_blank"
          rel="noreferrer"
        >
          Releases e instaladores
        </a>
      </p>
      <div className="panel release-summary">
        <div>
          <h2>Sistema · Versões</h2>
          <p>
            Última estável:{" "}
            <strong>{published[0]?.version || "Nenhuma"}</strong> ·{" "}
            {data.history.length} versões cadastradas
          </p>
        </div>
        <button
          disabled={!data.configured || busy || refreshing}
          onClick={() => {
            setRecover(null);
            setTag("");
            setOpen(true);
            void freshTags();
          }}
        >
          Nova versão
        </button>
        <button disabled={busy || refreshing} onClick={() => void freshTags()}>
          Atualizar histórico
        </button>
      </div>
      {!data.configured && (
        <p className="panel" role="status">
          Publicação indisponível. Configure o servidor externo de upload e o
          segredo compartilhado. Nenhum instalador passa pela Vercel.
        </p>
      )}
      {data.warning && <p role="alert">{data.warning}</p>}
      {notice && <p role="status">{notice}</p>}
      {open && (
        <form className="panel release-form" onSubmit={publish}>
          <h3>
            {recover
              ? "Recuperar publicação " + recover.githubTag
              : "Nova versão"}
          </h3>
          {!recover && (
            <>
              <label>
                Pesquisar tags
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label>
                Tag do GitHub
                <select
                  required
                  value={tag}
                  disabled={busy}
                  onChange={(e) => setTag(e.target.value)}
                >
                  <option value="">Selecione uma tag existente</option>
                  {data.tags
                    .filter((t) =>
                      t.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((t) => (
                      <option key={t.name} value={t.name} disabled={t.used}>
                        {t.name}
                        {t.used ? " · utilizada" : ""}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          {recover && (
            <p>
              Envie o mesmo instalador. Um Setup.exe existente só será adotado
              após conferir tamanho e SHA-256; nunca será substituído.
            </p>
          )}
          <label>
            Arquivo instalador (.exe, até 1 GB)
            <input
              required
              type="file"
              accept=".exe"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          {!recover && (
            <label>
              Descrição / notas da versão (até 4.000 bytes)
              <textarea
                maxLength={4000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={busy}
              />
            </label>
          )}
          {busy && (
            <label>
              Upload: {progress}%<progress max={100} value={progress} />
            </label>
          )}
          <div className="release-actions">
            <button
              disabled={busy || !file || (!recover && !tag)}
              type="submit"
            >
              {busy ? "Enviando…" : "Publicar versão"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <div className="release-history">
        {data.history.map((row) => (
          <article className="panel" key={row.id}>
            <h3>
              {row.githubTag}{" "}
              <small>
                {(
                  {
                    UPLOADING: "Aguardando envio",
                    PROCESSING: "Verificando e publicando",
                    FAILED: "Falha",
                    PUBLISHED: "Publicada",
                  } as Record<string, string>
                )[row.status] || "Indisponível"}
              </small>
            </h3>
            <p>
              {row.publishedAt
                ? new Date(row.publishedAt).toLocaleString("pt-BR")
                : "Ainda não publicada"}{" "}
              · {(row.fileSize / 1048576).toFixed(1)} MB
            </p>
            <p>{row.changelog || "Sem notas."}</p>
            {row.checksum && (
              <p className="release-checksum">SHA-256: {row.checksum}</p>
            )}
            {row.error && <p role="alert">{row.error}</p>}
            <div className="release-actions">
              {row.setupUrl && (
                <a href={row.setupUrl} target="_blank" rel="noreferrer">
                  {row.repositoryPrivate
                    ? "Setup.exe no GitHub (requer acesso)"
                    : "Setup.exe no GitHub"}
                </a>
              )}
              {row.githubReleaseId && (
                <a
                  href={
                    "https://github.com/rodrigojr09/Cyro-IA/releases/tag/" +
                    encodeURIComponent(row.githubTag)
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir release
                </a>
              )}
              {row.status !== "PUBLISHED" &&
                (["FAILED", "UPLOADING"].includes(row.status) ||
                  !row.leaseUntil ||
                  Date.parse(row.leaseUntil) < Date.now()) && (
                  <button
                    disabled={busy || !data.configured}
                    onClick={() => {
                      setRecover(row);
                      setOpen(true);
                      setFile(null);
                    }}
                  >
                    Recuperar com conferência
                  </button>
                )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
