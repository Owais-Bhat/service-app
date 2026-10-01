'use strict';

// Bulk item + stock import.
//
// One function checks the rows (`validateRows`) and one writes them
// (`importRows`). The screen's preview and the real import both go through
// `validateRows`, so what the owner is shown is exactly what would happen.
//
// The rules that matter:
//   • Nothing is saved unless every row is clean — a half-imported stock list
//     is harder to fix than an unimported one.
//   • An item is found by its SKU, else by its name. One that is already there
//     is updated, never duplicated, and a blank cell leaves what is saved alone.
//   • An item with no stock yet gets opening stock. One that already holds
//     stock has its quantity brought to the file's number (when asked to), as a
//     count: the difference moves through `stock.move()` and is posted to the
//     books against stock adjustments, so the shelf and the ledger still agree.
//     The same file uploaded twice changes nothing the second time.
//   • Opening stock goes in through the same `stock.move()` door as every other
//     movement, and one journal (Dr Inventory / Cr Opening Balance Equity)
//     carries the whole value.

const { createHash, randomUUID } = require('crypto');
const money = require('../money.cjs');
const posting = require('../ledger/posting.cjs');
const stock = require('./engine.cjs');

// The columns of the template, in order. `keys` are the header spellings
// accepted on upload, lower-cased with punctuation removed, so "Selling Rate",
// "selling_rate" and "SELLING RATE (₹)" all land in the same column.
const COLUMNS = [
    { field: 'name', label: 'Item Name', keys: ['itemname', 'name', 'item', 'product', 'productname'] },
    { field: 'sku', label: 'SKU', keys: ['sku', 'code', 'itemcode', 'partno', 'partnumber'] },
    { field: 'category', label: 'Category', keys: ['category', 'group', 'type'] },
    { field: 'hsn_sac', label: 'HSN/SAC', keys: ['hsnsac', 'hsn', 'sac', 'hsncode'] },
    { field: 'unit', label: 'Unit', keys: ['unit', 'uom'] },
    { field: 'purchase_rate', label: 'Purchase Rate', keys: ['purchaserate', 'purchaseprice', 'costprice', 'cost', 'buyrate'] },
    { field: 'selling_rate', label: 'Selling Rate', keys: ['sellingrate', 'sellingprice', 'saleprice', 'salerate', 'mrp', 'rate', 'price'] },
    { field: 'gst_rate', label: 'GST %', keys: ['gst', 'gstrate', 'gstpercent', 'tax', 'taxrate'] },
    { field: 'opening_qty', label: 'Opening Qty', keys: ['openingqty', 'openingquantity', 'openingstock', 'quantity', 'qty', 'stock', 'onhand'] },
    { field: 'opening_rate', label: 'Opening Rate', keys: ['openingrate', 'openingcost', 'stockrate'] },
    { field: 'min_stock', label: 'Min Stock', keys: ['minstock', 'minimumstock', 'reorderlevel', 'minqty'] },
    { field: 'location', label: 'Location', keys: ['location', 'store', 'godown', 'warehouse'] },
    { field: 'brand', label: 'Brand', keys: ['brand', 'make', 'manufacturer'] },
    { field: 'model', label: 'Model', keys: ['model', 'modelno'] },
    { field: 'warranty_months', label: 'Warranty (months)', keys: ['warrantymonths', 'warranty'] },
    { field: 'track_serial', label: 'Track Serial', keys: ['trackserial', 'serial', 'hasserial'] },
    { field: 'serials', label: 'Serial Numbers', keys: ['serialnumbers', 'serialnos', 'serialno', 'serials'] },
];

const SAMPLE_ROWS = [
    ['HD Dome Camera 2MP', 'CAM-2MP-01', 'Cameras', '85258900', 'pcs', 1500, 2500, 18, 10, 1450, 3, 'Main Store', 'Hikvision', 'DS-2CE', 24, 'Y', 'SN001, SN002, SN003, SN004, SN005, SN006, SN007, SN008, SN009, SN010'],
    ['CAT6 Cable (metre)', 'CBL-CAT6', 'Cables', '85444999', 'm', 22, 30, 18, 305, '', 100, 'Main Store', 'D-Link', '', '', 'N', ''],
    ['Cable Tie 200mm', '', 'Accessories', '39269099', 'pcs', 1.5, 3, 18, '', '', '', '', '', '', '', 'N', ''],
];

const MAX_ROWS = 1000; // the request body is capped at 1 MB
const UNIT_MAX = 20;

const compact = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const text = (v, max = 255) => String(v ?? '').trim().slice(0, max);

