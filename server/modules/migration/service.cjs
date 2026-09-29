'use strict';

// Stage 6 — bringing what already exists into the books.
//
// Three things were running before the accounts were: tickets billed and paid,
// stock on the shelf, and a hand-kept service register. Each is brought in the
// same way — looked at first (nothing written), then confirmed, with the books'
// own checks run before and after so the change is measured rather than hoped
// for. Every step can be repeated safely: what is already in is never posted
// twice.

const { createHash, randomUUID } = require('crypto');
const money = require('../money.cjs');
const posting = require('../ledger/posting.cjs');
const stock = require('../stock/engine.cjs');
const reports = require('../reports/service.cjs');
const serviceLedger = require('../service-ledger/service.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');

const ymd = serviceLedger.ymd;

class MigrationError extends Error {
    constructor(message, code = 'migration_error', status = 422) {
        super(message);
        this.name = 'MigrationError';
        this.code = code;
        this.status = status;
    }
}

const TABLES = [
    `CREATE TABLE IF NOT EXISTS migration_runs (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        kind VARCHAR(20) NOT NULL COMMENT 'tickets | stock | service_log',
        status VARCHAR(12) NOT NULL DEFAULT 'complete' COMMENT 'complete | partial',
        summary JSON NULL,
        before_checks JSON NULL,
        after_checks JSON NULL,
        before_ok TINYINT(1) NULL,
        after_ok TINYINT(1) NULL,
        created_by VARCHAR(36) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_migration_runs (business_id, created_at)
    )`,
    // What has been brought in from a source row, so it is never brought in twice.
    `CREATE TABLE IF NOT EXISTS migration_items (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        source_type VARCHAR(20) NOT NULL,
        source_id VARCHAR(36) NOT NULL,
        run_id VARCHAR(36) NULL,
        party_id VARCHAR(36) NULL,
        income_journal_id VARCHAR(36) NULL,
        collect_journal_id VARCHAR(36) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_migration_item (source_type, source_id)
    )`,
    // A note that someone was reminded. It moves no money and posts nothing.
    `CREATE TABLE IF NOT EXISTS payment_reminders (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        party_id VARCHAR(36) NOT NULL,
        amount_paise BIGINT NOT NULL DEFAULT 0,
        channel VARCHAR(12) NOT NULL DEFAULT 'whatsapp',
        created_by VARCHAR(36) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_reminder_party (business_id, party_id, created_at)
    )`,
];

