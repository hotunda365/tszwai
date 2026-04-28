import type { Metadata } from "next";
import AdminDashboard from "./AdminDashboard";

export const metadata: Metadata = {
  title: "Admin | 心靈導師",
  description: "tszwai.com 後台管理頁面",
  alternates: {
    canonical: "/admin",
  },
};

export default function AdminPage() {
  return <AdminDashboard />;
}
