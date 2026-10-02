'use strict';

// The printed document.
//
// One renderer for every sales document, because an estimate, a proforma, an
// invoice and a credit note differ in their title and their wording, not in
// their arithmetic. It prints from the snapshot the document carries, so
// reprinting last year's invoice reprints last year's invoice.
//
// Practical requirements it meets: A4, a table header repeated on every page,
// long descriptions that wrap instead of overlapping, totals that land on the
// last page rather than being orphaned, and the ₹ glyph where the Unicode font
// is available.

const fs = require('fs');
const path = require('path');
const { formatINR } = require('../money.cjs');
const gst = require('../gst.cjs');
const { informationalGst } = require('../tax-engine.cjs');

let PDFDocument = null;
try {
    PDFDocument = require('pdfkit');
} catch {
    console.warn('[sales/pdf] pdfkit not installed — document PDFs disabled');
}

let QRCode = null;
try {
    QRCode = require('qrcode');
} catch {
    console.warn('[sales/pdf] qrcode not installed — the UPI QR is left off the printed document');
}

const FONT_REG = path.join(__dirname, '..', '..', 'fonts', 'NotoSans-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', '..', 'fonts', 'NotoSans-Bold.ttf');
const HAS_UNICODE = fs.existsSync(FONT_REG) && fs.existsSync(FONT_BOLD);

const TITLES = {
    invoice: 'TAX INVOICE',
    credit_note: 'CREDIT NOTE',
    estimate: 'QUOTATION',
    proforma: 'PROFORMA INVOICE',
};

// A proforma and a quotation are offers, not demands for payment, and they say
// so on their face. This is also why neither posts to the ledger.
const FOOTNOTES = {
    estimate: 'This is a quotation, not a tax invoice. No payment is due against this document.',
    proforma: 'This is a proforma invoice issued for reference. It is not a tax invoice and creates no tax liability.',
    credit_note: 'Issued against the invoice referenced above.',
};

const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const BRAND = '#15a05a';

const rupees = (paise) => formatINR(Number(paise) || 0, { symbol: HAS_UNICODE })
    .replace('₹', HAS_UNICODE ? '₹' : 'Rs. ');

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
    'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ''));
