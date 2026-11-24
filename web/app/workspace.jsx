'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const App = dynamic(() => import('../generated/scripts/app/App').then((module) => module.App), {
  ssr: false,
  loading: () => <WorkspaceStatus>Carregando o espaço de trabalho…</WorkspaceStatus>,
});

function WorkspaceStatus({ children }) {
  return (
    <main id="welcome" role="status">
      <h2>Cyro IA</h2>
      <p>{children}</p>
    </main>
  );
}

export default function Workspace() {
  const [bridge, setBridge] = useState(null);
  useEffect(() => setBridge(window.cyroDesktop?.workspaceProtocol || 0), []);
  if (bridge === null)
    return <WorkspaceStatus>Carregando o espaço de trabalho…</WorkspaceStatus>;
  if (bridge !== 1)
    return <WorkspaceStatus>Abra o Cyro IA Desktop para acessar o espaço de trabalho.</WorkspaceStatus>;
  return <App />;
}
