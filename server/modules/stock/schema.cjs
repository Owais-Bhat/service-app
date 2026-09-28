'use strict';

// Stage 3 schema: where the goods are, what they cost, and how they got there.
//
// The existing `inventory_movements` table stays the one ledger for stock — it
// grows the columns this stage needs rather than being replaced, so the
// movements already recorded by the service and installation flows remain part
// of the same history.
//
// Three ideas the shape is built around:
//
//   * Stock is always somewhere. The main store, a technician's van, the
//     damaged shelf and a customer's device in for repair are all locations,
//     and every movement names the one it left and the one it entered.
//   * A customer's own device is not our stock. It sits in a location marked
//     as not-owned, so it can be tracked without ever appearing in the value of
//     what the business owns.
//   * Receiving goods and being billed for them are two events. The receipt
//     puts goods on the shelf; the bill records what is owed. Neither does the
//     other's job, which is what stops the same delivery being counted twice.

const STOCK_TABLES = [
    `CREATE TABLE IF NOT EXISTS stock_locations (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        name VARCHAR(120) NOT NULL,
        kind VARCHAR(20) NOT NULL DEFAULT 'store'
            COMMENT 'store | van | site | damaged | quarantine | customer — customer holds devices we do not own',
        employee_id VARCHAR(36) NULL COMMENT 'set for a technician van, so stock can be held to a person',
        owned TINYINT(1) NOT NULL DEFAULT 1
            COMMENT '0 for a customer device in for repair: tracked, never valued as ours',
        is_default TINYINT(1) DEFAULT 0,
        active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_location_name (business_id, name),
        INDEX idx_location_employee (employee_id)
    )`,

    // One row per physical device we can point at. Serial numbers are how a
    // warranty claim two years from now finds the invoice it belongs to.
    `CREATE TABLE IF NOT EXISTS item_serials (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        item_id VARCHAR(36) NOT NULL,
        serial_no VARCHAR(120) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'in_stock'
            COMMENT 'in_stock | with_technician | installed | returned | scrapped | customer_owned',
        location_id VARCHAR(36) NULL,
        owned TINYINT(1) NOT NULL DEFAULT 1,
        purchase_doc_id VARCHAR(36) NULL,
        supplier_party_id VARCHAR(36) NULL,
        sale_doc_id VARCHAR(36) NULL,
        customer_party_id VARCHAR(36) NULL,
        job_type VARCHAR(20) NULL COMMENT 'inquiry | installation — the job it went out on',
        job_id VARCHAR(36) NULL,
        cost_paise BIGINT NULL,
        warranty_months INT NULL,
        warranty_until DATE NULL,
        installed_at TIMESTAMP NULL,
        notes VARCHAR(500),
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_serial (business_id, serial_no),
        INDEX idx_serial_item (item_id, status),
        INDEX idx_serial_customer (customer_party_id),
        FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
    )`,

    // Held for a job, not yet taken off the shelf. A reservation is a promise,
    // never a consumption — the two are counted separately everywhere.
    `CREATE TABLE IF NOT EXISTS stock_reservations (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        item_id VARCHAR(36) NOT NULL,
        location_id VARCHAR(36) NULL,
        quantity DECIMAL(14,3) NOT NULL,
        ref_type VARCHAR(20) COMMENT 'estimate | sales_order | inquiry | installation',
        ref_id VARCHAR(36),
        status VARCHAR(12) NOT NULL DEFAULT 'held' COMMENT 'held | released | consumed',
        note VARCHAR(300),
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        released_at TIMESTAMP NULL,
        INDEX idx_reservation_item (item_id, status),
        INDEX idx_reservation_ref (ref_type, ref_id),
        FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
    )`,

    // A physical count and what it found. Differences are posted as corrections
    // once someone approves them, never silently.
    `CREATE TABLE IF NOT EXISTS stock_counts (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        location_id VARCHAR(36) NULL,
        count_no VARCHAR(40),
        count_date DATE NOT NULL,
        status VARCHAR(12) NOT NULL DEFAULT 'open' COMMENT 'open | approved | cancelled',
        note VARCHAR(500),
        counted_by VARCHAR(36),
        approved_by VARCHAR(36),
        approved_at TIMESTAMP NULL,
        journal_id VARCHAR(36) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_count_business (business_id, count_date)
    )`,

    `CREATE TABLE IF NOT EXISTS stock_count_lines (
        id VARCHAR(36) PRIMARY KEY,
        count_id VARCHAR(36) NOT NULL,
        item_id VARCHAR(36) NOT NULL,
        expected_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
        counted_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
        difference_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
        unit_cost_paise BIGINT DEFAULT 0,
        value_difference_paise BIGINT DEFAULT 0,
        note VARCHAR(300),
        INDEX idx_count_line (count_id),
        FOREIGN KEY (count_id) REFERENCES stock_counts(id) ON DELETE CASCADE
    )`,

    // Purchase documents mirror the sales side deliberately: the same states,
    // the same snapshot-on-issue rule, the same refusal to edit what has been
    // issued.
    `CREATE TABLE IF NOT EXISTS purchase_documents (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        doc_type VARCHAR(20) NOT NULL
            COMMENT 'purchase_order | goods_receipt | supplier_bill | purchase_return',
        doc_no VARCHAR(40) NULL,
        doc_date DATE NOT NULL,
        due_date DATE NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft'
            COMMENT 'draft | issued | partially_received | received | cancelled | closed',

        party_id VARCHAR(36) NULL COMMENT 'the supplier',
        party_snapshot JSON NULL,
        place_of_supply_state_code VARCHAR(2),
        supply_type VARCHAR(6),
        prices_include_tax TINYINT(1) DEFAULT 0,

        location_id VARCHAR(36) NULL COMMENT 'where a receipt puts the goods',
        po_id VARCHAR(36) NULL COMMENT 'the order a receipt or bill belongs to',
        grn_id VARCHAR(36) NULL COMMENT 'the receipt a bill belongs to',
        supplier_ref VARCHAR(120) COMMENT "the supplier's own invoice number",

        gross_paise BIGINT DEFAULT 0,
        line_discount_paise BIGINT DEFAULT 0,
        doc_discount_paise BIGINT DEFAULT 0,
        charges_paise BIGINT DEFAULT 0 COMMENT 'freight and the like, added to the cost of the goods',
        taxable_paise BIGINT DEFAULT 0,
        cgst_paise BIGINT DEFAULT 0,
        sgst_paise BIGINT DEFAULT 0,
        utgst_paise BIGINT DEFAULT 0,
        igst_paise BIGINT DEFAULT 0,
        round_off_paise BIGINT DEFAULT 0,
        total_paise BIGINT DEFAULT 0,
        input_credit_eligible TINYINT(1) DEFAULT 1
            COMMENT 'ineligible purchases keep their tax in the cost instead of claiming it',

        notes TEXT,
        terms TEXT,
        journal_id VARCHAR(36) NULL,
        issued_at TIMESTAMP NULL,
        issued_by VARCHAR(36) NULL,
        cancelled_at TIMESTAMP NULL,
        cancelled_by VARCHAR(36) NULL,
        cancel_reason VARCHAR(500),
        attachment_url VARCHAR(500),
        idempotency_key VARCHAR(120) NULL,
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_pdoc_idem (idempotency_key),
        UNIQUE KEY uniq_pdoc_no (business_id, doc_type, doc_no),
        INDEX idx_pdoc_party (party_id, doc_type, status),
        INDEX idx_pdoc_po (po_id),
        INDEX idx_pdoc_date (business_id, doc_type, doc_date)
    )`,

    `CREATE TABLE IF NOT EXISTS purchase_document_lines (
        id VARCHAR(36) PRIMARY KEY,
        document_id VARCHAR(36) NOT NULL,
        line_no INT NOT NULL DEFAULT 1,
        kind VARCHAR(10) NOT NULL DEFAULT 'item' COMMENT 'item | charge',
        item_id VARCHAR(36) NULL,
        item_snapshot JSON NULL,
        description VARCHAR(500) NOT NULL,
        hsn_sac VARCHAR(10),
        quantity DECIMAL(14,3) NOT NULL DEFAULT 1 COMMENT 'in the unit written on the line',
        unit VARCHAR(20),
        base_quantity DECIMAL(14,3) NOT NULL DEFAULT 1 COMMENT 'converted to the stock unit — rolls bought, metres held',
        received_qty DECIMAL(14,3) NOT NULL DEFAULT 0 COMMENT 'on an order: how much has arrived so far',
        billed_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
        rate_paise BIGINT NOT NULL DEFAULT 0,
        discount_bps INT DEFAULT 0,
        line_discount_paise BIGINT DEFAULT 0,
        doc_discount_share_paise BIGINT DEFAULT 0,
        landed_cost_paise BIGINT DEFAULT 0 COMMENT "this line's share of freight and other charges",
        tax_treatment VARCHAR(20) DEFAULT 'gst',
        tax_rate_bps INT DEFAULT 0,
        taxable_paise BIGINT DEFAULT 0,
        cgst_paise BIGINT DEFAULT 0,
        sgst_paise BIGINT DEFAULT 0,
        utgst_paise BIGINT DEFAULT 0,
        igst_paise BIGINT DEFAULT 0,
        amount_paise BIGINT DEFAULT 0,
        po_line_id VARCHAR(36) NULL COMMENT 'the order line this receipt or bill line answers',
        serial_numbers JSON NULL,
        INDEX idx_pline_doc (document_id),
        INDEX idx_pline_po (po_line_id),
        FOREIGN KEY (document_id) REFERENCES purchase_documents(id) ON DELETE CASCADE
    )`,

    // What a payment to a supplier was put against. Same idea as the sales
    // side: unallocated money is an advance and stays visible as one.
    `CREATE TABLE IF NOT EXISTS purchase_allocations (
        id VARCHAR(36) PRIMARY KEY,
        payment_id VARCHAR(36) NOT NULL,
        document_id VARCHAR(36) NOT NULL,
        amount_paise BIGINT NOT NULL,
        journal_id VARCHAR(36) NULL,
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_palloc_payment (payment_id),
        INDEX idx_palloc_doc (document_id),
        FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES purchase_documents(id) ON DELETE CASCADE
    )`,
];

