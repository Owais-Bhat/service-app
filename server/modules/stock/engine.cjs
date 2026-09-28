'use strict';

// The stock engine.
//
// Every change to what is on the shelf goes through `move()`. Nothing else
// writes to `inventory_items.quantity`, which is why the running total and the
// movement ledger cannot drift apart: the quantity is a consequence of the
// ledger, written in the same statement.
//
// Valuation is **moving average cost**, per item, in paise per base unit:
//
//     new average = (old qty × old average + received qty × received cost)
//                   ÷ (old qty + received qty)
//
// Goods leave at the average of the moment, so cost of goods sold is settled
// when the goods go out and is never revised by a later purchase. The method is
// used consistently for stock value, for cost of sales and for returns.
//
// Units: an item can be bought in one unit and held in another — a 90-metre
// roll of cable bought as one roll, held and used in metres. Quantities in the
// ledger are always in the item's base unit; conversion happens at the door.

const { randomUUID } = require('crypto');

class StockError extends Error {
    constructor(message, code = 'stock_error', status = 422) {
        super(message);
        this.name = 'StockError';
        this.code = code;
        this.status = status;
    }
}

// Quantities are decimal to three places — a third of a roll, 2.5 metres of
// cable — so they are held as thousandths internally and rounded once.
const MILLI = 1000;
const qty = (v) => Math.round((Number(v) || 0) * MILLI) / MILLI;

// Movements that add to stock, and those that take away. The sign is the
// engine's, never the caller's.
const INWARD = new Set(['purchase', 'return', 'adjust_in', 'transfer_in', 'opening', 'count_up']);
const OUTWARD = new Set(['consume', 'adjust_out', 'damage', 'transfer_out', 'sale', 'count_down', 'purchase_return']);

async function loadItem(conn, itemId) {
    const [[item]] = await conn.query('SELECT * FROM inventory_items WHERE id = ? LIMIT 1', [itemId]);
    if (!item) throw new StockError('No such item', 'no_item', 404);
    return item;
}

async function defaultLocation(conn, businessId) {
    const [[row]] = await conn.query(
        'SELECT * FROM stock_locations WHERE business_id = ? AND is_default = 1 LIMIT 1', [businessId]
    );
    if (!row) throw new StockError('No default stock location', 'no_location', 400);
    return row;
}

/**
 * Convert a quantity written in some unit into the item's base unit.
 * A roll of 90 metres bought as "1 roll" becomes 90 metres on the shelf.
 */
function toBaseQuantity(item, quantity, unit = null) {
    const amount = qty(quantity);
    if (!unit) return amount;
    const base = (item.base_unit || item.unit || '').toLowerCase();
    const secondary = (item.secondary_unit || '').toLowerCase();
    const given = String(unit).toLowerCase();

    if (!base || given === base) return amount;
    if (secondary && given === secondary) {
        const factor = Number(item.conversion_factor);
        if (!(factor > 0)) {
            throw new StockError(
                `${item.name} has no conversion set between ${secondary} and ${base}`,
                'no_conversion', 400
            );
        }
        return qty(amount * factor);
    }
    throw new StockError(`${item.name} is not measured in ${unit}`, 'unknown_unit', 400);
}

/**
 * The one door in and out of stock.
 *
 * @param {object} conn      inside a transaction
 * @param {object} move
 * @param {string} move.itemId
 * @param {string} move.type       purchase | consume | transfer_out | …
 * @param {number} move.quantity   in the item's base unit, always positive
 * @param {number} [move.unitCostPaise]  required for an inward move that sets cost
 * @param {string} [move.locationId]
 * @returns {object} the movement row, with the resulting balance and value
 */
