'use strict';

// Where Vyapar's history lives in the portal.
//
// The past invoices, quotations, payments and purchases brought over from Vyapar are *records to look at*, not
// accounting entries: the books start from opening balances (parties) and opening stock (items), so posting
// these as well would count everything twice. They are therefore kept in tables of their own that no report,
// GST return or ledger reads.

const TABLES = [
    `CREATE TABLE IF NOT EXISTS legacy_documents (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        source VARCHAR(16) NOT NULL DEFAULT 'vyapar',
        source_id VARCHAR(40) NOT NULL COMMENT 'the id the record had in the program it came from',
        doc_type VARCHAR(20) NOT NULL
            COMMENT 'sale | estimate | purchase | payment_in | payment_out | sale_return | purchase_return | expense | delivery_challan | other',
        vyapar_type INT NULL,
        doc_no VARCHAR(90) NULL,
        doc_date DATE NULL,
        due_date DATE NULL,
        party_id VARCHAR(36) NULL COMMENT 'the portal party, when the name was matched or imported',
        party_name VARCHAR(200) NULL COMMENT 'as it was on the record',
        party_phone VARCHAR(20) NULL,
        total_paise BIGINT NOT NULL DEFAULT 0,
        paid_paise BIGINT NOT NULL DEFAULT 0 COMMENT 'received/paid when the record was made',
        balance_paise BIGINT NOT NULL DEFAULT 0 COMMENT 'what that program showed as unpaid on this record; not reliable per invoice',
        discount_paise BIGINT NOT NULL DEFAULT 0,
        tax_paise BIGINT NOT NULL DEFAULT 0,
        round_off_paise BIGINT NOT NULL DEFAULT 0,
        tax_inclusive TINYINT(1) NOT NULL DEFAULT 0,
        place_of_supply VARCHAR(60) NULL,
        payment_state VARCHAR(12) NULL COMMENT 'paid | partly_paid | unpaid',
        payment_mode VARCHAR(80) NULL,
        reference VARCHAR(120) NULL,
        notes TEXT NULL,
        charges JSON NULL,
        links JSON NULL COMMENT 'payments put against this record, or the quotation/invoice it became',
        imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_legacy_source (business_id, source, source_id),
        INDEX idx_legacy_party (party_id, doc_date),
        INDEX idx_legacy_type (business_id, doc_type, doc_date),
        INDEX idx_legacy_date (business_id, doc_date)
    )`,
    `CREATE TABLE IF NOT EXISTS legacy_document_lines (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        document_id VARCHAR(36) NOT NULL,
        line_no INT NOT NULL DEFAULT 1,
        item_id VARCHAR(36) NULL COMMENT 'the portal item, when one was matched',
        item_name VARCHAR(500) NOT NULL,
        hsn_sac VARCHAR(10) NULL,
        quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
        unit VARCHAR(20) NULL,
        rate_paise BIGINT NOT NULL DEFAULT 0 COMMENT 'per unit, before tax',
        discount_paise BIGINT NOT NULL DEFAULT 0,
        tax_rate_bps INT NOT NULL DEFAULT 0,
        tax_paise BIGINT NOT NULL DEFAULT 0,
        amount_paise BIGINT NOT NULL DEFAULT 0 COMMENT 'the line including tax',
        serial_no VARCHAR(200) NULL,
        INDEX idx_legacy_line_doc (document_id),
        INDEX idx_legacy_line_item (item_id)
    )`,
    // Which portal record a record in the other program became — so a second import updates instead of duplicating.
    `CREATE TABLE IF NOT EXISTS vyapar_map (
        business_id VARCHAR(36) NOT NULL,
        entity VARCHAR(12) NOT NULL COMMENT 'party | item',
        source_id VARCHAR(40) NOT NULL,
        local_id VARCHAR(36) NOT NULL,
        PRIMARY KEY (business_id, entity, source_id),
        INDEX idx_vyapar_map_local (local_id)
    )`,
    `CREATE TABLE IF NOT EXISTS vyapar_imports (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        step VARCHAR(12) NOT NULL COMMENT 'parties | items | history',
        file_name VARCHAR(200) NULL,
        as_on DATE NULL,
        result JSON NULL,
        run_by VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_vyapar_imports (business_id, created_at)
    )`,
];

async function ensureVyaparSchema(conn) {
    for (const ddl of TABLES) await conn.query(ddl);
}

module.exports = { ensureVyaparSchema, TABLES };
