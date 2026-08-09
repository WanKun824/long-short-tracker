"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./AdminDashboard.module.css";

type Snapshot = {
  fundId: string;
  fundName: string;
  accession: string;
  period: string;
  filedAt: string;
  checkedAt: string;
  holdingCount: number;
  changes: { baseline: boolean; added: number; exited: number; increased: number; decreased: number };
};

type Delivery = {
  fundId: string;
  fundName: string;
  accession: string;
  status: string;
  providerId: string | null;
  error: string | null;
  createdAt: string;
};

type PublicSignal = {
  fundId: string;
  fundName: string;
  kind: string;
  sourceName: string;
  sourceUrl: string;
  title: string;
  publishedAt: string;
  discoveredAt: string;
};

type RefreshRun = {
  id: string;
  trigger: string;
  scheduledAt: string | null;
  startedAt: string;
  completedAt: string | null;
  status: string;
  reason: string | null;
  durationMs: number | null;
  fundChecks: number;
  updatedFunds: number;
  publicSignalCount: number;
  emailsSent: number;
  emailsFailed: number;
  error: string | null;
};

type DashboardData = {
  generatedAt: string;
  lastRefreshAt: string | null;
  subscribers: { total: number; active: number; unsubscribed: number; today: number; last7Days: number };
  dailySignups: Array<{ day: string; signups: number }>;
  dataHistory: { snapshotCount: number; fundCount: number; snapshots: Snapshot[] };
  deliveries: { sent: number; failed: number; sending: number; recent: Delivery[] };
  publicSignals: { count: number; fundCount: number; recent: PublicSignal[] };
  runHistory: { total: number; succeeded: number; skipped: number; failed: number; running: number; recent: RefreshRun[] };
};

function formatDateTime(value: string | null) {
  if (!value) return "暂无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  }).format(date);
}

function formatDuration(value: number | null) {
  if (value === null) return "运行中";
  if (value < 1_000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(1)} 秒`;
  return `${Math.floor(value / 60_000)}分 ${Math.round((value % 60_000) / 1_000)}秒`;
}

function runStatusLabel(status: string) {
  return ({ succeeded: "成功", skipped: "跳过", failed: "失败", running: "运行中" })[status] ?? status;
}

function runTriggerLabel(trigger: string) {
  return ({ scheduled: "云端定时", manual: "手动", legacy: "历史记录" })[trigger] ?? trigger;
}

function changeSummary(snapshot: Snapshot) {
  if (snapshot.changes.baseline) return "初始快照";
  const parts = [
    snapshot.changes.added ? `新增 ${snapshot.changes.added}` : "",
    snapshot.changes.exited ? `退出 ${snapshot.changes.exited}` : "",
    snapshot.changes.increased ? `增持 ${snapshot.changes.increased}` : "",
    snapshot.changes.decreased ? `减持 ${snapshot.changes.decreased}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "无重大权重变化";
}

