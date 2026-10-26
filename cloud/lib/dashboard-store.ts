export type ResourceSnapshot = {
  data: unknown;
  error: string;
  loading: boolean;
};
export function createDashboardStore(request: typeof fetch = fetch) {
  const entries = new Map<
    string,
    {
      snapshot: ResourceSnapshot;
      pending?: Promise<void>;
      listeners: Set<() => void>;
    }
  >();
  function entry(key: string) {
    if (!entries.has(key))
      entries.set(key, {
        snapshot: { data: null, error: "", loading: false },
        listeners: new Set(),
      });
    return entries.get(key)!;
  }
  function publish(key: string, patch: Partial<ResourceSnapshot>) {
    const item = entry(key);
    item.snapshot = { ...item.snapshot, ...patch };
    item.listeners.forEach((fn) => fn());
  }
  return {
    snapshot(key: string) {
      return entry(key).snapshot;
    },
    subscribe(key: string, listener: () => void) {
      const item = entry(key);
      item.listeners.add(listener);
      return () => {
        item.listeners.delete(listener);
      };
    },
    async load(key: string, refresh = false): Promise<void> {
      const item = entry(key);
      if (item.pending) return item.pending;
      if (item.snapshot.data !== null && !refresh) return;
      publish(key, { loading: true, error: "" });
      item.pending = (async () => {
        try {
          const response = await request(key, { cache: "no-store" });
          if (response.status === 401) {
            if (typeof window !== "undefined") window.location.assign("/login");
            throw Error("Sua sessão expirou. Entre novamente.");
          }
          const data = await response.json();
          if (!response.ok)
            throw Error(
              response.status === 403
                ? "Sua conta não tem permissão para acessar esta página."
                : data.error || "Não foi possível carregar os dados.",
            );
          publish(key, { data, error: "" });
        } catch (error) {
          publish(key, {
            error: error instanceof Error ? error.message : "Falha de conexão.",
          });
        } finally {
          item.pending = undefined;
          publish(key, { loading: false });
        }
      })();
      return item.pending;
    },
  };
}
