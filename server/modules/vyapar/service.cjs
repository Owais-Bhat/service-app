'use strict';

// Bringing a Vyapar backup into the portal, in three separate steps the owner can run, check and rerun:
//
//   1. parties — customers and suppliers, with what each owes / is owed *today* as an opening balance.
//   2. items   — the catalogue and the stock really on the shelf today, through the same door as any other
//                stock import (one opening-stock journal).
//   3. history — every past invoice, quotation, payment, purchase and return, kept to look at. Not posted:
//                the opening balances already hold the money, so posting these too would count it twice.
//
// Running a step again updates what it brought before instead of duplicating it. It never moves a party's
// opening balance or an item's stock a second time.

const { randomUUID } = require('crypto');
const importer = require('../stock/importer.cjs');

const last10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);
const clip = (v, n) => (v === null || v === undefined ? null : String(v).slice(0, n));
const parse = (v) => {
    if (!v) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return null; }
};
// A DATE comes back from the database as midnight in the server's own time zone; sent as JSON that becomes the
// evening before in UTC and the page shows the wrong day. Send the date as the plain text it is.
const dateOnly = (v) => {
    if (!v) return null;
    if (v instanceof Date) {
        return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    }
    return String(v).slice(0, 10);
};
const chunks = (list, size) => {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
};

async function loadMap(conn, businessId, entity) {
    const [rows] = await conn.query('SELECT source_id, local_id FROM vyapar_map WHERE business_id = ? AND entity = ?', [businessId, entity]);
    return new Map(rows.map((r) => [r.source_id, r.local_id]));
}

async function remember(conn, businessId, entity, pairs) {
    for (const part of chunks(pairs, 500)) {
        if (!part.length) continue;
        await conn.query(
            'INSERT INTO vyapar_map (business_id, entity, source_id, local_id) VALUES ? ON DUPLICATE KEY UPDATE local_id = VALUES(local_id)',
            [part.map(([source, local]) => [businessId, entity, String(source), local])]
        );
    }
}

async function logRun(conn, { businessId, step, fileName, asOn = null, result, userId }) {
    await conn.query('INSERT INTO vyapar_imports SET ?', [{
        id: randomUUID(), business_id: businessId, step, file_name: clip(fileName, 200), as_on: asOn,
        result: JSON.stringify(result), run_by: userId || null,
    }]);
}

