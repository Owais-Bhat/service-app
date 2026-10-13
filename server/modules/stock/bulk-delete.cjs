'use strict';

// Deleting many items at once, without damaging the books.
//
// An item can only disappear for good if nothing else points at it: no bill, no purchase, no job, no serial number,
// no count, no transfer. For those, what stock they held came in as opening stock (an import, or the old "opening
// stock" box), so that value is taken back out of Inventory against Opening Balance Equity — the exact reverse of what
// brought it in — and then the item and its movements are removed.
//
// Everything else is *kept*, but hidden (made inactive). It cannot be deleted without rewriting history that bills,
// purchases and journals still refer to. The caller sees which is which before anything happens (a dry run).

const posting = require('../ledger/posting.cjs');

const SKIP_TABLES = new Set(['inventory_items', 'inventory_movements', 'vyapar_map', 'legacy_document_lines']);
const CHUNK = 500;

const chunks = (list) => {
    const out = [];
    for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
    return out;
};

// Every table in this database that has an item_id column — found, not listed, so a table added later is respected.
async function referencingTables(conn) {
    const [rows] = await conn.query(
        `SELECT TABLE_NAME AS t FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'item_id'`
    );
    return rows.map((r) => r.t).filter((t) => !SKIP_TABLES.has(t));
}

/**
 * What would happen to these items. Pure reading.
 * @returns {{ delete: object[], keep: object[], reverse_value_paise: number }}
 */
async function plan(conn, ids) {
    const unique = [...new Set(ids.filter(Boolean).map(String))];
    const items = [];
    for (const part of chunks(unique)) {
        const [rows] = await conn.query(
            'SELECT id, name, sku, quantity, stock_value_paise, active FROM inventory_items WHERE id IN (?)', [part]
        );
        items.push(...rows);
    }

    const tables = await referencingTables(conn);
    const used = new Map(); // item id -> Set of table names
    const history = new Map(); // item id -> { other, opening_value }
    for (const part of chunks(items.map((i) => i.id))) {
        for (const table of tables) {
            const [rows] = await conn.query(`SELECT item_id, COUNT(*) AS n FROM \`${table}\` WHERE item_id IN (?) GROUP BY item_id`, [part]);
            for (const r of rows) {
                if (!used.has(r.item_id)) used.set(r.item_id, new Set());
                used.get(r.item_id).add(table);
            }
        }
        const [moves] = await conn.query(
            `SELECT item_id,
                    SUM(CASE WHEN (source_type IS NOT NULL AND source_type <> 'opening') OR ref_id IS NOT NULL THEN 1 ELSE 0 END) AS other,
                    SUM(CASE WHEN source_type = 'opening' THEN COALESCE(value_paise, 0) ELSE 0 END) AS opening_value
               FROM inventory_movements WHERE item_id IN (?) GROUP BY item_id`, [part]
        );
        for (const m of moves) history.set(m.item_id, { other: Number(m.other), opening_value: Number(m.opening_value) });
    }

    const out = { delete: [], keep: [], reverse_value_paise: 0 };
    for (const item of items) {
        const refs = [...(used.get(item.id) || [])];
        const h = history.get(item.id) || { other: 0, opening_value: 0 };
        const why = [];
        if (refs.length) why.push(`used in ${refs.join(', ')}`);
        if (h.other > 0) why.push('has purchase, transfer, count or job stock history');
        const base = { id: item.id, name: item.name, sku: item.sku, quantity: Number(item.quantity), active: !!item.active };
        if (why.length) {
            out.keep.push({ ...base, reason: why.join('; ') });
        } else {
            out.delete.push({ ...base, opening_value_paise: h.opening_value });
            out.reverse_value_paise += Math.max(0, h.opening_value);
        }
    }
    return out;
}

/**
 * Do it. Runs inside one transaction: the journal, the deletions and the hiding all land, or none do.
 */
async function execute(conn, { businessId, user, plan: p, fileLabel = null }) {
    const deleteIds = p.delete.map((i) => i.id);
    const keepIds = p.keep.filter((i) => i.active).map((i) => i.id);
    let journalId = null;

    await conn.beginTransaction();
    try {
        if (p.reverse_value_paise > 0) {
            const inventory = await posting.accountByCode(conn, businessId, '1200');
            const equity = await posting.accountByCode(conn, businessId, '3100');
            const journal = await posting.postJournal(conn, {
                businessId, date: new Date(),
                narration: `Items deleted — opening stock taken back out (${deleteIds.length} item${deleteIds.length === 1 ? '' : 's'})${fileLabel ? ` — ${fileLabel}` : ''}`,
                sourceType: 'stock', sourceId: null,
                lines: [
                    { account_id: equity.id, debit_paise: p.reverse_value_paise, memo: 'Opening stock reversed' },
                    { account_id: inventory.id, credit_paise: p.reverse_value_paise, memo: 'Out of stock' },
                ],
                idempotencyKey: `item-bulk-delete:${deleteIds.slice(0, 5).join('-')}:${deleteIds.length}:${Date.now()}`,
                postedBy: user?.id || null,
            });
            journalId = journal.id;
        }

        for (const part of chunks(deleteIds)) {
            await conn.query('DELETE FROM inventory_movements WHERE item_id IN (?)', [part]);
            await conn.query("DELETE FROM vyapar_map WHERE entity = 'item' AND local_id IN (?)", [part]);
            await conn.query('UPDATE legacy_document_lines SET item_id = NULL WHERE item_id IN (?)', [part]).catch(() => {});
            await conn.query('DELETE FROM inventory_items WHERE id IN (?)', [part]);
        }
        for (const part of chunks(keepIds)) {
            await conn.query('UPDATE inventory_items SET active = 0 WHERE id IN (?)', [part]);
        }
        await conn.commit();
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    }

    return { deleted: deleteIds.length, hidden: keepIds.length, kept: p.keep.length, reversed_value_paise: p.reverse_value_paise, journal_id: journalId };
}

module.exports = { plan, execute };
