'use strict';

// Stage 3 API: purchases, locations, transfers, serials, reservations and
// stock counts.

const { randomUUID } = require('crypto');
const money = require('../money.cjs');
const posting = require('../ledger/posting.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');
const stock = require('./engine.cjs');
const purchases = require('./purchases.cjs');
const importer = require('./importer.cjs');

const clean = (v, max = 255) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const ymd = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    return Number.isNaN(date.getTime()) ? null
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function mountStock({ app, getConn, authenticateToken, permissions, audit }) {
    const { requireCap } = permissions;

    const handle = (fn) => async (req, res) => {
        let connection;
        try {
            connection = await getConn();
            await fn(req, res, connection);
        } catch (err) {
            const known = err instanceof stock.StockError
                || err instanceof purchases.PurchaseError
                || err instanceof posting.PostingError;
            if (connection) await connection.rollback().catch(() => {});
            if (known) return res.status(err.status || 422).json({ error: err.message, code: err.code });
            console.error('[stock]', req.method, req.path, '—', err.message);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    };

    const business = async (conn) => {
        const id = await defaultBusinessId(conn);
        if (!id) throw new stock.StockError('No business configured', 'no_business', 400);
        return id;
    };

    // ── locations ───────────────────────────────────────────────────────
    app.get('/api/stock/locations', authenticateToken, requireCap('stock.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const [rows] = await conn.query(
            `SELECT l.*, p.full_name AS employee_name
               FROM stock_locations l LEFT JOIN profiles p ON p.id = l.employee_id
              WHERE l.business_id = ? ORDER BY l.is_default DESC, l.name`,
            [businessId]
        );
        res.json(rows);
    }));

    app.post('/api/stock/locations', authenticateToken, requireCap('stock.adjust'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const b = req.body || {};
        if (!b.name) return res.status(400).json({ error: 'A name is required' });
        const kind = ['store', 'van', 'site', 'damaged', 'quarantine', 'customer'].includes(b.kind) ? b.kind : 'store';

        const id = randomUUID();
        await conn.query('INSERT INTO stock_locations SET ?', [{
            id, business_id: businessId, name: clean(b.name, 120), kind,
            employee_id: b.employee_id || null,
            // A customer's own device is never our stock, whatever else is set.
            owned: kind === 'customer' ? 0 : 1,
            is_default: 0, active: 1,
        }]);
        const [[saved]] = await conn.query('SELECT * FROM stock_locations WHERE id = ?', [id]);
        audit.record({ actor: req.user, action: 'location.create', entityType: 'stock_location', entityId: id, after: saved, ip: req.ip });
        res.status(201).json(saved);
    }));

    app.get('/api/stock/locations/:id/items', authenticateToken, requireCap('stock.view'), handle(async (req, res, conn) => {
        const [[location]] = await conn.query('SELECT is_default FROM stock_locations WHERE id = ? LIMIT 1', [req.params.id]);
        if (!location) return res.status(404).json({ error: 'No such location' });
        // Stock recorded before locations existed sits in the main store.
        res.json(await stock.locationStock(conn, req.params.id, { includeUnassigned: !!location.is_default }));
    }));

    // ── transfers ───────────────────────────────────────────────────────
    // Store to a technician's van and back. Neither is a sale and neither is an
    // expense — the business owns the same goods either way.
    app.post('/api/stock/transfers', authenticateToken, requireCap('stock.move'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const b = req.body || {};
        const lines = (b.lines || []).filter((l) => l.item_id && Number(l.quantity) > 0);
        if (!lines.length) return res.status(400).json({ error: 'Nothing to transfer' });

        await conn.beginTransaction();
        const moved = [];
        for (const line of lines) {
            moved.push(await stock.transfer(conn, {
                businessId, itemId: line.item_id, quantity: line.quantity,
                fromLocationId: b.from_location_id, toLocationId: b.to_location_id,
                employeeId: b.employee_id || null, note: clean(b.note, 300),
                createdBy: req.user.id, serialIds: line.serial_ids || [],
            }));
        }
        await conn.commit();

        audit.record({
            actor: req.user, action: 'stock.transfer', entityType: 'stock', entityId: b.to_location_id,
            after: { from: b.from_location_id, to: b.to_location_id, lines: lines.length }, ip: req.ip,
        });
        res.status(201).json({ transfers: moved });
    }));

    // ── adjustments ─────────────────────────────────────────────────────
    app.post('/api/stock/adjustments', authenticateToken, requireCap('stock.adjust'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const b = req.body || {};
        const type = ['adjust_in', 'adjust_out', 'damage'].includes(b.type) ? b.type : null;
        if (!type) return res.status(400).json({ error: 'Unknown adjustment type' });
        if (!b.reason) return res.status(400).json({ error: 'An adjustment needs a reason' });

        await conn.beginTransaction();
        const made = await stock.move(conn, {
            businessId, itemId: b.item_id, type, quantity: b.quantity,
            unitCostPaise: b.unit_cost === undefined ? null : money.toPaise(b.unit_cost),
            locationId: b.location_id || null, sourceType: 'adjustment',
            note: clean(b.reason, 300), createdBy: req.user.id,
        });
        await conn.commit();

        audit.record({
            actor: req.user, action: 'stock.adjust', entityType: 'inventory_item', entityId: b.item_id,
            after: made, reason: clean(b.reason, 300), ip: req.ip,
        });
        res.status(201).json(made);
    }));

    // ── reservations ────────────────────────────────────────────────────
    app.post('/api/stock/reservations', authenticateToken, requireCap('stock.move'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const b = req.body || {};
        await conn.beginTransaction();
        const made = await stock.reserve(conn, {
            businessId, itemId: b.item_id, quantity: b.quantity, locationId: b.location_id || null,
            refType: b.ref_type, refId: b.ref_id, note: clean(b.note, 300), createdBy: req.user.id,
        });
        await conn.commit();
        res.status(201).json(made);
    }));

    app.delete('/api/stock/reservations', authenticateToken, requireCap('stock.move'), handle(async (req, res, conn) => {
        const released = await stock.releaseReservations(conn, {
            refType: req.query.ref_type, refId: req.query.ref_id,
        });
        res.json({ released });
    }));

    app.get('/api/stock/availability/:itemId', authenticateToken, requireCap('stock.view'), handle(async (req, res, conn) => {
        const item = await stock.loadItem(conn, req.params.itemId);
        const reserved = await stock.reservedQuantity(conn, req.params.itemId);
        res.json({
            item_id: item.id, name: item.name,
            on_hand: stock.qty(item.quantity),
            reserved,
            available: stock.qty(stock.qty(item.quantity) - reserved),
            avg_cost_paise: Number(item.avg_cost_paise) || 0,
        });
    }));

    // ── serial numbers ──────────────────────────────────────────────────
    app.get('/api/stock/serials', authenticateToken, requireCap('stock.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const { q, item_id: itemId, status, customer_party_id: customerId, limit = '200' } = req.query;
        const where = ['s.business_id = ?'];
        const params = [businessId];
        if (q) { where.push('s.serial_no LIKE ?'); params.push(`%${q}%`); }
        if (itemId) { where.push('s.item_id = ?'); params.push(itemId); }
        if (status) { where.push('s.status = ?'); params.push(status); }
        if (customerId) { where.push('s.customer_party_id = ?'); params.push(customerId); }

        const [rows] = await conn.query(
            `SELECT s.*, i.name AS item_name, l.name AS location_name,
                    sup.display_name AS supplier_name, cus.display_name AS customer_name
               FROM item_serials s
               JOIN inventory_items i ON i.id = s.item_id
               LEFT JOIN stock_locations l ON l.id = s.location_id
               LEFT JOIN parties sup ON sup.id = s.supplier_party_id
               LEFT JOIN parties cus ON cus.id = s.customer_party_id
              WHERE ${where.join(' AND ')}
              ORDER BY s.created_at DESC LIMIT ?`,
            [...params, Math.min(Number(limit) || 200, 1000)]
        );
        res.json(rows);
    }));

    // A device the customer owns, left with us for repair. Tracked, never
    // counted as ours.
    app.post('/api/stock/serials/customer-device', authenticateToken, requireCap('stock.move'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const b = req.body || {};
        if (!b.item_id || !b.serial_no || !b.customer_party_id) {
            return res.status(400).json({ error: 'Item, serial number and customer are required' });
        }
        await conn.beginTransaction();
        const made = await stock.receiveCustomerDevice(conn, {
            businessId, itemId: b.item_id, serialNo: b.serial_no, customerPartyId: b.customer_party_id,
            jobType: b.job_type || null, jobId: b.job_id || null, notes: clean(b.notes, 500),
            createdBy: req.user.id,
        });
        await conn.commit();
        res.status(201).json(made);
    }));

    // ── stock counts ────────────────────────────────────────────────────
    app.post('/api/stock/counts', authenticateToken, requireCap('stock.adjust'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const b = req.body || {};
        const id = randomUUID();
        const countNo = await posting.allocateNumber(conn, businessId, 'stock_count', b.count_date || new Date());

        await conn.beginTransaction();
        await conn.query('INSERT INTO stock_counts SET ?', [{
            id, business_id: businessId, location_id: b.location_id || null, count_no: countNo,
            count_date: ymd(b.count_date || new Date()), status: 'open',
            note: clean(b.note, 500), counted_by: req.user.id,
        }]);

        for (const line of (b.lines || [])) {
            if (!line.item_id) continue;
            const item = await stock.loadItem(conn, line.item_id);
            const expected = stock.qty(item.quantity);
            const counted = stock.qty(line.counted_qty);
            const difference = stock.qty(counted - expected);
            await conn.query('INSERT INTO stock_count_lines SET ?', [{
                id: randomUUID(), count_id: id, item_id: line.item_id,
                expected_qty: expected, counted_qty: counted, difference_qty: difference,
                unit_cost_paise: Number(item.avg_cost_paise) || 0,
                value_difference_paise: Math.round((Number(item.avg_cost_paise) || 0) * difference),
                note: clean(line.note, 300),
            }]);
        }
        await conn.commit();

        const [[saved]] = await conn.query('SELECT * FROM stock_counts WHERE id = ?', [id]);
        const [lines] = await conn.query('SELECT * FROM stock_count_lines WHERE count_id = ?', [id]);
        res.status(201).json({ count: saved, lines });
    }));

    // Approving a count is what actually moves stock — and the difference is
    // posted to shrinkage, so it shows up in the accounts instead of quietly
    // changing a number.
    app.post('/api/stock/counts/:id/approve', authenticateToken, requireCap('stock.adjust'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const [[count]] = await conn.query('SELECT * FROM stock_counts WHERE id = ? LIMIT 1', [req.params.id]);
        if (!count) return res.status(404).json({ error: 'No such count' });
        if (count.status !== 'open') return res.status(422).json({ error: 'That count has already been settled', code: 'not_open' });

        const [lines] = await conn.query('SELECT * FROM stock_count_lines WHERE count_id = ?', [req.params.id]);
        const moving = lines.filter((l) => Number(l.difference_qty) !== 0);

        await conn.beginTransaction();
        let up = 0;
        let down = 0;
        for (const line of moving) {
            const difference = stock.qty(line.difference_qty);
            const made = await stock.move(conn, {
                businessId, itemId: line.item_id,
                type: difference > 0 ? 'count_up' : 'count_down',
                quantity: Math.abs(difference),
                locationId: count.location_id,
                sourceType: 'count', sourceId: count.id,
                note: `Stock count ${count.count_no}`, createdBy: req.user.id,
            });
            if (difference > 0) up += Math.abs(made.value_paise); else down += Math.abs(made.value_paise);
        }

        let journalId = null;
        if (up || down) {
            const inventory = await posting.accountByCode(conn, businessId, '1200');
            const shrinkage = await posting.accountByCode(conn, businessId, '5010');
            const net = up - down;
            const journal = await posting.postJournal(conn, {
                businessId,
                date: count.count_date,
                narration: `Stock count ${count.count_no}`,
                sourceType: 'stock',
                sourceId: count.id,
                lines: net >= 0
                    ? [
                        { account_id: inventory.id, debit_paise: net, memo: 'Count found more' },
                        { account_id: shrinkage.id, credit_paise: net, memo: 'Count adjustment' },
                    ]
                    : [
                        { account_id: shrinkage.id, debit_paise: -net, memo: 'Count found less' },
                        { account_id: inventory.id, credit_paise: -net, memo: 'Count adjustment' },
                    ],
                idempotencyKey: `count:${count.id}`,
                postedBy: req.user.id,
            });
            journalId = journal.id;
        }

        await conn.query(
            `UPDATE stock_counts SET status = 'approved', approved_by = ?, approved_at = NOW(), journal_id = ? WHERE id = ?`,
            [req.user.id, journalId, count.id]
        );
        await conn.commit();

        audit.record({
            actor: req.user, action: 'stock.count_approve', entityType: 'stock_count', entityId: count.id,
            after: { lines: moving.length, up_paise: up, down_paise: down }, ip: req.ip,
        });
        res.json({ approved: moving.length, journal_id: journalId });
    }));

    // ── valuation ───────────────────────────────────────────────────────
    app.get('/api/stock/valuation', authenticateToken, requireCap('item.cost.view'), handle(async (req, res, conn) => {
        const out = await stock.valuation(conn, {});
        res.json({
            ...out,
            scope: { basis: 'moving average cost, from the stock ledger', as_on: ymd(new Date()) },
        });
    }));

    // ── bulk item + opening stock import ────────────────────────────────
    // The template's columns come from here, so the screen and the checker
    // cannot drift apart.
    app.get('/api/stock/import/template', authenticateToken, requireCap('stock.adjust'), (req, res) => {
        res.json({
            columns: importer.COLUMNS.map((c) => c.label),
            sample_rows: importer.SAMPLE_ROWS,
        });
    });

    // dry_run: true → check the file and report; nothing is written.
    const importHandler = handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const b = req.body || {};
        // Items already holding stock are brought to the file's quantity unless the caller says not to.
        const checked = await importer.validateRows(conn, businessId, b.rows, { updateStock: b.update_stock !== false });
        const shaped = {
            ok: checked.ok,
            errors: checked.errors,
            ignored_columns: checked.ignored_columns || [],
            summary: checked.summary,
            rows: checked.rows.map((r) => ({
                row: r.row, action: r.action, name: r.name, sku: r.sku, unit: r.unit,
                purchase_rate: r.purchase_rate, selling_rate: r.selling_rate, gst_rate: r.gst_rate,
                opening_qty: r.opening_qty, opening_rate: r.opening_rate, location: r.location_name,
                stock_mode: r.stock_mode, stock_before: r.stock_before, stock_delta: r.stock_delta,
                serials: r.serials.length, problems: r.problems,
            })),
        };
        if (b.dry_run !== false) return res.json({ ...shaped, dry_run: true });
        if (!checked.ok) return res.status(422).json({ ...shaped, error: 'The file still has errors — nothing was imported' });

        const done = await importer.importRows(conn, {
            businessId, rows: checked.rows, openingDate: b.opening_date,
            userId: req.user.id, fileName: clean(b.file_name, 120),
        });
        audit.record({
            actor: req.user, action: 'stock.import', entityType: 'inventory_item', entityId: null,
            after: done, reason: clean(b.file_name, 120), ip: req.ip,
        });
        res.status(201).json({ ...shaped, dry_run: false, done });
    });
    app.post('/api/stock/import', authenticateToken, requireCap('item.manage'), requireCap('stock.adjust'), importHandler);

    // ── purchases ───────────────────────────────────────────────────────
    app.get('/api/purchases/documents', authenticateToken, requireCap('purchase.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const { doc_type: docType, status, party_id: partyId, from, to, q, limit = '200' } = req.query;
        const where = ['d.business_id = ?'];
        const params = [businessId];
        if (docType && docType !== 'all') { where.push('d.doc_type = ?'); params.push(docType); }
        if (status && status !== 'all') { where.push('d.status = ?'); params.push(status); }
        if (partyId) { where.push('d.party_id = ?'); params.push(partyId); }
        if (from) { where.push('d.doc_date >= ?'); params.push(ymd(from)); }
        if (to) { where.push('d.doc_date <= ?'); params.push(ymd(to)); }
        if (q) {
            where.push('(d.doc_no LIKE ? OR d.supplier_ref LIKE ? OR p.display_name LIKE ?)');
            const like = `%${q}%`;
            params.push(like, like, like);
        }

        const [rows] = await conn.query(
            `SELECT d.*, p.display_name AS party_name, l.name AS location_name,
                    COALESCE(al.paid_paise, 0) AS paid_paise
               FROM purchase_documents d
               LEFT JOIN parties p ON p.id = d.party_id
               LEFT JOIN stock_locations l ON l.id = d.location_id
               LEFT JOIN (
                    SELECT a.document_id, SUM(a.amount_paise) paid_paise
                      FROM purchase_allocations a
                      JOIN payments pay ON pay.id = a.payment_id AND pay.status = 'posted'
                     GROUP BY a.document_id
               ) al ON al.document_id = d.id
              WHERE ${where.join(' AND ')}
              ORDER BY d.doc_date DESC, d.created_at DESC LIMIT ?`,
            [...params, Math.min(Number(limit) || 200, 1000)]
        );
        res.json(rows.map((r) => ({ ...r, balance_paise: Number(r.total_paise) - Number(r.paid_paise) })));
    }));

    app.get('/api/purchases/documents/:id', authenticateToken, requireCap('purchase.view'), handle(async (req, res, conn) => {
        const loaded = await purchases.loadPurchase(conn, req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No such document' });
        res.json(loaded);
    }));

    app.post('/api/purchases/documents', authenticateToken, requireCap('purchase.manage'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const id = await purchases.savePurchaseDraft(conn, { businessId, user: req.user, payload: req.body || {} });
        await conn.commit();
        res.status(201).json(await purchases.loadPurchase(conn, id));
    }));

    app.patch('/api/purchases/documents/:id', authenticateToken, requireCap('purchase.manage'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        await purchases.savePurchaseDraft(conn, {
            businessId, user: req.user, payload: req.body || {}, existingId: req.params.id,
        });
        await conn.commit();
        res.json(await purchases.loadPurchase(conn, req.params.id));
    }));

    app.post('/api/purchases/documents/:id/issue', authenticateToken, requireCap('purchase.manage'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const issued = await purchases.issuePurchase(conn, { businessId, user: req.user, id: req.params.id });
        await conn.commit();

        audit.record({
            actor: req.user, action: 'purchase.issue', entityType: 'purchase_document', entityId: req.params.id,
            after: { doc_no: issued.document.doc_no, doc_type: issued.document.doc_type, total_paise: issued.document.total_paise },
            ip: req.ip,
        });
        res.json(issued);
    }));

    // Receive what has actually turned up, against the order. Partial
    // deliveries are the normal case.
    app.post('/api/purchases/orders/:id/receive', authenticateToken, requireCap('purchase.manage'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const receipt = await purchases.receiveAgainstOrder(conn, {
            businessId, user: req.user, poId: req.params.id, payload: req.body || {},
        });
        await conn.commit();

        audit.record({
            actor: req.user, action: 'purchase.receive', entityType: 'purchase_document', entityId: receipt.document.id,
            after: { po_id: req.params.id, doc_no: receipt.document.doc_no }, ip: req.ip,
        });
        res.status(201).json(receipt);
    }));

    app.post('/api/purchases/documents/:id/cancel', authenticateToken, requireCap('purchase.manage'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const reason = clean(req.body?.reason, 500);
        await conn.beginTransaction();
        const cancelled = await purchases.cancelPurchase(conn, { businessId, user: req.user, id: req.params.id, reason });
        await conn.commit();

        audit.record({
            actor: req.user, action: 'purchase.cancel', entityType: 'purchase_document', entityId: req.params.id,
            reason, ip: req.ip,
        });
        res.json(cancelled);
    }));

    app.delete('/api/purchases/documents/:id', authenticateToken, requireCap('purchase.manage'), handle(async (req, res, conn) => {
        const loaded = await purchases.loadPurchase(conn, req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No such document' });
        if (loaded.document.status !== 'draft') {
            return res.status(422).json({ error: 'An issued document is cancelled, not deleted', code: 'not_draft' });
        }
        await conn.query('DELETE FROM purchase_documents WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    }));

    app.post('/api/purchases/payments', authenticateToken, requireCap('payment.record'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const out = await purchases.paySupplier(conn, { businessId, user: req.user, payload: req.body || {} });
        await conn.commit();

        audit.record({
            actor: req.user, action: 'supplier.pay', entityType: 'payment', entityId: out.payment.id,
            after: { amount_paise: out.payment.amount_paise, method: out.payment.method }, ip: req.ip,
        });
        res.status(201).json(out);
    }));

    // What we owe, aged the same way as what we are owed.
    app.get('/api/purchases/payables', authenticateToken, requireCap('purchase.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const asOn = ymd(req.query.as_on || new Date());

        const [rows] = await conn.query(
            `SELECT * FROM (
                SELECT d.id, d.doc_no, d.supplier_ref, d.doc_date, d.due_date, d.total_paise, d.party_id,
                       p.display_name AS party_name, p.phone AS party_phone,
                       COALESCE(al.paid_paise, 0) AS paid_paise,
                       d.total_paise - COALESCE(al.paid_paise, 0) AS outstanding_paise,
                       DATEDIFF(?, COALESCE(d.due_date, d.doc_date)) AS days_overdue
                  FROM purchase_documents d
                  LEFT JOIN parties p ON p.id = d.party_id
                  LEFT JOIN (
                       SELECT a.document_id, SUM(a.amount_paise) paid_paise
                         FROM purchase_allocations a
                         JOIN payments pay ON pay.id = a.payment_id AND pay.status = 'posted'
                        GROUP BY a.document_id
                  ) al ON al.document_id = d.id
                 WHERE d.business_id = ? AND d.doc_type = 'supplier_bill' AND d.status = 'issued'
                   AND d.doc_date <= ?
            ) open_bills
             WHERE outstanding_paise > 0
             ORDER BY days_overdue DESC`,
            [asOn, businessId, asOn]
        );

        const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
        const open = rows.map((r) => {
            const outstanding = Number(r.outstanding_paise);
            const days = Number(r.days_overdue) || 0;
            const bucket = days <= 0 ? 'current' : days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90_plus';
            buckets[bucket] += outstanding;
            return { ...r, outstanding_paise: outstanding, days_overdue: days, bucket };
        });

        res.json({
            as_on: asOn,
            scope: { basis: 'issued supplier bills less posted payments', as_on: asOn },
            total_paise: open.reduce((s, r) => s + r.outstanding_paise, 0),
            buckets,
            bills: open,
        });
    }));

    console.log('[stock] Stage 3 routes mounted (purchases, locations, transfers, serials, counts)');
}

module.exports = { mountStock };
