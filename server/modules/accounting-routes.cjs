'use strict';

// Stage 1 API: the masters and the ledger.
//
// Mounted from server/index.cjs with the app's own connection pool and token
// check, so authentication, sessions and deployment stay exactly as they were.
// Every route is guarded by a capability, checked here on the server.

const { randomUUID } = require('crypto');
const money = require('./money.cjs');
const gst = require('./gst.cjs');
const { defaultBusinessId, fyLabel } = require('./ledger/schema.cjs');
const posting = require('./ledger/posting.cjs');

const ymd = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    return Number.isNaN(date.getTime()) ? null
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const clean = (v, max = 255) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);

function mountAccounting({ app, getConn, authenticateToken, permissions, audit }) {
    const { requireCap, capabilitiesOf, CAPABILITIES } = permissions;

    // Every route below needs a business to belong to.
    async function business(conn) {
        const id = await defaultBusinessId(conn);
        if (!id) throw new Error('No business configured');
        return id;
    }

    const handle = (fn) => async (req, res) => {
        let connection;
        try {
            connection = await getConn();
            await fn(req, res, connection);
        } catch (err) {
            if (err instanceof posting.PostingError) {
                return res.status(422).json({ error: err.message, code: err.code });
            }
            console.error('[accounting]', req.method, req.path, '—', err.message);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    };

    // ── what this user may do ───────────────────────────────────────────
    app.get('/api/accounting/capabilities', authenticateToken, handle(async (req, res) => {
        res.json({ capabilities: await capabilitiesOf(req.user), catalogue: CAPABILITIES });
    }));

    // ── the issuing business ────────────────────────────────────────────
    app.get('/api/accounting/business', authenticateToken, handle(async (req, res, conn) => {
        const [[row]] = await conn.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
        if (!row) return res.status(404).json({ error: 'No business configured' });
        // The bank details are part of the invoice; the whole row is office
        // information, so it is readable by anyone who can see a document.
        res.json({
            business: row,
            fy_label: fyLabel(new Date(), row.fy_start_month || 4),
            // What still has to be answered before tax documents are legal.
            setup_pending: [
                !row.legal_name && 'Legal business name',
                !row.address_line1 && 'Registered address',
                !row.state_code && 'State (decides CGST/SGST vs IGST)',
                row.registration_type === 'regular' && !row.gstin && 'GSTIN',
                !row.bank_name && 'Bank details for the invoice footer',
            ].filter(Boolean),
        });
    }));

    app.put('/api/accounting/business', authenticateToken, requireCap('business.manage'), handle(async (req, res, conn) => {
        const [[before]] = await conn.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
        if (!before) return res.status(404).json({ error: 'No business configured' });

        const b = req.body || {};
        if (b.gstin) {
            const check = gst.validateGstin(b.gstin);
            if (!check.valid) return res.status(400).json({ error: `GSTIN: ${check.reason}` });
            // The state in a GSTIN is the state of registration; keep the two
            // from disagreeing silently.
            if (b.state_code && b.state_code !== check.state_code) {
                return res.status(400).json({ error: `That GSTIN is registered in ${gst.stateName(check.state_code)}, not ${gst.stateName(b.state_code) || b.state_code}` });
            }
            b.state_code = check.state_code;
        }
        if (b.state_code) {
            const name = gst.stateName(b.state_code);
            if (!name) return res.status(400).json({ error: 'Unknown state code' });
            b.state_name = name;
        }
        if (b.registration_type && !['regular', 'composition', 'unregistered'].includes(b.registration_type)) {
            return res.status(400).json({ error: 'Registration type must be regular, composition or unregistered' });
        }

        const fields = [
            'legal_name', 'trade_name', 'address_line1', 'address_line2', 'city', 'state_code', 'state_name',
            'pincode', 'phone', 'email', 'website', 'gstin', 'pan', 'registration_type', 'fy_start_month',
            'logo_url', 'signature_url', 'invoice_footer', 'payment_instructions',
            'bank_name', 'bank_account_no', 'bank_ifsc', 'bank_branch', 'upi_id', 'setup_complete',
        ];
        const updates = {};
        for (const f of fields) if (f in b) updates[f] = b[f] === '' ? null : b[f];
        if (!Object.keys(updates).length) return res.json({ business: before });

        await conn.query('UPDATE businesses SET ? WHERE id = ?', [updates, before.id]);
        const [[after]] = await conn.query('SELECT * FROM businesses WHERE id = ?', [before.id]);

        audit.record({
            actor: req.user, action: 'business.update', entityType: 'business', entityId: before.id,
            before, after, reason: clean(b.reason, 500), ip: req.ip,
        });
        res.json({ business: after });
    }));

    // ── parties ─────────────────────────────────────────────────────────
    // Who matches a request: the kind of party, active or not, and a search over name, phone, GSTIN and email.
    function partyFilter(businessId, { kind, q, active = '1' }) {
        const where = ['p.business_id = ?', 'p.merged_into_id IS NULL'];
        const params = [businessId];
        if (kind && kind !== 'all') { where.push("(p.kind = ? OR p.kind = 'both')"); params.push(kind); }
        if (active !== 'all') { where.push('p.active = ?'); params.push(active === '1' ? 1 : 0); }
        if (q) {
            where.push('(p.display_name LIKE ? OR p.phone LIKE ? OR p.gstin LIKE ? OR p.email LIKE ?)');
            const like = `%${q}%`;
            params.push(like, like, like, like);
        }
        return { where: where.join(' AND '), params };
    }

    // The balance comes from the ledger, not from a stored field, so it can never disagree with the accounts.
    const BALANCE_JOINS = `
               LEFT JOIN journal_lines l ON l.party_id = p.id
               LEFT JOIN journals j ON j.id = l.journal_id
               LEFT JOIN accounts a ON a.id = l.account_id AND a.subtype IN ('receivable', 'payable')`;

    // One page of parties, in name order. `offset` walks through the rest; the page size is up to 5000 (a picker
    // that wants everyone asks for that).
    app.get('/api/parties', authenticateToken, requireCap('party.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const { where, params } = partyFilter(businessId, req.query);
        const [rows] = await conn.query(
            `SELECT p.*,
                    COALESCE(SUM(l.debit_paise), 0) - COALESCE(SUM(l.credit_paise), 0) AS balance_paise
               FROM parties p ${BALANCE_JOINS}
              WHERE ${where}
              GROUP BY p.id
              ORDER BY p.display_name
              LIMIT ? OFFSET ?`,
            [...params, Math.min(Number(req.query.limit) || 200, 5000), Math.max(Number(req.query.offset) || 0, 0)]
        );
        res.json(rows);
    }));

    // How many, and what they owe in all — over *every* matching party, not just the page on screen.
    app.get('/api/parties/summary', authenticateToken, requireCap('party.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const { where, params } = partyFilter(businessId, req.query);
        const [[s]] = await conn.query(
            `SELECT COUNT(*) AS count,
                    COALESCE(SUM(b > 0), 0) AS owing_count, COALESCE(SUM(CASE WHEN b > 0 THEN b ELSE 0 END), 0) AS owing_paise,
                    COALESCE(SUM(b < 0), 0) AS credit_count, COALESCE(SUM(CASE WHEN b < 0 THEN -b ELSE 0 END), 0) AS credit_paise,
                    COALESCE(SUM(b), 0) AS net_paise
               FROM (SELECT p.id, COALESCE(SUM(l.debit_paise), 0) - COALESCE(SUM(l.credit_paise), 0) AS b
                       FROM parties p ${BALANCE_JOINS}
                      WHERE ${where}
                      GROUP BY p.id) t`,
            params
        );
        res.json({
            count: Number(s.count), owing_count: Number(s.owing_count), owing_paise: Number(s.owing_paise),
            credit_count: Number(s.credit_count), credit_paise: Number(s.credit_paise), net_paise: Number(s.net_paise),
        });
    }));

    app.get('/api/parties/:id', authenticateToken, requireCap('party.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const [[party]] = await conn.query('SELECT * FROM parties WHERE id = ? LIMIT 1', [req.params.id]);
        if (!party) return res.status(404).json({ error: 'No such party' });
        const [addresses] = await conn.query('SELECT * FROM party_addresses WHERE party_id = ?', [party.id]);
        const balance = await posting.partyBalance(conn, businessId, party.id);
        res.json({ party, addresses, ...balance });
    }));

    async function writeParty(req, conn, existing = null) {
        const b = req.body || {};
        const businessId = await business(conn);

        if (b.gstin) {
            const check = gst.validateGstin(b.gstin);
            if (!check.valid) throw Object.assign(new Error(`GSTIN: ${check.reason}`), { status: 400 });
            b.gstin = check.gstin;
            if (!b.place_of_supply_state_code) b.place_of_supply_state_code = check.state_code;
            // A party who hands over a GSTIN is registered, whatever the form said.
            if (!b.gst_treatment || b.gst_treatment === 'unregistered') b.gst_treatment = 'registered';
        }
        if (b.place_of_supply_state_code && !gst.stateName(b.place_of_supply_state_code)) {
            throw Object.assign(new Error('Unknown state code for place of supply'), { status: 400 });
        }

        const row = {
            business_id: businessId,
            kind: ['customer', 'supplier', 'both'].includes(b.kind) ? b.kind : (existing?.kind || 'customer'),
            display_name: clean(b.display_name, 200) || existing?.display_name,
            legal_name: clean(b.legal_name, 200),
            phone: clean(b.phone, 20),
            alt_phone: clean(b.alt_phone, 20),
            email: clean(b.email, 160),
            gst_treatment: b.gst_treatment || existing?.gst_treatment || 'unregistered',
            gstin: clean(b.gstin, 15),
            pan: clean(b.pan, 10),
            place_of_supply_state_code: clean(b.place_of_supply_state_code, 2),
            credit_days: Number(b.credit_days) || 0,
            credit_limit_paise: money.toPaise(b.credit_limit ?? 0),
            opening_balance_paise: money.toPaise(b.opening_balance ?? 0),
            opening_balance_type: b.opening_balance_type === 'payable' ? 'payable' : 'receivable',
            opening_balance_on: b.opening_balance_on ? ymd(b.opening_balance_on) : null,
            notes: clean(b.notes, 2000),
            active: b.active === undefined ? (existing?.active ?? 1) : (b.active ? 1 : 0),
        };
        if (!row.display_name) throw Object.assign(new Error('A name is required'), { status: 400 });
        return row;
    }

    app.post('/api/parties', authenticateToken, requireCap('party.manage'), handle(async (req, res, conn) => {
        let row;
        try { row = await writeParty(req, conn); } catch (err) {
            return res.status(err.status || 400).json({ error: err.message });
        }
        const id = randomUUID();
        await conn.query('INSERT INTO parties SET ?', [{ id, ...row, created_by: req.user.id }]);

        // Addresses arrive with the party so the first invoice has somewhere to
        // ship to.
        for (const addr of (req.body?.addresses || [])) {
            await conn.query('INSERT INTO party_addresses SET ?', [{
                id: randomUUID(), party_id: id,
                kind: addr.kind === 'shipping' ? 'shipping' : 'billing',
                label: clean(addr.label, 80),
                line1: clean(addr.line1), line2: clean(addr.line2),
                city: clean(addr.city, 120), state_code: clean(addr.state_code, 2),
                state_name: gst.stateName(addr.state_code), pincode: clean(addr.pincode, 10),
                is_default: addr.is_default ? 1 : 0,
            }]);
        }

        const [[saved]] = await conn.query('SELECT * FROM parties WHERE id = ?', [id]);
        audit.record({ actor: req.user, action: 'party.create', entityType: 'party', entityId: id, after: saved, ip: req.ip });
        res.status(201).json(saved);
    }));

    app.patch('/api/parties/:id', authenticateToken, requireCap('party.manage'), handle(async (req, res, conn) => {
        const [[before]] = await conn.query('SELECT * FROM parties WHERE id = ? LIMIT 1', [req.params.id]);
        if (!before) return res.status(404).json({ error: 'No such party' });

        let row;
        try { row = await writeParty(req, conn, before); } catch (err) {
            return res.status(err.status || 400).json({ error: err.message });
        }
        delete row.business_id;
        await conn.query('UPDATE parties SET ? WHERE id = ?', [row, before.id]);
        const [[after]] = await conn.query('SELECT * FROM parties WHERE id = ?', [before.id]);

        audit.record({
            actor: req.user, action: 'party.update', entityType: 'party', entityId: before.id,
            before: audit.diff(before, after), after, reason: clean(req.body?.reason, 500), ip: req.ip,
        });
        res.json(after);
    }));

    // Two records for one customer is the normal state of any address book
    // that grew out of job sheets. This finds the likely pairs; a person
    // decides, and the merge is recorded.
    app.get('/api/parties/duplicates/suggest', authenticateToken, requireCap('party.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const [rows] = await conn.query(
            `SELECT id, display_name, phone, gstin, kind, created_at
               FROM parties WHERE business_id = ? AND merged_into_id IS NULL AND active = 1`,
            [businessId]
        );

        const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10);
        const norm = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const groups = new Map();
        const push = (key, row) => {
            if (!key) return;
            if (!groups.has(key)) groups.set(key, { key, reason: key.split(':')[0], parties: [] });
            groups.get(key).parties.push(row);
        };
        rows.forEach((r) => {
            if (digits(r.phone).length === 10) push(`phone:${digits(r.phone)}`, r);
            if (r.gstin) push(`gstin:${r.gstin}`, r);
            if (norm(r.display_name).length > 3) push(`name:${norm(r.display_name)}`, r);
        });

        res.json([...groups.values()].filter((g) => g.parties.length > 1));
    }));

    app.post('/api/parties/merge', authenticateToken, requireCap('party.merge'), handle(async (req, res, conn) => {
        const { keep_id: keepId, merge_ids: mergeIds = [], reason } = req.body || {};
        if (!keepId || !Array.isArray(mergeIds) || !mergeIds.length) {
            return res.status(400).json({ error: 'Choose the record to keep and at least one to merge into it' });
        }
        if (mergeIds.includes(keepId)) return res.status(400).json({ error: 'A record cannot be merged into itself' });

        const [[keep]] = await conn.query('SELECT * FROM parties WHERE id = ? LIMIT 1', [keepId]);
        if (!keep) return res.status(404).json({ error: 'The record to keep does not exist' });

        await conn.beginTransaction();
        try {
            for (const loserId of mergeIds) {
                const [[loser]] = await conn.query('SELECT * FROM parties WHERE id = ? LIMIT 1', [loserId]);
                if (!loser) continue;

                // Everything that pointed at the old record now points at the
                // kept one — including the ledger, so balances survive intact.
                await conn.query('UPDATE journal_lines SET party_id = ? WHERE party_id = ?', [keepId, loserId]);
                await conn.query('UPDATE party_addresses SET party_id = ? WHERE party_id = ?', [keepId, loserId]);
                await conn.query('UPDATE inquiries SET party_id = ? WHERE party_id = ?', [keepId, loserId]);
                await conn.query('UPDATE installations SET party_id = ? WHERE party_id = ?', [keepId, loserId]);

                // Fill gaps in the kept record from the one being merged away,
                // never overwrite what is already there.
                const fill = {};
                for (const f of ['phone', 'alt_phone', 'email', 'gstin', 'pan', 'legal_name', 'place_of_supply_state_code']) {
                    if (!keep[f] && loser[f]) fill[f] = loser[f];
                }
                if (Object.keys(fill).length) await conn.query('UPDATE parties SET ? WHERE id = ?', [fill, keepId]);

                await conn.query(
                    'UPDATE parties SET merged_into_id = ?, active = 0 WHERE id = ?', [keepId, loserId]
                );
                audit.record({
                    actor: req.user, action: 'party.merge', entityType: 'party', entityId: loserId,
                    before: loser, after: { merged_into_id: keepId }, reason: clean(reason, 500), ip: req.ip,
                });
            }
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        }

        const [[after]] = await conn.query('SELECT * FROM parties WHERE id = ?', [keepId]);
        res.json({ party: after, merged: mergeIds.length });
    }));

    // ── chart of accounts ───────────────────────────────────────────────
    app.get('/api/accounting/accounts', authenticateToken, requireCap('ledger.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const [rows] = await conn.query(
            'SELECT * FROM accounts WHERE business_id = ? ORDER BY code', [businessId]
        );
        res.json(rows);
    }));

    app.post('/api/accounting/accounts', authenticateToken, requireCap('ledger.post'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const b = req.body || {};
        if (!b.code || !b.name || !b.type) return res.status(400).json({ error: 'Code, name and type are required' });
        if (!['asset', 'liability', 'equity', 'income', 'expense'].includes(b.type)) {
            return res.status(400).json({ error: 'Unknown account type' });
        }
        const id = randomUUID();
        try {
            await conn.query('INSERT INTO accounts SET ?', [{
                id, business_id: businessId, code: clean(b.code, 20), name: clean(b.name, 160),
                type: b.type, subtype: clean(b.subtype, 30) || 'other', parent_id: b.parent_id || null,
                is_system: 0, opening_balance_paise: money.toPaise(b.opening_balance ?? 0),
                opening_balance_on: b.opening_balance_on ? ymd(b.opening_balance_on) : null, active: 1,
            }]);
        } catch (err) {
            if (/duplicate/i.test(err.message)) return res.status(409).json({ error: 'That account code is already used' });
            throw err;
        }
        const [[saved]] = await conn.query('SELECT * FROM accounts WHERE id = ?', [id]);
        audit.record({ actor: req.user, action: 'account.create', entityType: 'account', entityId: id, after: saved, ip: req.ip });
        res.status(201).json(saved);
    }));

    app.patch('/api/accounting/accounts/:id', authenticateToken, requireCap('ledger.post'), handle(async (req, res, conn) => {
        const [[before]] = await conn.query('SELECT * FROM accounts WHERE id = ? LIMIT 1', [req.params.id]);
        if (!before) return res.status(404).json({ error: 'No such account' });

        const b = req.body || {};
        const updates = {};
        if ('name' in b) updates.name = clean(b.name, 160);
        if ('subtype' in b && !before.is_system) updates.subtype = clean(b.subtype, 30);
        if ('active' in b) {
            // A seeded account is addressed by the posting engine by code;
            // switching it off would break posting rather than tidy the list.
            if (before.is_system && !b.active) {
                return res.status(400).json({ error: 'This account is used by the posting engine and cannot be switched off' });
            }
            updates.active = b.active ? 1 : 0;
        }
        if ('opening_balance' in b) updates.opening_balance_paise = money.toPaise(b.opening_balance);
        if ('opening_balance_on' in b) updates.opening_balance_on = b.opening_balance_on ? ymd(b.opening_balance_on) : null;
        if (!Object.keys(updates).length) return res.json(before);

        await conn.query('UPDATE accounts SET ? WHERE id = ?', [updates, before.id]);
        const [[after]] = await conn.query('SELECT * FROM accounts WHERE id = ?', [before.id]);
        audit.record({
            actor: req.user, action: 'account.update', entityType: 'account', entityId: before.id,
            before: audit.diff(before, after), after, ip: req.ip,
        });
        res.json(after);
    }));

    // ── tax rates ───────────────────────────────────────────────────────
    app.get('/api/accounting/tax-rates', authenticateToken, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const onDate = req.query.on ? ymd(req.query.on) : null;
        const [rows] = await conn.query(
            `SELECT * FROM tax_rates
              WHERE business_id = ? AND active = 1
                ${onDate ? 'AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)' : ''}
              ORDER BY treatment, rate_bps`,
            onDate ? [businessId, onDate, onDate] : [businessId]
        );
        res.json(rows);
    }));

    // A rate change closes the old row and opens a new one. Documents raised
    // before the change keep the rate they were raised at.
    app.post('/api/accounting/tax-rates', authenticateToken, requireCap('tax.manage'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const b = req.body || {};
        const treatment = b.treatment || 'gst';
        if (!['gst', 'exempt', 'nil_rated', 'zero_rated', 'non_gst'].includes(treatment)) {
            return res.status(400).json({ error: 'Unknown tax treatment' });
        }
        const effectiveFrom = ymd(b.effective_from || new Date());
        if (!effectiveFrom) return res.status(400).json({ error: 'A valid effective-from date is required' });

        if (b.supersedes_id) {
            const [[old]] = await conn.query('SELECT * FROM tax_rates WHERE id = ? LIMIT 1', [b.supersedes_id]);
            if (!old) return res.status(404).json({ error: 'The rate being replaced does not exist' });
            const dayBefore = new Date(effectiveFrom);
            dayBefore.setDate(dayBefore.getDate() - 1);
            await conn.query('UPDATE tax_rates SET effective_to = ? WHERE id = ?', [ymd(dayBefore), old.id]);
            audit.record({
                actor: req.user, action: 'tax.supersede', entityType: 'tax_rate', entityId: old.id,
                before: old, after: { effective_to: ymd(dayBefore) }, reason: clean(b.reason, 500), ip: req.ip,
            });
        }

        const id = randomUUID();
        await conn.query('INSERT INTO tax_rates SET ?', [{
            id, business_id: businessId,
            name: clean(b.name, 80) || `GST ${(Number(b.rate_bps) || 0) / 100}%`,
            treatment,
            rate_bps: treatment === 'gst' ? (Number(b.rate_bps) || 0) : 0,
            cess_bps: Number(b.cess_bps) || 0,
            effective_from: effectiveFrom,
            effective_to: b.effective_to ? ymd(b.effective_to) : null,
            is_default: b.is_default ? 1 : 0, active: 1,
        }]);
        const [[saved]] = await conn.query('SELECT * FROM tax_rates WHERE id = ?', [id]);
        audit.record({ actor: req.user, action: 'tax.create', entityType: 'tax_rate', entityId: id, after: saved, ip: req.ip });
        res.status(201).json(saved);
    }));

    // ── numbering ───────────────────────────────────────────────────────
    app.get('/api/accounting/series', authenticateToken, requireCap('series.manage'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const [rows] = await conn.query(
            'SELECT * FROM number_series WHERE business_id = ? ORDER BY doc_type, fy_label DESC', [businessId]
        );
        res.json(rows);
    }));

    app.patch('/api/accounting/series/:id', authenticateToken, requireCap('series.manage'), handle(async (req, res, conn) => {
        const [[before]] = await conn.query('SELECT * FROM number_series WHERE id = ? LIMIT 1', [req.params.id]);
        if (!before) return res.status(404).json({ error: 'No such series' });

        const b = req.body || {};
        const updates = {};
        if ('prefix' in b) updates.prefix = clean(b.prefix, 20) || '';
        if ('suffix' in b) updates.suffix = clean(b.suffix, 20) || '';
        if ('padding' in b) updates.padding = Math.min(Math.max(Number(b.padding) || 1, 1), 10);
        if ('next_number' in b) {
            const next = Number(b.next_number);
            if (!Number.isInteger(next) || next < 1) return res.status(400).json({ error: 'The next number must be a whole number' });
            // Going backwards would hand out a number some document already
            // carries, so it needs a stated reason and lands in the audit log.
            if (next < before.next_number && !b.reason) {
                return res.status(400).json({ error: 'Lowering the next number can repeat an existing document number — give a reason' });
            }
            updates.next_number = next;
        }
        if ('active' in b) updates.active = b.active ? 1 : 0;
        if (!Object.keys(updates).length) return res.json(before);

        await conn.query('UPDATE number_series SET ? WHERE id = ?', [updates, before.id]);
        const [[after]] = await conn.query('SELECT * FROM number_series WHERE id = ?', [before.id]);
        audit.record({
            actor: req.user, action: 'series.update', entityType: 'number_series', entityId: before.id,
            before: audit.diff(before, after), after, reason: clean(b.reason, 500), ip: req.ip,
        });
        res.json(after);
    }));

    // ── journals ────────────────────────────────────────────────────────
    app.get('/api/accounting/journals', authenticateToken, requireCap('ledger.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const { from, to, source_type: sourceType, limit = '100' } = req.query;
        const where = ['j.business_id = ?'];
        const params = [businessId];
        if (from) { where.push('j.journal_date >= ?'); params.push(ymd(from)); }
        if (to) { where.push('j.journal_date <= ?'); params.push(ymd(to)); }
        if (sourceType) { where.push('j.source_type = ?'); params.push(sourceType); }

        const [rows] = await conn.query(
            `SELECT j.*, p.full_name AS posted_by_name
               FROM journals j
               LEFT JOIN profiles p ON p.id = j.posted_by
              WHERE ${where.join(' AND ')}
              ORDER BY j.journal_date DESC, j.posted_at DESC
              LIMIT ?`,
            [...params, Math.min(Number(limit) || 100, 500)]
        );
        res.json(rows);
    }));

    app.get('/api/accounting/journals/:id', authenticateToken, requireCap('ledger.view'), handle(async (req, res, conn) => {
        const [[journal]] = await conn.query('SELECT * FROM journals WHERE id = ? LIMIT 1', [req.params.id]);
        if (!journal) return res.status(404).json({ error: 'No such journal' });
        const [lines] = await conn.query(
            `SELECT l.*, a.code AS account_code, a.name AS account_name, pt.display_name AS party_name
               FROM journal_lines l
               JOIN accounts a ON a.id = l.account_id
               LEFT JOIN parties pt ON pt.id = l.party_id
              WHERE l.journal_id = ? ORDER BY l.line_no`,
            [journal.id]
        );
        res.json({ journal, lines });
    }));

    app.post('/api/accounting/journals', authenticateToken, requireCap('ledger.post'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const b = req.body || {};
        const lines = (b.lines || []).map((l) => ({
            account_id: l.account_id,
            debit_paise: l.debit === undefined ? Number(l.debit_paise || 0) : money.toPaise(l.debit),
            credit_paise: l.credit === undefined ? Number(l.credit_paise || 0) : money.toPaise(l.credit),
            party_id: l.party_id || null,
            memo: clean(l.memo, 300),
        }));

        await conn.beginTransaction();
        try {
            const journal = await posting.postJournal(conn, {
                businessId,
                date: b.date || new Date(),
                narration: clean(b.narration, 500),
                sourceType: 'manual',
                lines,
                idempotencyKey: clean(b.idempotency_key, 120),
                postedBy: req.user.id,
            });
            await conn.commit();
            audit.record({
                actor: req.user, action: 'journal.post', entityType: 'journal', entityId: journal.id,
                after: { journal_no: journal.journal_no, total_paise: journal.total_paise }, ip: req.ip,
            });
            res.status(journal.reused ? 200 : 201).json(journal);
        } catch (err) {
            await conn.rollback();
            throw err;
        }
    }));

    app.post('/api/accounting/journals/:id/reverse', authenticateToken, requireCap('ledger.reverse'), handle(async (req, res, conn) => {
        const reason = clean(req.body?.reason, 500);
        if (!reason) return res.status(400).json({ error: 'A reversal needs a reason' });

        await conn.beginTransaction();
        try {
            const reversal = await posting.reverseJournal(conn, {
                journalId: req.params.id,
                date: req.body?.date || new Date(),
                reason,
                postedBy: req.user.id,
            });
            await conn.commit();
            audit.record({
                actor: req.user, action: 'journal.reverse', entityType: 'journal', entityId: req.params.id,
                after: { reversal_id: reversal.id }, reason, ip: req.ip,
            });
            res.status(201).json(reversal);
        } catch (err) {
            await conn.rollback();
            throw err;
        }
    }));

    app.get('/api/accounting/trial-balance', authenticateToken, requireCap('report.financial'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const { from = null, to = null } = req.query;
        const balance = await posting.trialBalance(conn, businessId, { from, to });
        res.json({
            ...balance,
            // Every report states what it covers; a number without its range is
            // a number waiting to be misread.
            scope: { from: from ? ymd(from) : 'the beginning', to: to ? ymd(to) : 'today', basis: 'posted journals' },
        });
    }));

    // ── opening balances ────────────────────────────────────────────────
    // Turns the opening figures captured on parties and accounts into one
    // posted journal, with Opening Balance Equity as the other side. Running it
    // twice for the same date returns the first journal rather than doubling
    // the books.
    app.post('/api/accounting/opening-balances', authenticateToken, requireCap('ledger.post'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const asOn = ymd(req.body?.as_on || new Date());
        if (!asOn) return res.status(400).json({ error: 'A valid as-on date is required' });

        const equity = await posting.accountByCode(conn, businessId, '3100');
        const receivable = await posting.accountByCode(conn, businessId, '1100');
        const payable = await posting.accountByCode(conn, businessId, '2000');

        const [parties] = await conn.query(
            `SELECT id, display_name, opening_balance_paise, opening_balance_type
               FROM parties WHERE business_id = ? AND merged_into_id IS NULL AND opening_balance_paise <> 0`,
            [businessId]
        );
        const [accounts] = await conn.query(
            `SELECT id, code, name, type, opening_balance_paise
               FROM accounts WHERE business_id = ? AND opening_balance_paise <> 0`,
            [businessId]
        );

        const lines = [];
        let equityBalance = 0;

        for (const p of parties) {
            const amount = Number(p.opening_balance_paise);
            const isReceivable = p.opening_balance_type !== 'payable';
            lines.push({
                account_id: isReceivable ? receivable.id : payable.id,
                debit_paise: isReceivable ? amount : 0,
                credit_paise: isReceivable ? 0 : amount,
                party_id: p.id,
                memo: `Opening balance — ${p.display_name}`,
            });
            equityBalance += isReceivable ? amount : -amount;
        }

        for (const a of accounts) {
            const amount = Number(a.opening_balance_paise);
            const debitSide = ['asset', 'expense'].includes(a.type);
            lines.push({
                account_id: a.id,
                debit_paise: debitSide ? amount : 0,
                credit_paise: debitSide ? 0 : amount,
                memo: `Opening balance — ${a.name}`,
            });
            equityBalance += debitSide ? amount : -amount;
        }

        if (!lines.length) return res.status(400).json({ error: 'No opening balances have been entered yet' });

        lines.push({
            account_id: equity.id,
            debit_paise: equityBalance < 0 ? -equityBalance : 0,
            credit_paise: equityBalance > 0 ? equityBalance : 0,
            memo: 'Opening balance equity',
        });

        await conn.beginTransaction();
        try {
            const journal = await posting.postJournal(conn, {
                businessId,
                date: asOn,
                narration: `Opening balances as on ${asOn}`,
                sourceType: 'opening',
                lines,
                idempotencyKey: `opening:${businessId}:${asOn}`,
                postedBy: req.user.id,
            });
            await conn.commit();
            audit.record({
                actor: req.user, action: 'opening.post', entityType: 'journal', entityId: journal.id,
                after: { as_on: asOn, lines: lines.length, reused: journal.reused }, ip: req.ip,
            });
            res.status(journal.reused ? 200 : 201).json({ journal, lines: lines.length, reused: journal.reused });
        } catch (err) {
            await conn.rollback();
            throw err;
        }
    }));

    // ── period locks ────────────────────────────────────────────────────
    app.get('/api/accounting/period-locks', authenticateToken, requireCap('ledger.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const [rows] = await conn.query(
            `SELECT pl.*, p.full_name AS locked_by_name
               FROM period_locks pl LEFT JOIN profiles p ON p.id = pl.locked_by
              WHERE pl.business_id = ? ORDER BY pl.locked_upto DESC`,
            [businessId]
        );
        res.json(rows);
    }));

    app.post('/api/accounting/period-locks', authenticateToken, requireCap('period.lock'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const lockedUpto = ymd(req.body?.locked_upto);
        if (!lockedUpto) return res.status(400).json({ error: 'A valid date is required' });

        const id = randomUUID();
        await conn.query('INSERT INTO period_locks SET ?', [{
            id, business_id: businessId, locked_upto: lockedUpto,
            reason: clean(req.body?.reason, 300), locked_by: req.user.id,
        }]);
        const [[saved]] = await conn.query('SELECT * FROM period_locks WHERE id = ?', [id]);
        audit.record({ actor: req.user, action: 'period.lock', entityType: 'period_lock', entityId: id, after: saved, ip: req.ip });
        res.status(201).json(saved);
    }));

    app.delete('/api/accounting/period-locks/:id', authenticateToken, requireCap('period.lock'), handle(async (req, res, conn) => {
        const reason = clean(req.body?.reason, 300);
        if (!reason) return res.status(400).json({ error: 'Reopening a closed period needs a reason' });
        const [[before]] = await conn.query('SELECT * FROM period_locks WHERE id = ? LIMIT 1', [req.params.id]);
        if (!before) return res.status(404).json({ error: 'No such lock' });

        await conn.query('DELETE FROM period_locks WHERE id = ?', [req.params.id]);
        audit.record({
            actor: req.user, action: 'period.unlock', entityType: 'period_lock', entityId: req.params.id,
            before, reason, ip: req.ip,
        });
        res.json({ success: true });
    }));

    // ── audit trail ─────────────────────────────────────────────────────
    app.get('/api/accounting/audit', authenticateToken, requireCap('audit.view'), handle(async (req, res, conn) => {
        const rows = await audit.list(conn, {
            entityType: req.query.entity_type || null,
            entityId: req.query.entity_id || null,
            actorId: req.query.actor_id || null,
            limit: req.query.limit || 100,
        });
        res.json(rows);
    }));

    console.log('[accounting] Stage 1 routes mounted (masters, ledger, permissions, audit)');
}

module.exports = { mountAccounting };