// ── 1. parties ──────────────────────────────────────────────────────────
async function importParties(conn, { businessId, userId, data, asOn, fileName = null }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(asOn || ''))) throw Object.assign(new Error('Choose the date the balances are as on'), { status: 400 });

    const [existing] = await conn.query(
        'SELECT id, display_name, phone, opening_balance_paise FROM parties WHERE business_id = ? AND merged_into_id IS NULL', [businessId]
    );
    const byPhone = new Map();
    const byName = new Map();
    for (const p of existing) {
        if (last10(p.phone).length === 10) byPhone.set(last10(p.phone), p);
        byName.set(String(p.display_name).trim().toLowerCase(), p);
    }
    const mapped = await loadMap(conn, businessId, 'party');
    const [[biz]] = await conn.query('SELECT state_code FROM businesses WHERE id = ? LIMIT 1', [businessId]);

    const result = { created: 0, updated: 0, matched_existing: 0, with_opening_balance: 0, owe_us_paise: 0, we_owe_paise: 0, kept_existing_balance: 0, same_phone: 0 };
    const pairs = [];
    // A portal party can stand for only one Vyapar party. Two Vyapar parties that share a phone number (two shops
    // of one owner, say) stay two records here too — merging them would also merge their balances.
    const claimed = new Set([...mapped.values()]);
    await conn.beginTransaction();
    try {
        for (const p of data.parties) {
            let target = null;
            const known = mapped.get(String(p.source_id));
            if (known) target = existing.find((e) => e.id === known) || { id: known, opening_balance_paise: 0 };
            else {
                const byPhoneHit = last10(p.phone).length === 10 ? byPhone.get(last10(p.phone)) : null;
                const hit = (byPhoneHit && !claimed.has(byPhoneHit.id) ? byPhoneHit : null) || (byName.get(p.name.toLowerCase()) && !claimed.has(byName.get(p.name.toLowerCase()).id) ? byName.get(p.name.toLowerCase()) : null);
                if (hit) { target = hit; claimed.add(hit.id); result.matched_existing += 1; }
                else if (byPhoneHit) result.same_phone += 1;
            }

            const fields = {
                legal_name: clip(p.name, 200), phone: clip(p.phone, 20), email: clip(p.email, 160),
                gst_treatment: p.gstin ? 'registered' : 'unregistered', gstin: p.gstin,
                place_of_supply_state_code: p.state_code || null,
                credit_limit_paise: p.credit_limit_paise || 0, active: p.active ? 1 : 0,
            };

            if (target) {
                // Only fill what the portal does not have; never overwrite what someone typed here.
                const [[now]] = await conn.query('SELECT phone, email, gstin, place_of_supply_state_code, opening_balance_paise FROM parties WHERE id = ?', [target.id]);
                const patch = {};
                if (!now.phone && fields.phone) patch.phone = fields.phone;
                if (!now.email && fields.email) patch.email = fields.email;
                if (!now.gstin && fields.gstin) { patch.gstin = fields.gstin; patch.gst_treatment = 'registered'; }
                if (!now.place_of_supply_state_code && fields.place_of_supply_state_code) patch.place_of_supply_state_code = fields.place_of_supply_state_code;
                // A balance is set once. A second run, or a party that already has one here, keeps what it has.
                if (!known && Number(now.opening_balance_paise) === 0 && p.balance_paise) {
                    patch.opening_balance_paise = Math.abs(p.balance_paise);
                    patch.opening_balance_type = p.balance_paise > 0 ? 'receivable' : 'payable';
                    patch.opening_balance_on = asOn;
                    result.with_opening_balance += 1;
                    if (p.balance_paise > 0) result.owe_us_paise += p.balance_paise; else result.we_owe_paise += -p.balance_paise;
                } else if (p.balance_paise && Number(now.opening_balance_paise) !== 0) result.kept_existing_balance += 1;
                if (Object.keys(patch).length) await conn.query('UPDATE parties SET ? WHERE id = ?', [patch, target.id]);
                result.updated += 1;
                pairs.push([p.source_id, target.id]);
                continue;
            }

            const id = randomUUID();
            const row = {
                id, business_id: businessId, kind: p.kind, display_name: clip(p.name, 200), ...fields,
                place_of_supply_state_code: fields.place_of_supply_state_code || biz?.state_code || null,
                notes: 'Imported from Vyapar', created_by: userId || null,
            };
            if (p.balance_paise) {
                row.opening_balance_paise = Math.abs(p.balance_paise);
                row.opening_balance_type = p.balance_paise > 0 ? 'receivable' : 'payable';
                row.opening_balance_on = asOn;
                result.with_opening_balance += 1;
                if (p.balance_paise > 0) result.owe_us_paise += p.balance_paise; else result.we_owe_paise += -p.balance_paise;
            }
            await conn.query('INSERT INTO parties SET ?', [row]);
            if (p.address || p.pincode) {
                await conn.query('INSERT INTO party_addresses SET ?', [{
                    id: randomUUID(), party_id: id, kind: 'billing', line1: clip(p.address, 255), pincode: clip(p.pincode, 10),
                    state_code: p.state_code || null, is_default: 1,
                }]);
            }
            result.created += 1;
            pairs.push([p.source_id, id]);
            claimed.add(id);
        }
        await remember(conn, businessId, 'party', pairs);
        await conn.commit();
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    }
    await logRun(conn, { businessId, step: 'parties', fileName, asOn, result, userId });
    return result;
}

// ── 2. items and stock ──────────────────────────────────────────────────
const ITEM_HEADER = importer.COLUMNS.map((c) => c.label);
const COLUMN = Object.fromEntries(importer.COLUMNS.map((c, i) => [c.field, i]));