export function AdminDashboard({ viewerEmail }: { viewerEmail: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/summary", { cache: "no-store" });
      const payload = (await response.json()) as DashboardData & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "管理数据加载失败");
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "管理数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const dailySignups = useMemo(() => [...(data?.dailySignups ?? [])].reverse(), [data]);
  const maxSignups = Math.max(...dailySignups.map((row) => row.signups), 1);

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/">LONG / SHORT TRACKER</Link>
        <div><span>ADMIN</span><small>{viewerEmail}</small></div>
      </header>

      <section className={styles.heading}>
        <div>
          <span>OPERATIONS</span>
          <h1>管理面板</h1>
          <p>订阅、13F快照、定时任务与邮件投递的运行数据。</p>
        </div>
        <button onClick={() => void load()} disabled={loading}>{loading ? "刷新中" : "刷新数据"}</button>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {!data && loading && <div className={styles.loading}>正在读取管理数据</div>}

      {data && (
        <>
          <section className={styles.statusline}>
            <span><i /> 数据库已连接</span>
            <span>最近完整刷新：{formatDateTime(data.lastRefreshAt)}</span>
            <span>页面生成：{formatDateTime(data.generatedAt)}</span>
          </section>

          <section className={styles.metrics} aria-label="关键指标">
            <article><span>定时运行</span><strong>{data.runHistory.total}</strong><small>失败 {data.runHistory.failed} · 跳过 {data.runHistory.skipped}</small></article>
            <article><span>活跃订阅</span><strong>{data.subscribers.active}</strong><small>累计 {data.subscribers.total}</small></article>
            <article><span>近7日新增</span><strong>{data.subscribers.last7Days}</strong><small>今日 {data.subscribers.today}</small></article>
            <article><span>历史快照</span><strong>{data.dataHistory.snapshotCount}</strong><small>{data.dataHistory.fundCount} 家机构</small></article>
            <article><span>邮件投递</span><strong>{data.deliveries.sent}</strong><small>失败 {data.deliveries.failed}</small></article>
            <article><span>公开动态</span><strong>{data.publicSignals.count}</strong><small>{data.publicSignals.fundCount} 家机构</small></article>
          </section>

          <section className={styles.tablePanel}>
            <div className={styles.panelHead}>
              <div><span>CRON HISTORY</span><h2>定时任务历史</h2></div>
              <b>香港时间 · 最近 {data.runHistory.recent.length} 次</b>
            </div>
            {data.runHistory.recent.length ? (
              <div className={styles.tableScroll}>
                <table>
                  <thead><tr><th>计划／开始时间</th><th>触发方式</th><th>状态</th><th>耗时</th><th>机构检查</th><th>13F更新</th><th>公开动态</th><th>邮件</th><th>说明</th></tr></thead>
                  <tbody>
                    {data.runHistory.recent.map((run) => (
                      <tr key={run.id}>
                        <td><strong>{formatDateTime(run.scheduledAt ?? run.startedAt)}</strong><small>开始 {formatDateTime(run.startedAt)}</small></td>
                        <td>{runTriggerLabel(run.trigger)}</td>
                        <td><span className={`${styles.runBadge} ${styles[`run_${run.status}`] ?? ""}`}>{runStatusLabel(run.status)}</span></td>
                        <td>{formatDuration(run.durationMs)}</td>
                        <td>{run.fundChecks} / 8</td>
                        <td>{run.updatedFunds}</td>
                        <td>{run.publicSignalCount}</td>
                        <td><strong>{run.emailsSent} 成功</strong><small>{run.emailsFailed} 失败</small></td>
                        <td>{run.error ?? run.reason ?? "正常完成"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className={styles.empty}>等待下一次定时任务运行</div>}
          </section>

          <section className={styles.grid}>
            <article className={styles.panel}>
              <div className={styles.panelHead}>
                <div><span>SUBSCRIBERS</span><h2>近30日订阅新增</h2></div>
                <b>退订 {data.subscribers.unsubscribed}</b>
              </div>
              {dailySignups.length ? (
                <div className={styles.chart}>
                  {dailySignups.map((row) => (
                    <div key={row.day} title={`${row.day}: ${row.signups}`}>
                      <i style={{ height: `${Math.max((row.signups / maxSignups) * 100, 6)}%` }} />
                      <span>{row.day.slice(5)}</span>
                    </div>
                  ))}
                </div>
              ) : <div className={styles.empty}>暂无订阅记录</div>}
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHead}><div><span>DELIVERY HEALTH</span><h2>邮件投递状态</h2></div></div>
              <div className={styles.deliverySummary}>
                <div><span>成功</span><strong>{data.deliveries.sent}</strong></div>
                <div><span>发送中</span><strong>{data.deliveries.sending}</strong></div>
                <div><span>失败</span><strong>{data.deliveries.failed}</strong></div>
              </div>
              {!data.deliveries.recent.length && <div className={styles.empty}>尚无邮件投递记录</div>}
            </article>
          </section>

          <section className={styles.tablePanel}>
            <div className={styles.panelHead}><div><span>DATA HISTORY</span><h2>13F快照历史</h2></div><b>最近 {data.dataHistory.snapshots.length} 条</b></div>
            <div className={styles.tableScroll}>
              <table>
                <thead><tr><th>检查时间</th><th>机构</th><th>报告期</th><th>持仓数</th><th>变动摘要</th><th>申报编号</th></tr></thead>
                <tbody>{data.dataHistory.snapshots.map((snapshot) => (
                  <tr key={`${snapshot.fundId}-${snapshot.accession}`}>
                    <td>{formatDateTime(snapshot.checkedAt)}</td>
                    <td><strong>{snapshot.fundName}</strong><small>申报 {snapshot.filedAt}</small></td>
                    <td>{snapshot.period}</td><td>{snapshot.holdingCount}</td><td>{changeSummary(snapshot)}</td><td><code>{snapshot.accession}</code></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section className={styles.tablePanel}>
            <div className={styles.panelHead}><div><span>PUBLIC CONTEXT</span><h2>官网、官方 X 与财经媒体</h2></div><b>仅作背景，不推断实时仓位</b></div>
            {data.publicSignals.recent.length ? (
              <div className={styles.tableScroll}><table>
                <thead><tr><th>发布时间</th><th>机构</th><th>信源类型</th><th>来源</th><th>标题</th></tr></thead>
                <tbody>{data.publicSignals.recent.map((signal, index) => (
                  <tr key={`${signal.fundId}-${signal.sourceUrl}-${index}`}>
                    <td>{formatDateTime(signal.publishedAt)}</td><td>{signal.fundName}</td><td>{signal.kind}</td><td>{signal.sourceName}</td>
                    <td><a href={signal.sourceUrl} target="_blank" rel="noreferrer">{signal.title}</a></td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <div className={styles.empty}>等待首次公开信源检查</div>}
          </section>

          <section className={styles.tablePanel}>
            <div className={styles.panelHead}><div><span>ALERT HISTORY</span><h2>最近邮件记录</h2></div><b>不显示订阅邮箱</b></div>
            {data.deliveries.recent.length ? (
              <div className={styles.tableScroll}><table>
                <thead><tr><th>时间</th><th>机构</th><th>状态</th><th>服务编号</th><th>错误</th></tr></thead>
                <tbody>{data.deliveries.recent.map((delivery, index) => (
                  <tr key={`${delivery.fundId}-${delivery.accession}-${index}`}>
                    <td>{formatDateTime(delivery.createdAt)}</td><td>{delivery.fundName}</td>
                    <td><span className={`${styles.deliveryBadge} ${styles[`delivery_${delivery.status}`] ?? ""}`}>{delivery.status}</span></td>
                    <td><code>{delivery.providerId ?? "—"}</code></td><td>{delivery.error ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : <div className={styles.empty}>尚无邮件投递记录</div>}
          </section>
        </>
      )}
    </main>
  );
}
