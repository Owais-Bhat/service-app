'use strict';

// The posting engine. Everything financial in the system ends up here, and
// these are the rules it will not bend:
//
//   1. A journal must balance. Debits equal credits, in integer paise.
//   2. A posted journal is never edited or deleted. A mistake is corrected by
//      a reversal that points back at the original.
//   3. Nothing posts into a locked period.
//   4. A retried request re-finds its own journal instead of posting twice.
//
// Callers pass a connection so a journal, its document and its stock movements
// commit or fail together.

const { randomUUID } = require('crypto');
const { assertPaise } = require('../money.cjs');
const { fyLabel } = require('./schema.cjs');

class PostingError extends Error {
    constructor(message, code = 'posting_error') {
        super(message);
        this.name = 'PostingError';
        this.code = code;
    }
}

const ymd = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) throw new PostingError('Invalid date', 'bad_date');
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// ── period locks ────────────────────────────────────────────────────────
async function assertPeriodOpen(conn, businessId, date) {
    const [[lock]] = await conn.query(
        'SELECT locked_upto FROM period_locks WHERE business_id = ? ORDER BY locked_upto DESC LIMIT 1',
        [businessId]
    );
    if (!lock) return;
    if (ymd(date) <= ymd(lock.locked_upto)) {
        throw new PostingError(
            `The books are closed up to ${ymd(lock.locked_upto)} — this entry cannot be posted into that period.`,
            'period_locked'
        );
    }
}

// Prefixes for documents raised before anyone configured a series for them.
const DEFAULT_PREFIXES = {
    invoice: 'INV', estimate: 'EST', proforma: 'PI', credit_note: 'CN', debit_note: 'DN',
    sales_order: 'SO', delivery_challan: 'DC', receipt: 'RCT', payment: 'PAY',
    purchase_order: 'PO', goods_receipt: 'GRN', supplier_bill: 'SB', purchase_return: 'PR',
    journal: 'JV', expense: 'EXP', stock_count: 'SC', material_issue: 'MI',
};

// ── document numbers ────────────────────────────────────────────────────
// Atomic by design: the UPDATE both reserves the number and remembers it on
// this connection, so two simultaneous invoices get two different numbers even
// under load. LAST_INSERT_ID(expr) is MySQL's documented way to read back a
// value an UPDATE just set, and it is per-connection.
async function allocateNumber(conn, businessId, docType, date = new Date()) {
    const [[biz]] = await conn.query('SELECT fy_start_month FROM businesses WHERE id = ? LIMIT 1', [businessId]);
    const label = fyLabel(date, biz?.fy_start_month || 4);

    let [[series]] = await conn.query(
        'SELECT * FROM number_series WHERE business_id = ? AND doc_type = ? AND fy_label IN (?, ?) ORDER BY fy_label DESC LIMIT 1',
        [businessId, docType, label, 'ALL']
    );

    if (!series) {
        // A new financial year, or a document type nobody has raised yet. The
        // prefix is the one an accountant would expect to see on that kind of
        // document, not the first three letters of a column value.
        const id = randomUUID();
        await conn.query('INSERT INTO number_series SET ?', [{
            id, business_id: businessId, doc_type: docType, fy_label: label,
            prefix: `${DEFAULT_PREFIXES[docType] || docType.split('_').map((w) => w[0]).join('').toUpperCase()}-${label.replace('-', '')}-`,
            padding: 4, next_number: 1, reset_policy: 'fy', active: 1,
        }]);
        [[series]] = await conn.query('SELECT * FROM number_series WHERE id = ?', [id]);
    }

    await conn.query(
        'UPDATE number_series SET next_number = LAST_INSERT_ID(next_number) + 1 WHERE id = ?',
        [series.id]
    );
    const [[{ n }]] = await conn.query('SELECT LAST_INSERT_ID() AS n');

    return `${series.prefix || ''}${String(n).padStart(series.padding || 1, '0')}${series.suffix || ''}`;
}

