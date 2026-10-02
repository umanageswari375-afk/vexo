const PLACEHOLDER_RE = /^(?:your_[a-z0-9_]+(?:_here)?|replace_with_.+|example|demo|placeholder|changeme|dummy|mock|test(?:_[a-z0-9_]+)?|sk-test(?:_[a-z0-9]+)?|api[_-]?key[_-]?here)$/i;

export function normalizeConfiguredKey(raw?: string): string {
  const value = (raw ?? "").trim();
  if (!value) return "";

  const cleaned = value.replace(/^(?:[A-Z_][A-Z0-9_]*=\s*)+/g, "").trim();
  if (!cleaned || PLACEHOLDER_RE.test(cleaned)) return "";

  return cleaned;
}

export function getConfiguredApiKey(name: string): string {
  return normalizeConfiguredKey(process.env[name]);
}
