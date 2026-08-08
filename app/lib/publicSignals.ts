import { ensureDbSchema, getD1, getRuntimeEnv } from "../../db";
import { funds, type FundProfile } from "../data/funds";
import { researchSources, trustedMedia, trustedMediaFeeds, type ResearchSourceProfile } from "../data/researchSources";
import { parseGdeltArticles, parseTrustedRss, parseXPosts, sourceForDomain, type ParsedGdeltArticle } from "./publicSignalParsers";

export type PublicSignal = {
  id: string;
  fundId: FundProfile["id"];
  kind: "official" | "social" | "media";
  sourceName: string;
  sourceUrl: string;
  title: string;
  publishedAt: string;
  discoveredAt: string;
};

type SignalRefreshError = {
  fundId: FundProfile["id"];
  sources: string[];
  errorStreak: number;
};

type SourceFetchResult = {
  signals: Omit<PublicSignal, "id" | "discoveredAt">[];
  errors: string[];
  successfulSources: number;
  xStatus: "checked" | "not_configured" | "error" | "not_applicable";
};

const SIGNAL_WINDOW_DAYS = 7;
const MAX_GDELT_BYTES = 2_000_000;

async function readBoundedResponse(response: Response, maxBytes: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("response too large");
      throw new Error("信源响应超过安全上限");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function readBoundedJson(response: Response, maxBytes: number) {
  try {
    return JSON.parse(await readBoundedResponse(response, maxBytes)) as unknown;
  } catch {
    throw new Error("信源返回了无效JSON");
  }
}

async function fetchTrustedMediaFeeds() {
  const results = await Promise.allSettled(trustedMediaFeeds.map(async (feed) => {
    const response = await fetch(feed.url, { headers: { accept: "application/rss+xml, application/xml, text/xml" } });
    if (!response.ok) throw new Error(`${feed.name} RSS ${response.status}`);
    const xml = await readBoundedResponse(response, MAX_GDELT_BYTES);
    return parseTrustedRss(xml, feed);
  }));
  const articles = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const failures = results.flatMap((result) => result.status === "rejected"
    ? [result.reason instanceof Error ? result.reason.message : "RSS读取失败"]
    : []);
  return { articles, successfulFeeds: results.length - failures.length, failures };
}

function quotedTerm(term: string) {
  return `"${term.replaceAll('"', "")}"`;
}

async function fetchGdeltCorpus() {
  const allOfficialSources = researchSources.flatMap((profile) => profile.officialSources);
  const allSearchTerms = [...new Set(researchSources.flatMap((profile) => profile.searchTerms))];
  const officialDomains = allOfficialSources.flatMap((source) => {
    try {
      return [new URL(source.url).hostname.replace(/^www\./, "")];
    } catch {
      return [];
    }
  });
  const domains = [...new Set([...trustedMedia.map((source) => source.domain), ...officialDomains])];
  const query = `(${allSearchTerms.map(quotedTerm).join(" OR ")}) (${domains.map((domain) => `domain:${domain}`).join(" OR ")}) sourcelang:english`;
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("maxrecords", "250");
  url.searchParams.set("format", "json");
  url.searchParams.set("sort", "datedesc");
  url.searchParams.set("timespan", `${SIGNAL_WINDOW_DAYS}d`);

  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`GDELT ${response.status}`);
  const payload = await readBoundedJson(response, MAX_GDELT_BYTES);
  return parseGdeltArticles(payload, {
    fundId: "situational-awareness",
    searchTerms: allSearchTerms,
    officialSources: allOfficialSources,
  });
}

function mediaSignalsForProfile(profile: ResearchSourceProfile, articles: ParsedGdeltArticle[]) {
  const relevant = articles.filter((article) => {
    const title = article.title.toLowerCase();
    return profile.searchTerms.some((term) => title.includes(term.toLowerCase()));
  });
  return relevant.slice(0, 8).map((article) => {
    const source = sourceForDomain(article.domain, profile);
    return {
      fundId: profile.fundId,
      kind: source?.kind ?? ("media" as const),
      sourceName: source?.sourceName ?? article.domain,
      sourceUrl: article.url,
      title: article.title,
      publishedAt: article.seenDate,
    };
  });
}

