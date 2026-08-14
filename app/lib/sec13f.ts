import type { FundProfile, Holding } from "../data/funds";

const MAX_SEC_DOCUMENT_BYTES = 8_000_000;
const SEC_USER_AGENT = "LongShortTracker/1.1 contact@vincenvan.cc";

const secHeaders = {
  accept: "application/json, application/xml, text/xml, text/plain",
  "accept-encoding": "gzip, deflate",
  "user-agent": SEC_USER_AGENT,
};

type FilingDirectoryItem = {
  name: string;
  size: number;
};

type RawHolding = Omit<Holding, "valueK" | "weight"> & {
  rawValue: number;
};

export const SEC_PARSER_VERSION = "sec-values-v2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readBoundedText(response: Response, maxBytes = MAX_SEC_DOCUMENT_BYTES) {
  if (!response.body) return "";
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`SEC文档超过${maxBytes}字节上限`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("document too large");
      throw new Error(`SEC文档超过${maxBytes}字节上限`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function decodeXml(value: string) {
  return value.replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (match, numeric, named) => {
    if (numeric) {
      const base = String(numeric).toLowerCase().startsWith("x") ? 16 : 10;
      const codePoint = Number.parseInt(String(numeric).replace(/^x/i, ""), base);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[String(named).toLowerCase()] ?? match;
  });
}

function tagValue(block: string, tag: string) {
  const expression = new RegExp(`<(?:(?:[A-Za-z0-9_-]+):)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[A-Za-z0-9_-]+):)?${tag}\\s*>`, "i");
  const match = block.match(expression);
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "").trim()) : "";
}

function referenceTicker(reference: Holding[], cusip: string, option: Holding["option"]) {
  return reference.find((row) => row.cusip === cusip && row.option === option)?.ticker
    ?? reference.find((row) => row.cusip === cusip && row.option === null)?.ticker
    ?? cusip;
}

function holdingKey(cusip: string, option: Holding["option"]) {
  return `${cusip}|${option ?? ""}`;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function valueDivisor(rows: RawHolding[], reference: Holding[]) {
  const referenceValues = new Map<string, number>();
  for (const row of reference) {
    const key = holdingKey(row.cusip, row.option);
    referenceValues.set(key, (referenceValues.get(key) ?? 0) + row.valueK);
  }

  const dollarScores: number[] = [];
  const legacyThousandScores: number[] = [];
  for (const row of rows) {
    const priorValueK = referenceValues.get(holdingKey(row.cusip, row.option));
    if (!priorValueK || priorValueK <= 0 || row.rawValue <= 0) continue;
    dollarScores.push(Math.abs(Math.log10((row.rawValue / 1_000) / priorValueK)));
    legacyThousandScores.push(Math.abs(Math.log10(row.rawValue / priorValueK)));
  }

  if (!dollarScores.length) return 1_000;
  return median(legacyThousandScores) + 0.75 < median(dollarScores) ? 1 : 1_000;
}

export function parseInformationTableXml(xml: string, tickerReference: Holding[] = []): Holding[] {
  const blocks = [...xml.matchAll(/<(?:(?:[A-Za-z0-9_-]+):)?infoTable(?:\s[^>]*)?>([\s\S]*?)<\/(?:(?:[A-Za-z0-9_-]+):)?infoTable\s*>/gi)];
  const aggregate = new Map<string, RawHolding>();

  for (const match of blocks) {
    const block = match[1];
    const issuer = tagValue(block, "nameOfIssuer") || "未知发行人";
    const titleClass = tagValue(block, "titleOfClass");
    const cusip = tagValue(block, "cusip");
    const rawValue = Number(tagValue(block, "value"));
    const rawAmount = Number(tagValue(block, "sshPrnamt"));
    const amountType = tagValue(block, "sshPrnamtType").toUpperCase();
    const rawOption = tagValue(block, "putCall").toUpperCase();
    const option: Holding["option"] = rawOption === "PUT" || rawOption === "CALL" ? rawOption : null;
    if (!cusip || !Number.isFinite(rawValue) || rawValue < 0) continue;

    const key = holdingKey(cusip, option);
    const shares = amountType === "SH" && Number.isFinite(rawAmount) ? rawAmount : null;
    const principal = amountType === "PRN" && Number.isFinite(rawAmount) ? rawAmount : null;
    const current = aggregate.get(key);
    if (current) {
      current.rawValue += rawValue;
      current.shares = current.shares === null ? shares : current.shares + (shares ?? 0);
      current.principal = current.principal === null ? principal : current.principal + (principal ?? 0);
      continue;
    }

    aggregate.set(key, {
      ticker: referenceTicker(tickerReference, cusip, option),
      issuer,
      class: titleClass,
      cusip,
      rawValue,
      shares,
      principal,
      option,
    });
  }

  const rawRows = [...aggregate.values()];
  const divisor = valueDivisor(rawRows, tickerReference);
  const rows = rawRows.map(({ rawValue, ...row }) => ({
    ...row,
    valueK: rawValue / divisor,
  }));
  const totalValueK = rows.reduce((sum, row) => sum + row.valueK, 0);
  return rows
    .map((row) => ({
      ...row,
      valueK: Math.round(row.valueK),
      weight: totalValueK > 0 ? (row.valueK / totalValueK) * 100 : 0,
    }))
    .sort((left, right) => right.valueK - left.valueK);
}

function parseDirectoryItems(value: unknown): FilingDirectoryItem[] {
  if (!isRecord(value) || !isRecord(value.directory) || !Array.isArray(value.directory.item)) return [];
  return value.directory.item.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.name !== "string") return [];
    const size = Number(entry.size ?? 0);
    return [{ name: entry.name, size: Number.isFinite(size) ? size : 0 }];
  });
}

function informationTableCandidates(items: FilingDirectoryItem[]) {
  return items
    .filter((item) => item.name.toLowerCase().endsWith(".xml") && item.name.toLowerCase() !== "primary_doc.xml")
    .sort((left, right) => {
      const leftPreferred = /info|table/i.test(left.name) ? 1 : 0;
      const rightPreferred = /info|table/i.test(right.name) ? 1 : 0;
      return rightPreferred - leftPreferred || right.size - left.size;
    })
    .slice(0, 6);
}

export async function fetchSecHoldingRows(fund: FundProfile, accession: string, tickerReference: Holding[]) {
  const cik = fund.cik.replace(/^0+/, "") || "0";
  const archiveBase = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}`;
  const indexResponse = await fetch(`${archiveBase}/index.json`, { headers: secHeaders });
  if (!indexResponse.ok) throw new Error(`SEC filing index ${indexResponse.status}`);
  const indexText = await readBoundedText(indexResponse, 1_000_000);
  let indexPayload: unknown;
  try {
    indexPayload = JSON.parse(indexText);
  } catch {
    throw new Error("SEC申报目录格式无效");
  }

  const candidates = informationTableCandidates(parseDirectoryItems(indexPayload));
  if (!candidates.length) throw new Error("SEC申报目录未找到information table XML");

  for (const candidate of candidates) {
    const response = await fetch(`${archiveBase}/${encodeURIComponent(candidate.name)}`, { headers: secHeaders });
    if (!response.ok) continue;
    const xml = await readBoundedText(response);
    const rows = parseInformationTableXml(xml, tickerReference);
    if (rows.length) return rows;
  }
  throw new Error("SEC information table未返回有效持仓");
}

export { secHeaders };
