'use strict';

// Service and installation money, into the books.
//
// A ticket carries its own bill and its own payment fields; the accounts never
// saw them. This module turns each ticket into (up to) three journals and keeps
// them in step with the ticket for as long as the ticket changes:
//
//   income    Dr Receivable (+ Discounts Allowed)    Cr Sales, Output GST      when the bill is made
//   collect   Dr Cash with Technician | Cash | Bank  Cr Receivable              when it is paid
//   handover  Dr Cash in Hand                        Cr Cash with Technician     when the technician hands the cash in
//
// A journal is never edited. When the ticket changes — the bill is revised, a
// payment is un-marked, the ticket is deleted — the old journal is reversed and
// a new one posted, so the trail shows what was believed and when.
//
// Only tickets billed on or after `businesses.service_ledger_from` are touched.
// What was billed before that belongs in opening balances, and posting it again
// would count it twice.

const { randomUUID } = require('crypto');
const money = require('../money.cjs');
const gst = require('../gst.cjs');
const posting = require('../ledger/posting.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');

const KINDS = { inquiry: 'inquiries', installation: 'installations' };

const TABLES = [
    `CREATE TABLE IF NOT EXISTS service_ledger_links (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        source_type VARCHAR(20) NOT NULL COMMENT 'inquiry | installation',
        source_id VARCHAR(36) NOT NULL,
        ticket_ref VARCHAR(60) NULL,
        party_id VARCHAR(36) NULL,
        income_journal_id VARCHAR(36) NULL,
        income_sig VARCHAR(200) NULL,
        income_ver INT NOT NULL DEFAULT 0,
        collect_journal_id VARCHAR(36) NULL,
        collect_sig VARCHAR(200) NULL,
        collect_ver INT NOT NULL DEFAULT 0,
        handover_journal_id VARCHAR(36) NULL,
        handover_sig VARCHAR(200) NULL,
        handover_ver INT NOT NULL DEFAULT 0,
        status VARCHAR(16) NOT NULL DEFAULT 'synced' COMMENT 'synced | skipped | blocked',
        note VARCHAR(300) NULL,
        synced_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_service_link (source_type, source_id),
        INDEX idx_service_link_status (status)
    )`,
];

