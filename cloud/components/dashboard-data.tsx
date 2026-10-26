"use client";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  useEffect,
  useCallback,
} from "react";
import { createDashboardStore } from "../lib/dashboard-store";
const Context = createContext<ReturnType<typeof createDashboardStore> | null>(
  null,
);
export function DashboardDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [store] = useState(() => createDashboardStore());
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useDashboardData<T>(key: string | null) {
  const store = useContext(Context);
  if (!store) throw Error("DashboardDataProvider ausente.");
  const resource = key || "/api/admin";
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(resource, listener),
    [store, resource],
  );
  const snapshot = useCallback(
    () => store.snapshot(resource),
    [store, resource],
  );
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (key) void store.load(key);
  }, [store, key]);
  const reload = useCallback(
    () => (key ? store.load(key, true) : Promise.resolve()),
    [store, key],
  );
  return {
    data: key ? (state.data as T | null) : null,
    error: key ? state.error : "",
    loading: !!key && (state.loading || (!state.data && !state.error)),
    reload,
  };
}
export function DashboardLoading({
  error,
  retry,
}: {
  error?: string;
  retry?: () => void;
}) {
  return (
    <div
      className="dashboard-loading"
      role={error ? "alert" : "status"}
      aria-live="polite"
    >
      <div>
        {!error && <span className="loading-spinner" aria-hidden="true" />}
        <p>{error || "Carregando sua dashboard…"}</p>
        {error && <button onClick={retry}>Tentar novamente</button>}
      </div>
    </div>
  );
}
