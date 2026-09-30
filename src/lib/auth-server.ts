/**
 * Verifies a Firebase ID token from an Authorization header, or from a `t` query
 * parameter. The query form exists because an iframe cannot set request headers.
 */
export async function verifyUser(request: Request): Promise<boolean> {
  const token = (
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("t") ??
    ""
  ).trim();
  const key = (process.env["GOOGLE_API_KEY"] ?? "").trim();
  if (!token || !key) return false;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