/** Map the header row onto fields. Returns { index: {field: columnIndex}, unknown: [labels] }. */
function mapHeader(header) {
    const index = {};
    const unknown = [];
    header.forEach((cell, i) => {
        const key = compact(String(cell).replace(/\(.*?\)/g, '')); // "Selling Rate (₹)" → sellingrate
        if (!key) return;
        const column = COLUMNS.find((c) => c.keys.includes(key));
        if (column && index[column.field] === undefined) index[column.field] = i;
        else if (!column) unknown.push(String(cell).trim());
    });
    return { index, unknown };
}

// A number typed by a person: "1,500", "₹ 1500", "12.5". Anything else is an
// error, never a silent zero.
function parseNumber(value) {
    if (value === '' || value === null || value === undefined) return { blank: true };
    if (typeof value === 'number') return Number.isFinite(value) ? { value } : { error: true };
    const cleaned = String(value).replace(/[₹,\s]/g, '').replace(/%$/, '');
    if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return { error: true };
    return { value: Number(cleaned) };
}

const YES = new Set(['y', 'yes', 'true', '1']);
const NO = new Set(['n', 'no', 'false', '0', '']);

/**
 * Check every row against the file and against the database. Pure of side
 * effects, so it is safe to call for a preview.
 *
 * @param {object} conn
 * @param {string} businessId
 * @param {Array<Array>} table  the sheet as rows of cells; the first row is the header
 * @param {{updateStock?: boolean}} [options]  updateStock (default true): bring the
 *        quantity of items that already hold stock to the file's number
 * @returns {Promise<{ok: boolean, rows: object[], errors: string[], summary: object}>}
 */
