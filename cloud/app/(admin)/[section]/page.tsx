import { notFound } from "next/navigation";
import Dashboard from "@/components/dashboard";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (
    ![
      "dashboard",
      "clients",
      "devices",
      "settings",
      "usage",
      "audit",
    ].includes(section)
  )
    notFound();
  return <Dashboard section={section} />;
}