const below1000 = (n) => (n < 100 ? below100(n) : `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${below100(n % 100)}` : ''}`);

/** "Rupees Twenty Two Thousand One Hundred Fifty Only", from paise. */
function inWords(paise) {
    const total = Math.round(Math.abs(Number(paise) || 0));
    let r = Math.floor(total / 100);
    const ps = total % 100;
    if (!r && !ps) return 'Zero';
    const parts = [];
    const crore = Math.floor(r / 1e7); r %= 1e7;
    const lakh = Math.floor(r / 1e5); r %= 1e5;
    const thousand = Math.floor(r / 1000); r %= 1000;
    if (crore) parts.push(`${below1000(crore)} Crore`);
    if (lakh) parts.push(`${below100(lakh)} Lakh`);
    if (thousand) parts.push(`${below100(thousand)} Thousand`);
    if (r) parts.push(below1000(r));
    return `Rupees ${parts.join(' ') || 'Zero'}${ps ? ` and ${below100(ps)} Paise` : ''} Only`;
}

const dayLabel = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/**
 * The columns of the line table. Their widths always add up to the page width
 * (the last column ends at the right margin), and the tax columns are left out
 * when nothing on the document carries tax, so the description gets the room.
 */
function tableColumns({ doc, lines, width }) {
    const W = width;
    const taxTotal = ['cgst_paise', 'sgst_paise', 'utgst_paise', 'igst_paise'].reduce((n, k) => n + Number(doc[k] || 0), 0);
    // GST bill: the tax columns are always there. Non-GST: never. Service bill: only if it was taxed.
    const taxed = taxTotal > 0 || lines.some((l) => Number(l.tax_rate_bps) > 0);
    const hasTax = doc.bill_type === 'non_gst' ? false : doc.bill_type === 'gst' ? true : taxed;
    const inter = doc.supply_type === 'inter';
    // A non-GST bill may print the GST contained in its prices — one "GST %" column, for information.
    const info = doc.bill_type === 'non_gst' && !!Number(doc.show_gst);
    // [key, heading, share of the page width in %, alignment] — the shares add up to 100,
    // so the last column always ends at the right margin.
    const spec = info
        ? [['sn', '#', 4, 'left'], ['desc', 'Item name', 36, 'left'], ['hsn', 'HSN/SAC', 11, 'left'], ['qty', 'Quantity', 8, 'right'], ['unit', 'Unit', 7, 'left'], ['rate', 'Price/unit', 12, 'right'], ['gstpct', 'GST %', 8, 'right'], ['amount', 'Amount', 14, 'right']]
        : !hasTax
        ? [['sn', '#', 4, 'left'], ['desc', 'Item name', 40, 'left'], ['hsn', 'HSN/SAC', 12, 'left'], ['qty', 'Quantity', 9, 'right'], ['unit', 'Unit', 8, 'left'], ['rate', 'Price/unit', 13, 'right'], ['amount', 'Amount', 14, 'right']]
        : inter
            ? [['sn', '#', 3, 'left'], ['desc', 'Item name', 22, 'left'], ['hsn', 'HSN', 9, 'left'], ['qty', 'Qty', 6, 'right'], ['unit', 'Unit', 7, 'left'], ['rate', 'Price/unit', 11, 'right'], ['taxable', 'Taxable', 13, 'right'], ['igst', 'IGST', 13, 'right'], ['amount', 'Amount', 16, 'right']]
            : [['sn', '#', 3, 'left'], ['desc', 'Item name', 20, 'left'], ['hsn', 'HSN', 8, 'left'], ['qty', 'Qty', 5, 'right'], ['unit', 'Unit', 7, 'left'], ['rate', 'Price/unit', 10, 'right'], ['taxable', 'Taxable', 11, 'right'], ['cgst', 'CGST', 11, 'right'], ['sgst', 'SGST', 11, 'right'], ['amount', 'Amount', 14, 'right']];
    let used = 0;
    const cols = spec.map(([key, label, pct, align], i) => {
        const w = i === spec.length - 1 ? W - used : Math.floor((W * pct) / 100);
        used += w;
        return { key, label, w, align };
    });
    return { cols, hasTax, info };
}

const NUMBER_LABEL = { invoice: 'Invoice No.', credit_note: 'Credit Note No.', estimate: 'Quotation No.', proforma: 'Proforma No.' };
const HEADING = { invoice: 'Tax Invoice', credit_note: 'Credit Note', estimate: 'Quotation', proforma: 'Proforma Invoice' };

// What the page calls itself. Only an invoice changes with the bill type: a bill
// with no GST is not a "Tax Invoice", and a service bill says what it is.
function headingOf(doc) {
    if (doc.doc_type === 'invoice') {
        if (doc.bill_type === 'non_gst') return 'Invoice';
        if (doc.bill_type === 'service') {
            const taxed = ['cgst_paise', 'sgst_paise', 'utgst_paise', 'igst_paise'].some((k) => Number(doc[k] || 0) > 0);
            return taxed ? 'Tax Invoice (Services)' : 'Service Invoice';
        }
    }
    return HEADING[doc.doc_type] || 'Document';
}
const TINT = '#eaf6ef';

/**
 * The link a UPI app understands. Scanned, it opens the payer's app with our
 * UPI id filled in — and, for an invoice with something owing, the amount.
 */
function upiLink({ upi, name, amountPaise = 0, note = '' }) {
    if (!upi) return null;
    const parts = [`pa=${encodeURIComponent(upi)}`, `pn=${encodeURIComponent(name || '')}`];
    if (amountPaise > 0) parts.push(`am=${(amountPaise / 100).toFixed(2)}`);
    parts.push('cu=INR');
    if (note) parts.push(`tn=${encodeURIComponent(note)}`);
    return `upi://pay?${parts.join('&')}`;
}

/** Draws a QR code as vector squares. Returns false when it cannot. */
function drawQr(pdf, text, x, y, size) {
    if (!QRCode || !text) return false;
    try {
        const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
        const n = qr.modules.size;
        const quiet = 2;
        const cell = size / (n + quiet * 2);
        pdf.rect(x, y, size, size).fill('#ffffff');
        for (let r = 0; r < n; r += 1) {
            for (let c = 0; c < n; c += 1) {
                if (qr.modules.get(r, c)) pdf.rect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell + 0.25, cell + 0.25).fill(INK);
            }
        }
        return true;
    } catch (err) {
        console.warn('[sales/pdf] could not draw the QR code:', err.message);
        return false;
    }
}