function itemRow(i, usedCodes) {
    const row = new Array(ITEM_HEADER.length).fill('');
    row[COLUMN.name] = i.name;
    // A code two items share would be refused by the importer; the first one keeps it.
    if (i.code && !usedCodes.has(i.code.toLowerCase())) { row[COLUMN.sku] = i.code; usedCodes.add(i.code.toLowerCase()); }
    row[COLUMN.category] = i.category || '';
    row[COLUMN.hsn_sac] = (i.hsn_sac || '').replace(/\D/g, '').slice(0, 8);
    row[COLUMN.unit] = (i.unit || 'Nos').slice(0, 20);
    row[COLUMN.purchase_rate] = i.purchase_price || 0;
    row[COLUMN.selling_rate] = i.sale_price || 0;
    row[COLUMN.gst_rate] = i.gst_rate_known ? i.gst_rate : 18;
    // Only stock that is really there. Negative stock means purchases were never entered; it is reported, not imported.
    row[COLUMN.opening_qty] = i.stock_qty > 0 ? i.stock_qty : '';
    row[COLUMN.opening_rate] = i.stock_qty > 0 ? (i.purchase_price || 0) : '';
    row[COLUMN.min_stock] = i.min_stock > 0 ? i.min_stock : '';
    return row;
}

async function importItems(conn, { businessId, userId, data, asOn, fileName = null }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(asOn || ''))) throw Object.assign(new Error('Choose the date the stock is as on'), { status: 400 });

    const result = { created: 0, updated: 0, with_stock: 0, stock_value_paise: 0, skipped: [], negative_stock: 0, negative_units: 0, stock_journals: [] };
    const usedCodes = new Set();
    const wanted = data.items.filter((i) => i.active);
    for (const i of wanted) if (i.stock_qty < 0) { result.negative_stock += 1; result.negative_units += i.stock_qty; }

    for (const part of chunks(wanted, 400)) {
        let rows = part.map((i) => ({ item: i, row: itemRow(i, usedCodes) }));
        // updateStock:false — an item that is already here keeps its stock; only a new one gets opening stock.
        let checked = await importer.validateRows(conn, businessId, [ITEM_HEADER, ...rows.map((r) => r.row)], { updateStock: false });
        if (!checked.ok) {
            const bad = new Set(checked.rows.filter((r) => r.problems.length).map((r) => r.row - 2));
            for (const index of bad) result.skipped.push({ name: rows[index].item.name, why: checked.rows.find((r) => r.row - 2 === index).problems[0] });
            rows = rows.filter((_, index) => !bad.has(index));
            if (!rows.length) continue;
            checked = await importer.validateRows(conn, businessId, [ITEM_HEADER, ...rows.map((r) => r.row)], { updateStock: false });
            if (!checked.ok) throw new Error(`Items could not be imported: ${checked.errors[0]}`);
        }
        const done = await importer.importRows(conn, { businessId, rows: checked.rows, openingDate: asOn, userId, fileName: `Vyapar ${fileName || ''}`.trim() });
        result.created += done.created; result.updated += done.updated; result.with_stock += done.stocked;
        result.stock_value_paise += done.total_value_paise;
        if (done.journal_id) result.stock_journals.push(done.journal_id);

        // Remember which portal item each Vyapar item became (names are unique, so the name is the key).
        const [found] = await conn.query('SELECT id, name FROM inventory_items WHERE name IN (?)', [rows.map((r) => r.item.name)]);
        const byName = new Map(found.map((f) => [f.name.toLowerCase(), f.id]));
        await remember(conn, businessId, 'item', rows.filter((r) => byName.has(r.item.name.toLowerCase())).map((r) => [r.item.source_id, byName.get(r.item.name.toLowerCase())]));
    }
    await logRun(conn, { businessId, step: 'items', fileName, asOn, result: { ...result, skipped: result.skipped.slice(0, 50), skipped_total: result.skipped.length }, userId });
    return result;
}

// ── 3. history ──────────────────────────────────────────────────────────
const PAYMENT_STATE = { 1: 'unpaid', 2: 'partly_paid', 3: 'paid' };

