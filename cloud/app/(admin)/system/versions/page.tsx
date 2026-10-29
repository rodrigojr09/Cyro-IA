import { notFound } from 'next/navigation';
import { admin } from '@/lib/auth';
import Dashboard from '@/components/dashboard';
export default async function VersionsPage() {
  if((await admin()).role!=='SUPER_ADMIN')notFound();
  return <Dashboard section="versions"/>;
}
