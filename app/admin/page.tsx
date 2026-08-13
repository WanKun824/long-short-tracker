import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getRuntimeEnv } from "../../db";
import { isAdminRequest } from "../lib/adminAccess";
import { AdminDashboard } from "./AdminDashboard";
import styles from "./AdminDashboard.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | LONG / SHORT TRACKER",
  robots: { index: false, follow: false },
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const requestHeaders = await headers();
  const runtime = getRuntimeEnv();
  const authenticated = await isAdminRequest(requestHeaders, runtime.ADMIN_SESSION_SECRET);

  if (!authenticated) {
    const error = (await searchParams).error;
    return (
      <main className={styles.guard}>
        <div>
          <span>LONG / SHORT TRACKER</span>
          <h1>管理面板</h1>
          <p>输入管理密码后查看定时任务、订阅和邮件记录。</p>
          {error === "invalid" && <div className={styles.loginError}>密码不正确，请重新输入。</div>}
          {error === "locked" && <div className={styles.loginError}>尝试次数过多，请在 15 分钟后重试。</div>}
          {error === "unavailable" && <div className={styles.loginError}>管理登录暂不可用，请稍后重试。</div>}
          <form className={styles.loginForm} method="post" action="/api/admin/login">
            <label htmlFor="admin-password">PASSWORD</label>
            <input id="admin-password" name="password" type="password" autoComplete="current-password" required autoFocus />
            <button type="submit">进入管理面板</button>
          </form>
          <Link href="/">返回网站</Link>
        </div>
      </main>
    );
  }

  return <AdminDashboard viewerEmail="PASSWORD SESSION" />;
}
