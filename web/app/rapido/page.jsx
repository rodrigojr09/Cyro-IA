import { connection } from 'next/server';
import QuickWindow from './window';
import '../../generated/styles/tokens.css';
import '../../generated/quick.css';
import '../../generated/clipboard.css';
import '../../generated/styles/attachments.css';
import '../../generated/styles/integrations.css';

export const metadata = { title: 'Cyro IA · Chat rápido' };
export default async function Page({ searchParams }) {
  await connection();
  const { panel } = await searchParams;
  return ['orb', 'composer', 'response'].includes(panel) ? <QuickWindow panel={panel} /> : null;
}