/**
 * @param {Buffer} [logo]      the business logo, already read from wherever it lives
 * @param {Buffer} [signature] the authorised signature
 */
function renderDocumentPdf({ business, document: doc, lines, allocations = [], paid_paise: paid = 0, logo = null, signature = null }) {
    if (!PDFDocument) throw new Error('PDF generation is not available on this server');

    return new Promise((resolve, reject) => {
        const pdf = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
        const chunks = [];
        pdf.on('data', (c) => chunks.push(c));
        pdf.on('end', () => resolve(Buffer.concat(chunks)));
        pdf.on('error', reject);

        const reg = HAS_UNICODE ? FONT_REG : 'Helvetica';
        const bold = HAS_UNICODE ? FONT_BOLD : 'Helvetica-Bold';
        const W = pdf.page.width - 80;
        const PAGE_BOTTOM = pdf.page.height - 46;
        const snapshot = doc.party_snapshot || {};
        const businessName = business.legal_name || 'Networking Experts';
        const isCredit = doc.doc_type === 'credit_note';

        // ── letterhead: name and address on the left, logo on the right ──
        let y = 40;
        const textW = W - 130;
        pdf.font(bold).fontSize(16).fillColor(INK).text(businessName, 40, y, { width: textW });
        y = pdf.y + 2;
        const addressLines = [
            [business.address_line1, business.address_line2].filter(Boolean).join(', '),
            [business.city, business.pincode].filter(Boolean).join(' ') + (business.state_name ? `, ${business.state_name}` : ''),
            business.phone && `Phone no.: ${business.phone}`,
            business.email && `Email: ${business.email}`,
            business.gstin && doc.bill_type !== 'non_gst' && `GSTIN: ${business.gstin}`,
        ].filter((l) => l && String(l).replace(/[,\s]/g, ''));
        pdf.font(reg).fontSize(8.5).fillColor(INK).text(addressLines.join('\n'), 40, y, { width: textW, lineGap: 1.5 });
        let headEnd = pdf.y;

        if (logo) {
            try {
                pdf.image(logo, 40 + W - 120, 40, { fit: [120, 64], align: 'right', valign: 'top' });
                headEnd = Math.max(headEnd, 40 + 64);
            } catch (err) {
                console.warn('[sales/pdf] could not draw the logo:', err.message);
            }
        }
        y = headEnd + 8;
        pdf.moveTo(40, y).lineTo(40 + W, y).strokeColor(INK).lineWidth(0.8).stroke();

        // ── the title, centred, in the brand green ──────────────────────
        y += 10;
        pdf.font(bold).fontSize(14).fillColor(BRAND).text(headingOf(doc), 40, y, { width: W, align: 'center' });
        y = pdf.y + 10;

        // ── bill to (left) and the document's details (right) ───────────
        const colW = W * 0.5;
        pdf.font(bold).fontSize(9.5).fillColor(INK).text(isCredit ? 'Credit To' : 'Bill To', 40, y);
        pdf.font(bold).fontSize(10.5).fillColor(INK).text(snapshot.legal_name || snapshot.display_name || '—', 40, pdf.y + 3, { width: colW - 10 });
        const billTo = [
            snapshot.address && [snapshot.address.line1, snapshot.address.line2].filter(Boolean).join(', '),
            snapshot.address && [snapshot.address.city, snapshot.address.pincode].filter(Boolean).join(' '),
            snapshot.address?.state_name,
            snapshot.phone && `Contact No.: ${snapshot.phone}`,
            snapshot.gstin ? `GSTIN: ${snapshot.gstin}` : null,
        ].filter((l) => l && String(l).trim());
        pdf.font(reg).fontSize(9).fillColor(INK).text(billTo.join('\n'), 40, pdf.y + 2, { width: colW - 10, lineGap: 1.5 });
        const leftEnd = pdf.y;

        const rightX = 40 + colW;
        pdf.font(bold).fontSize(9.5).fillColor(INK).text(`${headingOf(doc).replace(/^Tax /, '').replace(/ \(.*\)$/, '')} Details`, rightX, y, { width: colW, align: 'right' });
        const detailLines = [
            doc.doc_no
                ? `${NUMBER_LABEL[doc.doc_type] || 'No.'}: ${doc.doc_no}${Number(doc.revision_no) > 0 ? ` (Revision ${doc.revision_no})` : ''}`
                : 'DRAFT — not issued',
            `Date: ${dayLabel(doc.doc_date)}`,
            doc.due_date && doc.doc_type !== 'estimate' ? `Due date: ${dayLabel(doc.due_date)}` : null,
            doc.valid_until ? `Valid until: ${dayLabel(doc.valid_until)}` : null,
            doc.reference ? `Ref: ${doc.reference}` : null,
            doc.bill_type === 'non_gst' ? null
                : `Place of supply: ${snapshot.address?.state_name || gst.stateName(doc.place_of_supply_state_code) || doc.place_of_supply_state_code || '—'}`,
        ].filter(Boolean);
        pdf.font(reg).fontSize(9).fillColor(INK).text(detailLines.join('\n'), rightX, pdf.y + 3, { width: colW, align: 'right', lineGap: 1.5 });
        y = Math.max(leftEnd, pdf.y) + 14;

        // ── the table ───────────────────────────────────────────────────
        const { cols, hasTax, info: tableInfo } = tableColumns({ doc, lines, width: W });
        const descCol = cols.find((c) => c.key === 'desc');

        const drawHead = (top) => {
            pdf.rect(40, top, W, 20).fill(TINT);
            pdf.moveTo(40, top).lineTo(40 + W, top).strokeColor(INK).lineWidth(0.8).stroke();
            pdf.moveTo(40, top + 20).lineTo(40 + W, top + 20).strokeColor(INK).lineWidth(0.8).stroke();
            let x = 44;
            pdf.font(bold).fontSize(8).fillColor(INK);
            cols.forEach((c) => {
                pdf.text(c.label, x, top + 6, { width: c.w - 6, align: c.align });
                x += c.w;
            });
            return top + 20;
        };

        y = drawHead(y);

        lines.forEach((line, i) => {
            const model = line.item_snapshot?.model || '';
            const nameH = pdf.font(bold).fontSize(8.5).heightOfString(line.description || '', { width: descCol.w - 6 });
            const modelH = model ? pdf.font(reg).fontSize(7.5).heightOfString(model, { width: descCol.w - 6 }) + 1 : 0;
            const height = Math.max(nameH + modelH + 10, hasTax ? 32 : 24); // a tax cell is an amount over its rate: two lines

            // The header repeats rather than leaving a page of orphaned numbers.
            if (y + height > PAGE_BOTTOM - 40) {
                pdf.addPage();
                y = drawHead(50);
            }

            const values = {
                sn: String(i + 1),
                hsn: line.hsn_sac || '',
                qty: String(Number(line.quantity)),
                unit: line.unit || '',
                rate: rupees(line.rate_paise),
                taxable: rupees(line.taxable_paise),
                cgst: Number(line.tax_rate_bps) > 0 ? `${rupees(line.cgst_paise)}\n${Number(line.tax_rate_bps) / 200}%` : '—',
                sgst: Number(line.tax_rate_bps) > 0 ? `${rupees(line.sgst_paise)}\n${Number(line.tax_rate_bps) / 200}%` : '—',
                igst: Number(line.tax_rate_bps) > 0 ? `${rupees(line.igst_paise)}\n${Number(line.tax_rate_bps) / 100}%` : '—',
                gstpct: Number(line.info_tax_bps) > 0 ? `${Number(line.info_tax_bps) / 100}%` : '—',
                amount: rupees(line.amount_paise),
            };

            let x = 44;
            cols.forEach((c) => {
                if (c.key === 'desc') {
                    pdf.font(bold).fontSize(8.5).fillColor(INK).text(line.description || '', x, y + 5, { width: c.w - 6, lineGap: 0.5 });
                    if (model) pdf.font(reg).fontSize(7.5).fillColor(MUTED).text(model, x, pdf.y + 1, { width: c.w - 6 });
                } else {
                    pdf.font(reg).fontSize(8).fillColor(INK).text(values[c.key] ?? '', x, y + 5, { width: c.w - 6, align: c.align, lineGap: 0.5 });
                }
                x += c.w;
            });
            y += height;
            pdf.moveTo(40, y).lineTo(40 + W, y).strokeColor(LINE).lineWidth(0.5).stroke();
        });
        pdf.moveTo(40, y).lineTo(40 + W, y).strokeColor(INK).lineWidth(0.8).stroke();

        // ── summary: words and terms on the left, the totals on the right ─
        const discount = Number(doc.line_discount_paise) + Number(doc.doc_discount_paise);
        // The GST contained in a non-GST bill's prices, worked out for printing only.
        const infoGst = tableInfo
            ? informationalGst({ lines, supplier_state_code: business.state_code, place_of_supply_state_code: doc.place_of_supply_state_code })
            : null;
        const infoRows = infoGst && infoGst.tax_paise > 0 ? [
            ['Value excl. GST', rupees(infoGst.taxable_paise)],
            infoGst.cgst_paise ? ['CGST (included)', rupees(infoGst.cgst_paise)] : null,
            infoGst.sgst_paise ? ['SGST (included)', rupees(infoGst.sgst_paise)] : null,
            infoGst.igst_paise ? ['IGST (included)', rupees(infoGst.igst_paise)] : null,
        ] : [];
        const totalsRows = [
            ['Sub total', rupees(Number(doc.taxable_paise) + discount)],
            discount ? ['Discount', `- ${rupees(discount)}`] : null,
            discount ? ['Taxable value', rupees(doc.taxable_paise)] : null,
            ...infoRows,
            Number(doc.cgst_paise) ? ['CGST', rupees(doc.cgst_paise)] : null,
            Number(doc.sgst_paise) ? ['SGST', rupees(doc.sgst_paise)] : null,
            Number(doc.utgst_paise) ? ['UTGST', rupees(doc.utgst_paise)] : null,
            Number(doc.igst_paise) ? ['IGST', rupees(doc.igst_paise)] : null,
            Number(doc.round_off_paise) ? ['Rounding', rupees(doc.round_off_paise)] : null,
        ].filter(Boolean);

        const leftW = W - 250;
        const termsText = [FOOTNOTES[doc.doc_type], tableInfo ? 'The GST shown is contained in the prices above, for your information. No GST is charged separately on this bill.' : null, doc.notes, doc.terms, business.payment_instructions].filter(Boolean).join('\n');
        pdf.font(reg).fontSize(8);
        const leftH = 12 + 12 + pdf.heightOfString(inWords(doc.total_paise), { width: leftW, lineGap: 1.5 })
            + (termsText ? 24 + pdf.heightOfString(termsText, { width: leftW, lineGap: 2 }) : 0);
        const rightH = totalsRows.length * 15 + 34 + (doc.doc_type === 'invoice' ? 16 : 0);

        const upi = business.upi_id;
        const owing = doc.doc_type === 'invoice' ? Math.max(0, Number(doc.total_paise) - Number(paid)) : 0;
        const link = isCredit ? null : upiLink({ upi, name: businessName, amountPaise: owing, note: doc.doc_no || '' });
        const bankLines = isCredit ? [] : [
            business.bank_name && `Bank name: ${[business.bank_name, business.bank_branch].filter(Boolean).join(', ')}`,
            business.bank_account_no && `Bank account no.: ${business.bank_account_no}`,
            business.bank_ifsc && `Bank IFSC code: ${business.bank_ifsc}`,
            (business.bank_account_no || upi) && `Account holder: ${businessName}`,
            upi && `UPI ID: ${upi}`,
        ].filter(Boolean);
        const payH = bankLines.length || link ? 96 : 0;
        const signH = 70;

        y += 10;
        if (y + Math.max(leftH, rightH) + Math.max(payH, signH) + 30 > PAGE_BOTTOM) { pdf.addPage(); y = 50; }
        const top = y;

        // left
        pdf.font(bold).fontSize(8.5).fillColor(INK).text(`${isCredit ? 'Credit' : doc.doc_type === 'estimate' ? 'Quotation' : 'Invoice'} Amount In Words`, 40, y, { width: leftW });
        pdf.font(reg).fontSize(8.5).fillColor(INK).text(inWords(doc.total_paise), 40, pdf.y + 3, { width: leftW, lineGap: 1.5 });
        if (termsText) {
            pdf.font(bold).fontSize(8.5).fillColor(INK).text('Terms and Conditions', 40, pdf.y + 12, { width: leftW });
            pdf.font(reg).fontSize(8).fillColor(MUTED).text(termsText, 40, pdf.y + 3, { width: leftW, lineGap: 2 });
        }
        const leftBottom = pdf.y;

        // right
        const boxX = 40 + W - 240;
        let ry = top;
        totalsRows.forEach(([label, value]) => {
            pdf.font(reg).fontSize(9).fillColor(INK).text(label, boxX, ry, { width: 120, align: 'left' });
            pdf.font(reg).fontSize(9).fillColor(INK).text(value, boxX + 120, ry, { width: 120, align: 'right' });
            ry += 15;
        });
        pdf.rect(boxX, ry + 1, 240, 24).fill(TINT);
        pdf.moveTo(boxX, ry + 1).lineTo(boxX + 240, ry + 1).strokeColor(INK).lineWidth(0.8).stroke();
        pdf.moveTo(boxX, ry + 25).lineTo(boxX + 240, ry + 25).strokeColor(INK).lineWidth(0.8).stroke();
        pdf.font(bold).fontSize(11).fillColor(INK).text('Total', boxX + 4, ry + 7, { width: 110 });
        pdf.font(bold).fontSize(12).fillColor(BRAND).text(rupees(doc.total_paise), boxX + 116, ry + 6, { width: 120, align: 'right' });
        ry += 32;

        if (doc.doc_type === 'invoice') {
            const balance = Number(doc.total_paise) - Number(paid);
            pdf.font(reg).fontSize(8.5).fillColor(balance > 0 ? '#b45309' : BRAND).text(
                balance > 0
                    ? `Paid ${rupees(paid)}  ·  Balance due ${rupees(balance)}`
                    : `Paid in full${allocations.length ? ` on ${dayLabel(allocations[allocations.length - 1].payment_date)}` : ''}`,
                boxX - 20, ry, { width: 260, align: 'right' }
            );
            ry += 16;
        }

        y = Math.max(leftBottom, ry) + 14;

        // ── pay to: the QR, the bank, and the signature ─────────────────
        if (y + Math.max(payH, signH) > PAGE_BOTTOM) { pdf.addPage(); y = 50; }
        pdf.page.margins.bottom = 0;
        pdf.moveTo(40, y - 6).lineTo(40 + W, y - 6).strokeColor(LINE).lineWidth(1).stroke();

        let payX = 40;
        if (payH) {
            pdf.font(bold).fontSize(9).fillColor(INK).text('Pay To:', 40, y, { width: 200 });
            const qrOk = drawQr(pdf, link, 40, y + 14, 78);
            payX = qrOk ? 128 : 40;
            pdf.font(reg).fontSize(8.5).fillColor(INK).text(bankLines.join('\n'), payX, y + 16, { width: W - 210 - (payX - 40), lineGap: 3 });
            if (qrOk) pdf.font(reg).fontSize(7).fillColor(MUTED).text('Scan to pay (UPI)', 40, y + 94, { width: 92, align: 'center' });
        }

        const sigX = 40 + W - 170;
        if (signature) {
            try {
                pdf.image(signature, sigX + 25, y + 4, { fit: [120, 36], align: 'right' });
            } catch (err) {
                console.warn('[sales/pdf] could not draw the signature:', err.message);
            }
        }
        pdf.font(reg).fontSize(8).fillColor(MUTED)
            .text(`For ${businessName}`, sigX, y + 44, { width: 170, align: 'right' })
            .text('Authorised signatory', sigX, y + 56, { width: 170, align: 'right' });

        if (business.invoice_footer) {
            const fy = y + Math.max(payH, signH) + 4;
            if (fy + 14 < pdf.page.height - 34) {
                pdf.font(reg).fontSize(7.5).fillColor(MUTED).text(business.invoice_footer, 40, fy, { width: W, align: 'center' });
            }
        }

        // Page numbers last, once the page count is known. Same reason for the
        // margin: this line sits in the area pdfkit would otherwise treat as an
        // overflow and answer with another page.
        const range = pdf.bufferedPageRange();
        for (let i = 0; i < range.count; i += 1) {
            pdf.switchToPage(range.start + i);
            pdf.page.margins.bottom = 0;
            pdf.font(reg).fontSize(7.5).fillColor(MUTED).text(
                `Page ${i + 1} of ${range.count}`,
                40, pdf.page.height - 28, { width: W, align: 'center', lineBreak: false }
            );
        }

        pdf.end();
    });
}

module.exports = { renderDocumentPdf, HAS_UNICODE, inWords, tableColumns, headingOf, upiLink };
