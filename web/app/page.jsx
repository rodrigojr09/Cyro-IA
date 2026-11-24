import { connection } from 'next/server';
import Workspace from './workspace';
import '../generated/app.css';
import '../generated/clipboard.css';
import '../generated/writer.css';

export default async function Page() {
  await connection();
  return <Workspace />;
}
