import type { FundProfile } from "../data/funds";
import { trustedMedia, type ResearchSourceProfile } from "../data/researchSources.ts";

type TrustedMediaFeed = { domain: string; name: string; url: string };

export type ParsedGdeltArticle = {
  url: string;
  title: string;
  domain: string;
  seenDate: string;
};

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos|nbsp);/gi, (match, numeric, named) => {
      if (numeric) {
        const base = String(numeric).toLowerCase().startsWith("x") ? 16 : 10;
        const codePoint = Number.parseInt(String(numeric).replace(/^x/i, ""), base);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }
      return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[String(named).toLowerCase()] ?? match;
    });
}

function rssTag(block: string, tag: string) {
  const expression = new RegExp(`<(?:(?:[A-Za-z0-9_-]+):)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[A-Za-z0-9_-]+):)?${tag}\\s*>`, "i");
  const match = block.match(expression);
  return match ? decodeXml(match[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cleanSignalTitle(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 280);
}

function domainMatches(hostname: string, domain: string) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return normalized === domain || normalized.endsWith(`.${domain}`);
}

export function sourceForDomain(hostname: string, profile: ResearchSourceProfile) {
  for (const source of profile.officialSources) {
    try {
      if (domainMatches(hostname, new URL(source.url).hostname.replace(/^www\./, ""))) {
        return { kind: "official" as const, sourceName: source.name };
      }
    } catch {
      // A malformed registry URL is ignored instead of weakening the allowlist.
    }
  }
  const media = trustedMedia.find((source) => domainMatches(hostname, source.domain));
  return media ? { kind: "media" as const, sourceName: media.name } : null;
}

function normalizedHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function parseGdeltDate(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseGdeltArticles(payload: unknown, profile: ResearchSourceProfile): ParsedGdeltArticle[] {
  if (!isRecord(payload) || !Array.isArray(payload.articles)) return [];
  const seen = new Set<string>();
  const articles: ParsedGdeltArticle[] = [];
  for (const entry of payload.articles) {
    if (!isRecord(entry) || typeof entry.url !== "string" || typeof entry.title !== "string") continue;
    const url = normalizedHttpUrl(entry.url);
    if (!url || seen.has(url)) continue;
    const parsed = new URL(url);
    if (!sourceForDomain(parsed.hostname, profile)) continue;
    const seenDate = typeof entry.seendate === "string" ? parseGdeltDate(entry.seendate) : null;
    const title = cleanSignalTitle(entry.title);
    if (!seenDate || !title) continue;
    seen.add(url);
    articles.push({ url, title, domain: parsed.hostname, seenDate });
  }
  return articles.slice(0, 250);
}

export function parseXPosts(payload: unknown, handle: string, fundId: FundProfile["id"]) {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
  return payload.data.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.text !== "string" || typeof entry.created_at !== "string") return [];
    const published = new Date(entry.created_at);
    const title = cleanSignalTitle(entry.text);
    if (Number.isNaN(published.getTime()) || !title) return [];
    return [{
      fundId,
      kind: "social" as const,
      sourceName: `@${handle}`,
      sourceUrl: `https://x.com/${encodeURIComponent(handle)}/status/${encodeURIComponent(entry.id)}`,
      title,
      publishedAt: published.toISOString(),
    }];
  }).slice(0, 6);
}

export function parseTrustedRss(xml: string, feed: TrustedMediaFeed): ParsedGdeltArticle[] {
  const cutoff = Date.now() - 8 * 24 * 60 * 60 * 1_000;
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/gi)];
  const seen = new Set<string>();
  return items.flatMap((match) => {
    const block = match[1];
    const title = cleanSignalTitle(rssTag(block, "title"));
    const link = rssTag(block, "link");
    const published = new Date(rssTag(block, "pubDate") || rssTag(block, "date"));
    if (!title || !link || Number.isNaN(published.getTime()) || published.getTime() < cutoff) return [];
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return [];
    }
    if (!domainMatches(url.hostname, feed.domain)) return [];
    url.hash = "";
    const normalized = url.toString();
    if (seen.has(normalized)) return [];
    seen.add(normalized);
    return [{
      url: normalized,
      title,
      domain: url.hostname,
      seenDate: published.toISOString(),
    }];
  }).slice(0, 60);
}
