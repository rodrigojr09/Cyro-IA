"use client";
import Link from "next/link";
import type { UsageReport } from "../lib/usage-report";

const number = (value: number) => value.toLocaleString("pt-BR");
const money = (value: string | null) =>
  value === null
    ? "Indisponível"
    : Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 6,
      });
export default function UsagePanel({
  report,
  employees,
  query,
}: {
  report?: UsageReport;
  employees: { id: string; name: string; role: string }[];
  query: string;
}) {
  const filters = new URLSearchParams(query);
  const pageLink = (page: number) => {
    const next = new URLSearchParams(filters);
    next.delete("usage");
    next.set("usagePage", String(page));
    return "/usage?" + next.toString();
  };
  const max = Math.max(1, ...(report?.users.map((user) => user.tokens) ?? []));
  const total = report?.total;
  return (
    <section className="card usage-panel">
      <h2>Consumo de OpenAI</h2>
      <p className="muted">
        Acompanhe o consumo geral e por usuário. Os gráficos somam todas as
        chamadas do período; a lista mostra apenas as mais recentes de cada
        usuário.
      </p>
      <form className="form-grid" method="get" action="/usage">
        <label>
          De (UTC)
          <input
            name="from"
            type="date"
            defaultValue={filters.get("from") || ""}
          />
        </label>
        <label>
          Até (UTC)
          <input name="to" type="date" defaultValue={filters.get("to") || ""} />
        </label>
        <label>
          Usuário
          <select name="clientId" defaultValue={filters.get("clientId") || ""}>
            <option value="">Todos do meu escopo</option>
            {employees.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Chamadas por usuário
          <select name="perUser" defaultValue={String(report?.perUser ?? 5)}>
            {[5, 10, 20].map((limit) => (
              <option key={limit} value={limit}>
                {limit} mais recentes
              </option>
            ))}
          </select>
        </label>
        <button>Aplicar filtros</button>
        <Link href="/usage">Limpar filtros</Link>
      </form>
      {!report ? (
        <p role="status">Carregando consumo…</p>
      ) : (
        <>
          <div className="usage-stats" aria-label="Resumo do período">
            <div>
              <span>Tokens no período</span>
              <strong>{number(report.total.tokens)}</strong>
            </div>
            <div>
              <span>Chamadas</span>
              <strong>{number(report.total.calls)}</strong>
            </div>
            <div>
              <span>Usuários com consumo</span>
              <strong>{number(report.userCount)}</strong>
            </div>
          </div>
          {report.total.calls === 0 ? (
            <p className="empty">
              Nenhum consumo registrado para os filtros selecionados.
            </p>
          ) : (
            <>
              <div className="usage-charts">
                <section
                  className="usage-chart"
                  aria-label="Gráfico de consumo geral"
                >
                  <h3>Consumo geral</h3>
                  <p className="muted">
                    Distribuição de tokens no período filtrado
                  </p>
                  <div
                    className="usage-stack"
                    role="img"
                    aria-label={`${number(total!.inputTokens)} tokens de entrada e ${number(total!.outputTokens)} tokens de saída`}
                  >
                    <span
                      className="usage-input"
                      style={{
                        width: `${total!.tokens ? (total!.inputTokens / total!.tokens) * 100 : 0}%`,
                      }}
                    />
                    <span
                      className="usage-output"
                      style={{
                        width: `${total!.tokens ? (total!.outputTokens / total!.tokens) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="usage-legend">
                    <span>
                      <i className="usage-input" />
                      Entrada <b>{number(total!.inputTokens)}</b>
                    </span>
                    <span>
                      <i className="usage-output" />
                      Saída <b>{number(total!.outputTokens)}</b>
                    </span>
                  </div>
                </section>
                <section
                  className="usage-chart"
                  aria-label="Gráfico de consumo por usuário"
                >
                  <h3>Consumo por usuário</h3>
                  <p className="muted">
                    Tokens totais · usuários desta página, ordenados por consumo
                  </p>
                  <div className="usage-bars">
                    {report.users.map((user) => (
                      <div className="usage-bar-row" key={user.userId}>
                        <div>
                          <span>{user.name}</span>
                          <b>{number(user.tokens)}</b>
                        </div>
                        <div
                          className="usage-track"
                          role="img"
                          aria-label={`${user.name}: ${number(user.tokens)} tokens`}
                        >
                          <span
                            style={{ width: `${(user.tokens / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <div className="usage-list-heading">
                <h3>Chamadas recentes por usuário</h3>
                <span className="muted">
                  Até {report.perUser} chamadas por usuário · 10 usuários por
                  página
                </span>
              </div>
              <p className="muted">
                Custos em USD são estimativas, não a fatura do provedor. Áudio e
                reservas sem uso confirmado não compõem estes tokens
                registrados, mas continuam sujeitos aos seus próprios limites.
              </p>
              {report.users.map((user) => (
                <section
                  className="usage-user"
                  key={user.userId}
                  aria-label={`Consumo de ${user.name}`}
                >
                  <header>
                    <h4>{user.name}</h4>
                    <span>
                      {number(user.tokens)} tokens · {number(user.calls)}{" "}
                      chamadas no período
                    </span>
                  </header>
                  <p className="muted">
                    Custo estimado registrado: {money(user.cost)}
                    {user.unpricedCalls > 0
                      ? ` · ${number(user.unpricedCalls)} chamada(s) sem estimativa de custo`
                      : ""}
                  </p>
                  <div
                    className="table-wrap"
                    role="region"
                    aria-label={`Chamadas recentes de ${user.name}`}
                    tabIndex={0}
                  >
                    <table>
                      <thead>
                        <tr>
                          {[
                            "Data",
                            "Modelo",
                            "Entrada",
                            "Saída",
                            "Custo estimado",
                          ].map((label) => (
                            <th scope="col" key={label}>
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {user.recent.map((row) => (
                          <tr key={row.id}>
                            <td>
                              {new Date(row.createdAt).toLocaleString("pt-BR")}
                            </td>
                            <td>{row.model}</td>
                            <td>{number(row.inputTokens)}</td>
                            <td>{number(row.outputTokens)}</td>
                            <td>{money(row.estimatedCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <small className="muted">
                    Mostrando {user.recent.length} de {number(user.calls)}{" "}
                    chamadas.
                  </small>
                </section>
              ))}
              <nav
                className="usage-pagination"
                aria-label="Páginas de usuários"
              >
                {report.page > 1 && (
                  <Link href={pageLink(report.page - 1)}>← Anterior</Link>
                )}
                <span>
                  Página {report.page} de {report.pages}
                </span>
                {report.page < report.pages && (
                  <Link href={pageLink(report.page + 1)}>Próxima →</Link>
                )}
              </nav>
            </>
          )}
        </>
      )}
    </section>
  );
}
