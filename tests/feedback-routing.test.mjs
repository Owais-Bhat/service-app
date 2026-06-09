import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const landingSource = readFileSync(new URL('../src/pages/landing.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server/index.cjs', import.meta.url), 'utf8');

test('feedback links survive a hosting SPA fallback', () => {
  assert.match(mainSource, /pathname\.startsWith\(['"]\/f\/['"]\)/, 'startup should recognize legacy /f/<token> links');
  assert.match(landingSource, /match\(\/\^\\\/f\\\/\(\[\^\/\?#\]\+\)\/\)/, 'landing page should extract a token from a legacy /f/<token> path');
});

test('new SMS feedback links use the explicit feedback route', () => {
  assert.match(
    serverSource,
    /\/feedback\?token=\$\{encodeURIComponent\(token\)\}/,
    'new feedback links should use /feedback?token=<token>'
  );
});

test('payment notifications never substitute the landing page for a missing feedback token', () => {
  assert.doesNotMatch(
    serverSource,
    /feedbackToken\s*\?\s*feedbackLinkFromToken\([^;]+:\s*publicBaseUrl/,
    'a missing token must not produce a homepage link'
  );
  assert.match(serverSource, /const becamePaid = data\.payment_status === 'paid'/, 'manual payments should detect the first paid transition');
  assert.match(serverSource, /if \(!alreadyPaid && inqRow\?\.phone\)/, 'gateway payments should send feedback only once');
  assert.match(serverSource, /const alreadyPaid = priorRows\[0\]\?\.payment_status === 'paid'/, 'webhook retries should detect an existing payment');
});