async function move(conn, {
    businessId, itemId, type, quantity, unitCostPaise = null, locationId = null, toLocationId = null,
    sourceType = null, sourceId = null, serialId = null, employeeId = null, note = null,
    createdBy = null, journalId = null, allowNegative = false,
}) {
    if (!INWARD.has(type) && !OUTWARD.has(type)) {
        throw new StockError(`Unknown stock movement: ${type}`, 'bad_type', 400);
    }
    const amount = qty(quantity);
    if (!(amount > 0)) throw new StockError('A stock movement needs a positive quantity', 'bad_quantity', 400);

    const item = await loadItem(conn, itemId);
    const onHand = qty(item.quantity);
    const avgCost = Number(item.avg_cost_paise) || 0;
    const inward = INWARD.has(type);
    const delta = inward ? amount : -amount;
    const newQty = qty(onHand + delta);

    // Stock that would go negative means the count is wrong or something left
    // without being recorded. Refusing is the point; the exception is per item
    // and deliberate.
    if (newQty < 0 && !allowNegative && !item.allow_negative) {
        throw new StockError(
            `${item.name}: only ${onHand} in stock, cannot take out ${amount}`,
            'insufficient_stock'
        );
    }

    let newAvg = avgCost;
    let valuePaise;

    if (inward) {
        const cost = unitCostPaise === null ? avgCost : Math.round(Number(unitCostPaise));
        if (cost < 0) throw new StockError('A cost cannot be negative', 'bad_cost', 400);
        valuePaise = Math.round(cost * amount);
        // Moving average. Goods coming back in at no stated cost come back at
        // the average they left at, which keeps a return neutral.
        const totalValue = Math.round(avgCost * onHand) + valuePaise;
        newAvg = newQty > 0 ? Math.round(totalValue / newQty) : cost;
    } else {
        const cost = unitCostPaise === null ? avgCost : Math.round(Number(unitCostPaise));
        valuePaise = -Math.round(cost * amount);
        // Taking goods out does not change what the rest of them cost.
        newAvg = avgCost;
    }

    const newValue = Math.max(0, Math.round(newAvg * newQty));

    const id = randomUUID();
    await conn.query('INSERT INTO inventory_movements SET ?', [{
        id,
        business_id: businessId || null,
        item_id: itemId,
        type,
        quantity: delta,
        rate: unitCostPaise === null ? null : Number(unitCostPaise) / 100,
        unit_cost_paise: unitCostPaise === null ? newAvg : Math.round(Number(unitCostPaise)),
        value_paise: valuePaise,
        balance_qty: newQty,
        location_id: locationId,
        to_location_id: toLocationId,
        source_type: sourceType,
        source_id: sourceId,
        serial_id: serialId,
        journal_id: journalId,
        ref_type: sourceType === 'job' ? null : null,
        employee_id: employeeId,
        note,
        created_by: createdBy,
    }]);

    await conn.query(
        'UPDATE inventory_items SET quantity = ?, avg_cost_paise = ?, stock_value_paise = ? WHERE id = ?',
        [newQty, newAvg, newValue, itemId]
    );

    return {
        id, item_id: itemId, type, quantity: delta, balance_qty: newQty,
        unit_cost_paise: inward ? (unitCostPaise ?? avgCost) : newAvg,
        value_paise: valuePaise, avg_cost_paise: newAvg, stock_value_paise: newValue,
    };
}

/**
 * Store → technician's van, or back again. A transfer is two movements that
 * balance to nothing: the business owns exactly as much afterwards as before,
 * which is why it is neither a sale nor an expense.
 */
async function transfer(conn, {
    businessId, itemId, quantity, fromLocationId, toLocationId, employeeId = null,
    note = null, createdBy = null, serialIds = [],
}) {
    if (!fromLocationId || !toLocationId) throw new StockError('A transfer needs both locations', 'no_location', 400);
    if (fromLocationId === toLocationId) throw new StockError('A transfer needs two different locations', 'same_location', 400);

    const [[from]] = await conn.query('SELECT * FROM stock_locations WHERE id = ? LIMIT 1', [fromLocationId]);
    const [[to]] = await conn.query('SELECT * FROM stock_locations WHERE id = ? LIMIT 1', [toLocationId]);
    if (!from || !to) throw new StockError('No such location', 'no_location', 404);

    const item = await loadItem(conn, itemId);
    const held = await locationQuantity(conn, itemId, fromLocationId, { includeUnassigned: !!from.is_default });
    const amount = qty(quantity);
    if (amount > held && from.owned) {
        throw new StockError(
            `${item.name}: ${from.name} holds ${held}, cannot move ${amount}`,
            'insufficient_stock'
        );
    }

    const source = { sourceType: 'transfer', sourceId: randomUUID() };
    const out = await move(conn, {
        businessId, itemId, type: 'transfer_out', quantity: amount,
        locationId: fromLocationId, toLocationId, employeeId, createdBy,
        note: note || `To ${to.name}`, ...source,
    });
    const back = await move(conn, {
        businessId, itemId, type: 'transfer_in', quantity: amount,
        unitCostPaise: out.avg_cost_paise,
        locationId: toLocationId, employeeId, createdBy,
        note: note || `From ${from.name}`, ...source,
    });

    for (const serialId of serialIds) {
        await conn.query(
            `UPDATE item_serials SET location_id = ?, status = ? WHERE id = ?`,
            [toLocationId, to.kind === 'van' ? 'with_technician' : 'in_stock', serialId]
        );
    }

    return { out, in: back, from, to };
}