async function validateRows(conn, businessId, table, { updateStock = true } = {}) {
    const errors = [];
    const fail = (message) => ({ ok: false, rows: [], errors: [message], summary: emptySummary() });

    if (!Array.isArray(table) || table.length < 2) return fail('The file has no item rows under the heading row.');
    if (table.length - 1 > MAX_ROWS) return fail(`A file can hold at most ${MAX_ROWS} items — split it and upload in parts.`);

    const { index, unknown } = mapHeader(table[0]);
    for (const required of ['name', 'purchase_rate', 'selling_rate']) {
        if (index[required] === undefined) {
            const label = COLUMNS.find((c) => c.field === required).label;
            return fail(`The heading row has no "${label}" column. Download the template and keep its headings as they are.`);
        }
    }

    const [existingItems] = await conn.query(
        'SELECT id, sku, name, quantity, track_serial FROM inventory_items'
    );
    const bySku = new Map();
    const byName = new Map();
    for (const item of existingItems) {
        if (item.sku) bySku.set(item.sku.toLowerCase(), item);
        byName.set(item.name.toLowerCase(), item);
    }

    const [locationRows] = await conn.query(
        'SELECT id, name, is_default FROM stock_locations WHERE business_id = ? AND owned = 1 AND active = 1', [businessId]
    );
    const locationByName = new Map(locationRows.map((l) => [l.name.toLowerCase(), l]));
    const defaultLocation = locationRows.find((l) => l.is_default) || locationRows[0];

    const [usedMovement] = await conn.query('SELECT DISTINCT item_id FROM inventory_movements');
    const hasHistory = new Set(usedMovement.map((r) => r.item_id));

    const [serialRows] = await conn.query('SELECT serial_no, item_id FROM item_serials WHERE business_id = ?', [businessId]);
    const serialOwner = new Map(serialRows.map((r) => [r.serial_no.toLowerCase(), r.item_id]));

    const seenKeys = new Map();      // sku or name within this file → row number
    const claimed = new Map();       // saved item id → row number that found it
    const seenSerials = new Map();   // serial → row number
    const rows = [];

    for (let i = 1; i < table.length; i += 1) {
        const line = table[i];
        const rowNo = i + 1; // what the owner sees in Excel
        const cell = (field) => (index[field] === undefined ? '' : line[index[field]]);
        if (!line.some((c) => String(c ?? '').trim() !== '')) continue; // a blank row is not an error

        const problems = [];
        const add = (message) => problems.push(message);

        const name = text(cell('name'));
        if (!name) add('Item Name is empty');

        const number = (field, label, { required = false, min = 0, whole = false, max = null } = {}) => {
            const parsed = parseNumber(cell(field));
            if (parsed.blank) {
                if (required) add(`${label} is empty`);
                return null;
            }
            if (parsed.error) { add(`${label} "${text(cell(field), 30)}" is not a number`); return null; }
            if (parsed.value < min) { add(`${label} cannot be less than ${min}`); return null; }
            if (max !== null && parsed.value > max) { add(`${label} cannot be more than ${max}`); return null; }
            if (whole && !Number.isInteger(parsed.value)) { add(`${label} must be a whole number`); return null; }
            return parsed.value;
        };

        const purchaseRate = number('purchase_rate', 'Purchase Rate', { required: true });
        const sellingRate = number('selling_rate', 'Selling Rate', { required: true });
        const gstRate = number('gst_rate', 'GST %', { max: 100 });
        const openingQty = number('opening_qty', 'Opening Qty');
        const openingRate = number('opening_rate', 'Opening Rate');
        const minStock = number('min_stock', 'Min Stock');
        const warranty = number('warranty_months', 'Warranty (months)', { whole: true, max: 240 });

        if (openingQty !== null && Math.round(openingQty * 1000) / 1000 !== openingQty) {
            add('Opening Qty can have at most 3 decimal places');
        }

        const sku = text(cell('sku'), 60);
        const unitGiven = text(cell('unit'), UNIT_MAX);
        const unit = unitGiven || 'pcs';

        // Which saved item is this row about? The SKU first, then the name. A
        // name that is taken by an item under a different SKU would make two
        // items that look identical on an invoice.
        let existing = sku ? bySku.get(sku.toLowerCase()) || null : null;
        if (!existing && name) {
            const named = byName.get(name.toLowerCase());
            if (named && (!sku || !named.sku)) existing = named;
            else if (named) add(`An item called "${name}" already exists under a different SKU (${named.sku})`);
        }
        if (existing) {
            if (claimed.has(existing.id)) add(`Is the same item as row ${claimed.get(existing.id)}`);
            else claimed.set(existing.id, rowNo);
        }

        const serialFlag = text(cell('track_serial')).toLowerCase();
        if (!YES.has(serialFlag) && !NO.has(serialFlag)) add(`Track Serial "${text(cell('track_serial'), 10)}" should be Y or N`);
        const serialFlagGiven = serialFlag !== '';
        // A blank Track Serial leaves a saved item as it is.
        const trackSerial = serialFlagGiven ? YES.has(serialFlag) : !!(existing && Number(existing.track_serial));

        const serials = String(cell('serials') ?? '')
            .split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
        if (serials.length && !trackSerial) add('Serial Numbers are filled but Track Serial is not Y');

        const hadStock = !!existing && (Number(existing.quantity) > 0 || hasHistory.has(existing.id));
        const given = openingQty !== null;

        // What happens to the shelf: first stock ('opening'), a count against
        // stock already held ('set'), or nothing.
        let stockMode = 'none';
        let newSerials = serials;
        let before = existing ? Number(existing.quantity) : 0;
        let delta = 0;
        if (!existing || !hadStock) {
            stockMode = (openingQty || 0) > 0 ? 'opening' : 'none';
        } else if (trackSerial) {
            // Each piece has its own number, so only numbers not yet on record change the stock.
            newSerials = serials.filter((s) => serialOwner.get(s.toLowerCase()) !== existing.id);
            if (updateStock && newSerials.length) { stockMode = 'set'; delta = newSerials.length; }
        } else if (given && updateStock) {
            delta = Math.round((openingQty - before) * 1000) / 1000;
            if (delta !== 0) stockMode = 'set';
        }

        if (stockMode === 'opening' && trackSerial) {
            if (!Number.isInteger(openingQty)) add('A serial-tracked item needs a whole Opening Qty');
            else if (serials.length !== openingQty) {
                add(`Opening Qty is ${openingQty} but ${serials.length} serial number${serials.length === 1 ? ' is' : 's are'} listed`);
            }
        }
        if (trackSerial && !(openingQty > 0) && serials.length && stockMode === 'none' && !hadStock) add('Serial Numbers need an Opening Qty');
        for (const serial of newSerials) {
            const key = serial.toLowerCase();
            if (serialOwner.has(key)) add(`Serial ${serial} is already on record`);
            else if (seenSerials.has(key)) add(`Serial ${serial} is repeated (also in row ${seenSerials.get(key)})`);
            else seenSerials.set(key, rowNo);
        }
        if (stockMode === 'none') newSerials = [];

        // Where does the stock go?
        let location = null;
        const locationName = text(cell('location'));
        if (stockMode !== 'none') {
            location = locationName ? locationByName.get(locationName.toLowerCase()) : defaultLocation;
            if (!location) {
                add(locationName
                    ? `Location "${locationName}" does not exist — create it under Stock → Locations & Vans first`
                    : 'No default stock location is set up');
            }
        } else if (locationName && !locationByName.has(locationName.toLowerCase())) {
            add(`Location "${locationName}" does not exist`);
        }
        if (stockMode === 'set' && delta < 0 && location) {
            const held = await stock.locationQuantity(conn, existing.id, location.id, { includeUnassigned: !!location.is_default });
            if (held < -delta) {
                add(`"${existing.name}": the file takes ${-delta} off, but only ${held} is held at ${location.name}`);
            }
        }

        // Duplicates inside the file.
        const fileKey = (sku || name).toLowerCase();
        if (fileKey) {
            if (seenKeys.has(fileKey)) add(`Repeats row ${seenKeys.get(fileKey)} (${sku ? 'same SKU' : 'same name'})`);
            else seenKeys.set(fileKey, rowNo);
        }

        if (problems.length) {
            errors.push(...problems.map((p) => `Row ${rowNo}: ${p}`));
        }

        rows.push({
            row: rowNo,
            action: existing ? 'update' : 'create',
            existing_id: existing?.id || null,
            name, sku: sku || null,
            category: text(cell('category'), 120) || null,
            hsn_sac: text(cell('hsn_sac'), 10) || null,
            unit,
            unit_given: !!unitGiven,
            purchase_rate: purchaseRate,
            selling_rate: sellingRate,
            gst_rate: gstRate === null ? 18 : gstRate,
            gst_given: gstRate !== null,
            min_stock: minStock || 0,
            min_stock_given: minStock !== null,
            brand: text(cell('brand'), 120) || null,
            model: text(cell('model'), 120) || null,
            warranty_months: warranty,
            track_serial: trackSerial,
            track_serial_given: serialFlagGiven,
            serials: newSerials,
            stock_mode: stockMode,
            stock_before: before,
            stock_delta: delta,
            opening_qty: openingQty || 0,
            opening_rate: openingRate !== null ? openingRate : purchaseRate,
            location_id: location?.id || null,
            location_name: location?.name || null,
            problems,
        });
    }

    if (!rows.length) return fail('The file has no item rows under the heading row.');

    return {
        ok: errors.length === 0,
        rows,
        errors,
        ignored_columns: unknown,
        summary: summarise(rows),
    };
}

