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

const categories = ["??", ...Array.from(new Set(funds.map((fund) => fund.category)))];

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
  if (!value) return "?";
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function formatCheckedAt(value: string | null) {
  if (!value) return "??????";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "?????????";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function ManagerAvatar({ fund, large = false }: { fund: FundProfile; large?: boolean }) {
  const managerLabel = fund.managerEn ? `${fund.managerZh}?${fund.managerEn}?` : fund.managerZh;
  return (
    <div
      className={`manager-avatar ${large ? "manager-avatar--large" : ""}`}
      style={{ "--avatar-accent": fund.accent } as CSSProperties}
    >
      {fund.image ? (
        <img src={fund.image} alt={`${managerLabel}??`} />
      ) : (
        <span aria-label={`${fund.managerZh}??????`}>{initials(fund.managerEn || fund.managerZh)}</span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: FundProfile["status"] }) {
  const tone = status === "????" ? "live" : status === "??????" ? "alert" : "stale";
  return <span className={`status-badge status-badge--${tone}`}>{status}</span>;
}

function TopHoldings({ rows, accent }: { rows: Holding[]; accent: string }) {
  const top = rows.slice(0, 4);
  const max = Math.max(...top.map((row) => row.weight), 1);

  return (
    <div className="mini-holdings" aria-label="???????">
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
        <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="??????">
          ?
        </button>

        <div className="fund-modal__hero" style={{ "--fund-accent": fund.accent } as CSSProperties}>
          <ManagerAvatar fund={fund} large />
          <div>
            <div className="eyebrow">???? ? {fund.category}</div>
            <h2 id="fund-modal-title">{fund.nameZh}</h2>
            <p className="fund-modal__english">{fund.nameEn}</p>
            <div className="modal-manager">
              {fund.managerZh} {fund.managerEn && <span>{fund.managerEn}</span>} ? {fund.managerRole}
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
              <h3>????</h3>
              <p>{fund.managerBio}</p>
            </div>

            <div className="profile-stat-grid">
              <div>
                <span>????</span>
                <strong>${fund.valueBn.toFixed(1)}B</strong>
              </div>
              <div>
                <span>????</span>
                <strong>{fund.holdingCount}</strong>
              </div>
              <div>
                <span>?????</span>
                <strong>{fund.top5.toFixed(1)}%</strong>
              </div>
              <div>
                <span>????</span>
                <strong>{fund.risk}</strong>
              </div>
            </div>

            <div className="profile-block">
              <h3>????</h3>
              <ul>
                {fund.playbook.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="analyst-note">
              <span>????</span>
              <p>{fund.read13f}</p>
            </div>

            <div className="status-note">
              <span>????</span>
              <p>{fund.statusNote}</p>
            </div>

            <div className="source-links">
              <a href={fund.profileSource} target="_blank" rel="noreferrer">
                ??????? ?
              </a>
              <a href={fund.filingSource} target="_blank" rel="noreferrer">
                ????13F ?
              </a>
            </div>
          </aside>

          <div className="holdings-panel">
            <div className="holdings-panel__head">
              <div>
                <span className="eyebrow">??????</span>
                <h3>{fund.period} ? ? {rows.length} ?</h3>
              </div>
              <span className="data-stamp">??? {fund.filingDate}</span>
            </div>

            <div className="table-scroll" tabIndex={0} aria-label={`${fund.nameZh}???????????`}>
              <table className="holdings-table">
                <thead>
                  <tr>
                    <th>??</th>
                    <th>??</th>
                    <th>??</th>
                    <th>??</th>
                    <th>????</th>
                    <th>??</th>
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
                          {row.option ?? "??"}
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
  const [activeCategory, setActiveCategory] = useState("??");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("value");
  const [selectedFund, setSelectedFund] = useState<FundProfile | null>(null);
  const [liveHoldings, setLiveHoldings] = useState(initialHoldings);
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

  const visibleFunds = useMemo(() => {
    const query = search.trim().toLowerCase();
    return funds
      .filter((fund) => activeCategory === "??" || fund.category === activeCategory)
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
      if (!response.ok) throw new Error(payload.error ?? "??????????");
      setSubscribeState("success");
      setSubscribeMessage(payload.message ?? "?????????????????????? ");
      setEmail("");
    } catch (error) {
      setSubscribeState("error");
      setSubscribeMessage(error instanceof Error ? error.message : "??????????");
    }
  }

  return (
    <main>
      <div className="market-strip" aria-label="????">
        <span><i /> LONG / SHORT TRACKER ? SEC??????</span>
        <span>?????? 2026 Q1</span>
        <span>Q2???? 2026-08-14</span>
        <span>??? SEC EDGAR</span>
      </div>

      <header className="site-header">
        <a className="brand" href="#top" aria-label="LONG / SHORT TRACKER??">
          <span className="brand-mark">13F</span>
          <span>
            <strong>LONG / SHORT TRACKER</strong>
            <em>INSTITUTIONAL 13F DATA</em>
          </span>
        </a>
        <nav aria-label="???">
          <a href="#institutions">????</a>
          <a href="#compare">????</a>
          <a href="#methodology">????</a>
        </nav>
        <a className="header-cta" href="#subscribe">????</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>INSTITUTIONAL POSITION DATA</span> ? ??????</div>
          <h1>???????<br /><span>?????</span></h1>
          <p>
            ??8?????????SEC 13F????????????????????????????????
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#institutions">?????? <span>?</span></a>
            <a className="text-button" href="#methodology">???????</a>
          </div>
          <div className="hero-metrics">
            <div><strong>8</strong><span>??????</span></div>
            <div><strong>${totalValueBn.toFixed(1)}B</strong><span>??????</span></div>
            <div><strong>{totalHoldingRows}</strong><span>?????</span></div>
          </div>
        </div>

        <form className="hero-subscribe" onSubmit={submitSubscription}>
          <div className="hero-service-status" aria-label="??????">
            <span className={serviceStatus?.dataReady ? "is-ready" : "is-pending"}>
              <i /> ???? {serviceStatus?.dataReady ? "???" : "???"}
            </span>
            <span className={serviceStatus?.emailReady ? "is-ready" : "is-pending"}>
              <i /> ???? {serviceStatus?.emailReady ? "???" : "???"}
            </span>
            <span className={serviceStatus?.publicSignalsReady ? "is-ready" : "is-pending"}>
              <i /> ???? {serviceStatus?.publicSignalsReady ? "???" : "???"}
            </span>
            <small>?????{formatCheckedAt(serviceStatus?.lastRefreshAt ?? null)}</small>
          </div>
          <div className="hero-subscribe__kicker"><i /> ????????</div>
          <h2>??13F????</h2>
          <p>?????????13F???????????????? X???????????????</p>
          <label className="hero-email-field">
            <span className="sr-only">????</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="??????"
              autoComplete="email"
            />
            <button disabled={subscribeState === "sending" || selectedIds.length === 0}>
              {subscribeState === "sending" ? "????" : "??????"}
            </button>
          </label>
          {subscribeMessage && (
            <p className={`form-message form-message--${subscribeState}`} role="status">{subscribeMessage}</p>
          )}
          <small>??????8????????????????????????????????</small>
        </form>
      </section>

      <section className="news-rail" aria-label="??????">
        <div className="news-rail__label">??</div>
        <div className="news-item news-item--alert">
          <span>2026-07-30</span>
          <strong>Situational Awareness????????????</strong>
        </div>
        <div className="news-item">
          <span>2025-11-10</span>
          <strong>Scion??SEC??????</strong>
        </div>
        <div className="news-item">
          <span>????</span>
          <strong>2026 Q2 13F??????</strong>
        </div>
      </section>

      <section className="institutions-section" id="institutions">
        <div className="section-heading">
          <div>
            <span className="eyebrow">TRACKED INSTITUTIONS</span>
            <h2>????</h2>
            <p>????????????????????????????????</p>
          </div>
          <div className="search-box">
            <span aria-hidden="true">?</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="??????????????"
              aria-label="??????????????"
            />
          </div>
        </div>

        <div className="filter-row">
          <div className="category-tabs" role="group" aria-label="?????">
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
            ??
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              <option value="value">????</option>
              <option value="concentration">?????</option>
              <option value="holdings">????</option>
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
                    <span>{fund.category} ? {fund.location}</span>
                    <h3>{fund.nameZh}</h3>
                    <p>{fund.nameEn}</p>
                  </div>
                  <StatusBadge status={fund.status} />
                </div>

                <div className="manager-line">
                  <span>????</span>
                  <strong>{fund.managerZh}</strong>
                  {fund.managerEn && <em>{fund.managerEn}</em>}
                </div>
                <span className="manager-tag">{fund.managerTag}</span>

                <p className="fund-card__summary">{fund.oneLiner}</p>

                <div className="manager-bio">
                  <span>????</span>
                  <p>{fund.managerBio}</p>
                </div>

                <div className="card-kpis">
                  <div><span>13F??</span><strong>${fund.valueBn.toFixed(1)}B</strong></div>
                  <div><span>??</span><strong>{fund.holdingCount}</strong></div>
                  <div><span>?????</span><strong>{fund.top5.toFixed(1)}%</strong></div>
                </div>

                <TopHoldings rows={rows} accent={fund.accent} />

                <div className="fund-card__footer">
                  <span>{fund.period} ? {fund.style}</span>
                  <button onClick={() => setSelectedFund(fund)}>?????? <span>?</span></button>
                </div>
              </article>
            );
          })}
        </div>

        {!visibleFunds.length && (
          <div className="empty-state">
            <strong>????????</strong>
            <span>????????? AAPL?NVDA?AMZN?</span>
          </div>
        )}
      </section>

      <section className="compare-section" id="compare">
        <div className="section-heading section-heading--inverse">
          <div>
            <span className="eyebrow">PORTFOLIO COMPARISON</span>
            <h2>????????????</h2>
            <p>??????????????????????????</p>
          </div>
          <div className="comparison-key">
            <span><i className="key-dot key-dot--mint" /> ?????</span>
            <span><i className="key-dot key-dot--slate" /> ????</span>
          </div>
        </div>

        <div className="strategy-board">
          <div className="strategy-table">
            <div className="strategy-table__head">
              <span>??</span><span>????</span><span>?????</span><span>???</span>
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
            <span className="eyebrow">????</span>
            <h3>13F??????</h3>
            <ol>
              <li><b>????</b><span>?????????????13F?????????</span></li>
              <li><b>TCI???</b><span>?????????????????????????</span></li>
              <li><b>????????</b><span>????????????????</span></li>
              <li><b>Scion?????</b><span>????????????????????????</span></li>
            </ol>
          </aside>
        </div>
      </section>

      <section className="methodology-section" id="methodology">
        <div className="methodology-intro">
          <span className="eyebrow">13F DATA LIMITATIONS</span>
          <h2>13F???????</h2>
          <p>???????SEC EDGAR?????information table XML???????????? X ?????Reuters?Bloomberg?Financial Times?The Wall Street Journal?The New York Times?CNBC?Barron&apos;s????????????????????????</p>
        </div>
        <div className="methodology-grid">
          <article><span>01</span><h3>????</h3><p>???????????45???????????????????</p></article>
          <article><span>02</span><h3>??????</h3><p>???????????????????????????????</p></article>
          <article><span>03</span><h3>???????</h3><p>PUT??????????????????????????????</p></article>
          <article><span>04</span><h3>???????</h3><p>?????????????????????????????????</p></article>
        </div>
      </section>

      <section className="subscribe-section" id="subscribe">
        <div className="subscribe-copy">
          <span className="eyebrow">EMAIL ALERTS</span>
          <h2>??13F????</h2>
          <p>?????????13F???????????????????????????????????????????????</p>
          <div className="alert-preview">
            <div className="alert-preview__head"><span>LONG / SHORT TRACKER ? ????</span><em>??</em></div>
            <strong>????????13F</strong>
            <ul>
              <li><span>???</span><b>2?</b></li>
              <li><span>??</span><b>4?</b></li>
              <li><span>??</span><b>1?</b></li>
            </ul>
          </div>
        </div>

        <form className="subscribe-form" onSubmit={submitSubscription}>
          <div className="subscribe-form__head">
            <span>01</span>
            <div><strong>??????</strong><p>?????????????????</p></div>
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
            <div><strong>????</strong><p>??SEC??????????????</p></div>
          </div>
          <label className="email-field">
            <span className="sr-only">????</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
            />
            <button disabled={subscribeState === "sending" || selectedIds.length === 0}>
              {subscribeState === "sending" ? "?????" : "??????"}
            </button>
          </label>
          {subscribeMessage && (
            <p className={`form-message form-message--${subscribeState}`} role="status">{subscribeMessage}</p>
          )}
          <p className="privacy-note">???????????????????????????????????</p>
        </form>

        <details className="email-setup-guide">
          <summary>????????????????</summary>
          <div>
            <ol>
              <li><strong>??Resend</strong><span>??????Resend??Domains???????????</span></li>
              <li><strong>??????</strong><span>????updates.?????????????Resend???DKIM?SPF?DNS?????????????Verified?</span></li>
              <li><strong>??API Key</strong><span>?API Keys?????13F-Holdings-Production????Sending access?????????????????????</span></li>
              <li><strong>??????</strong><span>??????RESEND_API_KEY????ALERT_FROM_EMAIL????LONG / SHORT TRACKER &lt;alerts@????&gt;?????????????</span></li>
            </ol>
            <p>
              <a href="https://resend.com/docs/dashboard/domains/introduction" target="_blank" rel="noreferrer">Resend?????? ?</a>
              <a href="https://resend.com/docs/dashboard/api-keys/introduction" target="_blank" rel="noreferrer">Resend API Key?? ?</a>
            </p>
          </div>
        </details>
      </section>

      <footer className="site-footer">
        <div className="footer-brand">
          <span className="brand-mark">13F</span>
          <div><strong>LONG / SHORT TRACKER</strong><p>???????????</p></div>
        </div>
        <div className="footer-note">
          <strong>????</strong>
          <p>????????????????????????????13F????????????</p>
        </div>
        <div className="footer-links">
          <a href="https://www.sec.gov/edgar/search/" target="_blank" rel="noreferrer">SEC EDGAR</a>
          <a href="#methodology">????</a>
          <a href="#subscribe">????</a>
        </div>
        <div className="photo-credit">
          ????????????Wikimedia Commons????????????????????Chris Hohn???
          <a href="https://commons.wikimedia.org/wiki/File:Chris_Hohn_GFSS_2023.jpg" target="_blank" rel="noreferrer">
            Simon Walker / No 10 Downing Street?CC BY 2.0
          </a>
          ?Seth Klarman???
          <a href="https://www.baupost.com/Team/Seth-A-Klarman" target="_blank" rel="noreferrer">The Baupost Group</a>?
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
