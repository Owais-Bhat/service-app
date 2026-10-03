'use strict';

// A backup of the business's data that a person can open: every table as a spreadsheet-ready CSV
// (UTF-8 with a byte-order mark, so Excel reads ₹ and Hindi correctly) inside one ZIP, with a
// summary of what is in it.
//
// What it leaves out, and says so in the summary:
//   * anything secret — password hashes, login/feedback/OTP tokens, API keys, stored face data,
//     reference selfies. A backup that travels by email must not carry a way into the portal.
//   * the bytes of stored files (logos, uploaded images): their names and sizes are listed, the
//     files themselves are not in the CSV.
//
// Rows are read a page at a time and compressed as they go, so even a large table never sits whole in memory.

const { Zip, ZipDeflate, strToU8 } = require('fflate');

const PAGE = 2000;
// Columns whose names say they hold a secret.
// ("passed" is a result, not a password: only whole words pass/password/passwd count.)
const SECRET_COLUMN = /(^|_)(password|passwd|pass)(_|$)|hash|token|secret|(^|_)otp(_|$)|api_?key|face_descriptor|reference_selfie|authorization/i;
// Tables that are only runtime plumbing — nothing a person would want to keep.
const SKIP_TABLES = new Set(['sessions', 'push_subscriptions', 'rate_limits']);

const pad = (n) => String(n).padStart(2, '0');
function formatDate(d) {
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return time === '00:00:00' ? day : `${day} ${time}`;
}

/** One cell as text: dates readable, JSON as JSON, binary as a note, nothing as empty. */
function cellText(value) {
    if (value === null || value === undefined) return '';
    if (Buffer.isBuffer(value)) return `<file, ${value.length} bytes — not included>`;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : formatDate(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function csvCell(value) {
    const text = cellText(value);
    return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvLine = (values) => values.map(csvCell).join(',');

/** The CSV of one table, produced in chunks. Calls `push(string)` for each piece. */
async function tableToCsv(conn, table, push) {
    const [columnRows] = await conn.query('SHOW COLUMNS FROM ??', [table]);
    const all = columnRows.map((c) => c.Field);
    const kept = all.filter((name) => !SECRET_COLUMN.test(name));
    const left = all.filter((name) => SECRET_COLUMN.test(name));

    push(`﻿${csvLine(kept)}\r\n`);
    let rows = 0;
    if (kept.length) {
        for (let offset = 0; ; offset += PAGE) {
            const [page] = await conn.query('SELECT ?? FROM ?? LIMIT ? OFFSET ?', [kept, table, PAGE, offset]);
            if (!page.length) break;
            push(page.map((row) => `${csvLine(kept.map((name) => row[name]))}\r\n`).join(''));
            rows += page.length;
            if (page.length < PAGE) break;
        }
    }
    return { rows, columns: kept.length, left_out: left };
}

/**
 * Build the ZIP. Resolves to { buffer, tables: [{ name, rows, left_out }], bytes }.
 * @param {object} conn  a database connection
 * @param {{ now?: Date, business?: string }} [options]
 */
async function buildBackup(conn, { now = new Date(), business = 'Networking Experts' } = {}) {
    const [tableRows] = await conn.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    const names = tableRows.map((r) => Object.values(r)[0]).filter((n) => !SKIP_TABLES.has(n)).sort();

    const chunks = [];
    let failure = null;
    const zip = new Zip((err, chunk) => {
        if (err) { failure = err; return; }
        chunks.push(Buffer.from(chunk));
    });

    const summary = [];
    for (const name of names) {
        const entry = new ZipDeflate(`tables/${name}.csv`, { level: 6 });
        zip.add(entry);
        try {
            const info = await tableToCsv(conn, name, (text) => entry.push(strToU8(text), false));
            summary.push({ name, ...info });
        } catch (err) {
            // One unreadable table must not lose the rest of the backup.
            entry.push(strToU8(`﻿could not be read: ${err.message}\r\n`), false);
            summary.push({ name, rows: 0, columns: 0, left_out: [], error: err.message });
        }
        entry.push(new Uint8Array(0), true);
    }

    const total = summary.reduce((n, t) => n + t.rows, 0);
    const readme = [
        `${business} — data backup`,
        `Made on ${formatDate(now)}`,
        '',
        `${summary.length} tables, ${total} rows. Each table is a CSV file in the "tables" folder; open them in Excel or Google Sheets.`,
        '',
        'Left out on purpose:',
        '  - passwords, login/OTP/feedback tokens, API keys and stored face data (columns named like pass*, hash, token, secret, otp, api_key, face_descriptor)',
        '  - the contents of uploaded files such as logos and images (their names and sizes are listed)',
        '',
        'Table                                    Rows   Left out',
        ...summary.map((t) => `${t.name.padEnd(38)} ${String(t.rows).padStart(6)}   ${t.error ? `NOT READ: ${t.error}` : t.left_out.join(', ')}`),
        '',
    ].join('\r\n');
    const readmeEntry = new ZipDeflate('README.txt', { level: 6 });
    zip.add(readmeEntry);
    readmeEntry.push(strToU8(readme), true);
    zip.end();

    if (failure) throw failure;
    const buffer = Buffer.concat(chunks);
    return { buffer, tables: summary, bytes: buffer.length, total_rows: total };
}

const fileName = (now = new Date()) => `nest-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`;

// Gmail and most providers refuse an attachment bigger than about 25 MB; stay well under.
const MAIL_LIMIT_BYTES = 20 * 1024 * 1024;

/**
 * Build a backup and email it. `send` is the mailer (injected so a test needs no mail server).
 * If the ZIP is too large for an email, a short message says so and the file is left to download from the portal.
 */
async function emailBackup(conn, { to, send, now = new Date(), limitBytes = MAIL_LIMIT_BYTES }) {
    const built = await buildBackup(conn, { now });
    const name = fileName(now);
    const sizeMb = (built.bytes / 1048576).toFixed(1);
    const fits = built.bytes <= limitBytes;
    const html = fits
        ? `<p>The backup you asked for is attached (<b>${name}</b>, ${sizeMb} MB): ${built.tables.length} tables, ${built.total_rows} rows.</p>
           <p>Open the CSV files in the <code>tables</code> folder with Excel or Google Sheets. Passwords and login tokens are not included.</p>`
        : `<p>The backup is ${sizeMb} MB — too large to send by email. Download it from the portal: <b>Data Migration → Back up everything → Download</b>.</p>`;
    await send({
        to, subject: `Your portal data backup — ${name}`, html,
        attachments: fits ? [{ filename: name, content: built.buffer, contentType: 'application/zip' }] : [],
    });
    return { sent: true, attached: fits, bytes: built.bytes, tables: built.tables.length, rows: built.total_rows, file: name };
}

module.exports = { buildBackup, emailBackup, tableToCsv, csvCell, cellText, fileName, SECRET_COLUMN, MAIL_LIMIT_BYTES };
