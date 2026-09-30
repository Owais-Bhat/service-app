'use strict';

// Stage 2 schema: sales documents, their lines, and the money against them.
//
// The shape follows one decision: a document is a record of what was agreed at
// a moment, not a view of today's masters. An issued invoice carries a snapshot
// of the customer and of every item on it, so renaming a customer or repricing
// a product next month leaves last month's invoice exactly as the customer
// received it.
//
// Money is BIGINT paise throughout. Quantities are DECIMAL(14,3) because cable
// is sold by the metre and a roll is not always a whole one.

const SALES_TABLES = [
    `CREATE TABLE IF NOT EXISTS sales_documents (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        doc_type VARCHAR(20) NOT NULL
            COMMENT 'estimate | proforma | invoice | credit_note — a quotation and a proforma never post to the ledger',
        doc_no VARCHAR(40) NULL COMMENT 'allocated when the document is issued, never while it is a draft',
        doc_date DATE NOT NULL,
        due_date DATE NULL,
        valid_until DATE NULL COMMENT 'estimates only',
        status VARCHAR(16) NOT NULL DEFAULT 'draft'
            COMMENT 'draft | issued | cancelled | accepted | rejected | expired | converted',

        party_id VARCHAR(36) NULL,
        party_snapshot JSON NULL COMMENT 'name, GSTIN, address and treatment as they stood when issued',
        place_of_supply_state_code VARCHAR(2),
        supply_type VARCHAR(6) COMMENT 'intra | inter',
        prices_include_tax TINYINT(1) DEFAULT 0,

        source_type VARCHAR(20) NULL COMMENT 'inquiry | installation — the job this came from',
        source_id VARCHAR(36) NULL,
        converted_from_id VARCHAR(36) NULL COMMENT 'the estimate this invoice came from',
        converted_to_id VARCHAR(36) NULL,
        converted_at TIMESTAMP NULL,
        revision_of_id VARCHAR(36) NULL COMMENT 'a revised quotation keeps its predecessor',
        revision_no INT DEFAULT 0,

        gross_paise BIGINT DEFAULT 0,
        line_discount_paise BIGINT DEFAULT 0,
        doc_discount_paise BIGINT DEFAULT 0,
        charges_paise BIGINT DEFAULT 0,
        taxable_paise BIGINT DEFAULT 0,
        cgst_paise BIGINT DEFAULT 0,
        sgst_paise BIGINT DEFAULT 0,
        utgst_paise BIGINT DEFAULT 0,
        igst_paise BIGINT DEFAULT 0,
        round_off_paise BIGINT DEFAULT 0,
        total_paise BIGINT DEFAULT 0,
        cost_paise BIGINT DEFAULT 0 COMMENT 'sum of the cost snapshots, so margin survives a repricing',

        notes TEXT,
        terms TEXT,
        reference VARCHAR(120) COMMENT 'the customer PO or whatever they call it',

        journal_id VARCHAR(36) NULL,
        issued_at TIMESTAMP NULL,
        issued_by VARCHAR(36) NULL,
        cancelled_at TIMESTAMP NULL,
        cancelled_by VARCHAR(36) NULL,
        cancel_reason VARCHAR(500),
        accepted_at TIMESTAMP NULL,
        acceptance_method VARCHAR(40) COMMENT 'how the customer agreed — call, WhatsApp, signature',
        acceptance_note VARCHAR(500),

        idempotency_key VARCHAR(120) NULL,
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        UNIQUE KEY uniq_doc_idem (idempotency_key),
        UNIQUE KEY uniq_doc_no (business_id, doc_type, doc_no),
        INDEX idx_doc_party (party_id, doc_type, status),
        INDEX idx_doc_date (business_id, doc_type, doc_date),
        INDEX idx_doc_source (source_type, source_id)
    )`,

    `CREATE TABLE IF NOT EXISTS sales_document_lines (
        id VARCHAR(36) PRIMARY KEY,
        document_id VARCHAR(36) NOT NULL,
        line_no INT NOT NULL DEFAULT 1,
        kind VARCHAR(10) NOT NULL DEFAULT 'item' COMMENT 'item | charge',
        item_id VARCHAR(36) NULL,
        item_snapshot JSON NULL COMMENT 'name, HSN and unit as they stood when issued',
        description VARCHAR(500) NOT NULL,
        hsn_sac VARCHAR(10),
        quantity DECIMAL(14,3) NOT NULL DEFAULT 1,
        unit VARCHAR(20),
        rate_paise BIGINT NOT NULL DEFAULT 0,
        cost_rate_paise BIGINT NULL COMMENT 'what it cost us at that moment — margin must survive repricing',
        discount_bps INT DEFAULT 0,
        line_discount_paise BIGINT DEFAULT 0,
        doc_discount_share_paise BIGINT DEFAULT 0,
        tax_treatment VARCHAR(20) DEFAULT 'gst',
        tax_rate_bps INT DEFAULT 0,
        taxable_paise BIGINT DEFAULT 0,
        cgst_paise BIGINT DEFAULT 0,
        sgst_paise BIGINT DEFAULT 0,
        utgst_paise BIGINT DEFAULT 0,
        igst_paise BIGINT DEFAULT 0,
        amount_paise BIGINT DEFAULT 0,
        INDEX idx_line_doc (document_id),
        FOREIGN KEY (document_id) REFERENCES sales_documents(id) ON DELETE CASCADE
    )`,

    // Money in and money out. A payment exists on its own — it is not a field
    // on an invoice — because one payment can settle several invoices and one
    // invoice can take several payments.
    `CREATE TABLE IF NOT EXISTS payments (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        payment_no VARCHAR(40),
        payment_date DATE NOT NULL,
        direction VARCHAR(3) NOT NULL DEFAULT 'in' COMMENT 'in = received from a customer, out = paid to a supplier',
        party_id VARCHAR(36) NULL,
        method VARCHAR(20) NOT NULL DEFAULT 'cash' COMMENT 'cash | upi | bank | card | cheque | other',
        account_id VARCHAR(36) NULL COMMENT 'the cash or bank account it landed in',
        amount_paise BIGINT NOT NULL,
        reference VARCHAR(120) COMMENT 'UPI reference, cheque number, bank narration',
        notes VARCHAR(500),
        attachment_url VARCHAR(500),
        status VARCHAR(12) NOT NULL DEFAULT 'posted' COMMENT 'posted | cancelled',
        journal_id VARCHAR(36) NULL,
        cancelled_at TIMESTAMP NULL,
        cancel_reason VARCHAR(500),
        idempotency_key VARCHAR(120) NULL,
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_payment_idem (idempotency_key),
        INDEX idx_payment_party (party_id, payment_date),
        INDEX idx_payment_date (business_id, payment_date)
    )`,

    // What a payment was put against. Whatever is not allocated is an advance,
    // and it stays visible as one instead of being lost in a customer's total.
    `CREATE TABLE IF NOT EXISTS payment_allocations (
        id VARCHAR(36) PRIMARY KEY,
        payment_id VARCHAR(36) NOT NULL,
        document_id VARCHAR(36) NOT NULL,
        amount_paise BIGINT NOT NULL,
        journal_id VARCHAR(36) NULL,
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_alloc_payment (payment_id),
        INDEX idx_alloc_doc (document_id),
        FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES sales_documents(id) ON DELETE CASCADE
    )`,

    // A link a customer can open without logging in — the PDF of one issued
    // document, for a limited time. Only a hash of the token is kept, so a copy
    // of the database cannot be used to open anyone's invoice.
    `CREATE TABLE IF NOT EXISTS document_share_links (
        id VARCHAR(36) PRIMARY KEY,
        document_id VARCHAR(36) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_opened_at TIMESTAMP NULL,
        opens INT NOT NULL DEFAULT 0,
        UNIQUE KEY uniq_share_token (token_hash),
        INDEX idx_share_doc (document_id),
        FOREIGN KEY (document_id) REFERENCES sales_documents(id) ON DELETE CASCADE
    )`,
];

async function ensureSalesSchema(connection) {
    for (const statement of SALES_TABLES) {
        await connection.query(statement);
    }
}

module.exports = { SALES_TABLES, ensureSalesSchema };
