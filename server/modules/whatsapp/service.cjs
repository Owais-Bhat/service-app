'use strict';

// WhatsApp messages sent through Fast2SMS's WhatsApp Business API.
//
// WhatsApp only lets a business start a conversation with an approved
// *template*, so nothing here composes free text: each purpose (an invoice, a
// payment reminder, an AMC renewal) has a fixed list of variables, and the owner
// registers the matching template in the Fast2SMS dashboard and pastes its
// message id into Business Settings → WhatsApp. This module fills the variables,
// sends, and keeps a log of what went out and what the provider said.
//
// A failed send is reported, never thrown into a route as a crash, and never
// pretended to have worked. Nothing is sent unless WhatsApp is switched on, a
// number id and the template for that purpose are set, and the API key exists.

const { randomUUID } = require('crypto');
const money = require('../money.cjs');
const sales = require('../sales/service.cjs');
const amc = require('../amc/service.cjs');
const reports = require('../reports/service.cjs');
const { normalizeIndianMobile } = require('../../fast2sms.cjs');

const FAST2SMS_WHATSAPP_URL = 'https://www.fast2sms.com/dev/whatsapp';

class WhatsappError extends Error {
    constructor(message, code = 'whatsapp_error', status = 422) {
        super(message);
        this.name = 'WhatsappError';
        this.code = code;
        this.status = status;
    }
}

/**
 * What can be sent. `vars` is the order the template's {{1}}, {{2}}… must follow —
 * the owner writes the template to match it. `suggested` is wording to paste
 * into the Fast2SMS template form.
 */
const PURPOSES = {
    document: {
        label: 'Invoice / quotation (with PDF)',
        media: true,
        cap: 'invoice.create',
        vars: ['Customer name', 'Document number', 'Total amount', 'Business name'],
        suggested: 'Hello {{1}}, your document {{2}} for {{3}} from {{4}} is attached. Thank you for your business.',
        header: 'Header type: Document (PDF)',
        sample: ['Sample Customer', 'INV-0001', '₹1,000.00', 'Networking Experts'],
    },
    payment_reminder: {
        label: 'Payment reminder',
        media: false,
        cap: 'payment.record',
        vars: ['Customer name', 'Amount due', 'Days overdue', 'Business name'],
        suggested: 'Hello {{1}}, a payment of {{2}} to {{4}} has been pending for {{3}} days. Please pay by UPI or bank transfer at your earliest. Thank you.',
        sample: ['Sample Customer', '₹5,000', '45', 'Networking Experts'],
    },
    amc_renewal: {
        label: 'AMC renewal reminder',
        media: false,
        cap: 'amc.manage',
        vars: ['Customer name', 'Contract number', 'End date', 'Renewal amount', 'Business name'],
        suggested: 'Hello {{1}}, your annual maintenance contract {{2}} ends on {{3}}. Renew it for {{4}} to keep your cameras covered. Reply to this message or call {{5}} and we will take care of it.',
        sample: ['Sample Customer', 'AMC-0001', '31 Dec 2026', '₹12,000', 'Networking Experts'],
    },
};

const TABLES = [
    `CREATE TABLE IF NOT EXISTS whatsapp_settings (
        business_id VARCHAR(36) PRIMARY KEY,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        phone_number_id VARCHAR(40),
        updated_by VARCHAR(36),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS whatsapp_templates (
        business_id VARCHAR(36) NOT NULL,
        purpose VARCHAR(30) NOT NULL,
        message_id VARCHAR(40) COMMENT 'the template id shown in the Fast2SMS dashboard',
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (business_id, purpose)
    )`,
    `CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        purpose VARCHAR(30) NOT NULL,
        ref_type VARCHAR(30),
        ref_id VARCHAR(36),
        party_id VARCHAR(36),
        phone VARCHAR(15) NOT NULL,
        message_id VARCHAR(40),
        variables JSON,
        has_media TINYINT(1) DEFAULT 0,
        status VARCHAR(10) NOT NULL DEFAULT 'queued' COMMENT 'queued | sent | failed — "sent" means the provider accepted it',
        request_id VARCHAR(80),
        error VARCHAR(500),
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_wa_ref (business_id, purpose, ref_id, created_at),
        INDEX idx_wa_recent (business_id, created_at)
    )`,
];

