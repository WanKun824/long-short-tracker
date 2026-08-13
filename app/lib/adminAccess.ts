const ADMIN_COOKIE = "lst_admin_session";
const SESSION_SECONDS = 24 * 60 * 60;
const encoder = new TextEncoder();

function base64Url(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, encoder.encode(value));
}

function cookieValue(headers: Headers, name: string) {
  const cookie = headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function timingSafeEqual(left: ArrayBuffer | Uint8Array, right: ArrayBuffer | Uint8Array) {
  const a = left instanceof Uint8Array ? left : new Uint8Array(left);
  const b = right instanceof Uint8Array ? right : new Uint8Array(right);
  if (a.byteLength !== b.byteLength) return false;
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (first: ArrayBuffer | ArrayBufferView, second: ArrayBuffer | ArrayBufferView) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(a, b);
  }
  let difference = 0;
  for (let index = 0; index < a.byteLength; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function verifyAdminPassword(value: string, configuredPassword: string | undefined) {
  if (!configuredPassword || !value) return false;
  const [supplied, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(value)),
    crypto.subtle.digest("SHA-256", encoder.encode(configuredPassword)),
  ]);
  return timingSafeEqual(supplied, expected);
}

export async function createAdminSession(secret: string, now = Date.now()) {
  const payload = base64Url(encoder.encode(JSON.stringify({
    version: 1,
    issuedAt: now,
    expiresAt: now + SESSION_SECONDS * 1_000,
    nonce: crypto.randomUUID(),
  })));
  const signature = base64Url(await hmac(payload, secret));
  return `${payload}.${signature}`;
}

export async function isAdminRequest(headers: Headers, sessionSecret: string | undefined, now = Date.now()) {
  if (!sessionSecret) return false;
  const token = cookieValue(headers, ADMIN_COOKIE);
  if (!token) return false;
  const [payload, providedSignature, extra] = token.split(".");
  if (!payload || !providedSignature || extra) return false;

  try {
    const expectedSignature = new Uint8Array(await hmac(payload, sessionSecret));
    const suppliedSignature = fromBase64Url(providedSignature);
    if (expectedSignature.byteLength !== suppliedSignature.byteLength) return false;
    if (!timingSafeEqual(expectedSignature, suppliedSignature)) return false;

    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as {
      version?: number;
      issuedAt?: number;
      expiresAt?: number;
    };
    return parsed.version === 1
      && typeof parsed.issuedAt === "number"
      && typeof parsed.expiresAt === "number"
      && parsed.issuedAt <= now + 60_000
      && parsed.expiresAt > now;
  } catch {
    return false;
  }
}

export function adminSessionCookie(token: string) {
  return `${ADMIN_COOKIE}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearAdminSessionCookie() {
  return `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export async function loginAttemptKey(headers: Headers, secret: string, now = Date.now()) {
  const address = headers.get("cf-connecting-ip")?.trim() || "unknown";
  const window = Math.floor(now / (15 * 60 * 1_000));
  return base64Url(await hmac(`${address}:${window}`, secret));
}
