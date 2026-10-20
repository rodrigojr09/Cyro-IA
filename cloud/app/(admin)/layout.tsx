import { admin } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await admin();
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/login");
    throw error;
  }
  return children;
}
