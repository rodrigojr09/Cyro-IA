import { connection } from 'next/server';
import LoginWindow from './window';
import '../../generated/login.css';

export const metadata = { title: 'Entrar no Cyro IA' };
export default async function Page() {
  await connection();
  return <LoginWindow />;
}