// The movement ledger grows the columns this stage needs. Rows written by the
// older code keep working: the new columns are nullable and default to the
// main store.
const MOVEMENT_COLUMNS = [
    { name: 'business_id', definition: 'VARCHAR(36) NULL' },
    { name: 'location_id', definition: 'VARCHAR(36) NULL COMMENT "where it came from, or went to for an inward move"' },
    { name: 'to_location_id', definition: 'VARCHAR(36) NULL COMMENT "set on a transfer; the other half of the move"' },
    { name: 'unit_cost_paise', definition: 'BIGINT NULL COMMENT "what one unit cost at this moment"' },
    { name: 'value_paise', definition: 'BIGINT NULL COMMENT "signed value into or out of stock"' },
    { name: 'balance_qty', definition: 'DECIMAL(14,3) NULL COMMENT "stock on hand after this movement"' },
    { name: 'source_type', definition: 'VARCHAR(30) NULL COMMENT "goods_receipt | supplier_bill | purchase_return | transfer | count | job | opening"' },
    { name: 'source_id', definition: 'VARCHAR(36) NULL' },
    { name: 'serial_id', definition: 'VARCHAR(36) NULL' },
    { name: 'journal_id', definition: 'VARCHAR(36) NULL' },
];

const ITEM_COLUMNS = [
    { name: 'avg_cost_paise', definition: 'BIGINT DEFAULT 0 COMMENT "moving average cost per base unit"' },
    { name: 'stock_value_paise', definition: 'BIGINT DEFAULT 0 COMMENT "quantity × average cost, kept in step with the ledger"' },
    { name: 'allow_negative', definition: 'TINYINT(1) DEFAULT 0 COMMENT "an audited exception, off by default"' },
];

