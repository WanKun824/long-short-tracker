import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getRuntimeEnv } from "../../db";
import { getAuthenticatedEmail, isAdminRequest } from "../lib/adminAccess";
import { AdminDashboard } from "./AdminDashboard";
import styles from "./AdminDashboard.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | LONG / SHORT TRACKER",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const requestHeaders = await headers();
  const runtime = getRuntimeEnv();
  const viewerEmail = getAuthenticatedEmail(requestHeaders);

  if (!isAdminRequest(requestHeaders, runtime.ADMIN_EMAIL)) {
    return (
      <main className={styles.guard}>
        <div>
          <span>LONG / SHORT TRACKER</span>
          <h1>管理面板不可访问</h1>
          <p>当前登录账号不在管理员名单中。</p>
          <Link href="/">返回网站</Link>
        </div>
      </main>
    );
  }

  return <AdminDashboard viewerEmail={viewerEmail ?? "已认证管理员"} />;
}
