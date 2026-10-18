/**
 * Short-lived signed tickets for the runtime proxy.
 *
 * The preview iframe cannot set request headers, and putting a Firebase token in
 * every asset URL is fragile and leaks credentials into logs. Instead the client
 * exchanges its ID token for a signed cookie scoped to /api/rt, which the browser
 * then attaches to every proxied request automatically.
 */
const enc = new TextEncoder();
export const COOKIE = "vexo_rt";
const TTL_MS = 30 * 60 * 1000;

async function hmacKey() {
  const secret = (
    process.env["RUNTIME_SECRET"] ??
    process.env["WIREFLOW_API_KEY"] ??
    process.env["DEEPSEEK_API_KEY"] ??
    "vexo-dev-secret"
  ).trim();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const unb64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function issueTicket(uid: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ u: uid, exp: Date.now() + TTL_MS })));
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(payload)),
  );
  return `${payload}.${b64url(sig)}`;
}

export async function verifyTicket(ticket: string | undefined | null): Promise<boolean> {
  if (!ticket) return false;
  const [payload, sig] = ticket.split(".");
  if (!payload || !sig) return false;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      unb64url(sig),
      enc.encode(payload),
    );
    if (!ok) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(unb64url(payload))) as { exp?: number };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m?.[1];
}

export function ticketCookie(ticket: string): string {
  const secure = process.env["NODE_ENV"] === "production" ? " Secure;" : "";
  return `${COOKIE}=${ticket}; Path=/api/rt; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000};${secure}`;
}
