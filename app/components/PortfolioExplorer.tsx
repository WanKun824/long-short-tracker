"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  funds,
  holdings as initialHoldings,
  type FundProfile,
  type Holding,
} from "../data/funds";

type SortMode = "value" | "concentration" | "holdings";
type SnapshotMetadata = {
  period: string;
  accession: string;
  filedAt: string;
  checkedAt: string;
};
type DynamicPayload = {
  holdings?: Partial<Record<FundProfile["id"], Holding[]>>;
  snapshots?: Partial<Record<FundProfile["id"], SnapshotMetadata>>;
};
type ServiceStatus = {
  dataReady: boolean;
  emailReady: boolean;
  trackedFunds: number;
  snapshotFunds: number;
  lastRefreshAt: string | null;
  refreshIntervalHours: number;
  publicSignalsReady: boolean;
  publicSignalCount: number;
  lastPublicSignalsAt: string | null;
  officialXReady: boolean;
};

const categories = ["全部", ...Array.from(new Set(funds.map((fund) => fund.category)))];

const currency = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatValue(valueK: number) {
  return currency.format(valueK * 1_000);
}

function formatShares(shares: number | null, principal: number | null) {
  const value = shares ?? principal;
  if (!value) return "—";
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function formatCheckedAt(value: string | null) {
  if (!value) return "等待首次检查";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近检查时间已记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function filingSource(fund: FundProfile, accession: string) {
  const compact = accession.replace(/\D/gu, "");
  if (compact.length !== 18) return fund.filingSource;
  const cik = fund.cik.replace(/^0+/u, "") || "0";
  const dashed = `${compact.slice(0, 10)}-${compact.slice(10, 12)}-${compact.slice(12)}`;
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${compact}/${dashed}-index.html`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function ManagerAvatar({ fund, large = false }: { fund: FundProfile; large?: boolean }) {
  const managerLabel = fund.managerEn ? `${fund.managerZh}（${fund.managerEn}）` : fund.managerZh;
  return (
    <div
      className={`manager-avatar ${large ? "manager-avatar--large" : ""}`}
      style={{ "--avatar-accent": fund.accent } as CSSProperties}
    >
      {fund.image ? (
        <img src={fund.image} alt={`${managerLabel}头像`} />
      ) : (
        <span aria-label={`${fund.managerZh}姓名缩写头像`}>{initials(fund.managerEn || fund.managerZh)}</span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: FundProfile["status"] }) {
  const tone = status === "最新申报" ? "live" : status === "已知重大变化" ? "alert" : "stale";
  return <span className={`status-badge status-badge--${tone}`}>{status}</span>;
}

function TopHoldings({ rows, accent }: { rows: Holding[]; accent: string }) {
  const top = rows.slice(0, 4);
  const max = Math.max(...top.map((row) => row.weight), 1);

  return (
    <div className="mini-holdings" aria-label="前四大披露仓位">
      {top.map((row, index) => (
        <div className="mini-holding" key={`${row.cusip}-${row.option ?? "shares"}-${index}`}>
          <div className="mini-holding__label">
            <span>
              {row.ticker} {row.option && <em>{row.option}</em>}
            </span>
            <strong>{row.weight.toFixed(1)}%</strong>
          </div>
          <div className="mini-holding__track">
            <span style={{ width: `${(row.weight / max) * 100}%`, background: accent }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FundModal({
  fund,
  rows,
  onClose,
}: {
  fund: FundProfile;
  rows: Holding[];
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.classList.add("modal-open");
    closeRef.current?.focus();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="fund-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fund-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="关闭机构详情">
          ×
        </button>

        <div className="fund-modal__hero" style={{ "--fund-accent": fund.accent } as CSSProperties}>
          <ManagerAvatar fund={fund} large />
          <div>
            <div className="eyebrow">机构档案 · {fund.category}</div>
            <h2 id="fund-modal-title">{fund.nameZh}</h2>
            <p className="fund-modal__english">{fund.nameEn}</p>
            <div className="modal-manager">
              {fund.managerZh} {fund.managerEn && <span>{fund.managerEn}</span>} · {fund.managerRole}
            </div>
          </div>
          <div className="modal-identity__status">
            <StatusBadge status={fund.status} />
            <span>{fund.period}</span>
          </div>
        </div>

        <div className="fund-modal__body">
          <aside className="fund-profile-panel">
            <p className="profile-lede">{fund.description}</p>

            <div className="profile-block profile-block--person">
              <h3>人物小传</h3>
              <p>{fund.managerBio}</p>
            </div>

            <div className="profile-stat-grid">
              <div>
                <span>披露市值</span>
                <strong>${fund.valueBn.toFixed(1)}B</strong>
              </div>
              <div>
                <span>持仓条目</span>
                <strong>{fund.holdingCount}</strong>
              </div>
              <div>
                <span>前五集中度</span>
                <strong>{fund.top5.toFixed(1)}%</strong>
              </div>
              <div>
                <span>风格风险</span>
                <strong>{fund.risk}</strong>
              </div>
            </div>

            <div className="profile-block">
              <h3>投资方法</h3>
              <ul>
                {fund.playbook.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="analyst-note">
              <span>读表提示</span>
              <p>{fund.read13f}</p>
            </div>

            <div className="status-note">
              <span>最新状态</span>
              <p>{fund.statusNote}</p>
            </div>

            <div className="source-links">
              <a href={fund.profileSource} target="_blank" rel="noreferrer">
                官方／权威资料 ↗
              </a>
              <a href={fund.filingSource} target="_blank" rel="noreferrer">
                查看原始13F ↗
              </a>
            </div>
          </aside>

          <div className="holdings-panel">
            <div className="holdings-panel__head">
              <div>
                <span className="eyebrow">完整披露持仓</span>
                <h3>{fund.period} · 共 {rows.length} 项</h3>
              </div>
              <span className="data-stamp">申报于 {fund.filingDate}</span>
            </div>

            <div className="table-scroll" tabIndex={0} aria-label={`${fund.nameZh}完整持仓表，可横向滚动`}>
              <table className="holdings-table">
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>证券</th>
                    <th>类型</th>
                    <th>权重</th>
                    <th>披露市值</th>
                    <th>数量</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.cusip}-${row.option ?? "shares"}-${index}`}>
                      <td className="rank-cell">{String(index + 1).padStart(2, "0")}</td>
                      <td>
                        <strong>{row.ticker}</strong>
                        <span>{row.issuer}</span>
                      </td>
                      <td>
                        <span className={`instrument-tag ${row.option ? "instrument-tag--option" : ""}`}>
                          {row.option ?? "股票"}
                        </span>
                      </td>
                      <td className="weight-cell">
                        <strong>{row.weight.toFixed(1)}%</strong>
                        <span>
                          <i style={{ width: `${Math.min(row.weight * 3.8, 100)}%`, background: fund.accent }} />
                        </span>
                      </td>
                      <td>{formatValue(row.valueK)}</td>
                      <td>{formatShares(row.shares, row.principal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PortfolioExplorer() {
  const [activeCategory, setActiveCategory] = useState("全部");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("value");
  const [selectedFundId, setSelectedFundId] = useState<FundProfile["id"] | null>(null);
  const [liveHoldings, setLiveHoldings] = useState(initialHoldings);
  const [liveSnapshots, setLiveSnapshots] = useState<DynamicPayload["snapshots"]>({});
  const [email, setEmail] = useState("");
  const [selectedIds, setSelectedIds] = useState<FundProfile["id"][]>(funds.map((fund) => fund.id));
  const [subscribeState, setSubscribeState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [subscribeMessage, setSubscribeMessage] = useState("");
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        await fetch("/api/refresh", { method: "POST", headers: { "x-site-heartbeat": "1" } });
        const [response, statusResponse] = await Promise.all([
          fetch("/api/holdings", { cache: "no-store" }),
          fetch("/api/status", { cache: "no-store" }),
        ]);
        if (response.ok) {
          const payload = (await response.json()) as DynamicPayload;
          if (!cancelled && payload.holdings && Object.keys(payload.holdings).length) {
            setLiveHoldings((current) => ({ ...current, ...payload.holdings }));
          }
          if (!cancelled && payload.snapshots) setLiveSnapshots(payload.snapshots);
        }
        if (statusResponse.ok) {
          const status = (await statusResponse.json()) as ServiceStatus;
          if (!cancelled) setServiceStatus(status);
        }
      } catch {
        // The verified filing snapshot bundled with the site remains available offline.
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const liveFunds = useMemo(() => funds.map((fund) => {
    const rows = liveHoldings[fund.id] ?? [];
    const snapshot = liveSnapshots?.[fund.id];
    return {
      ...fund,
      period: snapshot?.period ?? fund.period,
      filingDate: snapshot?.filedAt ?? fund.filingDate,
      filingSource: snapshot ? filingSource(fund, snapshot.accession) : fund.filingSource,
      valueBn: rows.reduce((sum, row) => sum + row.valueK, 0) / 1_000_000,
      holdingCount: rows.length,
      top5: rows.slice(0, 5).reduce((sum, row) => sum + row.weight, 0),
    };
  }), [liveHoldings, liveSnapshots]);

  const selectedFund = selectedFundId
    ? liveFunds.find((fund) => fund.id === selectedFundId) ?? null
    : null;
  const latestPeriod = liveFunds.reduce(
    (latest, fund) => fund.period > latest ? fund.period : latest,
    "",
  );
  const liveTotalValueBn = liveFunds.reduce((sum, fund) => sum + fund.valueBn, 0);
  const liveTotalHoldingRows = liveFunds.reduce((sum, fund) => sum + fund.holdingCount, 0);

  const visibleFunds = useMemo(() => {
    const query = search.trim().toLowerCase();
    return liveFunds
      .filter((fund) => activeCategory === "全部" || fund.category === activeCategory)
      .filter((fund) => {
        if (!query) return true;
        const fundText = [fund.nameZh, fund.nameEn, fund.managerZh, fund.managerEn, fund.category, fund.style]
          .join(" ")
          .toLowerCase();
        const holdingMatch = liveHoldings[fund.id].some(
          (row) => row.ticker.toLowerCase().includes(query) || row.issuer.toLowerCase().includes(query),
        );
        return fundText.includes(query) || holdingMatch;
      })
      .sort((a, b) => {
        if (sortMode === "concentration") return b.top5 - a.top5;
        if (sortMode === "holdings") return b.holdingCount - a.holdingCount;
        return b.valueBn - a.valueBn;
      });
  }, [activeCategory, liveFunds, liveHoldings, search, sortMode]);

  function toggleSubscription(id: FundProfile["id"]) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function submitSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubscribeState("sending");
    setSubscribeMessage("");

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, fundIds: selectedIds }),
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "订阅失败，请稍后重试");
      setSubscribeState("success");
      setSubscribeMessage(payload.message ?? "订阅成功。新申报出现时，我们会发送中文摘要。 ");
      setEmail("");
    } catch (error) {
      setSubscribeState("error");
      setSubscribeMessage(error instanceof Error ? error.message : "订阅失败，请稍后重试");
    }
  }

  return (
    <main>
      <div className="market-strip" aria-label="数据状态">
        <span><i /> LONG / SHORT TRACKER · SEC公开申报数据</span>
        <span>最新已披露季度 {latestPeriod}</span>
        <span>每日 08:00（香港时间）检查</span>
        <span>资料源 SEC EDGAR</span>
      </div>

      <header className="site-header">
        <a className="brand" href="#top" aria-label="LONG / SHORT TRACKER首页">
          <span className="brand-mark">13F</span>
          <span>
            <strong>LONG / SHORT TRACKER</strong>
            <em>INSTITUTIONAL 13F DATA</em>
          </span>
        </a>
        <nav aria-label="主导航">
          <a href="#institutions">机构追踪</a>
          <a href="#compare">策略图谱</a>
          <a href="#methodology">数据说明</a>
        </nav>
        <a className="header-cta" href="#subscribe">免费订阅</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>INSTITUTIONAL POSITION DATA</span> · 中文数据平台</div>
          <h1>美国机构投资者<br /><span>持仓数据库</span></h1>
          <p>
            跟踪8家代表性投资机构的SEC 13F原始申报，并汇总机构官网、官方社媒与可信财经媒体的近期公开动态。
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#institutions">查看机构持仓 <span>↘</span></a>
            <a className="text-button" href="#methodology">数据范围与限制</a>
          </div>
          <div className="hero-metrics">
            <div><strong>8</strong><span>家代表性机构</span></div>
            <div><strong>${liveTotalValueBn.toFixed(1)}B</strong><span>披露证券市值</span></div>
            <div><strong>{liveTotalHoldingRows}</strong><span>项持仓记录</span></div>
          </div>
        </div>

        <form className="hero-subscribe" onSubmit={submitSubscription}>
          <div className="hero-service-status" aria-label="订阅服务状态">
            <span className={serviceStatus?.dataReady ? "is-ready" : "is-pending"}>
              <i /> 数据检查 {serviceStatus?.dataReady ? "已启用" : "确认中"}
            </span>
            <span className={serviceStatus?.emailReady ? "is-ready" : "is-pending"}>
              <i /> 邮件提醒 {serviceStatus?.emailReady ? "已启用" : "待配置"}
            </span>
            <span className={serviceStatus?.publicSignalsReady ? "is-ready" : "is-pending"}>
              <i /> 公开信源 {serviceStatus?.publicSignalsReady ? "已启用" : "确认中"}
            </span>
            <small>最近检查：{formatCheckedAt(serviceStatus?.lastRefreshAt ?? null)}</small>
          </div>
          <div className="hero-subscribe__kicker"><i /> 每日检查公开申报</div>
          <h2>订阅13F申报更新</h2>
          <p>订阅后立即发送当前13F状态；新申报与经筛选的官网、官方 X、主流财经媒体动态将分别发送。</p>
          <label className="hero-email-field">
            <span className="sr-only">邮箱地址</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="输入邮箱地址"
              autoComplete="email"
            />
            <button disabled={subscribeState === "sending" || selectedIds.length === 0}>
              {subscribeState === "sending" ? "提交中…" : "订阅全部机构"}
            </button>
          </label>
          {subscribeMessage && (
            <p className={`form-message form-message--${subscribeState}`} role="status">{subscribeMessage}</p>
          )}
          <small>默认关注全部8家机构，可在下方精细选择。社媒与新闻仅作背景，不能推断实时仓位。</small>
        </form>
      </section>

      <section className="news-rail" aria-label="重要数据提示">
        <div className="news-rail__label">重要</div>
        <div className="news-item news-item--alert">
          <span>2026-07-30</span>
          <strong>Situational Awareness公开股票组合被报道已出售</strong>
        </div>
        <div className="news-item">
          <span>2025-11-10</span>
          <strong>Scion终止SEC投资顾问注册</strong>
        </div>
        <div className="news-item">
          <span>下一节点</span>
          <strong>2026 Q2 13F集中披露窗口</strong>
        </div>
      </section>

      <section className="institutions-section" id="institutions">
        <div className="section-heading">
          <div>
            <span className="eyebrow">TRACKED INSTITUTIONS</span>
            <h2>机构列表</h2>
            <p>按机构、基金经理、策略或股票代码检索，打开卡片查看全部披露持仓。</p>
          </div>
          <div className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索机构、基金经理或股票代码"
              aria-label="搜索机构、基金经理或股票代码"
            />
          </div>
        </div>

        <div className="filter-row">
          <div className="category-tabs" role="group" aria-label="按风格筛选">
            {categories.map((category) => (
              <button
                key={category}
                className={activeCategory === category ? "is-active" : ""}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <label className="sort-control">
            排序
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              <option value="value">披露市值</option>
              <option value="concentration">前五集中度</option>
              <option value="holdings">持仓数量</option>
            </select>
          </label>
        </div>

        <div className="fund-grid">
          {visibleFunds.map((fund) => {
            const rows = liveHoldings[fund.id];
            return (
              <article
                className="fund-card"
                key={fund.id}
                style={{ "--fund-accent": fund.accent } as React.CSSProperties}
              >
                <div className="fund-card__top">
                  <ManagerAvatar fund={fund} />
                  <div className="fund-card__identity">
                    <span>{fund.category} · {fund.location}</span>
                    <h3>{fund.nameZh}</h3>
                    <p>{fund.nameEn}</p>
                  </div>
                  <StatusBadge status={fund.status} />
                </div>

                <div className="manager-line">
                  <span>基金经理</span>
                  <strong>{fund.managerZh}</strong>
                  {fund.managerEn && <em>{fund.managerEn}</em>}
                </div>
                <span className="manager-tag">{fund.managerTag}</span>

                <p className="fund-card__summary">{fund.oneLiner}</p>

                <div className="manager-bio">
                  <span>人物小传</span>
                  <p>{fund.managerBio}</p>
                </div>

                <div className="card-kpis">
                  <div><span>13F市值</span><strong>${fund.valueBn.toFixed(1)}B</strong></div>
                  <div><span>持仓</span><strong>{fund.holdingCount}</strong></div>
                  <div><span>前五集中度</span><strong>{fund.top5.toFixed(1)}%</strong></div>
                </div>

                <TopHoldings rows={rows} accent={fund.accent} />

                <div className="fund-card__footer">
                  <span>{fund.period} · {fund.style}</span>
                  <button onClick={() => setSelectedFundId(fund.id)}>查看完整持仓 <span>↗</span></button>
                </div>
              </article>
            );
          })}
        </div>

        {!visibleFunds.length && (
          <div className="empty-state">
            <strong>没有找到匹配结果</strong>
            <span>试试股票代码，例如 AAPL、NVDA、AMZN。</span>
          </div>
        )}
      </section>

      <section className="compare-section" id="compare">
        <div className="section-heading section-heading--inverse">
          <div>
            <span className="eyebrow">PORTFOLIO COMPARISON</span>
            <h2>机构策略与组合集中度对比</h2>
            <p>比较各机构的核心策略、前五大持仓占比和披露持仓数量。</p>
          </div>
          <div className="comparison-key">
            <span><i className="key-dot key-dot--mint" /> 前五集中度</span>
            <span><i className="key-dot key-dot--slate" /> 持仓数量</span>
          </div>
        </div>

        <div className="strategy-board">
          <div className="strategy-table">
            <div className="strategy-table__head">
              <span>机构</span><span>核心风格</span><span>前五集中度</span><span>持仓数</span>
            </div>
            {liveFunds.map((fund) => (
              <button key={fund.id} onClick={() => setSelectedFundId(fund.id)}>
                <span className="strategy-name"><i style={{ background: fund.accent }} />{fund.nameZh}</span>
                <span>{fund.style}</span>
                <span className="strategy-bar">
                  <i style={{ width: `${fund.top5}%`, background: fund.accent }} />
                  <b>{fund.top5.toFixed(1)}%</b>
                </span>
                <span className="strategy-count">{fund.holdingCount}</span>
              </button>
            ))}
          </div>

          <aside className="reading-guide">
            <span className="eyebrow">使用说明</span>
            <h3>13F信息使用要点</h3>
            <ol>
              <li><b>伯克希尔</b><span>股票逻辑最适合长期研究，但13F不包含其经营业务。</span></li>
              <li><b>TCI／潘兴</b><span>集中持仓容易理解，股东行动和场外对冲需要补充研究。</span></li>
              <li><b>杜肯／阿特雷德斯</b><span>仓位轮动更快，季度快照容易过时。</span></li>
              <li><b>Scion／态势感知</b><span>期权、杠杆和对冲结构决定真实风险，不宜直接复制。</span></li>
            </ol>
          </aside>
        </div>
      </section>

      <section className="methodology-section" id="methodology">
        <div className="methodology-intro">
          <span className="eyebrow">13F DATA LIMITATIONS</span>
          <h2>13F数据范围与限制</h2>
          <p>持仓数据只读取SEC EDGAR原始申报及information table XML。机构官网、已确认的官方 X 账号，以及Reuters、Bloomberg、Financial Times、The Wall Street Journal、The New York Times、CNBC、Barron&apos;s等媒体仅列作近期公开背景，并与持仓变化严格分开。</p>
        </div>
        <div className="methodology-grid">
          <article><span>01</span><h3>有时间差</h3><p>机构最晚可在季度结束后45天申报。你看到的仓位，可能已经被调整。</p></article>
          <article><span>02</span><h3>只见部分资产</h3><p>主要覆盖特定美国上市证券；现金、债券、外汇、私募资产通常缺席。</p></article>
          <article><span>03</span><h3>看不见普通空头</h3><p>PUT会披露，但股票空仓及完整对冲腿通常不可见，不能只按方向判断。</p></article>
          <article><span>04</span><h3>期权价值易误读</h3><p>页面显示的是标的名义市值，不是期权费，也不等于基金承担的最大风险。</p></article>
        </div>
      </section>

      <section className="subscribe-section" id="subscribe">
        <div className="subscribe-copy">
          <span className="eyebrow">EMAIL ALERTS</span>
          <h2>订阅13F持仓更新</h2>
          <p>订阅后立即发送当前13F状态；新申报出现时发送持仓变化摘要，可信公开信源出现新动态时另发背景摘要，并附原始链接和日期。</p>
          <div className="alert-preview">
            <div className="alert-preview__head"><span>LONG / SHORT TRACKER · 更新摘要</span><em>示例</em></div>
            <strong>伯克希尔提交最新13F</strong>
            <ul>
              <li><span>新建仓</span><b>2项</b></li>
              <li><span>增持</span><b>4项</b></li>
              <li><span>清仓</span><b>1项</b></li>
            </ul>
          </div>
        </div>

        <form className="subscribe-form" onSubmit={submitSubscription}>
          <div className="subscribe-form__head">
            <span>01</span>
            <div><strong>选择关注机构</strong><p>默认订阅全部，可随时重新提交偏好。</p></div>
          </div>
          <div className="subscription-options">
            {funds.map((fund) => (
              <label key={fund.id}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(fund.id)}
                  onChange={() => toggleSubscription(fund.id)}
                />
                <span><i style={{ background: fund.accent }} />{fund.nameZh}</span>
              </label>
            ))}
          </div>

          <div className="subscribe-form__head subscribe-form__head--email">
            <span>02</span>
            <div><strong>接收邮箱</strong><p>接收SEC持仓更新与可信公开信源摘要。</p></div>
          </div>
          <label className="email-field">
            <span className="sr-only">邮箱地址</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
            />
            <button disabled={subscribeState === "sending" || selectedIds.length === 0}>
              {subscribeState === "sending" ? "正在订阅…" : "订阅机构更新"}
            </button>
          </label>
          {subscribeMessage && (
            <p className={`form-message form-message--${subscribeState}`} role="status">{subscribeMessage}</p>
          )}
          <p className="privacy-note">提交即表示同意接收持仓提醒。我们只保存邮箱和机构偏好，不出售个人信息。</p>
        </form>

        <details className="email-setup-guide">
          <summary>站点所有者：如何启用真实邮件发送</summary>
          <div>
            <ol>
              <li><strong>注册Resend</strong><span>使用邮箱登录Resend，在Domains页面添加你拥有的域名。</span></li>
              <li><strong>验证发件域名</strong><span>建议使用updates.你的域名这类专用子域名；把Resend给出的DKIM、SPF等DNS记录原样添加，等待状态变为Verified。</span></li>
              <li><strong>创建API Key</strong><span>在API Keys页面新建“13F-Holdings-Production”，选择Sending access和已验证域名；密钥只显示一次，请立即保存。</span></li>
              <li><strong>写入托管设置</strong><span>添加秘密变量RESEND_API_KEY；再添加ALERT_FROM_EMAIL，例如“LONG / SHORT TRACKER &lt;alerts@你的域名&gt;”。不要把密钥发送到聊天。</span></li>
            </ol>
            <p>
              <a href="https://resend.com/docs/dashboard/domains/introduction" target="_blank" rel="noreferrer">Resend域名验证指南 ↗</a>
              <a href="https://resend.com/docs/dashboard/api-keys/introduction" target="_blank" rel="noreferrer">Resend API Key指南 ↗</a>
            </p>
          </div>
        </details>
      </section>

      <footer className="site-footer">
        <div className="footer-brand">
          <span className="brand-mark">13F</span>
          <div><strong>LONG / SHORT TRACKER</strong><p>美国机构投资者持仓数据</p></div>
        </div>
        <div className="footer-note">
          <strong>免责声明</strong>
          <p>本站仅提供公开信息的中文整理与研究工具，不构成投资建议。13F存在延迟和披露范围限制。</p>
        </div>
        <div className="footer-links">
          <a href="https://www.sec.gov/edgar/search/" target="_blank" rel="noreferrer">SEC EDGAR</a>
          <a href="#methodology">数据方法</a>
          <a href="#subscribe">订阅提醒</a>
        </div>
        <div className="photo-credit">
          人物图片来源：机构官网、Wikimedia Commons及公开人物资料页，仅用于编辑性人物识别。Chris Hohn照片：
          <a href="https://commons.wikimedia.org/wiki/File:Chris_Hohn_GFSS_2023.jpg" target="_blank" rel="noreferrer">
            Simon Walker / No 10 Downing Street，CC BY 2.0
          </a>
          ；Seth Klarman照片：
          <a href="https://www.baupost.com/Team/Seth-A-Klarman" target="_blank" rel="noreferrer">The Baupost Group</a>。
        </div>
      </footer>

      {selectedFund && (
        <FundModal
          fund={selectedFund}
          rows={liveHoldings[selectedFund.id]}
          onClose={() => setSelectedFundId(null)}
        />
      )}
    </main>
  );
}