// What a single location holds, straight from the ledger rather than a stored
// per-location figure that could drift.
//
// Every movement carries the location it happened at, signed: a transfer is an
// outward row at the source and an inward row at the destination, so summing
// `quantity` per location is the whole answer.
//
// Movements recorded before locations existed carry none, and those goods are
// physically in the main store — so the default location counts them, and no
// other location does.
async function locationQuantity(conn, itemId, locationId, { includeUnassigned = false } = {}) {
    const [[row]] = await conn.query(
        `SELECT COALESCE(SUM(quantity), 0) AS held
           FROM inventory_movements
          WHERE item_id = ? AND (location_id = ?${includeUnassigned ? ' OR location_id IS NULL' : ''})`,
        [itemId, locationId]
    );
    return qty(row.held);
}

// Everything a location is holding, for a technician's van sheet or a store
// count.
async function locationStock(conn, locationId, { includeUnassigned = false } = {}) {
    const [rows] = await conn.query(
        `SELECT i.id, i.name, i.sku, i.unit, i.base_unit, i.avg_cost_paise,
                COALESCE(SUM(m.quantity), 0) AS held_qty
           FROM inventory_movements m
           JOIN inventory_items i ON i.id = m.item_id
          WHERE m.location_id = ?${includeUnassigned ? ' OR m.location_id IS NULL' : ''}
          GROUP BY i.id, i.name, i.sku, i.unit, i.base_unit, i.avg_cost_paise
         HAVING held_qty <> 0
          ORDER BY i.name`,
        [locationId]
    );
    return rows.map((r) => ({
        ...r,
        held_qty: qty(r.held_qty),
        value_paise: Math.round(Number(r.avg_cost_paise) * qty(r.held_qty)),
    }));
}

// ── reservations ────────────────────────────────────────────────────────
// Held for a job. A reservation never moves stock; it only means the shelf is
// spoken for, so available = on hand − reserved.
async function reserve(conn, { businessId, itemId, quantity, locationId = null, refType, refId, note = null, createdBy = null }) {
    const amount = qty(quantity);
    if (!(amount > 0)) throw new StockError('A reservation needs a quantity', 'bad_quantity', 400);

    const item = await loadItem(conn, itemId);
    const available = await availableQuantity(conn, itemId);
    if (amount > available) {
        throw new StockError(
            `${item.name}: ${available} available after existing reservations`,
            'insufficient_available'
        );
    }

    const id = randomUUID();
    await conn.query('INSERT INTO stock_reservations SET ?', [{
        id, business_id: businessId, item_id: itemId, location_id: locationId,
        quantity: amount, ref_type: refType, ref_id: refId, status: 'held',
        note, created_by: createdBy,
    }]);
    return { id, quantity: amount, available_after: qty(available - amount) };
}

async function releaseReservations(conn, { refType, refId, status = 'released' }) {
    const [result] = await conn.query(
        `UPDATE stock_reservations SET status = ?, released_at = NOW()
          WHERE ref_type = ? AND ref_id = ? AND status = 'held'`,
        [status, refType, refId]
    );
    return result.affectedRows || 0;
}

async function reservedQuantity(conn, itemId) {
    const [[row]] = await conn.query(
        `SELECT COALESCE(SUM(quantity), 0) held FROM stock_reservations
          WHERE item_id = ? AND status = 'held'`, [itemId]
    );
    return qty(row.held);
}

async function availableQuantity(conn, itemId) {
    const item = await loadItem(conn, itemId);
    return qty(qty(item.quantity) - await reservedQuantity(conn, itemId));
}