async function fetchXSignals(profile: ResearchSourceProfile, bearerToken: string) {
  if (!profile.officialXHandle) return [];
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", `from:${profile.officialXHandle} -is:retweet -is:reply`);
  url.searchParams.set("tweet.fields", "created_at");
  url.searchParams.set("max_results", "10");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${bearerToken}`, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`X API ${response.status}`);
  const payload = await readBoundedJson(response, 1_000_000);
  return parseXPosts(payload, profile.officialXHandle, profile.fundId);
}

async function fetchSources(
  profile: ResearchSourceProfile,
  mediaCorpus: ParsedGdeltArticle[] | null,
  mediaError: string | null,
): Promise<SourceFetchResult> {
  const runtime = getRuntimeEnv();
  const signals: SourceFetchResult["signals"] = [];
  const errors: string[] = [];
  let successfulSources = 0;
  let xStatus: SourceFetchResult["xStatus"] = profile.officialXHandle ? "not_configured" : "not_applicable";

  if (mediaCorpus) {
    signals.push(...mediaSignalsForProfile(profile, mediaCorpus));
    successfulSources += 1;
  } else if (mediaError) {
    errors.push(mediaError);
  }

  if (profile.officialXHandle && runtime.X_BEARER_TOKEN) {
    try {
      signals.push(...await fetchXSignals(profile, runtime.X_BEARER_TOKEN));
      successfulSources += 1;
      xStatus = "checked";
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : "X读取失败");
      xStatus = "error";
    }
  }

  return { signals, errors, successfulSources, xStatus };
}

async function signalId(signal: Omit<PublicSignal, "id" | "discoveredAt">) {
  const input = new TextEncoder().encode(`${signal.fundId}|${signal.sourceUrl}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function stateValue(key: string) {
  return getD1().prepare("SELECT value FROM system_state WHERE key = ?").bind(key).first<{ value: string }>();
}

async function setState(key: string, value: string) {
  await getD1().prepare(`INSERT INTO system_state (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).bind(key, value).run();
}

async function storeSignals(profile: ResearchSourceProfile, fetched: SourceFetchResult, checkedAt: string) {
  const db = getD1();
  const seededKey = `signals_seeded:${profile.fundId}`;
  const streakKey = `signals_error_streak:${profile.fundId}`;
  const wasSeeded = Boolean(await stateValue(seededKey));
  const priorStreak = Number((await stateValue(streakKey))?.value ?? 0);
  const errorStreak = fetched.errors.length ? priorStreak + 1 : 0;
  await setState(streakKey, String(errorStreak));

  const uniqueSignals = new Map<string, PublicSignal>();
  for (const signal of fetched.signals) {
    const id = await signalId(signal);
    uniqueSignals.set(id, { ...signal, id, discoveredAt: checkedAt });
  }

  const signals = [...uniqueSignals.values()];
  let inserted = 0;
  const insertedSignals: PublicSignal[] = [];
  for (const signal of signals) {
    const result = await db.prepare(`INSERT OR IGNORE INTO public_signals
      (id, fund_id, kind, source_name, source_url, title, published_at, discovered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(signal.id, signal.fundId, signal.kind, signal.sourceName, signal.sourceUrl, signal.title, signal.publishedAt, signal.discoveredAt)
      .run();
    if (Number(result.meta.changes ?? 0) > 0) {
      inserted += 1;
      insertedSignals.push(signal);
    }
  }

  if (fetched.successfulSources > 0 && !wasSeeded) await setState(seededKey, checkedAt);
  return {
    newSignals: wasSeeded ? insertedSignals : [],
    baselineCount: wasSeeded ? 0 : inserted,
    error: fetched.errors.length ? { fundId: profile.fundId, sources: fetched.errors, errorStreak } satisfies SignalRefreshError : null,
  };
}

export async function refreshPublicSignals(checkedAt: string) {
  await ensureDbSchema();
  let gdeltCorpus: ParsedGdeltArticle[] | null = null;
  let gdeltError: string | null = null;
  const [gdeltResult, directFeedResult] = await Promise.allSettled([fetchGdeltCorpus(), fetchTrustedMediaFeeds()]);
  if (gdeltResult.status === "fulfilled") gdeltCorpus = gdeltResult.value;
  else gdeltError = gdeltResult.reason instanceof Error ? gdeltResult.reason.message : "GDELT读取失败";

  const directFeeds = directFeedResult.status === "fulfilled"
    ? directFeedResult.value
    : { articles: [], successfulFeeds: 0, failures: [directFeedResult.reason instanceof Error ? directFeedResult.reason.message : "RSS读取失败"] };
  const mediaCorpus = [...(gdeltCorpus ?? []), ...directFeeds.articles];
  const uniqueMedia = new Map(mediaCorpus.map((article) => [article.url, article]));
  const mediaAvailable = gdeltCorpus !== null || directFeeds.successfulFeeds > 0;
  const mediaError = mediaAvailable
    ? null
    : [gdeltError, ...directFeeds.failures].filter(Boolean).join("; ") || "财经信源读取失败";
  const fetched = await Promise.all(researchSources.map(async (profile) => ({
    profile,
    result: await fetchSources(profile, mediaAvailable ? [...uniqueMedia.values()] : null, mediaError),
  })));
  const newSignals: PublicSignal[] = [];
  const errors: SignalRefreshError[] = [];
  let baselineCount = 0;
  const xStatuses: SourceFetchResult["xStatus"][] = [];

  for (const item of fetched) {
    const stored = await storeSignals(item.profile, item.result, checkedAt);
    newSignals.push(...stored.newSignals);
    baselineCount += stored.baselineCount;
    if (stored.error) errors.push(stored.error);
    xStatuses.push(item.result.xStatus);
  }

  return {
    checkedFunds: funds.length,
    newSignals,
    newCount: newSignals.length,
    baselineCount,
    errors,
    xStatus: xStatuses.includes("error")
      ? "partial_error"
      : xStatuses.includes("checked")
        ? "checked"
        : "not_configured",
    mediaStatus: gdeltCorpus !== null && directFeeds.successfulFeeds > 0
      ? "gdelt_and_direct_feeds"
      : directFeeds.successfulFeeds > 0
        ? "direct_feeds"
        : gdeltCorpus !== null
          ? "gdelt"
          : "error",
    directFeedCount: directFeeds.successfulFeeds,
    gdeltStatus: gdeltCorpus !== null ? "checked" : gdeltError ?? "error",
  } as const;
}

export async function latestPublicSignals(fundIds: FundProfile["id"][], limitPerFund = 2) {
  await ensureDbSchema();
  const db = getD1();
  const output = new Map<FundProfile["id"], PublicSignal[]>();
  for (const fundId of fundIds) {
    const result = await db.prepare(`SELECT id, fund_id, kind, source_name, source_url, title, published_at, discovered_at
      FROM public_signals WHERE fund_id = ? ORDER BY datetime(published_at) DESC LIMIT ?`)
      .bind(fundId, limitPerFund)
      .all<{
        id: string; fund_id: FundProfile["id"]; kind: PublicSignal["kind"]; source_name: string;
        source_url: string; title: string; published_at: string; discovered_at: string;
      }>();
    output.set(fundId, result.results.map((row) => ({
      id: row.id,
      fundId: row.fund_id,
      kind: row.kind,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      title: row.title,
      publishedAt: row.published_at,
      discoveredAt: row.discovered_at,
    })));
  }
  return output;
}

export function officialSourcesForFund(fundId: FundProfile["id"]) {
  return researchSources.find((profile) => profile.fundId === fundId)?.officialSources ?? [];
}
