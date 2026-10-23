"use client";
import Link from "next/link";
import Management from "./management";
import { useCallback, useEffect, useState } from "react";
type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  monthlyTokenLimit: number;
  cloudStorageLimitBytes: number;
};
type Device = {
  id: string;
  name: string;
  userId: string;
  user: { name: string };
  lastSeenAt: string;
  revokedAt: string | null;
};
type Usage = {
  id: string;
  userId: string;
  user: { name: string };
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: string | null;
  createdAt: string;
};
type Audit = {
  id: string;
  action: string;
  targetType: string;
  createdAt: string;
};
type Data = {
  actor: { name: string; role: string };
  employees: Employee[];
  devices: Device[];
  usage: Usage[];
  audit: Audit[];
  metrics?: {
    employees: number;
    active: number;
    devices: number;
    tokens: number;
    cost: string | null;
  };
};
const links = [
  ["dashboard", "◈", "Visão geral"],
  ["clients", "♙", "Usuários"],
  ["devices", "▣", "Dispositivos"],
  ["settings", "⚙", "Configurações"],
  ["usage", "▥", "Consumo"],
  ["audit", "≡", "Auditoria"],
];
const date = (value: string) => new Date(value).toLocaleString("pt-BR");
const number = (value: number) => value.toLocaleString("pt-BR");
export default function Dashboard({ section }: { section: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/admin" + (section === "usage" ? location.search : ""),
        { cache: "no-store" },
      );
      if (response.status === 401) {
        location.assign("/login");
        return;
      }
      if (!response.ok) throw Error("Não foi possível consultar o Cloud.");
      setData(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha de conexão.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function command(value: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const response = await result.json();
      if (!result.ok) throw Error(response.error);
      setNotice("Operação concluída.");
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operação não concluída.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const title = links.find((l) => l[0] === section)?.[2];
  return (
    <div className="shell">
      <aside>
        <Link className="brand" href="/dashboard">
          J<span>ARVIS</span>
          <i>CLOUD</i>
        </Link>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Navegação administrativa">
          {links.map(([id, icon, label]) => (
            <Link
              key={id}
              href={`/${id}`}
              aria-current={section === id ? "page" : undefined}
            >
              <span>{icon}</span>
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{data?.actor.name.slice(0, 1) || "J"}</span>
          <div>
            {data?.actor.name || "Administração"}
            <small>{data?.actor.role || "Conectando…"}</small>
          </div>
          <button
            className="ghost"
            aria-label="Sair"
            onClick={async () => {
              const result = await fetch("/api/auth/logout", {
                method: "POST",
              });
              if (result.ok) location.assign("/login");
              else setError("Não foi possível encerrar a sessão.");
            }}
          >
            ↗
          </button>
        </div>
      </aside>
      <main className="content">
        <header>
          <span>
            Administração <b>/ {title}</b>
          </span>
          <span className="environment">
            <i />
            JARVIS Cloud
          </span>
        </header>
        <div className="page-heading">
          <div>
            <p className="eyebrow">CENTRAL DE CONTROLE</p>
            <h1>{title}</h1>
            <p className="muted">
              {section === "dashboard"
                ? "Pessoas conectadas. Inteligência sob controle."
                : "Gerencie o acesso com segurança e acompanhe cada alteração."}
            </p>
          </div>
          <button
            className="secondary"
            onClick={() => {
              setError("");
              void load();
            }}
          >
            ↻ Atualizar
          </button>
        </div>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {!data ? (
          <section className="card">
            <p>
              {error
                ? "Dados indisponíveis. Configure a conexão e tente novamente."
                : "Consultando os dados do sistema…"}
            </p>
          </section>
        ) : (
          <>
            {section === "dashboard" && (
              <>
                <div className="metrics">
                  {[
                    [
                      "Clientes",
                      data.metrics?.employees ??
                        data.employees.filter((e) => e.role === "EMPLOYEE")
                          .length,
                      "Cadastrados no seu escopo",
                    ],
                    [
                      "Clientes ativos",
                      data.metrics?.active ??
                        data.employees.filter((e) => e.status === "ACTIVE")
                          .length,
                      "Acesso autorizado",
                    ],
                    [
                      "Instalações",
                      data.metrics?.devices ??
                        data.devices.filter((d) => !d.revokedAt).length,
                      "Dispositivos autorizados",
                    ],
                  ].map(([label, value, detail]) => (
                    <article className="card metric" key={String(label)}>
                      <p>{label}</p>
                      <strong>{number(Number(value))}</strong>
                      <small>{detail}</small>
                    </article>
                  ))}
                </div>
                <div className="dashboard-grid">
                  <section className="card">
                    <h2>Acesso por login</h2>
                    <p>
                      Cadastre usuários com e-mail e senha e controle o acesso
                      ao Desktop.
                    </p>
                    <Link href="/clients">Gerenciar usuários →</Link>
                  </section>
                  <section className="card consumption">
                    <span className="eyebrow">INTELIGÊNCIA ARTIFICIAL</span>
                    <h2>Consumo do mês</h2>
                    <strong>
                      {number(data.metrics?.tokens ?? 0)}
                      <small> tokens</small>
                    </strong>
                    <p className="muted">Consumo retornado pelo provedor.</p>
                    <Link href="/usage">Consultar uso e limites →</Link>
                    <div className="divider" />
                    <h3>Alertas administrativos</h3>
                    <p className="muted">
                      O Desktop verifica a sessão a cada cinco minutos.
                    </p>
                    <p className="muted">
                      Custos sem preço configurado aparecem como indisponíveis.
                    </p>
                  </section>
                </div>
              </>
            )}
            {section === "clients" && (
              <>
                <section className="card">
                  <h2>
                    Cadastrar usuário{" "}
                    {data.actor.role === "SUPER_ADMIN" && "ou administrador"}
                  </h2>
                  <form
                    className="form-grid"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const values = new FormData(form);
                      if (
                        await command({
                          action: "client.create",
                          data: {
                            name: values.get("name"),
                            email: values.get("email"),
                            role: values.get("role") || "EMPLOYEE",
                            monthlyTokenLimit: Number(values.get("limit")),
                            ...(values.get("password")
                              ? { password: values.get("password") }
                              : {}),
                          },
                        })
                      )
                        form.reset();
                    }}
                  >
                    <label>
                      Nome
                      <input name="name" required maxLength={100} />
                    </label>
                    <label>
                      E-mail
                      <input name="email" type="email" required />
                    </label>
                    <label>
                      Limite mensal de tokens
                      <input
                        name="limit"
                        type="number"
                        min={0}
                        max={100000000}
                        defaultValue={100000}
                        required
                      />
                    </label>
                    {data.actor.role === "SUPER_ADMIN" && (
                      <>
                        <label>
                          Papel
                          <select name="role">
                            <option value="EMPLOYEE">Cliente</option>
                            <option value="ADMIN">Administrador</option>
                          </select>
                        </label>
                      </>
                    )}
                    <label>
                      Senha inicial
                      <input
                        name="password"
                        type="password"
                        required
                        minLength={12}
                        maxLength={256}
                        autoComplete="new-password"
                      />
                    </label>
                    <button disabled={busy}>Cadastrar</button>
                  </form>
                </section>
                <section className="card">
                  <h2>Pessoas no seu escopo</h2>
                  <p className="muted">
                    Até 100 cadastros recentes. Dispositivos e consumo estão nas
                    páginas correspondentes.
                  </p>
                  {data.employees.map((e) => (
                    <form
                      className="employee-row"
                      key={e.id}
                      onSubmit={(event) => {
                        event.preventDefault();
                        const values = new FormData(event.currentTarget);
                        void command({
                          action: "client.update",
                          id: e.id,
                          name: values.get("name"),
                          status: values.get("status"),
                          monthlyTokenLimit: Number(values.get("limit")),
                          cloudStorageLimitBytes:
                            Number(values.get("storageLimit")) * 1048576,
                          ...(values.get("password")
                            ? { password: values.get("password") }
                            : {}),
                        });
                      }}
                    >
                      <label>
                        Nome
                        <input name="name" defaultValue={e.name} required />
                      </label>
                      <div>
                        {e.email}
                        <small>{e.role}</small>
                      </div>
                      <label>
                        Tokens/mês
                        <input
                          name="limit"
                          type="number"
                          min={0}
                          max={100000000}
                          defaultValue={e.monthlyTokenLimit}
                        />
                      </label>
                      <label>
                        Armazenamento na nuvem (MB)
                        <input
                          name="storageLimit"
                          type="number"
                          min={1}
                          max={1024}
                          defaultValue={
                            (e.cloudStorageLimitBytes || 52428800) / 1048576
                          }
                          required
                        />
                      </label>
                      <label>
                        Estado
                        <select name="status" defaultValue={e.status}>
                          <option value="ACTIVE">Ativo</option>
                          <option value="DISABLED">Desativado</option>
                        </select>
                      </label>
                      <label>
                        Nova senha (opcional)
                        <input
                          name="password"
                          type="password"
                          minLength={12}
                          maxLength={256}
                          autoComplete="new-password"
                        />
                      </label>
                      <button
                        disabled={busy || e.role === "SUPER_ADMIN"}
                        className="secondary"
                      >
                        Salvar
                      </button>
                    </form>
                  ))}
                </section>
              </>
            )}
            {section === "devices" && (
              <section className="card">
                <h2>Instalações autorizadas</h2>
                <Table
                  heads={[
                    "Dispositivo",
                    "Cliente",
                    "Último acesso",
                    "Licença",
                    "Ação",
                  ]}
                  rows={data.devices.map((d) => [
                    d.name,
                    d.user.name,
                    date(d.lastSeenAt),
                    d.revokedAt ? "Revogada" : "Ativa",
                    <button
                      key={d.id}
                      className="ghost danger"
                      disabled={busy || !!d.revokedAt}
                      onClick={() => {
                        if (
                          confirm(
                            "Bloquear este dispositivo e encerrar suas sessões?",
                          )
                        )
                          void command({ action: "device.revoke", id: d.id });
                      }}
                    >
                      Revogar
                    </button>,
                  ])}
                />
              </section>
            )}
            {section === "usage" && (
              <section className="card">
                <h2>Consumo de OpenAI</h2>
                <form className="form-grid" method="get">
                  <label>
                    De (UTC)
                    <input name="from" type="date" />
                  </label>
                  <label>
                    Até (UTC)
                    <input name="to" type="date" />
                  </label>
                  <label>
                    Cliente
                    <select name="clientId">
                      <option value="">Todos do meu escopo</option>
                      {data.employees
                        .filter((e) => e.role === "EMPLOYEE")
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button>Filtrar</button>
                </form>
                <p className="muted">
                  Até 100 chamadas recentes. Custos em USD são estimativas;
                  consulte a fatura do provedor. Reservas de chamadas sem uso
                  confirmado continuam abatendo o limite.
                </p>
                <Table
                  heads={[
                    "Cliente",
                    "Data",
                    "Modelo",
                    "Entrada",
                    "Saída",
                    "Custo estimado",
                  ]}
                  rows={data.usage.map((u) => [
                    u.user.name,
                    date(u.createdAt),
                    u.model,
                    number(u.inputTokens),
                    number(u.outputTokens),
                    u.estimatedCost === null
                      ? "Indisponível"
                      : `$ ${u.estimatedCost}`,
                  ])}
                />
                <h3>Limites mensais</h3>
                <Table
                  heads={["Cliente", "Tokens por mês"]}
                  rows={data.employees
                    .filter((e) => e.role === "EMPLOYEE")
                    .map((e) => [e.name, number(e.monthlyTokenLimit)])}
                />
              </section>
            )}
            {section === "settings" && <Management section={section} />}
            {section === "audit" && (
              <section className="card">
                <h2>Registro de auditoria</h2>
                <p className="muted">
                  Até 100 eventos recentes no escopo autorizado.
                </p>
                <Table
                  heads={["Data", "Ação", "Tipo"]}
                  rows={data.audit.map((a) => [
                    date(a.createdAt),
                    a.action,
                    a.targetType,
                  ])}
                />
              </section>
            )}
          </>
        )}
        <footer>
          JARVIS · Arquitetura Cloud + Desktop <span>v4.2.0</span>
        </footer>
      </main>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <span>⌁</span>
      <p>{text}</p>
    </div>
  );
}
function Table({
  heads,
  rows,
}: {
  heads: string[];
  rows: React.ReactNode[][];
}) {
  return rows.length ? (
    <div
      className="table-wrap"
      role="region"
      aria-label={heads.join(", ")}
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            {heads.map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty text="Nenhum registro encontrado." />
  );
}
