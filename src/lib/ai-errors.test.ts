import test from "node:test";
import assert from "node:assert/strict";
import { explainAiError, shouldFallbackToSecondaryProvider } from "./ai-errors.ts";
import { getConfiguredApiKey } from "./ai-config.ts";

test("explains insufficient balance clearly", () => {
  const message = explainAiError(
    402,
    JSON.stringify({ error: { message: "Insufficient Balance", request_id: "abc" } }),
  );
  assert.match(message, /balance|credits/i);
});

test("explains Gemini invalid API keys clearly", () => {
  const message = explainAiError(
    400,
    JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } }),
  );
  assert.match(message, /invalid or expired/i);
});

test("falls back when the primary provider is out of credits", () => {
  assert.equal(shouldFallbackToSecondaryProvider(402, "Insufficient Balance"), true);
  assert.equal(shouldFallbackToSecondaryProvider(429, "Too Many Requests"), false);
});

test("ignores placeholder and duplicated env values", () => {
  process.env["GEMINI_API_KEY"] = "GEMINI_API_KEY=your_gemini_api_key_here";
  assert.equal(getConfiguredApiKey("GEMINI_API_KEY"), "");

  process.env["GEMINI_API_KEY"] = "gemini-live-key";
  assert.equal(getConfiguredApiKey("GEMINI_API_KEY"), "gemini-live-key");

  delete process.env["GEMINI_API_KEY"];
});
