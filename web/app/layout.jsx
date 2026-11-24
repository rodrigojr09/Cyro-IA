import '../generated/app.css';
import '../generated/clipboard.css';
import '../generated/writer.css';
import { version } from '../generated/version.json';

export const metadata = {
  title: `Cyro IA ${version} — Desktop`,
  robots: { index: false, follow: false },
};

export default function Layout({ children }) {
  return (
    <html lang="pt-BR">
      <body><div id="root">{children}</div></body>
    </html>
  );
}
