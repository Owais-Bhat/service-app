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

let PDFDocument = null;
try {
    PDFDocument = require('pdfkit');
} catch {
    console.warn('[sales/pdf] pdfkit not installed — document PDFs disabled');
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
    const hasTax = taxTotal > 0 || lines.some((l) => Number(l.tax_rate_bps) > 0);
    const inter = doc.supply_type === 'inter';
    // [key, heading, share of the page width in %, alignment] — the shares add up to 100,
    // so the last column always ends at the right margin.
    const spec = !hasTax
        ? [['sn', '#', 4, 'left'], ['desc', 'Description', 46, 'left'], ['hsn', 'HSN/SAC', 12, 'left'], ['qty', 'Qty', 10, 'right'], ['rate', 'Rate', 13, 'right'], ['amount', 'Amount', 15, 'right']]
        : inter
            ? [['sn', '#', 3, 'left'], ['desc', 'Description', 24, 'left'], ['hsn', 'HSN', 10, 'left'], ['qty', 'Qty', 7, 'right'], ['rate', 'Rate', 12, 'right'], ['taxable', 'Taxable', 14, 'right'], ['igst', 'IGST', 14, 'right'], ['amount', 'Amount', 16, 'right']]
            : [['sn', '#', 3, 'left'], ['desc', 'Description', 20, 'left'], ['hsn', 'HSN', 10, 'left'], ['qty', 'Qty', 7, 'right'], ['rate', 'Rate', 11, 'right'], ['taxable', 'Taxable', 12, 'right'], ['cgst', 'CGST', 12, 'right'], ['sgst', 'SGST', 12, 'right'], ['amount', 'Amount', 13, 'right']];
    let used = 0;
    const cols = spec.map(([key, label, pct, align], i) => {
        const w = i === spec.length - 1 ? W - used : Math.floor((W * pct) / 100);
        used += w;
        return { key, label, w, align };
    });
    return { cols, hasTax };
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
        const snapshot = doc.party_snapshot || {};

        // ── letterhead ──────────────────────────────────────────────────
        let y = 40;
        let textLeft = 40;
        if (logo) {
            try {
                // Fitted into a box rather than scaled by height, so a tall logo
                // and a wide one both sit correctly beside the business name.
                pdf.image(logo, 40, y, { fit: [120, 48], align: 'left', valign: 'top' });
                textLeft = 172;
            } catch (err) {
                console.warn('[sales/pdf] could not draw the logo:', err.message);
            }
        }
        pdf.font(bold).fontSize(17).fillColor(INK)
            .text(business.legal_name || 'Networking Experts', textLeft, y, { width: W * 0.6 - (textLeft - 40) });
        y = pdf.y + 2;
        const addressLines = [
            business.address_line1, business.address_line2,
            [business.city, business.pincode].filter(Boolean).join(' '),
            business.state_name,
            [business.phone && `Ph ${business.phone}`, business.email].filter(Boolean).join('  ·  '),
            business.gstin && `GSTIN ${business.gstin}`,
        ].filter(Boolean);
        pdf.font(reg).fontSize(8.5).fillColor(MUTED)
            .text(addressLines.join('\n'), textLeft, y, { width: W * 0.6 - (textLeft - 40), lineGap: 1.5 });

        pdf.font(bold).fontSize(16).fillColor(BRAND)
            .text(TITLES[doc.doc_type] || 'DOCUMENT', 40, 40, { width: W, align: 'right' });
        pdf.font(reg).fontSize(9).fillColor(INK).text(
            [
                doc.doc_no ? `No.  ${doc.doc_no}${Number(doc.revision_no) > 0 ? `  (Revision ${doc.revision_no})` : ''}` : 'DRAFT — not issued',
                `Date  ${dayLabel(doc.doc_date)}`,
                doc.due_date && doc.doc_type !== 'estimate' ? `Due  ${dayLabel(doc.due_date)}` : null,
                doc.valid_until ? `Valid until  ${dayLabel(doc.valid_until)}` : null,
                doc.reference ? `Ref  ${doc.reference}` : null,
            ].filter(Boolean).join('\n'),
            40, pdf.y + 4, { width: W, align: 'right', lineGap: 2 }
        );

        y = Math.max(pdf.y, y + addressLines.length * 11) + 14;
        pdf.moveTo(40, y).lineTo(40 + W, y).strokeColor(LINE).lineWidth(1).stroke();
        y += 14;

        // ── who it is for ───────────────────────────────────────────────
        pdf.font(bold).fontSize(9).fillColor(MUTED).text('BILL TO', 40, y);
        pdf.font(bold).fontSize(11).fillColor(INK).text(snapshot.legal_name || snapshot.display_name || '—', 40, pdf.y + 2, { width: W * 0.55 });
        const billTo = [
            snapshot.address && [snapshot.address.line1, snapshot.address.line2].filter(Boolean).join(', '),
            snapshot.address && [snapshot.address.city, snapshot.address.pincode].filter(Boolean).join(' '),
            snapshot.address?.state_name,
            snapshot.phone,
            snapshot.gstin ? `GSTIN ${snapshot.gstin}` : null,
        ].filter(Boolean);
        pdf.font(reg).fontSize(9).fillColor(MUTED).text(billTo.join('\n'), 40, pdf.y + 2, { width: W * 0.55, lineGap: 1.5 });
        const leftEnd = pdf.y;

        const supplyNote = doc.supply_type === 'inter' ? 'Inter-state supply (IGST)' : 'Intra-state supply (CGST + SGST)';
        pdf.font(reg).fontSize(9).fillColor(MUTED)
            .text(`Place of supply: ${snapshot.address?.state_name || doc.place_of_supply_state_code || '—'}\n${supplyNote}`,
                40 + W * 0.6, y + 12, { width: W * 0.4, align: 'right', lineGap: 2 });

        y = Math.max(leftEnd, pdf.y) + 16;

        // ── the table ───────────────────────────────────────────────────
        const { cols, hasTax } = tableColumns({ doc, lines, width: W });

        const drawHead = (top) => {
            pdf.rect(40, top, W, 20).fillColor('#f3f6f4').fill();
            let x = 44;
            pdf.font(bold).fontSize(8).fillColor(MUTED);
            cols.forEach((c) => {
                pdf.text(c.label, x, top + 6, { width: c.w - 6, align: c.align });
                x += c.w;
            });
            return top + 20;
        };

        y = drawHead(y);
        const BOTTOM = pdf.page.height - 120;

        lines.forEach((line, i) => {
            const desc = [line.description, line.item_snapshot?.model].filter(Boolean).join(' — ');
            const height = Math.max(
                pdf.font(reg).fontSize(8.5).heightOfString(desc, { width: cols[1].w - 6 }) + 10,
                hasTax ? 32 : 24 // a tax cell is an amount over its rate: two lines
            );

            // The header repeats rather than leaving a page of orphaned numbers.
            if (y + height > BOTTOM) {
                pdf.addPage();
                y = drawHead(50);
            }

            const values = {
                sn: String(i + 1),
                desc,
                hsn: line.hsn_sac || '',
                qty: `${Number(line.quantity)}${line.unit ? ` ${line.unit}` : ''}`,
                rate: rupees(line.rate_paise),
                taxable: rupees(line.taxable_paise),
                cgst: Number(line.tax_rate_bps) > 0 ? `${rupees(line.cgst_paise)}\n${Number(line.tax_rate_bps) / 200}%` : '—',
                sgst: Number(line.tax_rate_bps) > 0 ? `${rupees(line.sgst_paise)}\n${Number(line.tax_rate_bps) / 200}%` : '—',
                igst: Number(line.tax_rate_bps) > 0 ? `${rupees(line.igst_paise)}\n${Number(line.tax_rate_bps) / 100}%` : '—',
                amount: rupees(line.amount_paise),
            };

            let x = 44;
            cols.forEach((c) => {
                pdf.font(reg).fontSize(c.key === 'desc' ? 8.5 : 8).fillColor(INK);
                pdf.text(values[c.key] ?? '', x, y + 5, { width: c.w - 6, align: c.align, lineGap: 0.5 });
                x += c.w;
            });
            y += height;
            pdf.moveTo(40, y).lineTo(40 + W, y).strokeColor(LINE).lineWidth(0.5).stroke();
        });

        // ── totals ──────────────────────────────────────────────────────
        const totalsRows = [
            ['Taxable value', rupees(doc.taxable_paise)],
            Number(doc.line_discount_paise) + Number(doc.doc_discount_paise)
                ? ['Discount', `− ${rupees(Number(doc.line_discount_paise) + Number(doc.doc_discount_paise))}`] : null,
            Number(doc.cgst_paise) ? ['CGST', rupees(doc.cgst_paise)] : null,
            Number(doc.sgst_paise) ? ['SGST', rupees(doc.sgst_paise)] : null,
            Number(doc.utgst_paise) ? ['UTGST', rupees(doc.utgst_paise)] : null,
            Number(doc.igst_paise) ? ['IGST', rupees(doc.igst_paise)] : null,
            Number(doc.round_off_paise) ? ['Rounding', rupees(doc.round_off_paise)] : null,
        ].filter(Boolean);

        const totalsHeight = totalsRows.length * 15 + 60;
        if (y + totalsHeight > BOTTOM) { pdf.addPage(); y = 50; }

        y += 10;
        const boxX = 40 + W - 230;
        totalsRows.forEach(([label, value]) => {
            pdf.font(reg).fontSize(9).fillColor(MUTED).text(label, boxX, y, { width: 120, align: 'left' });
            pdf.font(reg).fontSize(9).fillColor(INK).text(value, boxX + 120, y, { width: 110, align: 'right' });
            y += 15;
        });

        pdf.font(bold).fontSize(7.5).fillColor(MUTED).text('AMOUNT IN WORDS', 40, y + 4, { width: boxX - 60 });
        pdf.font(reg).fontSize(9).fillColor(INK).text(inWords(doc.total_paise), 40, y + 16, { width: boxX - 60, lineGap: 1.5 });
        pdf.rect(boxX, y + 2, 230, 26).fillColor('#f3f6f4').fill();
        pdf.font(bold).fontSize(11).fillColor(INK).text('Total', boxX + 4, y + 9, { width: 110 });
        pdf.font(bold).fontSize(12).fillColor(BRAND).text(rupees(doc.total_paise), boxX + 116, y + 8, { width: 110, align: 'right' });
        y += 34;

        if (doc.doc_type === 'invoice') {
            const balance = Number(doc.total_paise) - Number(paid);
            pdf.font(reg).fontSize(9).fillColor(balance > 0 ? '#b45309' : BRAND).text(
                balance > 0
                    ? `Paid ${rupees(paid)}  ·  Balance due ${rupees(balance)}`
                    : `Paid in full${allocations.length ? ` on ${dayLabel(allocations[allocations.length - 1].payment_date)}` : ''}`,
                boxX - 40, y, { width: 270, align: 'right' }
            );
            y += 16;
        }

        // ── the small print ─────────────────────────────────────────────
        let footY = Math.max(y + 10, pdf.page.height - 130);
        if (footY + 90 > pdf.page.height - 40) { pdf.addPage(); footY = 60; }

        const notes = [
            FOOTNOTES[doc.doc_type],
            doc.notes,
            doc.terms,
            business.payment_instructions,
            business.bank_name && `Bank: ${[business.bank_name, business.bank_account_no && `A/c ${business.bank_account_no}`, business.bank_ifsc && `IFSC ${business.bank_ifsc}`, business.bank_branch].filter(Boolean).join('  ·  ')}`,
            business.invoice_footer,
        ].filter(Boolean);

        pdf.page.margins.bottom = 0;
        pdf.moveTo(40, footY - 8).lineTo(40 + W, footY - 8).strokeColor(LINE).lineWidth(1).stroke();
        pdf.font(reg).fontSize(8).fillColor(MUTED).text(notes.join('\n'), 40, footY, { width: W * 0.62, lineGap: 2 });

        if (signature) {
            try {
                pdf.image(signature, 40 + W - 130, footY, { fit: [120, 36], align: 'right' });
            } catch (err) {
                console.warn('[sales/pdf] could not draw the signature:', err.message);
            }
        }
        pdf.font(reg).fontSize(8).fillColor(MUTED)
            .text(`For ${business.legal_name || 'Networking Experts'}`, 40 + W - 170, footY + 40, { width: 170, align: 'right' })
            .text('Authorised signatory', 40 + W - 170, footY + 52, { width: 170, align: 'right' });

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

module.exports = { renderDocumentPdf, HAS_UNICODE, inWords, tableColumns };