async function ensureMigrationSchema(connection) {
    for (const statement of TABLES) await connection.query(statement);
    const [cols] = await connection.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'businesses' AND COLUMN_NAME = 'owner_digest_on'`
    );
    if (!cols.length) {
        console.log('[migration] adding businesses.owner_digest_on');
        await connection.query("ALTER TABLE businesses ADD COLUMN owner_digest_on TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'send the owner a summary each evening'");
    }
}

// ── measuring the books ─────────────────────────────────────────────────

async function snapshot(conn, businessId) {
    const r = await reports.reconciliation(conn, businessId, { asOn: reports.today() });
    return {
        ok: r.ok,
        checks: r.checks.map((c) => ({ key: c.key, label: c.label, ok: c.ok, a_paise: c.a_paise, b_paise: c.b_paise, difference_paise: c.difference_paise })),
    };
}

async function logRun(conn, { businessId, kind, status = 'complete', summary, before, after, userId }) {
    const id = randomUUID();
    await conn.query('INSERT INTO migration_runs SET ?', [{
        id, business_id: businessId, kind, status,
        summary: JSON.stringify(summary), before_checks: JSON.stringify(before), after_checks: JSON.stringify(after),
        before_ok: before.ok ? 1 : 0, after_ok: after.ok ? 1 : 0, created_by: userId || null,
    }]);
    return id;
}

async function runs(conn, businessId) {
    const [rows] = await conn.query(
        `SELECT r.id, r.kind, r.status, r.summary, r.before_checks, r.after_checks, r.before_ok, r.after_ok, r.created_at, p.full_name AS by_name
           FROM migration_runs r LEFT JOIN profiles p ON p.id = r.created_by
          WHERE r.business_id = ? ORDER BY r.created_at DESC LIMIT 100`, [businessId]
    );
    const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
    return rows.map((r) => ({
        id: r.id, kind: r.kind, status: r.status, created_at: r.created_at, by: r.by_name,
        summary: parse(r.summary), before: parse(r.before_checks), after: parse(r.after_checks),
        before_ok: !!r.before_ok, after_ok: !!r.after_ok,
    }));
}

// ── 1. tickets billed before the ledger started ─────────────────────────

const monthOf = (d) => String(d).slice(0, 7);

async function ticketPreview(conn, businessId, { from }) {
    const start = ymd(from);
    if (!start) throw new MigrationError('Choose a valid date', 'bad_date', 400);

    const [[biz]] = await conn.query('SELECT service_ledger_from, state_code FROM businesses WHERE id = ? LIMIT 1', [businessId]);
    const current = ymd(biz.service_ledger_from);
    if (current && start >= current) {
        throw new MigrationError(`Tickets are already being posted from ${current}. Choose an earlier date to bring older ones in.`, 'not_earlier', 400);
    }

    const [[lock]] = await conn.query('SELECT MAX(locked_upto) AS upto FROM period_locks WHERE business_id = ?', [businessId]);
    const lockedUpto = ymd(lock?.upto);

    const totals = { tickets: 0, billed_paise: 0, tax_paise: 0, discount_paise: 0, collected_paise: 0, outstanding_paise: 0, with_technicians_paise: 0, customers: 0, in_closed_period: 0 };
    const months = new Map();
    const skipped = {};
    const customers = new Set();
    const sample = [];

    for (const kind of Object.keys(serviceLedger.KINDS)) {
        const table = serviceLedger.KINDS[kind];
        const [rows] = await conn.query(
            `SELECT * FROM ${table}
              WHERE bill_total > 0 AND COALESCE(bill_generated_at, payment_received_at, created_at) >= ?
                ${current ? 'AND COALESCE(bill_generated_at, payment_received_at, created_at) < ?' : ''}
              ORDER BY COALESCE(bill_generated_at, payment_received_at, created_at) DESC`,
            current ? [start, current] : [start]
        );
        const ids = rows.map((r) => r.id);
        const items = new Map();
        if (kind === 'inquiry' && ids.length) {
            const [sums] = await conn.query(
                `SELECT ref_id, COALESCE(SUM(quantity * rate), 0) AS total FROM bill_items WHERE ref_type = 'inquiry' AND ref_id IN (?) GROUP BY ref_id`, [ids]
            );
            sums.forEach((s) => items.set(s.ref_id, money.toPaise(s.total)));
        }
        const [invoiced] = ids.length
            ? await conn.query(`SELECT source_id FROM sales_documents WHERE source_type = ? AND source_id IN (?) AND doc_type = 'invoice' AND status <> 'cancelled'`, [kind, ids])
            : [[]];
        const invoicedSet = new Set(invoiced.map((r) => r.source_id));

        for (const row of rows) {
            const d = serviceLedger.describe(kind, row, { itemsPaise: items.get(row.id) || 0, from: start });
            if (!d.eligible || invoicedSet.has(row.id)) {
                const why = invoicedSet.has(row.id) ? 'Already invoiced through Sales' : d.reason;
                skipped[why] = (skipped[why] || 0) + 1;
                continue;
            }
            const i = d.income;
            const paid = d.collect ? d.collect.total : 0;
            totals.tickets += 1;
            totals.billed_paise += i.total;
            totals.tax_paise += i.tax;
            totals.discount_paise += i.discount;
            totals.collected_paise += paid;
            totals.outstanding_paise += i.total - paid;
            if (d.collect && d.collect.where === 'technician' && !d.handover) totals.with_technicians_paise += paid;
            if (lockedUpto && i.date <= lockedUpto) totals.in_closed_period += 1;
            customers.add(String(row.phone || row.full_name || '').replace(/\D/g, '').slice(-10) || row.full_name);

            const m = months.get(monthOf(i.date)) || { month: monthOf(i.date), tickets: 0, billed_paise: 0, collected_paise: 0, outstanding_paise: 0 };
            m.tickets += 1; m.billed_paise += i.total; m.collected_paise += paid; m.outstanding_paise += i.total - paid;
            months.set(m.month, m);

            if (sample.length < 10) {
                sample.push({ ticket: row.ticket_no, kind, customer: row.full_name, date: i.date, total_paise: i.total, paid: !!d.collect });
            }
        }
    }
    totals.customers = customers.size;

    const warnings = [];
    const [[opening]] = await conn.query(
        `SELECT MAX(journal_date) AS latest, COUNT(*) AS n FROM journals WHERE business_id = ? AND source_type = 'opening'`, [businessId]
    );
    const [[partyOpening]] = await conn.query(
        `SELECT MAX(opening_balance_on) AS latest FROM parties WHERE business_id = ? AND opening_balance_paise > 0`, [businessId]
    );
    const openedOn = ymd(opening.latest) || ymd(partyOpening.latest);
    if (openedOn && totals.tickets) {
        warnings.push(`Opening balances were entered as of ${openedOn}. If those included what customers owed for these tickets, bringing the tickets in as well would count it twice — choose a start date on or after ${openedOn}, or clear those opening balances first.`);
    }
    if (totals.in_closed_period) {
        warnings.push(`${totals.in_closed_period} ticket(s) fall in a closed accounting period (locked up to ${lockedUpto}). They cannot be posted until the lock is lifted; the rest will be.`);
    }
    if (totals.tax_paise > 0 && !require('../gst.cjs').stateName(biz.state_code)) {
        warnings.push('The business state is not set, so tickets that carry GST cannot be posted. Set it under Business & Tax Setup first.');
    }

    return {
        from: start, current_from: current, up_to: current || reports.today(),
        totals, months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
        skipped: Object.entries(skipped).map(([reason, count]) => ({ reason, count })),
        sample, warnings,
    };
}

async function ticketApply(getConn, conn, { businessId, from, userId, budgetMs = 60000 }) {
    const plan = await ticketPreview(conn, businessId, { from });
    if (!plan.totals.tickets) throw new MigrationError('There are no billed tickets in that window to bring in', 'nothing_to_do', 400);

    const before = await snapshot(conn, businessId);
    await conn.query('UPDATE businesses SET service_ledger_from = ? WHERE id = ?', [plan.from, businessId]);

    // The same sweep that keeps new tickets in step does the work, so what it
    // posts is exactly what a ticket billed today would get.
    const started = Date.now();
    let synced = 0;
    let last = { checked: 0, blocked: 0, skipped: 0 };
    let passes = 0;
    do {
        last = await serviceLedger.sweep(getConn, { limit: 200, userId });
        synced += last.synced || 0;
        passes += 1;
    } while (last.checked > 200 && Date.now() - started < budgetMs && passes < 60);

    const after = await snapshot(conn, businessId);
    const partial = last.checked > 200;
    const summary = { from: plan.from, up_to: plan.up_to, expected: plan.totals, posted: synced, blocked: last.blocked || 0, skipped: last.skipped || 0, remaining_for_sweep: partial ? last.checked - 200 : 0 };
    const runId = await logRun(conn, { businessId, kind: 'tickets', status: partial ? 'partial' : 'complete', summary, before, after, userId });
    return { run_id: runId, status: partial ? 'partial' : 'complete', ...summary, before, after };
}

// ── 2. stock that was on the shelf before the books ─────────────────────

async function stockPreview(conn, businessId) {
    const [items] = await conn.query(
        `SELECT i.id, i.name, i.sku, i.unit, i.base_unit, i.quantity, i.avg_cost_paise, i.stock_value_paise,
                COALESCE(m.qty, 0) AS ledger_qty, COALESCE(m.value, 0) AS ledger_value
           FROM inventory_items i
           LEFT JOIN (SELECT item_id, SUM(quantity) AS qty, SUM(COALESCE(value_paise, 0)) AS value
                        FROM inventory_movements GROUP BY item_id) m ON m.item_id = i.id
          WHERE i.business_id = ? OR i.business_id IS NULL
          ORDER BY i.name`, [businessId]
    );

    const bookable = [];
    const flagged = [];
    for (const i of items) {
        const qty = stock.qty(i.quantity);
        const ledgerQty = stock.qty(i.ledger_qty);
        const deltaQty = stock.qty(qty - ledgerQty);
        const deltaValue = (Number(i.stock_value_paise) || 0) - Number(i.ledger_value);
        if (deltaValue === 0 && deltaQty === 0) continue;

        const row = {
            item_id: i.id, name: i.name, sku: i.sku, unit: i.base_unit || i.unit,
            on_hand: qty, in_movements: ledgerQty, unbooked_qty: deltaQty,
            avg_cost_paise: Number(i.avg_cost_paise) || 0, unbooked_value_paise: deltaValue,
        };
        if (deltaValue > 0 && deltaQty >= 0) bookable.push(row);
        else flagged.push({ ...row, reason: deltaQty < 0
            ? 'The movement history shows more stock than is recorded on hand — count this item and correct it with Adjust or a Stock Count'
            : 'The recorded value is less than what the movements add up to — check its cost' });
    }

    const [[inv]] = await conn.query(
        `SELECT COALESCE(SUM(l.debit_paise - l.credit_paise), 0) AS bal FROM journal_lines l JOIN journals j ON j.id = l.journal_id
           JOIN accounts a ON a.id = l.account_id WHERE j.business_id = ? AND a.code = '1200'`, [businessId]
    );
    const [[mv]] = await conn.query('SELECT COALESCE(SUM(value_paise), 0) AS v FROM inventory_movements');

    return {
        bookable, flagged,
        totals: { items: bookable.length, value_paise: bookable.reduce((s, r) => s + r.unbooked_value_paise, 0), flagged: flagged.length },
        ledger_inventory_paise: Number(inv.bal),
        movements_value_paise: Number(mv.v),
        // If the ledger and the movements already disagree, that is a separate
        // problem and this step will not hide it.
        ledger_vs_movements_paise: Number(inv.bal) - Number(mv.v),
    };
}

async function stockApply(conn, { businessId, date, itemIds = null, userId }) {
    const day = ymd(date);
    if (!day) throw new MigrationError('Choose the date the opening stock counts from', 'no_date', 400);

    const plan = await stockPreview(conn, businessId);
    const chosen = plan.bookable.filter((r) => !itemIds || itemIds.includes(r.item_id));
    if (!chosen.length) throw new MigrationError('There is no unbooked stock to bring in', 'nothing_to_do', 400);

    const before = await snapshot(conn, businessId);
    const [[location]] = await conn.query('SELECT id FROM stock_locations WHERE business_id = ? AND is_default = 1 LIMIT 1', [businessId]);
    const total = chosen.reduce((s, r) => s + r.unbooked_value_paise, 0);

    await conn.beginTransaction();
    let journalId;
    try {
        const movementIds = [];
        for (const r of chosen) {
            const id = randomUUID();
            movementIds.push(id);
            // A movement that records stock already counted on the item: the item's
            // own quantity and cost are not touched, only the ledger catches up.
            await conn.query('INSERT INTO inventory_movements SET ?', [{
                id, business_id: businessId, item_id: r.item_id, type: 'opening',
                quantity: Math.max(0, r.unbooked_qty),
                rate: r.unbooked_qty > 0 ? Math.round(r.unbooked_value_paise / r.unbooked_qty) / 100 : r.avg_cost_paise / 100,
                unit_cost_paise: r.unbooked_qty > 0 ? Math.round(r.unbooked_value_paise / r.unbooked_qty) : r.avg_cost_paise,
                value_paise: r.unbooked_value_paise, balance_qty: r.on_hand,
                location_id: location?.id || null, source_type: 'opening',
                note: 'Opening stock brought into the books', created_by: userId || null,
            }]);
        }
        const inventory = await posting.accountByCode(conn, businessId, '1200');
        const equity = await posting.accountByCode(conn, businessId, '3100');
        const fingerprint = createHash('sha256').update(JSON.stringify([day, chosen.map((r) => [r.item_id, r.unbooked_value_paise])])).digest('hex').slice(0, 32);
        const journal = await posting.postJournal(conn, {
            businessId, date: day, narration: `Opening stock brought into the books (${chosen.length} item${chosen.length === 1 ? '' : 's'})`,
            sourceType: 'opening', sourceId: null,
            lines: [
                { account_id: inventory.id, debit_paise: total, memo: 'Stock already on the shelf' },
                { account_id: equity.id, credit_paise: total, memo: 'Opening stock' },
            ],
            idempotencyKey: `stock-opening:${fingerprint}`, postedBy: userId || null,
        });
        journalId = journal.id;
        await conn.query('UPDATE inventory_movements SET journal_id = ? WHERE id IN (?)', [journalId, movementIds]);
        await conn.commit();
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    }

    const after = await snapshot(conn, businessId);
    const summary = { date: day, items: chosen.length, value_paise: total, journal_id: journalId, flagged_left: plan.flagged.length };
    const runId = await logRun(conn, { businessId, kind: 'stock', summary, before, after, userId });
    return { run_id: runId, ...summary, before, after };
}

// ── 3. the hand-kept service register ───────────────────────────────────

async function serviceLogPreview(conn, businessId, { from = null, to = null } = {}) {
    const where = [];
    const params = [];
    if (from) { where.push('s.log_date >= ?'); params.push(ymd(from)); }
    if (to) { where.push('s.log_date <= ?'); params.push(ymd(to)); }

    const [rows] = await conn.query(
        `SELECT s.id, DATE_FORMAT(s.log_date, '%Y-%m-%d') AS log_date, s.ticket_no, s.inquiry_id, s.technician_name, s.customer_name,
                s.customer_phone, s.service_type, s.amount, s.payment_status,
                mi.id AS migrated_id,
                (q.id IS NOT NULL OR (COALESCE(s.ticket_no, '') <> '' AND
                    (EXISTS (SELECT 1 FROM inquiries x WHERE x.ticket_no = s.ticket_no)
                     OR EXISTS (SELECT 1 FROM installations y WHERE y.ticket_no = s.ticket_no)))) AS on_ticket
           FROM service_logs s
           LEFT JOIN migration_items mi ON mi.source_type = 'service_log' AND mi.source_id = s.id
           LEFT JOIN inquiries q ON q.id = s.inquiry_id
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY s.log_date DESC LIMIT 3000`, params
    );

    const candidates = [];
    const counts = { total: rows.length, already_in: 0, on_a_ticket: 0, no_amount: 0 };
    for (const r of rows) {
        if (r.migrated_id) { counts.already_in += 1; continue; }
        if (Number(r.on_ticket)) { counts.on_a_ticket += 1; continue; }
        const amount = money.toPaise(r.amount);
        if (!(amount > 0)) { counts.no_amount += 1; continue; }
        candidates.push({
            id: r.id, date: r.log_date, customer: r.customer_name, phone: r.customer_phone, service: r.service_type,
            technician: r.technician_name, amount_paise: amount, status: r.payment_status,
        });
    }
    const sum = (list) => list.reduce((s, c) => s + c.amount_paise, 0);
    return {
        candidates, counts,
        totals: {
            entries: candidates.length, billed_paise: sum(candidates),
            paid_paise: sum(candidates.filter((c) => c.status === 'paid')),
            unpaid_paise: sum(candidates.filter((c) => c.status !== 'paid')),
        },
        note: 'Entries that are already on a ticket are left out — the ticket posts them. What is listed had no ticket. They are booked as service income with no GST, for the amount written in the register.',
    };
}

async function serviceLogApply(conn, { businessId, ids, paidInto = 'cash', userId }) {
    if (!Array.isArray(ids) || !ids.length) throw new MigrationError('Choose at least one entry', 'nothing_chosen', 400);
    if (!['cash', 'bank'].includes(paidInto)) throw new MigrationError('Say where the paid money went: cash or bank', 'bad_account', 400);

    const plan = await serviceLogPreview(conn, businessId);
    const byId = new Map(plan.candidates.map((c) => [c.id, c]));
    const before = await snapshot(conn, businessId);
    const [[biz]] = await conn.query('SELECT state_code FROM businesses WHERE id = ? LIMIT 1', [businessId]);

    const results = [];
    let posted = 0;
    let billed = 0;
    let collected = 0;

    for (const id of ids) {
        const c = byId.get(id);
        if (!c) { results.push({ id, ok: false, error: 'Not available — already brought in, on a ticket, or has no amount' }); continue; }
        try {
            await conn.beginTransaction();
            const partyId = await serviceLedger.resolveParty(conn, businessId, { phone: c.phone, full_name: c.customer }, biz.state_code);
            const receivable = await posting.accountByCode(conn, businessId, '1100');
            const sales = await posting.accountByCode(conn, businessId, '4010');
            const narration = `Service register — ${String(c.customer || '').slice(0, 60)}${c.service ? ` (${String(c.service).slice(0, 60)})` : ''}`;

            const income = await posting.postJournal(conn, {
                businessId, date: c.date, narration, sourceType: 'migration', sourceId: id,
                lines: [
                    { account_id: receivable.id, debit_paise: c.amount_paise, party_id: partyId, memo: 'From the service register' },
                    { account_id: sales.id, credit_paise: c.amount_paise, memo: 'Service charges (no GST recorded)' },
                ],
                idempotencyKey: `migrate:servicelog:${id}:income`, postedBy: userId || null,
            });
            let collectId = null;
            if (c.status === 'paid') {
                const into = await posting.accountByCode(conn, businessId, paidInto === 'bank' ? '1010' : '1000');
                const pay = await posting.postJournal(conn, {
                    businessId, date: c.date, narration: `${narration} — paid`, sourceType: 'migration', sourceId: id,
                    lines: [
                        { account_id: into.id, debit_paise: c.amount_paise, memo: 'Received' },
                        { account_id: receivable.id, credit_paise: c.amount_paise, party_id: partyId, memo: 'Paid' },
                    ],
                    idempotencyKey: `migrate:servicelog:${id}:collect`, postedBy: userId || null,
                });
                collectId = pay.id;
                collected += c.amount_paise;
            }
            await conn.query('INSERT INTO migration_items SET ?', [{
                id: randomUUID(), business_id: businessId, source_type: 'service_log', source_id: id,
                party_id: partyId, income_journal_id: income.id, collect_journal_id: collectId,
            }]);
            await conn.commit();
            posted += 1;
            billed += c.amount_paise;
            results.push({ id, ok: true });
        } catch (err) {
            await conn.rollback().catch(() => {});
            const known = err instanceof posting.PostingError;
            if (!known) console.error('[migration] service log', id, '—', err.message);
            results.push({ id, ok: false, error: err.message });
        }
    }

    const after = await snapshot(conn, businessId);
    const summary = { entries: ids.length, posted, failed: ids.length - posted, billed_paise: billed, collected_paise: collected, paid_into: paidInto };
    const runId = await logRun(conn, { businessId, kind: 'service_log', status: posted === ids.length ? 'complete' : 'partial', summary, before, after, userId });
    return { run_id: runId, ...summary, results, before, after };
}

// ── the evening summary ─────────────────────────────────────────────────

async function sendDigest({ getConn, recordNotification, force = false, now = new Date() }) {
    const conn = await getConn();
    try {
        const businessId = await defaultBusinessId(conn);
        if (!businessId) return { sent: false, why: 'No business configured' };
        const [[biz]] = await conn.query('SELECT owner_digest_on FROM businesses WHERE id = ? LIMIT 1', [businessId]);
        if (!force && !biz.owner_digest_on) return { sent: false, why: 'Switched off' };
        if (!force && now.getHours() < 20) return { sent: false, why: 'Not evening yet' };

        const on = reports.ymd(now);
        const [[seen]] = await conn.query("SELECT setting_value FROM app_settings WHERE setting_key = 'last_owner_digest' LIMIT 1").catch(() => [[null]]);
        if (!force && seen && seen.setting_value === on) return { sent: false, why: 'Already sent today' };

        const [[any]] = await conn.query('SELECT COUNT(*) AS n FROM journals WHERE business_id = ?', [businessId]);
        if (!Number(any.n)) return { sent: false, why: 'Nothing in the books yet' };

        const summary = await reports.ownerSummary(conn, businessId, { on });
        const text = reports.digestText(summary);
        await recordNotification({
            subject: 'owner_summary', title: '📒 Aaj ka hisaab', body: text,
            audience: { role: 'admin' }, data: { as_on: on, kind: 'owner_summary' },
        });
        await conn.query(
            "INSERT INTO app_settings (setting_key, setting_value) VALUES ('last_owner_digest', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", [on]
        );
        return { sent: true, text, as_on: on };
    } finally {
        conn.release();
    }
}

module.exports = {
    MigrationError, ensureMigrationSchema, snapshot, runs,
    ticketPreview, ticketApply, stockPreview, stockApply, serviceLogPreview, serviceLogApply, sendDigest,
};
