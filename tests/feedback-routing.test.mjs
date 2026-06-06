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