async function importHistory(conn, { businessId, userId, data, fileName = null }) {
    const parties = await loadMap(conn, businessId, 'party');
    const items = await loadMap(conn, businessId, 'item');
    const partyInfo = new Map(data.parties.map((p) => [p.source_id, p]));

    const result = { documents: 0, lines: 0, matched_party: 0, unmatched_party: 0, by_type: {} };
    await conn.beginTransaction();
    try {
        // History is read-only and replaced as a whole, so a second import cannot leave two copies.
        await conn.query(
            `DELETE l FROM legacy_document_lines l JOIN legacy_documents d ON d.id = l.document_id WHERE d.business_id = ? AND d.source = 'vyapar'`, [businessId]
        );
        await conn.query(`DELETE FROM legacy_documents WHERE business_id = ? AND source = 'vyapar'`, [businessId]);

        for (const part of chunks(data.documents, 300)) {
            const docRows = [];
            const lineRows = [];
            for (const d of part) {
                const id = randomUUID();
                const info = d.party_source_id ? partyInfo.get(d.party_source_id) : null;
                const partyId = d.party_source_id ? (parties.get(String(d.party_source_id)) || null) : null;
                if (d.party_source_id) { if (partyId) result.matched_party += 1; else result.unmatched_party += 1; }
                // A quotation is open or closed (it was acted on); a sale or purchase is paid, part-paid or unpaid.
                const state = d.doc_type === 'estimate' ? (d.status === 4 ? 'closed' : 'open') : (PAYMENT_STATE[d.payment_status] || null);
                docRows.push([
                    id, businessId, 'vyapar', d.source_id, d.doc_type, d.vyapar_type, clip(d.doc_no, 90), d.date, d.due_date, partyId,
                    clip(info?.name, 200), clip(info?.phone, 20), d.total_paise, d.paid_paise, d.balance_paise, d.discount_paise, d.tax_paise,
                    d.round_off_paise, d.tax_inclusive ? 1 : 0, clip(d.place_of_supply, 60), state, clip(d.payment_mode, 80), clip(d.reference, 120),
                    d.notes, d.charges.length ? JSON.stringify(d.charges) : null, d.links.length ? JSON.stringify(d.links) : null,
                ]);
                d.lines.forEach((l, index) => lineRows.push([
                    id, index + 1, l.item_source_id ? (items.get(String(l.item_source_id)) || null) : null, clip(l.name, 500), l.hsn_sac,
                    l.quantity, clip(l.unit, 20), l.rate_paise, l.discount_paise, l.tax_rate_bps, l.tax_paise, l.amount_paise, clip(l.serial_no, 200),
                ]));
                result.documents += 1;
                result.lines += d.lines.length;
                result.by_type[d.doc_type] = (result.by_type[d.doc_type] || 0) + 1;
            }
            if (docRows.length) {
                await conn.query(
                    `INSERT INTO legacy_documents (id, business_id, source, source_id, doc_type, vyapar_type, doc_no, doc_date, due_date, party_id, party_name, party_phone,
                        total_paise, paid_paise, balance_paise, discount_paise, tax_paise, round_off_paise, tax_inclusive, place_of_supply, payment_state, payment_mode,
                        reference, notes, charges, links) VALUES ?`, [docRows]
                );
            }
            if (lineRows.length) {
                await conn.query(
                    `INSERT INTO legacy_document_lines (document_id, line_no, item_id, item_name, hsn_sac, quantity, unit, rate_paise, discount_paise, tax_rate_bps,
                        tax_paise, amount_paise, serial_no) VALUES ?`, [lineRows]
                );
            }
        }
        await conn.commit();
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    }
    await logRun(conn, { businessId, step: 'history', fileName, result, userId });
    return result;
}

