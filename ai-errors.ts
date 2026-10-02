export function explainAiError(status: number, rawText: string): string {
  const text = String(rawText ?? "").trim();
  let message = "The AI request failed.";

  try {
    const parsed = JSON.parse(text);
    const candidate = parsed?.error?.message ?? parsed?.message ?? parsed?.error?.code;
    if (candidate) message = String(candidate);
  } catch {
    if (text) message = text;
  }

  const lower = message.toLowerCase();

  if (status === 402 || /insufficient balance|insufficient credits|not enough credits|credit balance/i.test(lower)) {
    return "Your AI account does not have enough credits. Add funds to the provider account or switch to a different funded API key.";
  }

  if (status === 401 || /invalid api key|api key expired|unauthorized|authentication/i.test(lower)) {
    return "Your AI API key is invalid or expired. Update the key in .env and try again.";
  }

  if (status === 429 || /rate limit|too many requests/i.test(lower)) {
    return "The AI provider rate limit was reached. Wait a minute and send your message again.";
  }

  if (status === 413 || /request too large/i.test(lower)) {
    return "This project is too large for the current AI plan. Try a smaller project or raise the token budget in .env.";
  }

  if (status >= 500 || /internal server error|bad gateway|service unavailable/i.test(lower)) {
    return "The AI provider is temporarily unavailable. Please try again in a moment.";
  }

  return message;
}

export function shouldFallbackToSecondaryProvider(status: number, rawText: string): boolean {
  const lower = explainAiError(status, rawText).toLowerCase();
  return (
    status === 402 ||
    status === 401 ||
    /insufficient balance|insufficient credits|not enough credits|invalid api key|expired|unauthorized/.test(lower)
  );
}
