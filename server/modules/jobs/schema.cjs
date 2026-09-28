'use strict';

// Stage 4 schema: what a job actually cost.
//
// A job in this system is a service request or an installation — records that
// already exist and that technicians already work from. Nothing here replaces
// them. What it adds is the cost side: the materials that went out, the labour
// and travel behind them, what the customer approved along the way, and the
// invoice that came out at the end.
//
// The rule the shape exists to enforce: a technician *submits* what was used;
// an approver *accepts* it; only then does stock leave the books and a cost
// reach the accounts. Between those two moments the job shows an estimate, not
// a fact.

const JOB_TABLES = [
    // One submission — usually one technician, one visit. Its lines are what he
    // says he fitted.
    `CREATE TABLE IF NOT EXISTS job_material_issues (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        issue_no VARCHAR(40),
        job_type VARCHAR(20) NOT NULL COMMENT 'inquiry | installation',
        job_id VARCHAR(36) NOT NULL,
        location_id VARCHAR(36) NULL COMMENT 'where the goods came from — usually the technician van',
        employee_id VARCHAR(36) NULL,
        status VARCHAR(12) NOT NULL DEFAULT 'submitted'
            COMMENT 'submitted | approved | rejected — stock only moves on approval',
        kind VARCHAR(12) NOT NULL DEFAULT 'used'
            COMMENT 'used = fitted on the job, returned = came back unused',
        customer_approved TINYINT(1) DEFAULT 0
            COMMENT 'the customer agreed to this extra work',
        customer_approval_note VARCHAR(500),
        note VARCHAR(500),
        cost_paise BIGINT DEFAULT 0 COMMENT 'what these goods cost us, at approval',
        journal_id VARCHAR(36) NULL,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_by VARCHAR(36) NULL,
        approved_at TIMESTAMP NULL,
        rejected_reason VARCHAR(500),
        created_by VARCHAR(36),
        INDEX idx_issue_job (job_type, job_id, status),
        INDEX idx_issue_status (business_id, status)
    )`,

    `CREATE TABLE IF NOT EXISTS job_material_lines (
        id VARCHAR(36) PRIMARY KEY,
        issue_id VARCHAR(36) NOT NULL,
        item_id VARCHAR(36) NULL,
        description VARCHAR(300) NOT NULL,
        quantity DECIMAL(14,3) NOT NULL DEFAULT 1,
        unit VARCHAR(20),
        base_quantity DECIMAL(14,3) NOT NULL DEFAULT 1,
        unit_cost_paise BIGINT DEFAULT 0 COMMENT 'moving average at the moment it was approved',
        cost_paise BIGINT DEFAULT 0,
        sell_rate_paise BIGINT DEFAULT 0 COMMENT 'what the customer will be charged, carried to the invoice',
        serial_ids JSON NULL,
        INDEX idx_mline_issue (issue_id),
        FOREIGN KEY (issue_id) REFERENCES job_material_issues(id) ON DELETE CASCADE
    )`,

    // The costs that are not goods: hours, travel, a subcontractor's bill.
    // Estimated ones are what was planned; actual ones are what happened, and
    // only actual ones reach the accounts.
    `CREATE TABLE IF NOT EXISTS job_costs (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        job_type VARCHAR(20) NOT NULL,
        job_id VARCHAR(36) NOT NULL,
        kind VARCHAR(20) NOT NULL COMMENT 'labour | travel | subcontract | other',
        basis VARCHAR(12) NOT NULL DEFAULT 'actual' COMMENT 'estimate | actual',
        description VARCHAR(300),
        quantity DECIMAL(14,3) DEFAULT 1 COMMENT 'hours, kilometres, or one',
        rate_paise BIGINT DEFAULT 0,
        amount_paise BIGINT NOT NULL DEFAULT 0,
        employee_id VARCHAR(36) NULL,
        party_id VARCHAR(36) NULL COMMENT 'the subcontractor, when there is one',
        billable TINYINT(1) DEFAULT 1 COMMENT 'goes on the customer invoice as well as the cost',
        status VARCHAR(12) NOT NULL DEFAULT 'approved' COMMENT 'submitted | approved | rejected',
        journal_id VARCHAR(36) NULL,
        created_by VARCHAR(36),
        approved_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cost_job (job_type, job_id, basis),
        INDEX idx_cost_status (business_id, status)
    )`,

    // What was planned before the work started — the other half of "estimated
    // versus actual". Written when a quotation is accepted, or by hand.
    `CREATE TABLE IF NOT EXISTS job_estimates (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        job_type VARCHAR(20) NOT NULL,
        job_id VARCHAR(36) NOT NULL,
        source_document_id VARCHAR(36) NULL COMMENT 'the quotation this came from',
        item_id VARCHAR(36) NULL,
        description VARCHAR(300) NOT NULL,
        quantity DECIMAL(14,3) NOT NULL DEFAULT 1,
        unit VARCHAR(20),
        cost_paise BIGINT DEFAULT 0,
        sell_paise BIGINT DEFAULT 0,
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_estimate_job (job_type, job_id)
    )`,
];

const BUSINESS_COLUMNS = [
    {
        name: 'require_material_approval',
        definition: `TINYINT(1) DEFAULT 0 COMMENT "when on, a technician's materials wait for approval before stock and cost move"`,
    },
    {
        name: 'default_labour_rate_paise',
        definition: 'BIGINT DEFAULT 0 COMMENT "per hour, used to price labour on a job when nothing else is given"',
    },
    {
        name: 'default_travel_rate_paise',
        definition: 'BIGINT DEFAULT 0 COMMENT "per kilometre"',
    },
];

async function ensureJobSchema(connection) {
    for (const statement of JOB_TABLES) {
        await connection.query(statement);
    }

    for (const column of BUSINESS_COLUMNS) {
        const [rows] = await connection.execute(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'businesses' AND COLUMN_NAME = ?`,
            [column.name]
        );
        if (rows.length) continue;
        console.log(`[jobs] adding businesses.${column.name}`);
        await connection.query(`ALTER TABLE businesses ADD COLUMN ?? ${column.definition}`, [column.name]);
    }
}

module.exports = { JOB_TABLES, BUSINESS_COLUMNS, ensureJobSchema };