async function ensureServiceLedgerSchema(connection) {
    for (const statement of TABLES) await connection.query(statement);

    // The start date is added once, and set to today on the day it is added:
    // going live must not quietly pull in every old ticket. After that a NULL
    // means the owner switched the feature off.
    const [cols] = await connection.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'businesses' AND COLUMN_NAME = 'service_ledger_from'`
    );
    if (!cols.length) {
        console.log('[service-ledger] adding businesses.service_ledger_from');
        await connection.query(
            "ALTER TABLE businesses ADD COLUMN service_ledger_from DATE NULL COMMENT 'tickets billed on or after this date are posted to the books; NULL = off'"
        );
        await connection.query('UPDATE businesses SET service_ledger_from = CURDATE() WHERE is_default = 1');
    }
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (v) => {
    if (!v) return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const later = (a, b) => (a && b ? (a > b ? a : b) : a || b);

/**
 * What the books should say about one ticket, from the ticket alone.
 *
 * Pure: no database, no clock. The sweep uses it to see whether a ticket has
 * moved on from what was last posted, and the sync uses it to post.
 *
 * `bill_total = base + GST − discount` is how the billing screens build a
 * total, so the base (what was sold) is recovered from it exactly.
 */
function describe(kind, row, { itemsPaise = 0, from = null } = {}) {
    const total = money.toPaise(row.bill_total);
    if (!(total > 0)) return { eligible: false, reason: 'No bill on this ticket yet' };
    if (String(row.payment_status || '').toLowerCase() === 'foc') {
        return { eligible: false, reason: 'Free of cost — nothing was billed' };
    }

    const billDate = ymd(row.bill_generated_at) || ymd(row.payment_received_at) || ymd(row.created_at);
    if (!billDate) return { eligible: false, reason: 'The bill has no date' };
    if (!from || billDate < from) return { eligible: false, before: true, reason: 'Billed before the ledger start date' };

    const tax = money.toPaise(row.gst_amount);
    const discount = money.toPaise(row.discount_amount);
    const base = total + discount - tax;
    if (base < 0) return { eligible: false, reason: 'The bill total is smaller than its own GST — check the bill' };

    const goodsSource = kind === 'installation' ? money.toPaise(row.items_total) : itemsPaise;
    const goods = Math.min(base, Math.max(0, goodsSource));
    const services = base - goods;

    const paid = String(row.payment_status || '').toLowerCase() === 'paid';
    const cash = /cash/i.test(String(row.payment_method || ''));
    const cashSubmitted = kind === 'inquiry' && !!row.cash_submitted_at;
    const cashWithTechnician = kind === 'inquiry' && (!!row.cash_collected_at || cashSubmitted);

    let where = 'bank';
    if (cash) where = cashWithTechnician ? 'technician' : 'office';

    const payDate = paid
        ? later(billDate, ymd(row.payment_received_at) || ymd(row.cash_collected_at))
        : null;
    const handoverDate = paid && where === 'technician' && cashSubmitted
        ? later(payDate, ymd(row.cash_submitted_at))
        : null;

    const income = { total, discount, tax, goods, services, date: billDate };
    return {
        eligible: true,
        income,
        collect: paid ? { total, where, date: payDate } : null,
        handover: handoverDate ? { total, date: handoverDate } : null,
        sigs: {
            income: `${total}|${discount}|${tax}|${goods}|${services}|${billDate}`,
            collect: paid ? `${total}|${where}|${payDate}` : null,
            handover: handoverDate ? `${total}|${handoverDate}` : null,
        },
    };
}

// ── the customer, as a party ────────────────────────────────────────────

const digits = (s) => String(s || '').replace(/\D/g, '').slice(-10);

// A ticket carries a name and a phone, not a party. The phone is the closest
// thing to an identity, so that is what a returning customer is matched on; a
// customer already entered in Customers & Suppliers is reused, never duplicated.
async function resolveParty(conn, businessId, row, stateCode) {
    const phone = digits(row.phone);
    if (phone.length >= 7) {
        const [candidates] = await conn.query(
            `SELECT id, phone FROM parties
              WHERE business_id = ? AND merged_into_id IS NULL AND phone LIKE ? LIMIT 25`,
            [businessId, `%${phone.slice(-4)}%`]
        );
        const hit = candidates.find((c) => digits(c.phone) === phone);
        if (hit) return hit.id;
    } else if (row.full_name) {
        const [[byName]] = await conn.query(
            `SELECT id FROM parties WHERE business_id = ? AND merged_into_id IS NULL AND display_name = ? LIMIT 1`,
            [businessId, String(row.full_name).trim()]
        );
        if (byName) return byName.id;
    }

    const id = randomUUID();
    await conn.query('INSERT INTO parties SET ?', [{
        id, business_id: businessId, kind: 'customer',
        display_name: String(row.full_name || 'Walk-in customer').trim().slice(0, 200),
        phone: row.phone ? String(row.phone).trim().slice(0, 20) : null,
        gst_treatment: 'consumer', place_of_supply_state_code: stateCode || null,
        notes: 'Created automatically from a service ticket',
    }]);
    return id;
}

// Installation contacts become customers, so an invoice can be raised to them
// without first waiting for the installation to be billed. A person is matched
// on the last ten digits of the phone, exactly as a ticket is, so running this
// again (or the ticket being billed later) never makes a second record.
async function syncInstallationContacts(conn, businessId) {
    const [[biz]] = await conn.query('SELECT state_code FROM businesses WHERE id = ? LIMIT 1', [businessId]);
    const [known] = await conn.query(
        'SELECT phone FROM parties WHERE business_id = ? AND merged_into_id IS NULL AND phone IS NOT NULL', [businessId]
    );
    const have = new Set(known.map((p) => digits(p.phone)).filter((d) => d.length >= 7));

    const [contacts] = await conn.query(
        `SELECT full_name, phone FROM installations
          WHERE phone IS NOT NULL AND phone <> '' ORDER BY created_at DESC`
    );
    let created = 0;
    for (const c of contacts) {
        const d = digits(c.phone);
        if (d.length < 7 || have.has(d)) continue;
        have.add(d);
        await conn.query('INSERT INTO parties SET ?', [{
            id: randomUUID(), business_id: businessId, kind: 'customer',
            display_name: String(c.full_name || 'Customer').trim().slice(0, 200),
            phone: String(c.phone).trim().slice(0, 20),
            gst_treatment: 'consumer', place_of_supply_state_code: biz?.state_code || null,
            notes: 'Created automatically from an installation contact',
        }]);
        created += 1;
    }
    return { created };
}

// ── posting ─────────────────────────────────────────────────────────────

const ACCOUNTS = { receivable: '1100', cash: '1000', bank: '1010', technician: '1020', discount: '4900',
    goods: '4000', services: '4010', installation: '4020', cgst: '2100', sgst: '2110', utgst: '2110', igst: '2120' };

async function loadBusiness(conn) {
    const id = await defaultBusinessId(conn);
    if (!id) return null;
    const [[biz]] = await conn.query('SELECT * FROM businesses WHERE id = ? LIMIT 1', [id]);
    return biz || null;
}

async function itemsTotalPaise(conn, kind, id) {
    const [[r]] = await conn.query(
        'SELECT COALESCE(SUM(quantity * rate), 0) AS total FROM bill_items WHERE ref_type = ? AND ref_id = ?', [kind, id]
    );
    return money.toPaise(r.total);
}

async function invoicedThroughSales(conn, kind, id) {
    const [[hit]] = await conn.query(
        `SELECT id FROM sales_documents
          WHERE source_type = ? AND source_id = ? AND doc_type = 'invoice' AND status <> 'cancelled' LIMIT 1`,
        [kind, id]
    );
    return !!hit;
}

async function account(conn, businessId, code) {
    return posting.accountByCode(conn, businessId, ACCOUNTS[code] || code);
}

async function buildLines(conn, businessId, biz, kind, part, d, partyId) {
    if (part === 'income') {
        const i = d.income;
        const lines = [{ account_id: (await account(conn, businessId, 'receivable')).id, debit_paise: i.total, party_id: partyId, memo: 'Billed' }];
        if (i.discount > 0) lines.push({ account_id: (await account(conn, businessId, 'discount')).id, debit_paise: i.discount, memo: 'Discount given' });
        if (i.goods > 0) lines.push({ account_id: (await account(conn, businessId, 'goods')).id, credit_paise: i.goods, memo: 'Parts and materials' });
        if (i.services > 0) {
            lines.push({
                account_id: (await account(conn, businessId, kind === 'installation' ? 'installation' : 'services')).id,
                credit_paise: i.services, memo: kind === 'installation' ? 'Installation and labour' : 'Service charges',
            });
        }
        if (i.tax > 0) {
            // The customer is in the same place as the business, so the tax is
            // split the way an intra-state supply is.
            const supply = gst.supplyType({ supplierStateCode: biz.state_code, placeOfSupplyStateCode: biz.state_code });
            const split = gst.splitTax(i.tax, supply.components);
            for (const [component, amount] of Object.entries(split)) {
                if (amount > 0) {
                    lines.push({ account_id: (await account(conn, businessId, component)).id, credit_paise: amount, memo: `Output ${component.toUpperCase()}` });
                }
            }
        }
        return lines;
    }
    if (part === 'collect') {
        const c = d.collect;
        const into = c.where === 'technician' ? 'technician' : c.where === 'office' ? 'cash' : 'bank';
        return [
            { account_id: (await account(conn, businessId, into)).id, debit_paise: c.total, memo: into === 'technician' ? 'Collected by the technician' : 'Payment received' },
            { account_id: (await account(conn, businessId, 'receivable')).id, credit_paise: c.total, party_id: partyId, memo: 'Paid' },
        ];
    }
    const h = d.handover;
    return [
        { account_id: (await account(conn, businessId, 'cash')).id, debit_paise: h.total, memo: 'Handed in by the technician' },
        { account_id: (await account(conn, businessId, 'technician')).id, credit_paise: h.total, memo: 'Cash handed in' },
    ];
}

async function upsertStatus(conn, businessId, kind, id, status, note, ref = null) {
    await conn.query(
        `INSERT INTO service_ledger_links (id, business_id, source_type, source_id, ticket_ref, status, note, synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note), synced_at = NOW(),
                                 ticket_ref = COALESCE(VALUES(ticket_ref), ticket_ref)`,
        [randomUUID(), businessId, kind, id, ref, status, note ? String(note).slice(0, 300) : null]
    );
}

/**
 * Bring one ticket's journals in line with the ticket. Safe to call as often
 * as you like; it posts only what changed.
 *
 * @returns {Promise<{status: string, note?: string, posted?: number, reversed?: number}>}
 */
async function syncTicket(conn, kind, id, { userId = null } = {}) {
    if (!KINDS[kind]) throw new Error(`Unknown ticket kind: ${kind}`);
    const biz = await loadBusiness(conn);
    if (!biz) return { status: 'off', note: 'No business configured' };
    const from = ymd(biz.service_ledger_from);
    if (!from) return { status: 'off', note: 'Service income is not being posted to the books' };

    const [[row]] = await conn.query(`SELECT * FROM ${KINDS[kind]} WHERE id = ? LIMIT 1`, [id]);

    let desired = { eligible: false, reason: 'The ticket no longer exists' };
    if (row) {
        const itemsPaise = kind === 'inquiry' ? await itemsTotalPaise(conn, kind, id) : 0;
        desired = describe(kind, row, { itemsPaise, from });
        if (desired.eligible && await invoicedThroughSales(conn, kind, id)) {
            desired = { eligible: false, reason: 'Invoiced through Sales — not posted again from the ticket' };
        }
    }
    const ref = row?.ticket_no || null;

    // Tax cannot be split without knowing where the business is.
    if (desired.eligible && desired.income.tax > 0 && !gst.stateName(biz.state_code)) {
        await upsertStatus(conn, biz.id, kind, id, 'blocked', 'Set the business state under Business & Tax Setup so the GST can be split', ref);
        return { status: 'blocked', note: 'business state missing' };
    }

    let outcome;
    try {
        await conn.beginTransaction();
        await conn.query(
            'INSERT IGNORE INTO service_ledger_links (id, business_id, source_type, source_id, ticket_ref) VALUES (?, ?, ?, ?, ?)',
            [randomUUID(), biz.id, kind, id, ref]
        );
        const [[link]] = await conn.query(
            'SELECT * FROM service_ledger_links WHERE source_type = ? AND source_id = ? FOR UPDATE', [kind, id]
        );

        const want = desired.eligible
            ? desired.sigs
            : { income: null, collect: null, handover: null };

        const differs = (part) => link[`${part}_sig`] !== want[part] || (want[part] !== null && !link[`${part}_journal_id`]);
        const collectChanges = differs('collect');
        const undo = { handover: differs('handover') || collectChanges, collect: collectChanges, income: differs('income') };

        let reversed = 0;
        let posted = 0;
        const today = new Date();

        // Undo from the outside in: what depends on the bill goes first.
        for (const part of ['handover', 'collect', 'income']) {
            if (!undo[part] || !link[`${part}_journal_id`]) continue;
            try {
                await posting.reverseJournal(conn, {
                    journalId: link[`${part}_journal_id`], date: today,
                    reason: row ? 'The service ticket changed' : 'The service ticket was deleted', postedBy: userId,
                });
            } catch (err) {
                // Someone already reversed it from the Ledger screen — the books
                // are where we wanted them, so carry on.
                if (!(err instanceof posting.PostingError) || err.code !== 'already_reversed') throw err;
            }
            link[`${part}_journal_id`] = null;
            link[`${part}_sig`] = null;
            reversed += 1;
        }

        if (desired.eligible) {
            const partyId = link.party_id || await resolveParty(conn, biz.id, row, biz.state_code);
            link.party_id = partyId;

            const dates = { income: desired.income.date, collect: desired.collect?.date, handover: desired.handover?.date };
            for (const part of ['income', 'collect', 'handover']) {
                if (want[part] === null || link[`${part}_journal_id`]) continue;
                link[`${part}_ver`] += 1;
                const journal = await posting.postJournal(conn, {
                    businessId: biz.id,
                    date: dates[part],
                    narration: `Service ${ref || id.slice(0, 8)} — ${String(row.full_name || 'customer').slice(0, 60)}`,
                    sourceType: 'service',
                    sourceId: id,
                    lines: await buildLines(conn, biz.id, biz, kind, part, desired, partyId),
                    idempotencyKey: `svc:${kind}:${id}:${part}:${link[`${part}_ver`]}`,
                    postedBy: userId,
                });
                link[`${part}_journal_id`] = journal.id;
                link[`${part}_sig`] = want[part];
                posted += 1;
            }
        }

        const status = desired.eligible ? 'synced' : 'skipped';
        await conn.query(
            `UPDATE service_ledger_links SET party_id = ?, ticket_ref = COALESCE(?, ticket_ref), status = ?, note = ?, synced_at = NOW(),
                    income_journal_id = ?, income_sig = ?, income_ver = ?,
                    collect_journal_id = ?, collect_sig = ?, collect_ver = ?,
                    handover_journal_id = ?, handover_sig = ?, handover_ver = ?
              WHERE id = ?`,
            [link.party_id, ref, status, desired.eligible ? null : desired.reason,
                link.income_journal_id, link.income_sig, link.income_ver,
                link.collect_journal_id, link.collect_sig, link.collect_ver,
                link.handover_journal_id, link.handover_sig, link.handover_ver, link.id]
        );
        await conn.commit();
        outcome = { status, note: desired.eligible ? null : desired.reason, posted, reversed };
    } catch (err) {
        await conn.rollback().catch(() => {});
        const known = err instanceof posting.PostingError;
        if (!known) console.error('[service-ledger]', kind, id, '—', err.message);
        await upsertStatus(conn, biz.id, kind, id, 'blocked', err.message, ref);
        outcome = { status: 'blocked', note: err.message };
    }
    return outcome;
}

/**
 * Look at every ticket billed since the start date and sync the ones that are
 * not what was last posted — a ticket changed by any route, however it got
 * there, is caught here. Also settles tickets that were deleted.
 */
async function sweep(getConn, { limit = 300, userId = null } = {}) {
    const conn = await getConn();
    try {
        const biz = await loadBusiness(conn);
        const from = biz ? ymd(biz.service_ledger_from) : null;
        if (!from) return { checked: 0, synced: 0, blocked: 0, skipped: 0, off: true };

        const [links] = await conn.query('SELECT * FROM service_ledger_links WHERE business_id = ?', [biz.id]);
        const linkOf = new Map(links.map((l) => [`${l.source_type}:${l.source_id}`, l]));

        const todo = [];
        for (const kind of Object.keys(KINDS)) {
            const [rows] = await conn.query(
                `SELECT * FROM ${KINDS[kind]}
                  WHERE bill_total > 0 AND COALESCE(bill_generated_at, payment_received_at, created_at) >= ?`, [from]
            );
            const ids = rows.map((r) => r.id);
            const items = new Map();
            if (kind === 'inquiry' && ids.length) {
                const [sums] = await conn.query(
                    `SELECT ref_id, COALESCE(SUM(quantity * rate), 0) AS total FROM bill_items
                      WHERE ref_type = 'inquiry' AND ref_id IN (?) GROUP BY ref_id`, [ids]
                );
                sums.forEach((s) => items.set(s.ref_id, money.toPaise(s.total)));
            }
            for (const row of rows) {
                const link = linkOf.get(`${kind}:${row.id}`);
                if (link && link.status === 'skipped' && /^Invoiced through Sales/.test(link.note || '')) continue;
                const d = describe(kind, row, { itemsPaise: items.get(row.id) || 0, from });
                const current = !!link && link.status === 'synced'
                    && (d.eligible
                        ? link.income_sig === d.sigs.income && link.collect_sig === d.sigs.collect && link.handover_sig === d.sigs.handover
                        : !link.income_journal_id && !link.collect_journal_id && !link.handover_journal_id);
                if (!current && !(link && link.status === 'skipped' && !d.eligible)) todo.push([kind, row.id]);
            }
        }

        // Deleted tickets that still have money posted against them.
        for (const link of links) {
            if (!link.income_journal_id && !link.collect_journal_id && !link.handover_journal_id) continue;
            const [[still]] = await conn.query(`SELECT id FROM ${KINDS[link.source_type]} WHERE id = ? LIMIT 1`, [link.source_id]);
            if (!still) todo.push([link.source_type, link.source_id]);
        }

        const counts = { checked: todo.length, synced: 0, blocked: 0, skipped: 0 };
        for (const [kind, id] of todo.slice(0, limit)) {
            const out = await syncTicket(conn, kind, id, { userId });
            if (counts[out.status] !== undefined) counts[out.status] += 1;
        }
        return counts;
    } finally {
        conn.release();
    }
}

module.exports = { ensureServiceLedgerSchema, describe, syncTicket, sweep, resolveParty, syncInstallationContacts, ymd, KINDS };
