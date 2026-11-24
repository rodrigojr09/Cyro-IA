import { connection } from 'next/server';
import Workspace from './workspace';

export default async function Page() {
  await connection();
  return <Workspace />;
}
