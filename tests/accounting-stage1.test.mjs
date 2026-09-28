// Stage 1 acceptance tests: masters, the ledger and the permission wall.
//
// These run against a running API on 127.0.0.1:5000 and the local test
// database. When either is absent the suite skips rather than fails, so
// `npm test` stays honest on a machine without a database.
//
//   node --test tests/accounting-stage1.test.mjs
//
// Every row this file creates is removed again at the end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const API = 'http://127.0.0.1:5000/api';

let mysql; let jwt; let db; let tokens; let reachable = false;
const made = { parties: [], journals: [], accounts: [], locks: [] };

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/accounting/capabilities`).catch(() => null);
  reachable = !!probe && probe.status === 401; // the route exists and wants a token
  if (reachable) {
    db = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER,
      password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    const [[emp]] = await db.query("SELECT id FROM profiles WHERE role = 'employee' LIMIT 1");
    const sign = (id, role) => jwt.sign(
      { id, email: `${role}@test.local`, role, worker_type: 'fixed' },
      process.env.JWT_SECRET, { expiresIn: '1h' }
    );
    tokens = { admin: sign(admin.id, 'admin'), employee: sign(emp.id, 'employee'), adminId: admin.id };
  }
} catch {
  reachable = false;
}

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';

const call = async (method, path, body, who = 'admin') => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const gstinFor = (stateCode) => {
  const { gstinCheckDigit } = require('../server/modules/gst.cjs');
  const first14 = `${stateCode}ABCDE1234F1Z`;
  return first14 + gstinCheckDigit(first14);
};

test('the ledger refuses an unbalanced journal', { skip }, async () => {
  const accounts = (await call('GET', '/accounting/accounts')).body;
  const cash = accounts.find((a) => a.code === '1000');
  const sales = accounts.find((a) => a.code === '4010');

  const bad = await call('POST', '/accounting/journals', {
    date: '2026-09-01',
    narration: 'ZZ test — deliberately lopsided',
    lines: [
      { account_id: cash.id, debit: '100.00' },
      { account_id: sales.id, credit: '90.00' },
    ],
  });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.code, 'unbalanced');

  const oneSided = await call('POST', '/accounting/journals', {
    date: '2026-09-01',
    lines: [{ account_id: cash.id, debit: '100.00' }],
  });
  assert.equal(oneSided.status, 422);
  assert.equal(oneSided.body.code, 'too_few_lines');
});

test('a balanced journal posts, and the same idempotency key never posts twice', { skip }, async () => {
  const accounts = (await call('GET', '/accounting/accounts')).body;
  const cash = accounts.find((a) => a.code === '1000');
  const sales = accounts.find((a) => a.code === '4010');
  const key = `zz-test-${randomUUID()}`;

  const entry = {
    date: '2026-09-02',
    narration: 'ZZ test — cash sale',
    idempotency_key: key,
    lines: [
      { account_id: cash.id, debit: '1180.00' },
      { account_id: sales.id, credit: '1180.00' },
    ],
  };

  const first = await call('POST', '/accounting/journals', entry);
  assert.equal(first.status, 201);
  assert.equal(Number(first.body.total_paise), 118000);
  made.journals.push(first.body.id);

  // A retried request — a double click, a flaky connection — must not double the books.
  const retry = await call('POST', '/accounting/journals', entry);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.id, first.body.id);
  assert.equal(retry.body.reused, true);

  // …and neither must two of them at the same instant.
  const racers = await Promise.all([1, 2, 3, 4].map(() => call('POST', '/accounting/journals', {
    ...entry, idempotency_key: `${key}-race`,
  })));
  const ids = new Set(racers.map((r) => r.body.id));
  assert.equal(ids.size, 1, 'four simultaneous retries should share one journal');
  made.journals.push([...ids][0]);
});

test('concurrent document numbers are never handed out twice', { skip }, async () => {
  const accounts = (await call('GET', '/accounting/accounts')).body;
  const cash = accounts.find((a) => a.code === '1000');
  const sales = accounts.find((a) => a.code === '4010');

  const posts = await Promise.all(Array.from({ length: 12 }, () => call('POST', '/accounting/journals', {
    date: '2026-09-03',
    narration: 'ZZ test — number race',
    lines: [
      { account_id: cash.id, debit: '1.00' },
      { account_id: sales.id, credit: '1.00' },
    ],
  })));

  const numbers = posts.map((p) => p.body.journal_no);
  posts.forEach((p) => made.journals.push(p.body.id));
  assert.equal(numbers.filter(Boolean).length, 12);
  assert.equal(new Set(numbers).size, 12, `12 journals must carry 12 numbers, got ${numbers.join(', ')}`);
});

test('a reversal cancels the original and links both ways', { skip }, async () => {
  const accounts = (await call('GET', '/accounting/accounts')).body;
  const cash = accounts.find((a) => a.code === '1000');
  const sales = accounts.find((a) => a.code === '4010');

  const posted = await call('POST', '/accounting/journals', {
    date: '2026-09-04',
    narration: 'ZZ test — to be reversed',
    lines: [
      { account_id: cash.id, debit: '500.00' },
      { account_id: sales.id, credit: '500.00' },
    ],
  });
  made.journals.push(posted.body.id);

  const noReason = await call('POST', `/accounting/journals/${posted.body.id}/reverse`, {});
  assert.equal(noReason.status, 400, 'a reversal without a reason should be refused');

  const reversal = await call('POST', `/accounting/journals/${posted.body.id}/reverse`, {
    date: '2026-09-05', reason: 'ZZ test — wrong account',
  });
  assert.equal(reversal.status, 201);
  made.journals.push(reversal.body.id);

  const [[original]] = await db.query('SELECT status, reversed_by_id FROM journals WHERE id = ?', [posted.body.id]);
  assert.equal(original.status, 'reversed');
  assert.equal(original.reversed_by_id, reversal.body.id);

  const [[back]] = await db.query('SELECT reversal_of_id FROM journals WHERE id = ?', [reversal.body.id]);
  assert.equal(back.reversal_of_id, posted.body.id);

  // The two together leave the cash account exactly where it was.
  const [[net]] = await db.query(
    `SELECT COALESCE(SUM(l.debit_paise), 0) - COALESCE(SUM(l.credit_paise), 0) AS net
       FROM journal_lines l WHERE l.journal_id IN (?, ?) AND l.account_id = ?`,
    [posted.body.id, reversal.body.id, cash.id]
  );
  assert.equal(Number(net.net), 0);

  // Reversing twice is not a thing.
  const again = await call('POST', `/accounting/journals/${posted.body.id}/reverse`, { reason: 'again' });
  assert.equal(again.status, 422);
  assert.equal(again.body.code, 'already_reversed');
});

test('nothing posts into a closed period', { skip }, async () => {
  const accounts = (await call('GET', '/accounting/accounts')).body;
  const cash = accounts.find((a) => a.code === '1000');
  const sales = accounts.find((a) => a.code === '4010');

  const lock = await call('POST', '/accounting/period-locks', {
    locked_upto: '2026-06-30', reason: 'ZZ test — quarter closed',
  });
  assert.equal(lock.status, 201);
  made.locks.push(lock.body.id);

  const inside = await call('POST', '/accounting/journals', {
    date: '2026-06-15',
    lines: [
      { account_id: cash.id, debit: '10.00' },
      { account_id: sales.id, credit: '10.00' },
    ],
  });
  assert.equal(inside.status, 422);
  assert.equal(inside.body.code, 'period_locked');

  const after = await call('POST', '/accounting/journals', {
    date: '2026-07-01',
    narration: 'ZZ test — after the lock',
    lines: [
      { account_id: cash.id, debit: '10.00' },
      { account_id: sales.id, credit: '10.00' },
    ],
  });
  assert.equal(after.status, 201);
  made.journals.push(after.body.id);

  // Reopening is allowed, but only with a reason on the record.
  const noReason = await call('DELETE', `/accounting/period-locks/${lock.body.id}`, {});
  assert.equal(noReason.status, 400);

  const reopened = await call('DELETE', `/accounting/period-locks/${lock.body.id}`, { reason: 'ZZ test — done checking' });
  assert.equal(reopened.status, 200);

  const back = await call('POST', '/accounting/journals', {
    date: '2026-06-15',
    narration: 'ZZ test — posts once the period is open again',
    lines: [
      { account_id: cash.id, debit: '10.00' },
      { account_id: sales.id, credit: '10.00' },
    ],
  });
  assert.equal(back.status, 201);
  made.journals.push(back.body.id);
});

test('the trial balance balances and states its scope', { skip }, async () => {
  const tb = await call('GET', '/accounting/trial-balance?from=2026-04-01&to=2027-03-31');
  assert.equal(tb.status, 200);
  assert.equal(tb.body.balanced, true, 'debits and credits must agree');
  assert.equal(tb.body.totals.debit_paise, tb.body.totals.credit_paise);
  assert.equal(tb.body.scope.from, '2026-04-01');
  assert.equal(tb.body.scope.basis, 'posted journals');
});

test('a party is validated, not just stored', { skip }, async () => {
  const bad = await call('POST', '/parties', { display_name: 'ZZ Bad GST', gstin: '27ABCDE1234F1Z9' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /GSTIN/);

  const nameless = await call('POST', '/parties', { phone: '9000000001' });
  assert.equal(nameless.status, 400);

  const good = await call('POST', '/parties', {
    display_name: 'ZZ Test Customer',
    phone: '9000000001',
    gstin: gstinFor('01'),
    kind: 'customer',
    opening_balance: '5000.50',
    addresses: [{ kind: 'billing', line1: 'Lal Chowk', city: 'Srinagar', state_code: '01', is_default: true }],
  });
  assert.equal(good.status, 201);
  made.parties.push(good.body.id);
  // A GSTIN tells us the state and that they are registered — no need to ask twice.
  assert.equal(good.body.place_of_supply_state_code, '01');
  assert.equal(good.body.gst_treatment, 'registered');
  assert.equal(Number(good.body.opening_balance_paise), 500050);
});

test('duplicate customers are found and merged without losing the ledger', { skip }, async () => {
  const a = await call('POST', '/parties', { display_name: 'ZZ Dup Shop', phone: '9000000002' });
  const b = await call('POST', '/parties', { display_name: 'ZZ Dup Shop', phone: '09000000002', email: 'dup@test.local' });
  made.parties.push(a.body.id, b.body.id);

  const suggestions = (await call('GET', '/parties/duplicates/suggest')).body;
  const group = suggestions.find((g) => g.parties.some((p) => p.id === a.body.id) && g.parties.some((p) => p.id === b.body.id));
  assert.ok(group, 'the two records for one shop should be offered as a duplicate group');

  // Give the loser a ledger line, so the merge has something real to move.
  const accounts = (await call('GET', '/accounting/accounts')).body;
  const receivable = accounts.find((acc) => acc.code === '1100');
  const sales = accounts.find((acc) => acc.code === '4010');
  const journal = await call('POST', '/accounting/journals', {
    date: '2026-09-06',
    narration: 'ZZ test — sale to the duplicate',
    lines: [
      { account_id: receivable.id, debit: '2000.00', party_id: b.body.id },
      { account_id: sales.id, credit: '2000.00' },
    ],
  });
  made.journals.push(journal.body.id);

  const merged = await call('POST', '/parties/merge', {
    keep_id: a.body.id, merge_ids: [b.body.id], reason: 'ZZ test — same shop',
  });
  assert.equal(merged.status, 200);

  const kept = (await call('GET', `/parties/${a.body.id}`)).body;
  assert.equal(kept.receivable_paise, 200000, 'the balance must follow the merge');
  assert.equal(kept.party.email, 'dup@test.local', 'gaps in the kept record fill from the merged one');

  const [[loser]] = await db.query('SELECT merged_into_id, active FROM parties WHERE id = ?', [b.body.id]);
  assert.equal(loser.merged_into_id, a.body.id);
  assert.equal(loser.active, 0);

  // and the merged-away record no longer shows up in the list
  const list = (await call('GET', '/parties?q=ZZ Dup Shop')).body;
  assert.equal(list.filter((p) => p.id === b.body.id).length, 0);
});

test('opening balances post once, balanced', { skip }, async () => {
  const first = await call('POST', '/accounting/opening-balances', { as_on: '2026-04-01' });
  assert.ok([200, 201].includes(first.status), JSON.stringify(first.body));
  made.journals.push(first.body.journal?.id);

  const again = await call('POST', '/accounting/opening-balances', { as_on: '2026-04-01' });
  assert.equal(again.body.reused, true, 'running opening balances twice must not double them');

  const [[sums]] = await db.query(
    `SELECT COALESCE(SUM(debit_paise),0) d, COALESCE(SUM(credit_paise),0) c
       FROM journal_lines WHERE journal_id = ?`,
    [first.body.journal.id]
  );
  assert.equal(Number(sums.d), Number(sums.c));
});

test('permissions are enforced on the server, not in the menu', { skip }, async () => {
  const accounts = (await call('GET', '/accounting/accounts')).body;
  const cash = accounts.find((a) => a.code === '1000');
  const sales = accounts.find((a) => a.code === '4010');

  const post = await call('POST', '/accounting/journals', {
    date: '2026-09-07',
    lines: [
      { account_id: cash.id, debit: '10.00' },
      { account_id: sales.id, credit: '10.00' },
    ],
  }, 'employee');
  assert.equal(post.status, 403);
  assert.equal(post.body.capability, 'ledger.post');

  assert.equal((await call('GET', '/accounting/accounts', null, 'employee')).status, 403);
  assert.equal((await call('PUT', '/accounting/business', { legal_name: 'Hijack' }, 'employee')).status, 403);
  assert.equal((await call('POST', '/parties/merge', { keep_id: 'x', merge_ids: ['y'] }, 'employee')).status, 403);

  // A technician may still look up a customer — that is their job.
  assert.equal((await call('GET', '/parties?q=ZZ', null, 'employee')).status, 200);

  const caps = (await call('GET', '/accounting/capabilities', null, 'employee')).body.capabilities;
  assert.ok(caps.includes('party.view'));
  assert.ok(!caps.includes('ledger.post'));
});

test('a system account cannot be switched off, and codes stay unique', { skip }, async () => {
  const accounts = (await call('GET', '/accounting/accounts')).body;
  const receivable = accounts.find((a) => a.code === '1100');

  const off = await call('PATCH', `/accounting/accounts/${receivable.id}`, { active: false });
  assert.equal(off.status, 400);

  const clash = await call('POST', '/accounting/accounts', { code: '1100', name: 'ZZ Clash', type: 'asset' });
  assert.equal(clash.status, 409);

  const made1 = await call('POST', '/accounting/accounts', { code: 'ZZ99', name: 'ZZ Test Expense', type: 'expense', subtype: 'expense' });
  assert.equal(made1.status, 201);
  made.accounts.push(made1.body.id);
});

test('the business record knows what is still missing', { skip }, async () => {
  const out = await call('GET', '/accounting/business');
  assert.equal(out.status, 200);
  assert.equal(out.body.business.legal_name, 'Networking Experts');
  assert.ok(Array.isArray(out.body.setup_pending));
  assert.match(out.body.fy_label, /^\d{4}-\d{2}$/);

  const badState = await call('PUT', '/accounting/business', { state_code: '99' });
  assert.equal(badState.status, 400);

  const mismatch = await call('PUT', '/accounting/business', { gstin: gstinFor('27'), state_code: '01' });
  assert.equal(mismatch.status, 400, 'a GSTIN from another state should not sit next to this one');
});

test('every change to the books left a trail', { skip }, async () => {
  const trail = (await call('GET', '/accounting/audit?limit=50')).body;
  assert.ok(trail.some((r) => r.action === 'journal.post'));
  assert.ok(trail.some((r) => r.action === 'party.merge'));
  assert.ok(trail.some((r) => r.action === 'period.lock'));
  const merge = trail.find((r) => r.action === 'party.merge');
  assert.equal(merge.actor_id, tokens.adminId);
  assert.ok(merge.reason);
});

test.after(async () => {
  if (!db) return;
  // Leave the database exactly as it was found.
  for (const id of made.journals.filter(Boolean)) {
    await db.query('DELETE FROM journal_lines WHERE journal_id = ?', [id]);
    await db.query('DELETE FROM journals WHERE id = ?', [id]);
  }
  await db.query("DELETE FROM journals WHERE narration LIKE 'ZZ test%' OR narration LIKE 'Reversal of%ZZ test%'");
  for (const id of made.parties.filter(Boolean)) {
    await db.query('DELETE FROM journal_lines WHERE party_id = ?', [id]);
    await db.query('DELETE FROM party_addresses WHERE party_id = ?', [id]);
    await db.query('DELETE FROM parties WHERE id = ?', [id]);
  }
  for (const id of made.accounts.filter(Boolean)) await db.query('DELETE FROM accounts WHERE id = ?', [id]);
  for (const id of made.locks.filter(Boolean)) await db.query('DELETE FROM period_locks WHERE id = ?', [id]);
  await db.query("DELETE FROM audit_log WHERE reason LIKE 'ZZ test%'");
  await db.end();
});
