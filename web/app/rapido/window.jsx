'use client';

import { useEffect, useState } from 'react';
import { QuickApp } from '../../generated/scripts/quick/QuickApp';

export default function QuickWindow({ panel }) {
  const [ready, setReady] = useState(null);
  useEffect(() => setReady(typeof window.quick?.state === 'function'), []);
  if (ready === null) return null;
  return ready ? <QuickApp panel={panel} /> : <p>Abra o Cyro IA Desktop para usar o Chat rápido.</p>;
}
