import test from 'node:test';
import assert from 'node:assert/strict';
import { GET as health } from '../api/health.js';
import { POST } from '../api/v1/copilot.js';

test('returns structured validation errors without invoking a model', async () => {
  const request = new Request('https://fin.example/api/v1/copilot', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiVersion: '1.0', question: 'hi' }),
  });
  const response = await POST(request);
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error, 'INVALID_REQUEST');
  assert.equal(Array.isArray(body.fields), true);
});

test('rejects request bodies over the service limit', async () => {
  const request = new Request('https://fin.example/api/v1/copilot', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(257 * 1024) }),
  });
  const response = await POST(request);
  const body = await response.json();
  assert.equal(response.status, 413);
  assert.equal(body.offlineFallback, true);
});

test('health reports configuration without exposing credentials', async () => {
  const previousModel = process.env.AI_GATEWAY_MODEL;
  const previousKey = process.env.AI_GATEWAY_API_KEY;
  try {
    process.env.AI_GATEWAY_MODEL = 'openai/gpt-oss-20b';
    process.env.AI_GATEWAY_API_KEY = 'must-never-appear';
    const response = health(new Request('https://fin.example/api/health'));
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(text).gatewayAuthentication, 'gateway-key');
    assert.equal(text.includes('must-never-appear'), false);
  } finally {
    if (previousModel === undefined) delete process.env.AI_GATEWAY_MODEL;
    else process.env.AI_GATEWAY_MODEL = previousModel;
    if (previousKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previousKey;
  }
});

