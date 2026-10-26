import { notFound } from "next/navigation";
import { admin } from "@/lib/auth";
import Dashboard from "@/components/dashboard";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  const query = new URLSearchParams();
  if (section === "usage") {
    query.set("usage", "1");
    const filters = await searchParams;
    for (const key of ["from", "to", "clientId", "perUser", "usagePage"]) {
      if (typeof filters[key] === "string" && filters[key])
        query.set(key, filters[key]);
    }
  }
  return (
    <Dashboard
      section={section}
      query={query.size ? "?" + query.toString() : ""}
    />
  );
}
