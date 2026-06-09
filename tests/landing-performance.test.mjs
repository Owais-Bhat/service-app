import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const landingSource = readFileSync(new URL('../src/pages/landing.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server/index.cjs', import.meta.url), 'utf8');

test('landing page renders immediately and refreshes one bootstrap request in the background', () => {
  assert.match(landingSource, /adsLoading:\s*false/, 'ads must not block the public portal');
  assert.match(landingSource, /fetch\(`\$\{API_URL\}\/landing\/bootstrap`\)/, 'landing data should use one bootstrap request');
  assert.doesNotMatch(landingSource, /fetch\(`\$\{API_URL\}\/settings\/popup`\)/, 'popup settings should be included in bootstrap');
  assert.doesNotMatch(landingSource, /supabase\.from\('ads'\)/, 'landing should not make a separate ads query');
  assert.doesNotMatch(landingSource, /supabase\.from\('service_pricing'\)/, 'landing should not make a separate pricing query');
});

test('landing bootstrap supports memory cache and optional Redis with invalidation', () => {
  assert.match(serverSource, /process\.env\.REDIS_URL/, 'Redis should be opt-in through REDIS_URL');
  assert.match(serverSource, /app\.get\('\/api\/landing\/bootstrap'/, 'server should expose the combined bootstrap endpoint');
  assert.match(serverSource, /stale-while-revalidate=300/, 'browser/CDN should be allowed to serve stale bootstrap data');
  assert.match(serverSource, /if \(table === 'ads' \|\| table === 'service_pricing'\) invalidateLandingBootstrap\(\)/, 'content writes should invalidate cache');
});
