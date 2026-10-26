import { notFound } from "next/navigation";
import { admin } from "@/lib/auth";
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
      "credentials",
      "usage",
      "audit",
    ].includes(section)
  )
    notFound();
  if (section === "credentials" && (await admin()).role !== "SUPER_ADMIN")
    notFound();
  return <Dashboard section={section} />;
}
