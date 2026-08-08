import type { PublicSignal } from "./publicSignals";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const MAX_INPUT_SIGNALS = 40;
const MAX_RESPONSE_BYTES = 500_000;

export type DeepSeekDigestItem = {
  signalId: string;
  titleZh: string;
  summaryZh: string;
  relevanceZh: string;
  materiality: "high" | "medium" | "low";
};

export type DeepSeekDigest = {
  provider: "deepseek";
  model: string;
  headlineZh: string;
  overviewZh: string;
  items: DeepSeekDigestItem[];
};

type DeepSeekRuntime = {
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function configuredBaseUrl(value?: string) {
  const url = new URL(value?.trim() || DEFAULT_BASE_URL);
  if (url.protocol !== "https:") throw new Error("DEEPSEEK_BASE_URL 必须使用 HTTPS");
  return url.toString().replace(/\/$/, "");
}

async function readBoundedText(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("DeepSeek 响应超过安全上限");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel("response too large");
      throw new Error("DeepSeek 响应超过安全上限");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function validateDigest(payload: unknown, signals: PublicSignal[], model: string): DeepSeekDigest {
  const root = asRecord(payload);
  if (!root) throw new Error("DeepSeek 返回的摘要不是 JSON 对象");

  const validIds = new Set(signals.map((signal) => signal.id));
  const items = (Array.isArray(root.items) ? root.items : [])
    .map(asRecord)
    .filter((item): item is JsonRecord => Boolean(item))
    .flatMap<DeepSeekDigestItem>((item) => {
      const signalId = cleanText(item.signalId, 128);
      if (!validIds.has(signalId)) return [];
      const titleZh = cleanText(item.titleZh, 120);
      const summaryZh = cleanText(item.summaryZh, 260);
      const relevanceZh = cleanText(item.relevanceZh, 180);
      const materiality = item.materiality === "high" || item.materiality === "medium" || item.materiality === "low"
        ? item.materiality
        : "low";
      if (!titleZh || !summaryZh) return [];
      return [{ signalId, titleZh, summaryZh, relevanceZh, materiality }];
    })
    .slice(0, MAX_INPUT_SIGNALS);

  if (!items.length) throw new Error("DeepSeek 摘要没有可验证的条目");
  return {
    provider: "deepseek",
    model,
    headlineZh: cleanText(root.headlineZh, 100) || "近期公开动态",
    overviewZh: cleanText(root.overviewZh, 400),
    items,
  };
}

export async function summarizePublicSignals(
  signals: PublicSignal[],
  runtime: DeepSeekRuntime,
  fetcher: typeof fetch = fetch,
): Promise<DeepSeekDigest | null> {
  const apiKey = runtime.DEEPSEEK_API_KEY?.trim();
  if (!apiKey || !signals.length) return null;

  const model = runtime.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
  const selectedSignals = [...signals]
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, MAX_INPUT_SIGNALS);
  const input = selectedSignals.map((signal) => ({
      signalId: signal.id,
      fundId: signal.fundId,
      kind: signal.kind,
      sourceName: signal.sourceName,
      title: signal.title,
      publishedAt: signal.publishedAt,
      sourceUrl: signal.sourceUrl,
    }));

  const response = await fetcher(`${configuredBaseUrl(runtime.DEEPSEEK_BASE_URL)}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      thinking: { type: "disabled" },
      temperature: 0.1,
      max_tokens: 2_000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "你是金融新闻编辑。只允许使用用户提供的标题、来源、日期与链接，不得补充外部事实，不得推断实时持仓、交易、空头规模或投资意图。13F是延迟披露数据。输出简体中文 json，保持克制、准确、可追溯。",
        },
        {
          role: "user",
          content: `请把以下公开资料整理为邮件摘要。返回 json，格式示例：{"headlineZh":"一句标题","overviewZh":"两句总览","items":[{"signalId":"必须原样引用输入ID","titleZh":"中文标题","summaryZh":"只概括标题明确表达的信息","relevanceZh":"与对应机构或经理的关系；无法判断时留空","materiality":"high|medium|low"}]}。每个条目必须引用一个输入 signalId，不得创造ID；不要把媒体报道写成SEC申报或实时交易。输入：${JSON.stringify(input)}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  const responseText = await readBoundedText(response);
  let payload: unknown;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    throw new Error(`DeepSeek 返回了无效 JSON（HTTP ${response.status}）`);
  }
  if (!response.ok) {
    const error = asRecord(asRecord(payload)?.error);
    throw new Error(cleanText(error?.message, 300) || `DeepSeek HTTP ${response.status}`);
  }

  const root = asRecord(payload);
  const choice = Array.isArray(root?.choices) ? root.choices[0] : null;
  const message = asRecord(asRecord(choice)?.message);
  const content = cleanText(message?.content, MAX_RESPONSE_BYTES);
  if (!content) throw new Error("DeepSeek 返回了空摘要");

  let digestPayload: unknown;
  try {
    digestPayload = JSON.parse(content);
  } catch {
    throw new Error("DeepSeek 摘要内容不是有效 JSON");
  }
  return validateDigest(digestPayload, selectedSignals, model);
}
