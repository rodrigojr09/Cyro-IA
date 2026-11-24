'use client';

import { useEffect, useState } from 'react';
import { Login } from '../../generated/scripts/session/Login';

export default function LoginWindow() {
  const [ready, setReady] = useState(null);
  useEffect(() => setReady(window.cyroDesktop?.workspaceProtocol === 1), []);
  if (ready === null) return null;
  return ready ? <Login /> : <main><section>Abra o Cyro IA Desktop para entrar.</section></main>;
}