// ── serial numbers ──────────────────────────────────────────────────────
// A serial is unique for the business — the same number cannot be received
// twice — and it carries its own history: what it cost, who sold it to us, who
// we sold it to, which job it went out on and when its warranty ends.
async function receiveSerials(conn, {
    businessId, itemId, serials = [], locationId, costPaise = null, supplierPartyId = null,
    purchaseDocId = null, warrantyMonths = null, createdBy = null,
}) {
    const made = [];
    for (const raw of serials) {
        const serialNo = String(raw || '').trim();
        if (!serialNo) continue;

        const [[clash]] = await conn.query(
            'SELECT id, status FROM item_serials WHERE business_id = ? AND serial_no = ? LIMIT 1',
            [businessId, serialNo]
        );
        if (clash) throw new StockError(`Serial ${serialNo} is already on record`, 'duplicate_serial', 409);

        const id = randomUUID();
        const warranty = warrantyMonths ? new Date() : null;
        if (warranty) warranty.setMonth(warranty.getMonth() + Number(warrantyMonths));

        await conn.query('INSERT INTO item_serials SET ?', [{
            id, business_id: businessId, item_id: itemId, serial_no: serialNo,
            status: 'in_stock', location_id: locationId, owned: 1,
            purchase_doc_id: purchaseDocId, supplier_party_id: supplierPartyId,
            cost_paise: costPaise, warranty_months: warrantyMonths || null,
            warranty_until: warranty ? warranty.toISOString().slice(0, 10) : null,
            created_by: createdBy,
        }]);
        made.push({ id, serial_no: serialNo });
    }
    return made;
}

// A device that belongs to the customer, left with us for repair. It is
// tracked like anything else and valued like nothing else — `owned = 0` keeps
// it out of the stock we own, whatever happens to it in between.
async function receiveCustomerDevice(conn, {
    businessId, itemId, serialNo, customerPartyId, jobType = null, jobId = null,
    notes = null, createdBy = null,
}) {
    const [[location]] = await conn.query(
        `SELECT * FROM stock_locations WHERE business_id = ? AND kind = 'customer' LIMIT 1`, [businessId]
    );
    if (!location) throw new StockError('No location for customer devices', 'no_location', 400);

    const [[clash]] = await conn.query(
        'SELECT id FROM item_serials WHERE business_id = ? AND serial_no = ? LIMIT 1', [businessId, String(serialNo).trim()]
    );
    if (clash) throw new StockError(`Serial ${serialNo} is already on record`, 'duplicate_serial', 409);

    const id = randomUUID();
    await conn.query('INSERT INTO item_serials SET ?', [{
        id, business_id: businessId, item_id: itemId, serial_no: String(serialNo).trim(),
        status: 'customer_owned', location_id: location.id, owned: 0,
        customer_party_id: customerPartyId, job_type: jobType, job_id: jobId,
        cost_paise: null, notes, created_by: createdBy,
    }]);
    return { id, location_id: location.id };
}

// ── what the books should say stock is worth ────────────────────────────
// Rebuilt from the ledger, so it can be compared against the running totals
// rather than simply agreeing with them by construction.
async function valuation(conn, { businessId = null } = {}) {
    const [items] = await conn.query(
        `SELECT i.id, i.name, i.sku, i.unit, i.base_unit, i.quantity, i.avg_cost_paise, i.stock_value_paise,
                COALESCE(led.qty, 0) AS ledger_qty,
                COALESCE(led.value, 0) AS ledger_value_paise
           FROM inventory_items i
           LEFT JOIN (
                SELECT item_id, SUM(quantity) qty, SUM(COALESCE(value_paise, 0)) value
                  FROM inventory_movements
                 GROUP BY item_id
           ) led ON led.item_id = i.id
          ${businessId ? 'WHERE i.business_id = ? OR i.business_id IS NULL' : ''}
          ORDER BY i.name`,
        businessId ? [businessId] : []
    );

    const rows = items.map((i) => {
        const onHand = qty(i.quantity);
        const ledgerQty = qty(i.ledger_qty);
        return {
            id: i.id, name: i.name, sku: i.sku, unit: i.base_unit || i.unit,
            quantity: onHand,
            ledger_quantity: ledgerQty,
            quantity_matches: onHand === ledgerQty,
            avg_cost_paise: Number(i.avg_cost_paise) || 0,
            value_paise: Number(i.stock_value_paise) || 0,
        };
    });

    return {
        method: 'moving average cost',
        items: rows,
        total_value_paise: rows.reduce((sum, r) => sum + r.value_paise, 0),
        // Anything here is a genuine problem: the running count and the ledger
        // have disagreed, which should be impossible while every change goes
        // through move().
        discrepancies: rows.filter((r) => !r.quantity_matches),
    };
}

module.exports = {
    StockError,
    move,
    transfer,
    locationQuantity,
    locationStock,
    reserve,
    releaseReservations,
    reservedQuantity,
    availableQuantity,
    receiveSerials,
    receiveCustomerDevice,
    toBaseQuantity,
    defaultLocation,
    valuation,
    loadItem,
    qty,
};
