import "./globals.css";
export const metadata = {
  title: "JARVIS · Administração",
  description: "Central de acesso, dispositivos e inteligência artificial",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