// Two accounts the purchase flow needs beyond the Stage 1 chart.
const EXTRA_ACCOUNTS = [
    ['2300', 'Goods Received Not Billed', 'liability', 'payable',
        'goods on the shelf that the supplier has not invoiced yet — this is what stops a delivery being counted twice'],
    ['5010', 'Inventory Write-off / Shrinkage', 'expense', 'expense',
        'what a stock count could not account for'],
];

async function ensureStockSchema(connection) {
    for (const statement of STOCK_TABLES) {
        await connection.query(statement);
    }

    const addColumns = async (table, columns) => {
        for (const column of columns) {
            const [rows] = await connection.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                [table, column.name]
            );
            if (rows.length) continue;
            console.log(`[stock] adding ${table}.${column.name}`);
            await connection.query(`ALTER TABLE ?? ADD COLUMN ?? ${column.definition}`, [table, column.name]);
        }
    };
    await addColumns('inventory_movements', MOVEMENT_COLUMNS);
    await addColumns('inventory_items', ITEM_COLUMNS);

    await seedStockDefaults(connection);
}

async function seedStockDefaults(connection) {
    const { randomUUID } = require('crypto');
    const [[business]] = await connection.query('SELECT id FROM businesses WHERE is_default = 1 LIMIT 1');
    if (!business) return;

    const [[store]] = await connection.query(
        'SELECT id FROM stock_locations WHERE business_id = ? AND is_default = 1 LIMIT 1', [business.id]
    );
    if (!store) {
        await connection.query('INSERT INTO stock_locations SET ?', [{
            id: randomUUID(), business_id: business.id, name: 'Main Store', kind: 'store',
            owned: 1, is_default: 1, active: 1,
        }]);
        await connection.query('INSERT INTO stock_locations SET ?', [{
            id: randomUUID(), business_id: business.id, name: 'Damaged / Quarantine', kind: 'damaged',
            owned: 1, is_default: 0, active: 1,
        }]);
        // Customer devices in for repair live here: tracked, never ours.
        await connection.query('INSERT INTO stock_locations SET ?', [{
            id: randomUUID(), business_id: business.id, name: 'Customer Devices (in for repair)', kind: 'customer',
            owned: 0, is_default: 0, active: 1,
        }]);
        console.log('[stock] seeded the default locations');
    }

    for (const [code, name, type, subtype] of EXTRA_ACCOUNTS) {
        const [[exists]] = await connection.query(
            'SELECT id FROM accounts WHERE business_id = ? AND code = ? LIMIT 1', [business.id, code]
        );
        if (exists) continue;
        await connection.query('INSERT INTO accounts SET ?', [{
            id: randomUUID(), business_id: business.id, code, name, type, subtype, is_system: 1, active: 1,
        }]);
        console.log(`[stock] added account ${code} ${name}`);
    }

    // Items bought before this stage have a purchase rate but no average cost;
    // seeding it from that rate is the only sensible opening position.
    await connection.query(
        `UPDATE inventory_items
            SET avg_cost_paise = ROUND(COALESCE(purchase_rate, 0) * 100),
                stock_value_paise = ROUND(COALESCE(purchase_rate, 0) * 100 * COALESCE(quantity, 0))
          WHERE avg_cost_paise = 0 AND COALESCE(purchase_rate, 0) > 0`
    );
}

module.exports = { STOCK_TABLES, MOVEMENT_COLUMNS, ITEM_COLUMNS, ensureStockSchema };
