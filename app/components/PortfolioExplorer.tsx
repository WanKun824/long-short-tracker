"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  funds,
  holdings as initialHoldings,
  totalHoldingRows,
  totalValueBn,
  type FundProfile,
  type Holding,
} from "../data/funds";

type SortMode = "value" | "concentration" | "holdings";
type DynamicPayload = {
  holdings?: Partial<Record<FundProfile["id"], Holding[]>>;
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

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function ManagerAvatar({ fund, large = false }: { fund: FundProfile; large?: boolean }) {
  return (
    <div
      className={`manager-avatar ${large ? "manager-avatar--large" : ""}`}
      style={{ "--avatar-accent": fund.accent } as CSSProperties}
    >
      {fund.image ? (
        <img src={fund.image} alt={`${fund.managerZh}（${fund.managerEn}）头像`} />
      ) : (
        <span aria-label={`${fund.managerZh}姓名缩写头像`}>{initials(fund.managerEn)}</span>
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
              {fund.managerZh} <span>{fund.managerEn}</span> · {fund.managerRole}
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
  const [selectedFund, setSelectedFund] = useState<FundProfile | null>(null);
  const [liveHoldings, setLiveHoldings] = useState(initialHoldings);
  const [email, setEmail] = useState("");
  const [selectedIds, setSelectedIds] = useState<FundProfile["id"][]>(funds.map((fund) => fund.id));
  const [subscribeState, setSubscribeState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [subscribeMessage, setSubscribeMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        await fetch("/api/refresh", { method: "POST", headers: { "x-site-heartbeat": "1" } });
        const response = await fetch("/api/holdings", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as DynamicPayload;
        if (!cancelled && payload.holdings && Object.keys(payload.holdings).length) {
          setLiveHoldings((current) => ({ ...current, ...payload.holdings }));
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

  const visibleFunds = useMemo(() => {
    const query = search.trim().toLowerCase();
    return funds
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
  }, [activeCategory, liveHoldings, search, sortMode]);

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
        <span><i /> 数据源 SEC EDGAR</span>
        <span>最新完整季度 2026 Q1</span>
        <span>Q2申报截止 2026-08-14</span>
        <span>13F数据延迟约45天</span>
      </div>

      <header className="site-header">
        <a className="brand" href="#top" aria-label="持仓镜首页">
          <span className="brand-mark">持</span>
          <span>
            <strong>持仓镜</strong>
            <em>HOLDINGS LENS</em>
          </span>
        </a>
        <nav aria-label="主导航">
          <a href="#institutions">机构追踪</a>
          <a href="#compare">策略图谱</a>
          <a href="#methodology">数据说明</a>
        </nav>
        <a className="header-cta" href="#subscribe">订阅变动提醒</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>13F INTELLIGENCE</span> · 面向中国投资者</div>
          <h1>看懂全球顶级资本<br />的每一次<span>下注</span></h1>
          <p>
            用中文拆解八家传奇投资机构的最新持仓、投资方法与风险。不是简单抄作业，而是读懂它们为什么这样配置。
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#institutions">浏览机构持仓 <span>↘</span></a>
            <a className="text-button" href="#methodology">13F应该怎么看？</a>
          </div>
          <div className="hero-metrics">
            <div><strong>8</strong><span>家代表性机构</span></div>
            <div><strong>${totalValueBn.toFixed(1)}B</strong><span>披露证券市值</span></div>
            <div><strong>{totalHoldingRows}</strong><span>项持仓记录</span></div>
          </div>
        </div>

        <div className="hero-terminal" aria-label="机构持仓摘要">
          <div className="terminal-head">
            <span>机构观察台</span>
            <span className="live-pill"><i /> 已同步</span>
          </div>
          <div className="terminal-feature">
            <span>最大公开证券组合</span>
            <strong>伯克希尔·哈撒韦</strong>
            <div>
              <b>$263.1B</b>
              <em>29项披露仓位</em>
            </div>
          </div>
          <div className="terminal-grid">
            {funds.slice(0, 6).map((fund, index) => (
              <button key={fund.id} onClick={() => setSelectedFund(fund)}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{fund.nameZh}</strong>
                <em>{fund.category}</em>
                <i style={{ width: `${Math.max(24, fund.top5)}%`, background: fund.accent }} />
              </button>
            ))}
          </div>
          <div className="terminal-foot">
            <span>集中度不是风险的全部</span>
            <b>结合期权 · 空头 · 私募资产阅读</b>
          </div>
        </div>
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
            <span className="eyebrow">INSTITUTION WATCHLIST</span>
            <h2>机构持仓观察名单</h2>
            <p>按机构、经理、风格或股票代码检索；打开卡片可查看全部披露持仓。</p>
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
                  <em>{fund.managerEn}</em>
                </div>

                <p className="fund-card__summary">{fund.oneLiner}</p>

                <div className="card-kpis">
                  <div><span>13F市值</span><strong>${fund.valueBn.toFixed(1)}B</strong></div>
                  <div><span>持仓</span><strong>{fund.holdingCount}</strong></div>
                  <div><span>前五集中度</span><strong>{fund.top5.toFixed(1)}%</strong></div>
                </div>

                <TopHoldings rows={rows} accent={fund.accent} />

                <div className="fund-card__footer">
                  <span>{fund.period} · {fund.style}</span>
                  <button onClick={() => setSelectedFund(fund)}>查看完整持仓 <span>↗</span></button>
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
            <span className="eyebrow">STRATEGY MAP</span>
            <h2>同样是“名家持仓”，底层方法完全不同</h2>
            <p>横向比较组合集中度与披露持仓数量，先识别策略，再判断某一笔交易的意义。</p>
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
            {funds.map((fund) => (
              <button key={fund.id} onClick={() => setSelectedFund(fund)}>
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
            <span className="eyebrow">快速理解</span>
            <h3>从“可模仿”到“不可照抄”</h3>
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
          <span className="eyebrow">HOW TO READ 13F</span>
          <h2>13F是一张延迟的X光片，<br />不是完整交易账户。</h2>
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
          <span className="eyebrow">PORTFOLIO ALERTS</span>
          <h2>不必每天刷新，<br />持仓变化主动找你。</h2>
          <p>新13F或重大公开变动出现时，发送中文摘要：新建仓、增减持、清仓与集中度变化。</p>
          <div className="alert-preview">
            <div className="alert-preview__head"><span>持仓镜 · 变动快报</span><em>示例</em></div>
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
            <div><strong>接收邮箱</strong><p>只发送持仓更新与重要状态变化。</p></div>
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
              {subscribeState === "sending" ? "正在订阅…" : "订阅持仓变动"}
            </button>
          </label>
          {subscribeMessage && (
            <p className={`form-message form-message--${subscribeState}`} role="status">{subscribeMessage}</p>
          )}
          <p className="privacy-note">提交即表示同意接收持仓提醒。我们只保存邮箱和机构偏好，不出售个人信息。</p>
        </form>
      </section>

      <footer className="site-footer">
        <div className="footer-brand">
          <span className="brand-mark">持</span>
          <div><strong>持仓镜</strong><p>让机构持仓研究更清晰、更诚实。</p></div>
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
          人物图片来源：机构官网、Wikimedia Commons及公开人物资料页；仅用于编辑性人物识别。
        </div>
      </footer>

      {selectedFund && (
        <FundModal
          fund={selectedFund}
          rows={liveHoldings[selectedFund.id]}
          onClose={() => setSelectedFund(null)}
        />
      )}
    </main>
  );
}