async function ensureWhatsappSchema(conn) {
    for (const ddl of TABLES) await conn.query(ddl);
}

// ── the provider ────────────────────────────────────────────────────────
/**
 * WhatsApp template variables cannot hold line breaks or tabs, and Fast2SMS
 * joins them with "|", so a pipe inside one would shift every value after it.
 */
function cleanVariable(value) {
    const text = String(value ?? '').replace(/[\r\n\t|]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 200);
    return text || '-';
}

function requestUrl({ phoneNumberId, messageId, number, variables = [], mediaUrl = null, filename = null, udf1 = null }) {
    const url = new URL(FAST2SMS_WHATSAPP_URL);
    url.searchParams.set('message_id', String(messageId));
    url.searchParams.set('phone_number_id', String(phoneNumberId));
    url.searchParams.set('numbers', number);
    if (variables.length) url.searchParams.set('variables_values', variables.map(cleanVariable).join('|'));
    if (mediaUrl) url.searchParams.set('media_url', mediaUrl);
    if (mediaUrl && filename) url.searchParams.set('document_filename', filename);
    if (udf1) url.searchParams.set('udf1', String(udf1).slice(0, 60));
    return url;
}

/** One call to the provider. Never throws: a failure comes back as { ok: false, error }. */
async function callFast2Sms({ apiKey, fetchImpl = fetch, ...params }) {
    if (!apiKey) return { ok: false, error: 'The Fast2SMS API key (SMS_API) is not set on the server.' };
    let response;
    try {
        response = await fetchImpl(requestUrl(params).toString(), {
            method: 'GET', headers: { accept: 'application/json', authorization: apiKey },
        });
    } catch (err) {
        return { ok: false, error: `Could not reach Fast2SMS: ${err.message}` };
    }
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    const failed = !response.ok || payload?.status === false || payload?.return === false;
    if (failed) {
        const detail = Array.isArray(payload?.message) ? payload.message.join(', ') : (payload?.message || payload?.error || `HTTP ${response.status}`);
        return { ok: false, error: String(detail).slice(0, 400), provider: payload };
    }
    return { ok: true, request_id: payload?.request_id ? String(payload.request_id) : null, provider: payload };
}

// ── settings ────────────────────────────────────────────────────────────
async function getSettings(conn, businessId) {
    const [[s]] = await conn.query('SELECT * FROM whatsapp_settings WHERE business_id = ? LIMIT 1', [businessId]);
    const [rows] = await conn.query('SELECT * FROM whatsapp_templates WHERE business_id = ?', [businessId]);
    const byPurpose = new Map(rows.map((r) => [r.purpose, r]));
    return {
        enabled: !!s?.enabled,
        phone_number_id: s?.phone_number_id || '',
        api_key_set: !!(process.env.WHATSAPP_API_KEY || process.env.SMS_API),
        templates: Object.entries(PURPOSES).map(([purpose, p]) => ({
            purpose, label: p.label, vars: p.vars, media: p.media, suggested: p.suggested, header: p.header || null,
            message_id: byPurpose.get(purpose)?.message_id || '',
            enabled: byPurpose.has(purpose) ? !!byPurpose.get(purpose).enabled : true,
        })),
    };
}

async function saveSettings(conn, { businessId, user, payload }) {
    const phoneNumberId = String(payload.phone_number_id ?? '').trim();
    if (phoneNumberId && !/^\d{5,25}$/.test(phoneNumberId)) {
        throw new WhatsappError('The phone number id is the long number from the Fast2SMS WhatsApp page — digits only', 'bad_phone_number_id', 400);
    }
    await conn.query(
        `INSERT INTO whatsapp_settings (business_id, enabled, phone_number_id, updated_by) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), phone_number_id = VALUES(phone_number_id), updated_by = VALUES(updated_by)`,
        [businessId, payload.enabled ? 1 : 0, phoneNumberId || null, user?.id || null]
    );
    for (const t of payload.templates || []) {
        if (!PURPOSES[t.purpose]) continue;
        const messageId = String(t.message_id ?? '').trim();
        if (messageId && !/^[\w-]{1,40}$/.test(messageId)) throw new WhatsappError(`"${messageId}" does not look like a template id`, 'bad_message_id', 400);
        await conn.query(
            `INSERT INTO whatsapp_templates (business_id, purpose, message_id, enabled) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE message_id = VALUES(message_id), enabled = VALUES(enabled)`,
            [businessId, t.purpose, messageId || null, t.enabled === false ? 0 : 1]
        );
    }
    return getSettings(conn, businessId);
}