// ── posting ─────────────────────────────────────────────────────────────
function validateLines(lines) {
    if (!Array.isArray(lines) || lines.length < 2) {
        throw new PostingError('A journal needs at least two lines', 'too_few_lines');
    }

    let debits = 0;
    let credits = 0;
    lines.forEach((line, i) => {
        if (!line.account_id) throw new PostingError(`Line ${i + 1} has no account`, 'missing_account');
        const debit = assertPaise(line.debit_paise || 0);
        const credit = assertPaise(line.credit_paise || 0);
        if (debit < 0 || credit < 0) throw new PostingError(`Line ${i + 1} is negative — post the other side instead`, 'negative_line');
        if (debit && credit) throw new PostingError(`Line ${i + 1} is both a debit and a credit`, 'two_sided_line');
        if (!debit && !credit) throw new PostingError(`Line ${i + 1} has no amount`, 'empty_line');
        debits += debit;
        credits += credit;
    });

    if (debits !== credits) {
        throw new PostingError(
            `Journal does not balance: debits ${debits} paise, credits ${credits} paise`,
            'unbalanced'
        );
    }
    return debits;
}

/**
 * Post a balanced journal. The caller owns the transaction.
 *
 * @param {object} conn      an open mysql2 connection, ideally inside a transaction
 * @param {object} entry
 * @param {string} entry.businessId
 * @param {Date|string} entry.date
 * @param {Array}  entry.lines      [{ account_id, debit_paise|credit_paise, party_id?, memo? }]
 * @param {string} [entry.idempotencyKey]  same key twice returns the first journal
 */
async function postJournal(conn, entry) {
    const {
        businessId, date, narration = null, sourceType = 'manual', sourceId = null,
        lines, idempotencyKey = null, postedBy = null, journalNo = null,
    } = entry;

    if (!businessId) throw new PostingError('No business to post against', 'no_business');

    if (idempotencyKey) {
        const [[seen]] = await conn.query('SELECT * FROM journals WHERE idempotency_key = ? LIMIT 1', [idempotencyKey]);
        if (seen) return { ...seen, reused: true };
    }

    const total = validateLines(lines);
    await assertPeriodOpen(conn, businessId, date);

    const id = randomUUID();
    const number = journalNo || await allocateNumber(conn, businessId, 'journal', date);

    try {
        await conn.query('INSERT INTO journals SET ?', [{
            id,
            business_id: businessId,
            journal_no: number,
            journal_date: ymd(date),
            narration,
            source_type: sourceType,
            source_id: sourceId,
            status: 'posted',
            idempotency_key: idempotencyKey,
            total_paise: total,
            posted_by: postedBy,
        }]);
    } catch (err) {
        // Two identical requests raced. The loser has to read the winner's
        // journal — and it must be a locking read: this transaction's snapshot
        // was taken before the winner committed, so a plain SELECT would still
        // see nothing and we would post a second journal for the same request.
        if (/duplicate/i.test(err.message) && idempotencyKey) {
            const [[seen]] = await conn.query(
                'SELECT * FROM journals WHERE idempotency_key = ? LIMIT 1 FOR SHARE', [idempotencyKey]
            );
            if (seen) return { ...seen, reused: true };
        }
        throw err;
    }

    let lineNo = 0;
    for (const line of lines) {
        lineNo += 1;
        await conn.query('INSERT INTO journal_lines SET ?', [{
            id: randomUUID(),
            journal_id: id,
            line_no: lineNo,
            account_id: line.account_id,
            debit_paise: line.debit_paise || 0,
            credit_paise: line.credit_paise || 0,
            party_id: line.party_id || null,
            memo: line.memo || null,
        }]);
    }

    const [[saved]] = await conn.query('SELECT * FROM journals WHERE id = ?', [id]);
    return { ...saved, reused: false };
}

// A correction is its own entry: the same lines, the sides swapped, linked in
// both directions so the history reads straight.
async function reverseJournal(conn, { journalId, date = new Date(), reason = null, postedBy = null }) {
    const [[original]] = await conn.query('SELECT * FROM journals WHERE id = ? LIMIT 1', [journalId]);
    if (!original) throw new PostingError('No such journal', 'not_found');
    if (original.status === 'reversed') throw new PostingError('That journal was already reversed', 'already_reversed');

    const [lines] = await conn.query('SELECT * FROM journal_lines WHERE journal_id = ? ORDER BY line_no', [journalId]);
    const flipped = lines.map((l) => ({
        account_id: l.account_id,
        debit_paise: Number(l.credit_paise),
        credit_paise: Number(l.debit_paise),
        party_id: l.party_id,
        memo: l.memo,
    }));

    const reversal = await postJournal(conn, {
        businessId: original.business_id,
        date,
        narration: `Reversal of ${original.journal_no}${reason ? ` — ${reason}` : ''}`,
        sourceType: original.source_type,
        sourceId: original.source_id,
        lines: flipped,
        postedBy,
    });

    await conn.query(
        'UPDATE journals SET status = ?, reversed_by_id = ?, reversal_reason = ? WHERE id = ?',
        ['reversed', reversal.id, reason, journalId]
    );
    await conn.query('UPDATE journals SET reversal_of_id = ? WHERE id = ?', [journalId, reversal.id]);

    return reversal;
}

