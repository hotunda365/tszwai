import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminDashboard from "./AdminDashboard";
import { getSessionUser } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Admin | 心靈導師",
  description: "tszwai.com 後台管理頁面",
  alternates: {
    canonical: "/admin",
  },
};

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user?.isAdmin) {
    redirect("/login");
  }

  return <AdminDashboard />;
}