// ── sending ─────────────────────────────────────────────────────────────
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

/** Refuses, with the step that is missing, unless a message of this purpose could go out. */
async function assertReady(conn, businessId, purpose) {
    const def = PURPOSES[purpose];
    if (!def) throw new WhatsappError('Unknown kind of message', 'bad_purpose', 400);
    const settings = await getSettings(conn, businessId);
    if (!settings.enabled) throw new WhatsappError('WhatsApp sending is switched off — turn it on in Business Settings → WhatsApp', 'disabled', 409);
    if (!settings.phone_number_id) throw new WhatsappError('Set the WhatsApp phone number id in Business Settings → WhatsApp first', 'no_phone_number_id', 409);
    const template = settings.templates.find((t) => t.purpose === purpose);
    if (!template?.message_id || !template.enabled) {
        throw new WhatsappError(`No template is set for "${def.label}" — add its id in Business Settings → WhatsApp`, 'no_template', 409);
    }
    return { def, settings, template };
}

/**
 * Fills a purpose's template and sends it. Every attempt is logged, including
 * the ones the provider refused, with what it said.
 */
async function sendTemplate(conn, {
    businessId, user, purpose, refType = null, refId = null, partyId = null, phone, variables,
    mediaUrl = null, filename = null, force = false, apiKey = process.env.WHATSAPP_API_KEY || process.env.SMS_API, fetchImpl,
}) {
    const { def, settings, template } = await assertReady(conn, businessId, purpose);
    if (variables.length !== def.vars.length) throw new WhatsappError('The message is missing some of its details', 'bad_variables', 500);
    if (def.media && !mediaUrl) throw new WhatsappError('This message needs its PDF link', 'no_media', 500);

    const number = normalizeIndianMobile(phone);
    if (!number) throw new WhatsappError('This customer has no valid 10-digit mobile number', 'bad_phone', 400);

    if (refId && !force) {
        const [[recent]] = await conn.query(
            `SELECT id FROM whatsapp_messages WHERE business_id = ? AND purpose = ? AND ref_id = ? AND phone = ? AND status = 'sent'
                AND created_at > ? LIMIT 1`,
            [businessId, purpose, refId, number, new Date(Date.now() - DUPLICATE_WINDOW_MS)]
        );
        if (recent) throw new WhatsappError('That was sent to this number a moment ago', 'duplicate', 409);
    }

    const id = randomUUID();
    await conn.query('INSERT INTO whatsapp_messages SET ?', [{
        id, business_id: businessId, purpose, ref_type: refType, ref_id: refId, party_id: partyId, phone: number,
        message_id: template.message_id, variables: JSON.stringify(variables.map(cleanVariable)), has_media: mediaUrl ? 1 : 0,
        status: 'queued', created_by: user?.id || null,
    }]);

    const result = await callFast2Sms({
        apiKey, fetchImpl, phoneNumberId: settings.phone_number_id, messageId: template.message_id, number,
        variables, mediaUrl, filename, udf1: id.slice(0, 8),
    });

    await conn.query('UPDATE whatsapp_messages SET status = ?, request_id = ?, error = ? WHERE id = ?',
        [result.ok ? 'sent' : 'failed', result.request_id || null, result.ok ? null : result.error, id]);
    return { id, ok: result.ok, error: result.error || null, request_id: result.request_id || null, phone: number };
}

