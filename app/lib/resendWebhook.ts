const encoder = new TextEncoder();
function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export async function verifyResendWebhook(body: string, headers: Headers, secret: string, now = Date.now()) {
  try {
    const id = headers.get("svix-id");
    const timestamp = headers.get("svix-timestamp");
    if (!id || !timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
    const key = await crypto.subtle.importKey("raw", decodeBase64(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const signatures = (headers.get("svix-signature") ?? "").split(" ").slice(0, 5);
    for (const signature of signatures) {
      const [version, value] = signature.split(",");
      if (version === "v1" && value && await crypto.subtle.verify("HMAC", key, decodeBase64(value), encoder.encode(`${id}.${timestamp}.${body}`))) return true;
    }
  } catch { return false; }
  return false;
}