// ── what has been done, and the history to read ─────────────────────────
async function status(conn, businessId) {
    const [runs] = await conn.query(
        'SELECT step, file_name, as_on, result, created_at FROM vyapar_imports WHERE business_id = ? ORDER BY created_at DESC LIMIT 30', [businessId]
    );
    const last = {};
    for (const r of runs) if (!last[r.step]) last[r.step] = { file_name: r.file_name, as_on: r.as_on, at: r.created_at, result: parse(r.result) };
    const [[docs]] = await conn.query('SELECT COUNT(*) AS n FROM legacy_documents WHERE business_id = ?', [businessId]);
    const [[mappedParties]] = await conn.query("SELECT COUNT(*) AS n FROM vyapar_map WHERE business_id = ? AND entity = 'party'", [businessId]);
    const [[mappedItems]] = await conn.query("SELECT COUNT(*) AS n FROM vyapar_map WHERE business_id = ? AND entity = 'item'", [businessId]);
    return { last, history_documents: Number(docs.n), parties_brought: Number(mappedParties.n), items_brought: Number(mappedItems.n) };
}

async function listHistory(conn, { businessId, type, q, partyId, from, to, limit = 100, offset = 0 }) {
    const where = ['d.business_id = ?'];
    const params = [businessId];
    if (type && type !== 'all') { where.push('d.doc_type = ?'); params.push(type); }
    if (partyId) { where.push('d.party_id = ?'); params.push(partyId); }
    if (from) { where.push('d.doc_date >= ?'); params.push(from); }
    if (to) { where.push('d.doc_date <= ?'); params.push(to); }
    if (q) {
        where.push('(d.doc_no LIKE ? OR d.party_name LIKE ? OR d.party_phone LIKE ? OR d.reference LIKE ?)');
        const like = `%${q}%`;
        params.push(like, like, like, like);
    }
    const [rows] = await conn.query(
        `SELECT d.id, d.doc_type, d.doc_no, d.doc_date, d.party_id, d.party_name, d.party_phone, d.total_paise, d.paid_paise, d.payment_state, d.payment_mode,
                (SELECT COUNT(*) FROM legacy_document_lines l WHERE l.document_id = d.id) AS line_count
           FROM legacy_documents d WHERE ${where.join(' AND ')}
          ORDER BY d.doc_date DESC, d.doc_no DESC LIMIT ? OFFSET ?`,
        [...params, Math.min(Number(limit) || 100, 500), Math.max(Number(offset) || 0, 0)]
    );
    const [[total]] = await conn.query(`SELECT COUNT(*) AS n, COALESCE(SUM(d.total_paise), 0) AS sum FROM legacy_documents d WHERE ${where.join(' AND ')}`, params);
    return { rows: rows.map((r) => ({ ...r, doc_date: dateOnly(r.doc_date) })), total: Number(total.n), total_paise: Number(total.sum) };
}

async function getHistory(conn, businessId, id) {
    const [[doc]] = await conn.query('SELECT * FROM legacy_documents WHERE id = ? AND business_id = ? LIMIT 1', [id, businessId]);
    if (!doc) return null;
    const [lines] = await conn.query('SELECT * FROM legacy_document_lines WHERE document_id = ? ORDER BY line_no', [id]);
    const links = parse(doc.links) || [];
    // The other records this one is tied to, shown by their numbers.
    let related = [];
    if (links.length) {
        const [rel] = await conn.query(
            'SELECT source_id, id, doc_type, doc_no, doc_date, total_paise FROM legacy_documents WHERE business_id = ? AND source = ? AND source_id IN (?)',
            [businessId, 'vyapar', links.map((l) => l.with)]
        );
        const bySource = new Map(rel.map((r) => [r.source_id, r]));
        related = links.map((l) => {
            const r = bySource.get(l.with);
            return { ...l, record: r ? { ...r, doc_date: dateOnly(r.doc_date) } : null };
        });
    }
    return {
        document: { ...doc, doc_date: dateOnly(doc.doc_date), due_date: dateOnly(doc.due_date), charges: parse(doc.charges) || [], links: undefined },
        lines, related,
    };
}

module.exports = { importParties, importItems, importHistory, status, listHistory, getHistory, ITEM_HEADER, itemRow };
