import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const serverSource = readFileSync(new URL('../server/index.cjs', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../src/pages/ai-assistant.js', import.meta.url), 'utf8');

test('AI solution assistant prefers NVIDIA Kimi through the server', () => {
  assert.match(serverSource, /process\.env\.NVIDIA_API_KEY/, 'NVIDIA key must stay server-side');
  assert.match(serverSource, /https:\/\/integrate\.api\.nvidia\.com\/v1\/chat\/completions/, 'assistant should use NVIDIA integrate API');
  assert.match(serverSource, /moonshotai\/kimi-k2\.6/, 'Kimi K2.6 should be the default NVIDIA model');
  assert.match(serverSource, /response_format:\s*\{\s*type:\s*'json_object'\s*\}/, 'assistant should request structured JSON');
  assert.match(serverSource, /provider = nvidiaKey \? 'nvidia' : 'openrouter'/, 'OpenRouter should only be a fallback');
});

test('NVIDIA credential is not exposed in frontend code', () => {
  assert.doesNotMatch(clientSource, /NVIDIA_API_KEY|nvapi-/, 'browser bundle must never contain the NVIDIA credential');
});
