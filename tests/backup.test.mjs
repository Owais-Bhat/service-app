// The data backup: every table as a CSV in one ZIP, nothing secret in it, and the mail that carries it.
//
//   node --test tests/backup.test.mjs
//
// The first tests need only the code. The rest need the local API and the test database and skip without
// them. No mail is really sent: the mailer is handed in as a stand-in.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const backup = require('../server/modules/backup/service.cjs');
const { unzipSync, strFromU8 } = require('../node_modules/fflate');
const API = 'http://127.0.0.1:5000/api';

// ── no database needed ──────────────────────────────────────────────────
test('a cell is written so a spreadsheet reads it back exactly', () => {
  assert.equal(backup.csvCell('plain'), 'plain');
  assert.equal(backup.csvCell('a, b'), '"a, b"');
  assert.equal(backup.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(backup.csvCell('two\nlines'), '"two\nlines"');
  assert.equal(backup.csvCell(null), '');
  assert.equal(backup.csvCell(undefined), '');
  assert.equal(backup.csvCell(0), '0');
  assert.equal(backup.csvCell({ a: 1 }), '"{""a"":1}"', 'JSON stays JSON');
  assert.equal(backup.cellText(new Date(2026, 9, 3)), '2026-10-03', 'a date with no time is just the date');
  assert.equal(backup.cellText(new Date(2026, 9, 3, 14, 5, 9)), '2026-10-03 14:05:09');
  assert.match(backup.cellText(Buffer.from('abc')), /file, 3 bytes/, 'file contents are not dumped into a cell');
  assert.equal(backup.csvCell('नमस्ते ₹500'), 'नमस्ते ₹500');
});

test('columns that hold a secret are recognised by name', () => {
  for (const secret of ['password_hash', 'password', 'feedback_token_hash', 'api_key', 'otp_code', 'webhook_secret', 'face_descriptor', 'mobile_reference_selfie_url']) {
    assert.ok(backup.SECRET_COLUMN.test(secret), `${secret} must be left out`);
  }
  for (const fine of ['full_name', 'phone', 'ticket_no', 'bill_total', 'description', 'created_at', 'party_id', 'category', 'passed', 'compass_points', 'otpion']) {
    assert.ok(!backup.SECRET_COLUMN.test(fine), `${fine} must be kept`);
  }
});

// ── against the database ────────────────────────────────────────────────
let mysql; let jwt; let db; let tokens; let reachable = false;
const made = { parties: [], profiles: [] };

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/admin/backup/download`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER,
      password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    const sign = (id, role) => jwt.sign({ id, email: `${role}@test.local`, role, worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tokens = { admin: sign(admin.id, 'admin'), employee: sign(randomUUID(), 'employee') };
  }
} catch { reachable = false; }
const skip = reachable ? false : 'needs the local API on port 5000 and the test database';

const SECRET = 'ZZ-SECRET-HASH-MUST-NOT-LEAK';
const TRICKY_NAME = 'ZZ Backup "Quote", नमस्ते\nsecond line';
let built;

test('set up: a customer with an awkward name, a profile with stored face data, a login with a password hash', { skip }, async () => {
  const [[biz]] = await db.query('SELECT id FROM businesses WHERE is_default = 1 LIMIT 1');
  const partyId = randomUUID();
  await db.query('INSERT INTO parties SET ?', [{ id: partyId, business_id: biz.id, kind: 'customer', display_name: TRICKY_NAME, phone: '9000000995' }]);
  made.parties.push(partyId);
  const profileId = randomUUID();
  await db.query('INSERT INTO profiles SET ?', [{ id: profileId, full_name: 'ZZ Backup Person', role: 'employee', phone: '9000000996', face_descriptor: SECRET }]);
  made.profiles.push(profileId);
  const [authCols] = await db.query('SHOW COLUMNS FROM auth_users');
  const required = authCols.filter((c) => c.Null === 'NO' && c.Default === null && !/auto_increment/.test(c.Extra)).map((c) => c.Field);
  const row = { id: randomUUID(), email: `zz-backup-${Date.now()}@example.com`, password_hash: SECRET };
  for (const f of required) if (!(f in row)) row[f] = f === 'id' ? randomUUID() : 'zz';
  await db.query('INSERT INTO auth_users SET ?', [row]);
  made.authUsers = [row.id];
});

test('the backup has a CSV for every table, a summary, and none of the secrets', { skip }, async () => {
  built = await backup.buildBackup(db);
  const files = unzipSync(new Uint8Array(built.buffer));
  const names = Object.keys(files);
  assert.ok(names.includes('README.txt'));
  assert.ok(names.includes('tables/parties.csv') && names.includes('tables/profiles.csv') && names.includes('tables/inquiries.csv'));
  assert.ok(names.every((n) => n === 'README.txt' || /^tables\/[\w$-]+\.csv$/.test(n)), 'only the summary and the tables');

  const everything = Object.values(files).map((f) => strFromU8(f)).join('\n');
  assert.ok(!everything.includes(SECRET), 'a password hash never reaches the backup');
  const profileHeader = strFromU8(files['tables/profiles.csv']).split('\r\n')[0];
  assert.ok(!/face_descriptor/.test(profileHeader), 'stored face data is not even a column');
  assert.ok(profileHeader.includes('full_name'));
  const loginHeader = strFromU8(files['tables/auth_users.csv']).split('\r\n')[0];
  assert.ok(!/password_hash/.test(loginHeader) && loginHeader.includes('email'), 'logins are listed, without their password hashes');
  assert.ok(/password_hash/.test(strFromU8(files['README.txt'])), 'the summary says what was left out of which table');
  assert.ok(!names.includes('tables/push_subscriptions.csv'), 'push subscriptions (which hold keys) are not in it');

  const raw = files['tables/parties.csv'];
  assert.deepEqual([raw[0], raw[1], raw[2]], [0xEF, 0xBB, 0xBF], 'a byte-order mark first, so Excel reads it as UTF-8');
  assert.equal(built.tables.length, names.length - 1);
});

test('what was written can be read back exactly, including quotes, commas, line breaks and Hindi', { skip }, async () => {
  const files = unzipSync(new Uint8Array(built.buffer));
  const csv = strFromU8(files['tables/parties.csv']);
  const escaped = `"${TRICKY_NAME.replace(/"/g, '""')}"`;
  assert.ok(csv.includes(escaped), 'the awkward name is quoted correctly');
  assert.ok(csv.includes('9000000995'));

  const profiles = strFromU8(files['tables/profiles.csv']);
  assert.ok(profiles.includes('ZZ Backup Person'));
  const summary = built.tables.find((t) => t.name === 'profiles');
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM profiles');
  assert.equal(summary.rows, Number(n), 'every row is in, none dropped');
  assert.ok(summary.left_out.includes('face_descriptor'));
});

