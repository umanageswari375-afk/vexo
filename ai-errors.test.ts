import test from 'node:test';
import assert from 'node:assert/strict';
import { explainAiError, shouldFallbackToSecondaryProvider } from './ai-errors.ts';
import { getConfiguredApiKey } from './ai-config.ts';

test('explains insufficient balance clearly', () => {
  const message = explainAiError(402, JSON.stringify({ error: { message: 'Insufficient Balance', request_id: 'abc' } }));
  assert.match(message, /balance|credits/i);
});

test('falls back when the primary provider is out of credits', () => {
  assert.equal(
    shouldFallbackToSecondaryProvider(402, 'Insufficient Balance'),
    true,
  );
  assert.equal(
    shouldFallbackToSecondaryProvider(429, 'Too Many Requests'),
    false,
  );
});

test('ignores placeholder and duplicated env values', () => {
  process.env.OPENAI_API_KEY = 'OPENAI_API_KEY=your_openai_key_here';
  assert.equal(getConfiguredApiKey('OPENAI_API_KEY'), '');

  process.env.OPENAI_API_KEY = 'sk-live-real-key';
  assert.equal(getConfiguredApiKey('OPENAI_API_KEY'), 'sk-live-real-key');

  delete process.env.OPENAI_API_KEY;
});
