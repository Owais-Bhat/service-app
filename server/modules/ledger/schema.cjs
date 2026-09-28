'use strict';

// Stage 1 schema: the masters and the ledger everything else will stand on.
//
// Deliberate conventions, applied to every table in this file:
//   * money is BIGINT paise, never DECIMAL and never a float
//   * tax rates are integer basis points (18% = 1800)
//   * every row that can be created by a person carries created_by/created_at
//   * nothing here touches an existing table's data — the only changes to
//     tables that already exist are new, nullable columns
//
// Everything is CREATE TABLE IF NOT EXISTS / ADD COLUMN IF MISSING, run on
// boot the same way the rest of the app's schema is, so a deploy never needs a
// manual migration step.

const ACCOUNTING_TABLES = [
    // ── the issuing business ────────────────────────────────────────────
    // NEST is the portal brand; the legal issuer on a document is this row.
    `CREATE TABLE IF NOT EXISTS businesses (
        id VARCHAR(36) PRIMARY KEY,
        legal_name VARCHAR(200) NOT NULL,
        trade_name VARCHAR(200),
        address_line1 VARCHAR(255),
        address_line2 VARCHAR(255),
        city VARCHAR(120),
        state_code VARCHAR(2),
        state_name VARCHAR(120),
        pincode VARCHAR(10),
        country VARCHAR(80) DEFAULT 'India',
        phone VARCHAR(20),
        email VARCHAR(160),
        website VARCHAR(160),
        gstin VARCHAR(15),
        pan VARCHAR(10),
        registration_type VARCHAR(20) DEFAULT 'unregistered'
            COMMENT 'regular | composition | unregistered — drives which documents are legal',
        fy_start_month TINYINT DEFAULT 4 COMMENT '4 = April, the Indian financial year',
        logo_url VARCHAR(500),
        signature_url VARCHAR(500),
        invoice_footer TEXT,
        payment_instructions TEXT,
        bank_name VARCHAR(160),
        bank_account_no VARCHAR(40),
        bank_ifsc VARCHAR(20),
        bank_branch VARCHAR(160),
        upi_id VARCHAR(120),
        is_default TINYINT(1) DEFAULT 1,
        setup_complete TINYINT(1) DEFAULT 0
            COMMENT 'until the owner confirms the legal details, tax features stay locked',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // ── document numbering ──────────────────────────────────────────────
    // One row per (business, document type, financial year). Numbers are
    // handed out by an atomic UPDATE so two invoices created at the same
    // instant can never take the same number.
    `CREATE TABLE IF NOT EXISTS number_series (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        doc_type VARCHAR(40) NOT NULL,
        fy_label VARCHAR(9) NOT NULL COMMENT 'e.g. 2026-27, or ALL when the series never resets',
        prefix VARCHAR(20) DEFAULT '',
        suffix VARCHAR(20) DEFAULT '',
        padding TINYINT DEFAULT 4,
        next_number INT NOT NULL DEFAULT 1,
        reset_policy VARCHAR(10) DEFAULT 'fy' COMMENT 'fy | never',
        active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_series (business_id, doc_type, fy_label)
    )`,

    // ── parties: one record for a customer, a supplier, or both ─────────
    `CREATE TABLE IF NOT EXISTS parties (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        kind VARCHAR(10) NOT NULL DEFAULT 'customer' COMMENT 'customer | supplier | both',
        display_name VARCHAR(200) NOT NULL,
        legal_name VARCHAR(200),
        phone VARCHAR(20),
        alt_phone VARCHAR(20),
        email VARCHAR(160),
        gst_treatment VARCHAR(20) DEFAULT 'unregistered'
            COMMENT 'registered | composition | unregistered | consumer | overseas | sez',
        gstin VARCHAR(15),
        pan VARCHAR(10),
        place_of_supply_state_code VARCHAR(2),
        credit_days INT DEFAULT 0,
        credit_limit_paise BIGINT DEFAULT 0,
        opening_balance_paise BIGINT DEFAULT 0,
        opening_balance_type VARCHAR(12) DEFAULT 'receivable' COMMENT 'receivable | payable',
        opening_balance_on DATE,
        notes TEXT,
        active TINYINT(1) DEFAULT 1,
        merged_into_id VARCHAR(36) NULL COMMENT 'set when this record was merged away; kept for old references',
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_party_phone (phone),
        INDEX idx_party_name (display_name),
        INDEX idx_party_gstin (gstin),
        INDEX idx_party_kind (business_id, kind, active)
    )`,

    `CREATE TABLE IF NOT EXISTS party_addresses (
        id VARCHAR(36) PRIMARY KEY,
        party_id VARCHAR(36) NOT NULL,
        kind VARCHAR(10) NOT NULL DEFAULT 'billing' COMMENT 'billing | shipping',
        label VARCHAR(80),
        line1 VARCHAR(255),
        line2 VARCHAR(255),
        city VARCHAR(120),
        state_code VARCHAR(2),
        state_name VARCHAR(120),
        pincode VARCHAR(10),
        is_default TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_addr_party (party_id, kind),
        FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
    )`,

    // ── tax, effective-dated ────────────────────────────────────────────
    // A rate change creates a new row; it never edits the old one, so a
    // document raised last year still prices the way it was raised.
    `CREATE TABLE IF NOT EXISTS tax_rates (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        name VARCHAR(80) NOT NULL,
        treatment VARCHAR(20) NOT NULL DEFAULT 'gst'
            COMMENT 'gst | exempt | nil_rated | zero_rated | non_gst — these are different things, not one switch',
        rate_bps INT NOT NULL DEFAULT 0 COMMENT 'basis points: 18% = 1800',
        cess_bps INT NOT NULL DEFAULT 0,
        effective_from DATE NOT NULL,
        effective_to DATE NULL,
        is_default TINYINT(1) DEFAULT 0,
        active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tax_lookup (business_id, treatment, effective_from)
    )`,

    `CREATE TABLE IF NOT EXISTS hsn_codes (
        code VARCHAR(10) PRIMARY KEY,
        kind VARCHAR(8) NOT NULL DEFAULT 'hsn' COMMENT 'hsn for goods, sac for services',
        description VARCHAR(255),
        default_rate_bps INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // ── chart of accounts ───────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        code VARCHAR(20) NOT NULL,
        name VARCHAR(160) NOT NULL,
        type VARCHAR(12) NOT NULL COMMENT 'asset | liability | equity | income | expense',
        subtype VARCHAR(30) NOT NULL DEFAULT 'other'
            COMMENT 'cash | bank | receivable | payable | inventory | cogs | tax_output | tax_input | sales | purchase | expense | equity | other',
        parent_id VARCHAR(36) NULL,
        is_system TINYINT(1) DEFAULT 0 COMMENT 'seeded accounts the posting engine relies on; cannot be deleted',
        opening_balance_paise BIGINT DEFAULT 0,
        opening_balance_on DATE,
        active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_account_code (business_id, code),
        INDEX idx_account_subtype (business_id, subtype, active)
    )`,

    // ── the ledger itself ───────────────────────────────────────────────
    // Journals are the financial source of truth. Nothing edits a posted
    // journal: a mistake is corrected by a reversal that points back at it.
    `CREATE TABLE IF NOT EXISTS journals (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        journal_no VARCHAR(40),
        journal_date DATE NOT NULL,
        narration VARCHAR(500),
        source_type VARCHAR(30) NOT NULL DEFAULT 'manual'
            COMMENT 'invoice | credit_note | payment | purchase | stock | opening | manual',
        source_id VARCHAR(36),
        status VARCHAR(12) NOT NULL DEFAULT 'posted' COMMENT 'posted | reversed',
        reversal_of_id VARCHAR(36) NULL,
        reversed_by_id VARCHAR(36) NULL,
        reversal_reason VARCHAR(500),
        idempotency_key VARCHAR(120) NULL
            COMMENT 'a retried request re-finds its own journal instead of posting twice',
        total_paise BIGINT NOT NULL DEFAULT 0 COMMENT 'the balanced side total, for quick checks',
        posted_by VARCHAR(36),
        posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_journal_idem (idempotency_key),
        INDEX idx_journal_date (business_id, journal_date),
        INDEX idx_journal_source (source_type, source_id)
    )`,

    `CREATE TABLE IF NOT EXISTS journal_lines (
        id VARCHAR(36) PRIMARY KEY,
        journal_id VARCHAR(36) NOT NULL,
        line_no INT NOT NULL DEFAULT 1,
        account_id VARCHAR(36) NOT NULL,
        debit_paise BIGINT NOT NULL DEFAULT 0,
        credit_paise BIGINT NOT NULL DEFAULT 0,
        party_id VARCHAR(36) NULL COMMENT 'set on receivable/payable lines so a party ledger can be built',
        memo VARCHAR(300),
        INDEX idx_line_journal (journal_id),
        INDEX idx_line_account (account_id),
        INDEX idx_line_party (party_id),
        FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE CASCADE
    )`,

    // ── period locks ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS period_locks (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        locked_upto DATE NOT NULL COMMENT 'nothing may post on or before this date',
        reason VARCHAR(300),
        locked_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_lock_business (business_id, locked_upto)
    )`,

    // ── who changed what ────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS audit_log (
        id VARCHAR(36) PRIMARY KEY,
        actor_id VARCHAR(36),
        actor_role VARCHAR(20),
        action VARCHAR(60) NOT NULL,
        entity_type VARCHAR(40) NOT NULL,
        entity_id VARCHAR(64),
        reason VARCHAR(500),
        before_json JSON NULL,
        after_json JSON NULL,
        ip VARCHAR(60),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_entity (entity_type, entity_id),
        INDEX idx_audit_actor (actor_id, created_at)
    )`,

    // ── per-user capability grants on top of the role defaults ──────────
    `CREATE TABLE IF NOT EXISTS user_permissions (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        capability VARCHAR(60) NOT NULL,
        allowed TINYINT(1) NOT NULL DEFAULT 1,
        granted_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_cap (user_id, capability)
    )`,
];

// New, nullable columns on tables that already carry live data. Nothing is
// backfilled here — linking old rows to parties is a reviewed migration, not a
// boot-time guess.
const ACCOUNTING_COLUMNS = {
    inquiries: [
        { name: 'party_id', definition: 'VARCHAR(36) NULL COMMENT "set when this job is linked to a party record"' },
    ],
    installations: [
        { name: 'party_id', definition: 'VARCHAR(36) NULL' },
    ],
    inventory_items: [
        { name: 'business_id', definition: 'VARCHAR(36) NULL' },
        { name: 'item_type', definition: "VARCHAR(10) DEFAULT 'goods' COMMENT 'goods | service'" },
        { name: 'description', definition: 'TEXT' },
        { name: 'brand', definition: 'VARCHAR(120)' },
        { name: 'model', definition: 'VARCHAR(120)' },
        { name: 'hsn_sac', definition: 'VARCHAR(10)' },
        { name: 'tax_rate_id', definition: 'VARCHAR(36) NULL' },
        { name: 'purchase_rate_paise', definition: 'BIGINT NULL COMMENT "exact cost; the DECIMAL column stays for the existing screens"' },
        { name: 'selling_rate_paise', definition: 'BIGINT NULL' },
        { name: 'base_unit', definition: "VARCHAR(20) DEFAULT 'pcs'" },
        { name: 'secondary_unit', definition: 'VARCHAR(20) NULL COMMENT "e.g. a roll bought whole and used in metres"' },
        { name: 'conversion_factor', definition: 'DECIMAL(14,4) NULL COMMENT "base units per secondary unit"' },
        { name: 'track_serial', definition: 'TINYINT(1) DEFAULT 0' },
        { name: 'warranty_months', definition: 'INT NULL' },
        { name: 'reorder_level', definition: 'DECIMAL(14,3) NULL' },
    ],
};

// The accounts the posting engine addresses by name. Codes follow the usual
// 1000/2000/3000/4000/5000 blocks so an accountant recognises them on sight.
const SEED_ACCOUNTS = [
    ['1000', 'Cash in Hand', 'asset', 'cash'],
    ['1010', 'Bank Account', 'asset', 'bank'],
    ['1020', 'Cash with Technicians', 'asset', 'cash',
        'money a technician has collected but not yet handed over — custody, not income'],
    ['1100', 'Accounts Receivable', 'asset', 'receivable'],
    ['1200', 'Inventory', 'asset', 'inventory'],
    ['1300', 'Input CGST', 'asset', 'tax_input'],
    ['1310', 'Input SGST', 'asset', 'tax_input'],
    ['1320', 'Input IGST', 'asset', 'tax_input'],
    ['2000', 'Accounts Payable', 'liability', 'payable'],
    ['2100', 'Output CGST', 'liability', 'tax_output'],
    ['2110', 'Output SGST', 'liability', 'tax_output'],
    ['2120', 'Output IGST', 'liability', 'tax_output'],
    ['2200', 'Customer Advances', 'liability', 'other'],
    ['3000', 'Owner Equity', 'equity', 'equity'],
    ['3100', 'Opening Balance Equity', 'equity', 'equity',
        'the other side of every opening balance, so the books start balanced'],
    ['4000', 'Sales — Goods', 'income', 'sales'],
    ['4010', 'Sales — Services', 'income', 'sales'],
    ['4020', 'Sales — Installation & Labour', 'income', 'sales'],
    ['4900', 'Discounts Allowed', 'income', 'sales'],
    ['4910', 'Round Off', 'income', 'other'],
    ['5000', 'Cost of Goods Sold', 'expense', 'cogs'],
    ['5100', 'Purchases', 'expense', 'purchase'],
    ['5200', 'Freight & Transport', 'expense', 'expense'],
    ['5300', 'Salaries & Wages', 'expense', 'expense'],
    ['5400', 'Subcontractor Charges', 'expense', 'expense'],
    ['5500', 'Rent', 'expense', 'expense'],
    ['5600', 'Utilities', 'expense', 'expense'],
    ['5700', 'Travel', 'expense', 'expense'],
    ['5900', 'Other Expenses', 'expense', 'expense'],
];

// GST slabs as they stand, plus the treatments that are NOT a rate: exempt,
// nil-rated, zero-rated and non-GST are four different things and the engine
// keeps them apart. Rates carry an effective_from so a later change adds a row
// rather than rewriting history.
const SEED_TAX_RATES = [
    ['GST 0%', 'gst', 0, 0],
    ['GST 5%', 'gst', 500, 0],
    ['GST 12%', 'gst', 1200, 0],
    ['GST 18%', 'gst', 1800, 1],
    ['GST 28%', 'gst', 2800, 0],
    ['Exempt', 'exempt', 0, 0],
    ['Nil rated', 'nil_rated', 0, 0],
    ['Zero rated (export / SEZ)', 'zero_rated', 0, 0],
    ['Non-GST supply', 'non_gst', 0, 0],
];

// Document series start life here; each one resets with the financial year
// unless the owner changes it in Settings.
const SEED_SERIES = [
    ['invoice', 'INV-'],
    ['estimate', 'EST-'],
    ['sales_order', 'SO-'],
    ['delivery_challan', 'DC-'],
    ['credit_note', 'CN-'],
    ['debit_note', 'DN-'],
    ['proforma', 'PI-'],
    ['receipt', 'RCT-'],
    ['payment', 'PAY-'],
    ['purchase_order', 'PO-'],
    ['grn', 'GRN-'],
    ['supplier_bill', 'SB-'],
    ['purchase_return', 'PR-'],
    ['journal', 'JV-'],
    ['expense', 'EXP-'],
];

// India's financial year: 1 April to 31 March, written the way every invoice
// series writes it.
function fyLabel(date = new Date(), startMonth = 4) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const startYear = d.getMonth() + 1 >= startMonth ? y : y - 1;
    return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function uuid() {
    return require('crypto').randomUUID();
}

async function ensureAccountingSchema(connection) {
    for (const statement of ACCOUNTING_TABLES) {
        await connection.query(statement);
    }

    for (const [table, columns] of Object.entries(ACCOUNTING_COLUMNS)) {
        for (const column of columns) {
            const [rows] = await connection.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                [table, column.name]
            );
            if (rows.length) continue;
            console.log(`[accounting] adding ${table}.${column.name}`);
            await connection.query(`ALTER TABLE ?? ADD COLUMN ?? ${column.definition}`, [table, column.name]);
        }
    }

    await seedDefaults(connection);
}

// Seeds only what the engine needs to run. The legal details stay empty on
// purpose — an invoice issuer is not something software should invent, so the
// business stays `setup_complete = 0` until the owner fills it in, and the tax
// features check that flag.
async function seedDefaults(connection) {
    const [[existing]] = await connection.query('SELECT id FROM businesses WHERE is_default = 1 LIMIT 1');
    let businessId = existing?.id;

    if (!businessId) {
        businessId = uuid();
        await connection.query('INSERT INTO businesses SET ?', [{
            id: businessId,
            legal_name: 'Networking Experts',
            trade_name: 'Networking Experts',
            country: 'India',
            registration_type: 'unregistered',
            fy_start_month: 4,
            is_default: 1,
            setup_complete: 0,
        }]);
        console.log('[accounting] created the default business record (awaiting legal details)');
    }

    const [[accountCount]] = await connection.query(
        'SELECT COUNT(*) c FROM accounts WHERE business_id = ?', [businessId]
    );
    if (!accountCount.c) {
        for (const [code, name, type, subtype, note] of SEED_ACCOUNTS) {
            await connection.query('INSERT INTO accounts SET ?', [{
                id: uuid(), business_id: businessId, code, name, type, subtype,
                is_system: 1, active: 1,
            }]).catch((err) => {
                if (!/duplicate/i.test(err.message)) throw err;
            });
            if (note) { /* the note documents intent for the reader, not the row */ }
        }
        console.log(`[accounting] seeded ${SEED_ACCOUNTS.length} chart-of-accounts entries`);
    }

    const [[taxCount]] = await connection.query(
        'SELECT COUNT(*) c FROM tax_rates WHERE business_id = ?', [businessId]
    );
    if (!taxCount.c) {
        for (const [name, treatment, rate_bps, is_default] of SEED_TAX_RATES) {
            await connection.query('INSERT INTO tax_rates SET ?', [{
                id: uuid(), business_id: businessId, name, treatment, rate_bps,
                cess_bps: 0, effective_from: '2017-07-01', is_default, active: 1,
            }]);
        }
        console.log('[accounting] seeded GST rates and the non-rate treatments');
    }

    const label = fyLabel(new Date());
    for (const [docType, prefix] of SEED_SERIES) {
        await connection.query(
            `INSERT IGNORE INTO number_series SET ?`,
            [{
                id: uuid(), business_id: businessId, doc_type: docType, fy_label: label,
                prefix: `${prefix}${label.replace('-', '')}-`, padding: 4, next_number: 1,
                reset_policy: 'fy', active: 1,
            }]
        );
    }

    return businessId;
}

async function defaultBusinessId(connection) {
    const [[row]] = await connection.query('SELECT id FROM businesses WHERE is_default = 1 LIMIT 1');
    return row?.id || null;
}

module.exports = {
    ACCOUNTING_TABLES,
    ACCOUNTING_COLUMNS,
    SEED_ACCOUNTS,
    ensureAccountingSchema,
    defaultBusinessId,
    fyLabel,
};