function emptySummary() {
    return {
        rows: 0, create: 0, update: 0, with_stock: 0, total_qty: 0, total_value_paise: 0,
        restock: 0, restock_up: 0, restock_down: 0,
    };
}

function summarise(rows) {
    const summary = emptySummary();
    for (const r of rows) {
        summary.rows += 1;
        summary[r.action] += 1;
        if (r.stock_mode === 'opening') {
            summary.with_stock += 1;
            summary.total_qty += r.opening_qty;
            summary.total_value_paise += Math.round(money.toPaise(r.opening_rate || 0) * r.opening_qty);
        } else if (r.stock_mode === 'set') {
            summary.restock += 1;
            if (r.stock_delta > 0) summary.restock_up += 1; else summary.restock_down += 1;
        }
    }
    summary.total_qty = Math.round(summary.total_qty * 1000) / 1000;
    return summary;
}

/**
 * Write a validated file. Everything happens in one transaction: the items,
 * the stock movements, the serials and the journals all land, or none do.
 */
async function importRows(conn, { businessId, rows, openingDate, userId, fileName = null }) {
    if (rows.some((r) => r.problems.length)) {
        throw new stock.StockError('The file still has errors — nothing was imported', 'has_errors', 422);
    }
    const date = String(openingDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new stock.StockError('Choose the date the stock counts from', 'no_date', 400);
    }

    await conn.beginTransaction();
    try {
        const result = {
            created: 0, updated: 0, stocked: 0, serials: 0, total_value_paise: 0, journal_id: null,
            restocked: 0, restock_up_paise: 0, restock_down_paise: 0, restock_journal_id: null,
        };

        for (const r of rows) {
            const details = {
                sku: r.sku, name: r.name, category: r.category, unit: r.unit, base_unit: r.unit,
                hsn_sac: r.hsn_sac, brand: r.brand, model: r.model,
                purchase_rate: Math.round(r.purchase_rate * 100) / 100,
                selling_rate: Math.round(r.selling_rate * 100) / 100,
                gst_rate: r.gst_rate, min_stock: r.min_stock,
                track_serial: r.track_serial ? 1 : 0, warranty_months: r.warranty_months,
            };

            let itemId = r.existing_id;
            if (itemId) {
                // A blank cell in the file leaves what is saved alone.
                const keep = { ...details };
                for (const field of ['sku', 'category', 'hsn_sac', 'brand', 'model', 'warranty_months']) {
                    if (keep[field] === null) delete keep[field];
                }
                if (!r.unit_given) { delete keep.unit; delete keep.base_unit; }
                if (!r.gst_given) delete keep.gst_rate;
                if (!r.min_stock_given) delete keep.min_stock;
                if (!r.track_serial_given) delete keep.track_serial;
                await conn.query('UPDATE inventory_items SET ? WHERE id = ?', [keep, itemId]);
                result.updated += 1;
            } else {
                itemId = randomUUID();
                await conn.query('INSERT INTO inventory_items SET ?', [{ id: itemId, ...details, created_by: userId }]);
                result.created += 1;
            }

            if (r.stock_mode === 'opening') {
                const cost = money.toPaise(r.opening_rate);
                const made = await stock.move(conn, {
                    businessId, itemId, type: 'opening', quantity: r.opening_qty,
                    unitCostPaise: cost, locationId: r.location_id,
                    sourceType: 'opening', note: 'Opening stock (Excel import)', createdBy: userId,
                });
                result.total_value_paise += made.value_paise;
                result.stocked += 1;

                if (r.serials.length) {
                    const made = await stock.receiveSerials(conn, {
                        businessId, itemId, serials: r.serials, locationId: r.location_id,
                        costPaise: cost, warrantyMonths: r.warranty_months, createdBy: userId,
                    });
                    result.serials += made.length;
                }
            } else if (r.stock_mode === 'set') {
                const up = r.stock_delta > 0;
                const cost = money.toPaise(r.opening_rate);
                const made = await stock.move(conn, {
                    businessId, itemId, type: up ? 'count_up' : 'count_down', quantity: Math.abs(r.stock_delta),
                    unitCostPaise: up ? cost : null, locationId: r.location_id,
                    sourceType: 'count', note: 'Stock updated (Excel import)', createdBy: userId,
                });
                if (up) result.restock_up_paise += Math.abs(made.value_paise);
                else result.restock_down_paise += Math.abs(made.value_paise);
                result.restocked += 1;

                if (r.serials.length) {
                    const got = await stock.receiveSerials(conn, {
                        businessId, itemId, serials: r.serials, locationId: r.location_id,
                        costPaise: cost, warrantyMonths: r.warranty_months, createdBy: userId,
                    });
                    result.serials += got.length;
                }
            }
        }

        const fingerprint = (kind) => createHash('sha256').update(JSON.stringify([kind, date, rows.map((x) => [x.name, x.sku, x.opening_qty, x.opening_rate, x.stock_delta])])).digest('hex').slice(0, 32);

        if (result.total_value_paise > 0) {
            const inventory = await posting.accountByCode(conn, businessId, '1200');
            const equity = await posting.accountByCode(conn, businessId, '3100');
            // The same file on the same date is the same import; the key stops a
            // double-click from posting the value twice.
            const journal = await posting.postJournal(conn, {
                businessId, date,
                narration: `Opening stock — Excel import${fileName ? ` (${fileName})` : ''}`,
                sourceType: 'opening', sourceId: null,
                lines: [
                    { account_id: inventory.id, debit_paise: result.total_value_paise, memo: `${result.stocked} item(s) brought in` },
                    { account_id: equity.id, credit_paise: result.total_value_paise, memo: 'Opening stock' },
                ],
                idempotencyKey: `stock-import:${fingerprint('opening')}`,
                postedBy: userId,
            });
            result.journal_id = journal.id;
        }

        // Counts against stock already held: the net difference goes to the same
        // account a stock count uses, so it is visible in the accounts.
        const net = result.restock_up_paise - result.restock_down_paise;
        if (net !== 0) {
            const inventory = await posting.accountByCode(conn, businessId, '1200');
            const shrinkage = await posting.accountByCode(conn, businessId, '5010');
            const journal = await posting.postJournal(conn, {
                businessId, date,
                narration: `Stock updated — Excel import${fileName ? ` (${fileName})` : ''}`,
                sourceType: 'stock', sourceId: null,
                lines: net > 0
                    ? [
                        { account_id: inventory.id, debit_paise: net, memo: `${result.restocked} item(s) found more` },
                        { account_id: shrinkage.id, credit_paise: net, memo: 'Import stock update' },
                    ]
                    : [
                        { account_id: shrinkage.id, debit_paise: -net, memo: `${result.restocked} item(s) found less` },
                        { account_id: inventory.id, credit_paise: -net, memo: 'Import stock update' },
                    ],
                idempotencyKey: `stock-import:${fingerprint('update')}`,
                postedBy: userId,
            });
            result.restock_journal_id = journal.id;
        }

        await conn.commit();
        return result;
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    }
}

module.exports = { COLUMNS, SAMPLE_ROWS, validateRows, importRows, mapHeader, parseNumber };