// ── reading the ledger ──────────────────────────────────────────────────
// Reports derive from posted journals, never from a status column someone set
// by hand. A reversed journal keeps its lines — its reversal cancels it out —
// so balances stay arithmetic rather than conditional.
async function trialBalance(conn, businessId, { from = null, to = null } = {}) {
    const where = ['j.business_id = ?'];
    const params = [businessId];
    if (from) { where.push('j.journal_date >= ?'); params.push(ymd(from)); }
    if (to) { where.push('j.journal_date <= ?'); params.push(ymd(to)); }

    const [rows] = await conn.query(
        `SELECT a.id, a.code, a.name, a.type, a.subtype,
                COALESCE(SUM(l.debit_paise), 0)  AS debit_paise,
                COALESCE(SUM(l.credit_paise), 0) AS credit_paise
           FROM accounts a
           LEFT JOIN journal_lines l ON l.account_id = a.id
           LEFT JOIN journals j ON j.id = l.journal_id AND ${where.join(' AND ')}
          WHERE a.business_id = ?
          GROUP BY a.id, a.code, a.name, a.type, a.subtype
          ORDER BY a.code`,
        [...params, businessId]
    );

    const accounts = rows.map((r) => {
        const debit = Number(r.debit_paise);
        const credit = Number(r.credit_paise);
        const net = debit - credit;
        return {
            id: r.id, code: r.code, name: r.name, type: r.type, subtype: r.subtype,
            debit_paise: debit, credit_paise: credit,
            // Assets and expenses sit on the debit side; the rest on the credit side.
            balance_paise: ['asset', 'expense'].includes(r.type) ? net : -net,
        };
    });

    const totals = accounts.reduce(
        (acc, a) => ({ debit_paise: acc.debit_paise + a.debit_paise, credit_paise: acc.credit_paise + a.credit_paise }),
        { debit_paise: 0, credit_paise: 0 }
    );

    return { accounts, totals, balanced: totals.debit_paise === totals.credit_paise };
}

async function accountByCode(conn, businessId, code) {
    const [[row]] = await conn.query(
        'SELECT * FROM accounts WHERE business_id = ? AND code = ? LIMIT 1', [businessId, code]
    );
    if (!row) throw new PostingError(`Chart of accounts is missing ${code}`, 'missing_account');
    return row;
}

// What a customer owes (positive) or what we owe a supplier (positive on the
// payable side) — straight from the ledger lines tagged with that party.
async function partyBalance(conn, businessId, partyId) {
    const [[row]] = await conn.query(
        `SELECT COALESCE(SUM(l.debit_paise), 0) d, COALESCE(SUM(l.credit_paise), 0) c
           FROM journal_lines l
           JOIN journals j ON j.id = l.journal_id
           JOIN accounts a ON a.id = l.account_id
          WHERE j.business_id = ? AND l.party_id = ? AND a.subtype IN ('receivable', 'payable')`,
        [businessId, partyId]
    );
    return { receivable_paise: Number(row.d) - Number(row.c) };
}

// Convenience for callers that just need one entry committed on its own.
async function withTransaction(conn, fn) {
    await conn.beginTransaction();
    try {
        const out = await fn();
        await conn.commit();
        return out;
    } catch (err) {
        await conn.rollback();
        throw err;
    }
}

module.exports = {
    PostingError,
    postJournal,
    reverseJournal,
    trialBalance,
    accountByCode,
    partyBalance,
    allocateNumber,
    assertPeriodOpen,
    withTransaction,
    validateLines,
};