// ── what each purpose says ──────────────────────────────────────────────
const inr = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const dayLabel = (v) => {
    const [y, m, d] = String(v).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
async function businessName(conn, businessId) {
    const [[b]] = await conn.query('SELECT legal_name, trade_name FROM businesses WHERE id = ? LIMIT 1', [businessId]);
    return b?.trade_name || b?.legal_name || 'Networking Experts';
}
async function businessPhone(conn, businessId) {
    const [[b]] = await conn.query('SELECT phone FROM businesses WHERE id = ? LIMIT 1', [businessId]);
    return b?.phone || '';
}

async function sendDocument(conn, { businessId, user, documentId, baseUrl, phone = null, force = false, fetchImpl, apiKey }) {
    const loaded = await sales.loadDocument(conn, documentId);
    if (!loaded) throw new WhatsappError('No such document', 'not_found', 404);
    const doc = loaded.document;
    if (doc.doc_type === 'credit_note') throw new WhatsappError('A credit note is not sent from here', 'bad_doc', 409);

    const to = phone || doc.party_snapshot?.phone || doc.party_phone;
    if (!normalizeIndianMobile(to)) throw new WhatsappError('This customer has no valid 10-digit mobile number', 'bad_phone', 400);

    // Check the setup before minting a link nobody will use.
    await assertReady(conn, businessId, 'document');

    const { token } = await sales.createShareLink(conn, { documentId, user });
    const link = `${baseUrl.replace(/\/$/, '')}/api/public/documents/${token}/pdf`;
    return sendTemplate(conn, {
        businessId, user, purpose: 'document', refType: 'sales_document', refId: documentId, partyId: doc.party_id, phone: to,
        variables: [doc.party_snapshot?.display_name || doc.party_name || 'Customer', doc.doc_no || 'Draft', inr(doc.total_paise), await businessName(conn, businessId)],
        mediaUrl: link, filename: `${(doc.doc_no || doc.doc_type).replace(/[^\w.-]/g, '_')}.pdf`, force, fetchImpl, apiKey,
    });
}

async function sendPaymentReminder(conn, { businessId, user, partyId, force = false, fetchImpl, apiKey }) {
    const r = await reports.reminders(conn, businessId, { asOn: reports.today() });
    const c = r.customers.find((x) => x.party_id === partyId);
    if (!c) throw new WhatsappError('This customer has nothing overdue right now', 'nothing_due', 409);
    const out = await sendTemplate(conn, {
        businessId, user, purpose: 'payment_reminder', refType: 'party', refId: partyId, partyId, phone: c.phone,
        variables: [c.party, inr(c.outstanding_paise), String(c.oldest_days), await businessName(conn, businessId)], force, fetchImpl, apiKey,
    });
    if (out.ok) {
        await conn.query('INSERT INTO payment_reminders SET ?', [{
            id: randomUUID(), business_id: businessId, party_id: partyId, amount_paise: Math.max(0, Math.round(Number(c.outstanding_paise) || 0)),
            channel: 'whatsapp', created_by: user?.id || null,
        }]);
    }
    return out;
}

async function sendAmcRenewal(conn, { businessId, user, contractId, force = false, fetchImpl, apiKey }) {
    const loaded = await amc.loadContract(conn, contractId);
    if (!loaded) throw new WhatsappError('No such contract', 'not_found', 404);
    const c = loaded.contract;
    if (c.state === 'cancelled') throw new WhatsappError('This contract is cancelled', 'cancelled', 409);
    if (c.renewed_to_id) throw new WhatsappError('This contract has already been renewed', 'already_renewed', 409);

    const out = await sendTemplate(conn, {
        businessId, user, purpose: 'amc_renewal', refType: 'amc_contract', refId: contractId, partyId: c.party_id, phone: c.party_phone,
        variables: [c.party_name || 'Customer', c.contract_no, dayLabel(c.end_date), inr(c.amount_paise) + (Number(c.tax_rate_bps) ? ' + GST' : ''),
            (await businessPhone(conn, businessId)) || (await businessName(conn, businessId))],
        force, fetchImpl, apiKey,
    });
    if (out.ok) await amc.markReminded(conn, { id: contractId });
    return out;
}

async function recentMessages(conn, businessId, { limit = 30, refId = null } = {}) {
    const [rows] = await conn.query(
        `SELECT m.id, m.purpose, m.ref_type, m.ref_id, m.phone, m.status, m.error, m.request_id, m.has_media, m.created_at, p.display_name AS party_name
           FROM whatsapp_messages m LEFT JOIN parties p ON p.id = m.party_id
          WHERE m.business_id = ? ${refId ? 'AND m.ref_id = ?' : ''} ORDER BY m.created_at DESC LIMIT ?`,
        refId ? [businessId, refId, Math.min(200, limit)] : [businessId, Math.min(200, limit)]
    );
    return rows;
}

module.exports = {
    WhatsappError, PURPOSES, ensureWhatsappSchema, cleanVariable, requestUrl, callFast2Sms, getSettings, saveSettings,
    assertReady, sendTemplate, sendDocument, sendPaymentReminder, sendAmcRenewal, recentMessages, inr,
};