test('the backup is emailed as an attachment — or, if too big, says where to download it', { skip }, async () => {
  const sent = [];
  const send = async (m) => { sent.push(m); };
  const out = await backup.emailBackup(db, { to: 'owner@example.com', send, now: new Date(2026, 9, 3) });
  assert.equal(out.attached, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'owner@example.com');
  assert.equal(sent[0].attachments[0].filename, 'nest-backup-2026-10-03.zip');
  assert.equal(Buffer.from(sent[0].attachments[0].content).subarray(0, 2).toString(), 'PK', 'a real ZIP');

  const big = [];
  const tooBig = await backup.emailBackup(db, { to: 'owner@example.com', send: async (m) => { big.push(m); }, limitBytes: 100 });
  assert.equal(tooBig.attached, false);
  assert.deepEqual(big[0].attachments, [], 'nothing attached');
  assert.match(big[0].html, /Download/);

  // A mail server that refuses is an error the caller sees, not a silent success.
  await assert.rejects(() => backup.emailBackup(db, { to: 'x@example.com', send: async () => { throw new Error('SMTP down'); } }), /SMTP down/);
});

test('through the API: admins only, a real ZIP comes back, and not twice in a minute', { skip }, async () => {
  const get = (who) => fetch(`${API}/admin/backup/download`, { headers: { Authorization: `Bearer ${tokens[who]}` } });
  assert.equal((await get('employee')).status, 403);

  // (The email route is not called for an admin here: on a machine with a mail account it would really send.)
  const emailEmployee = await fetch(`${API}/admin/backup/email`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.employee}`, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(emailEmployee.status, 403);

  const res = await get('admin');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/zip');
  assert.match(res.headers.get('content-disposition'), /nest-backup-\d{4}-\d{2}-\d{2}\.zip/);
  const body = Buffer.from(await res.arrayBuffer());
  assert.equal(body.subarray(0, 2).toString(), 'PK');
  assert.ok(Object.keys(unzipSync(new Uint8Array(body))).includes('README.txt'));
  assert.equal((await get('admin')).status, 429, 'a second one straight away is refused');
});

test.after(async () => {
  if (!db) return;
  try {
    if (made.parties.length) await db.query('DELETE FROM parties WHERE id IN (?)', [made.parties]);
    if (made.profiles.length) await db.query('DELETE FROM profiles WHERE id IN (?)', [made.profiles]);
    if (made.authUsers?.length) await db.query('DELETE FROM auth_users WHERE id IN (?)', [made.authUsers]);
    await db.query("DELETE FROM audit_log WHERE action LIKE 'backup.%'").catch(() => {});
  } finally {
    await db.end();
  }
});
