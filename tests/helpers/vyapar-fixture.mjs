// A small made-up Vyapar backup (.vyb), built in memory. Nothing in it is real.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const initSqlJs = require('../../node_modules/sql.js');
const { zipSync } = require('../../node_modules/fflate');

export const SCHEMA = `
CREATE TABLE kb_firms (firm_id INTEGER, firm_name TEXT, firm_gstin_number TEXT, firm_state TEXT);
CREATE TABLE kb_item_units (unit_id INTEGER, unit_name TEXT, unit_short_name TEXT);
CREATE TABLE kb_tax_code (tax_code_id INTEGER, tax_code_name TEXT, tax_rate REAL);
CREATE TABLE kb_item_categories (item_category_id INTEGER, item_category_name TEXT);
CREATE TABLE kb_item_categories_mapping (id INTEGER, item_id INTEGER, category_id INTEGER);
CREATE TABLE kb_paymentTypes (paymentType_id INTEGER, paymentType_type TEXT, paymentType_name TEXT, paymentType_bankName TEXT, paymentType_accountNumber TEXT);
CREATE TABLE kb_names (name_id INTEGER, full_name TEXT, phone_number TEXT, email TEXT, amount REAL, address TEXT, name_gstin_number TEXT, name_state TEXT,
  pincode TEXT, credit_limit REAL, name_is_active INTEGER, name_type INTEGER, name_shipping_address TEXT);
CREATE TABLE kb_items (item_id INTEGER, item_name TEXT, item_code TEXT, item_sale_unit_price REAL, item_purchase_unit_price REAL, item_stock_quantity REAL,
  item_min_stock_quantity REAL, item_hsn_sac_code TEXT, item_tax_id INTEGER, item_tax_type INTEGER, base_unit_id INTEGER, item_is_active INTEGER, item_type INTEGER, item_description TEXT);
CREATE TABLE kb_transactions (txn_id INTEGER, txn_type INTEGER, txn_date TEXT, txn_due_date TEXT, txn_name_id INTEGER, txn_cash_amount REAL, txn_balance_amount REAL,
  txn_discount_amount REAL, txn_tax_amount REAL, txn_round_off_amount REAL, txn_tax_inclusive INTEGER, txn_invoice_prefix TEXT, txn_ref_number_char TEXT,
  txn_description TEXT, txn_payment_type_id INTEGER, txn_payment_reference TEXT, txn_payment_status INTEGER, txn_status INTEGER, txn_place_of_supply TEXT,
  txn_ac1_amount REAL, txn_ac2_amount REAL, txn_ac3_amount REAL, ac1_name TEXT, ac2_name TEXT, ac3_name TEXT);
CREATE TABLE kb_lineitems (lineitem_id INTEGER, lineitem_txn_id INTEGER, item_id INTEGER, quantity REAL, priceperunit REAL, total_amount REAL, lineitem_tax_amount REAL,
  lineitem_discount_amount REAL, lineitem_unit_id INTEGER, lineitem_tax_id INTEGER, lineitem_serial_number TEXT, lineitem_description TEXT, lineitem_free_quantity REAL);
CREATE TABLE kb_txn_links (txn_links_id INTEGER, txn_links_txn_1_id INTEGER, txn_links_txn_2_id INTEGER, txn_links_amount REAL);
CREATE TABLE kb_linked_transactions (linked_id INTEGER, txn_source_id INTEGER, txn_destination_id INTEGER);
`;
export const GSTIN_OK = '01AAACN1234F1ZB';   // passes the GSTIN check digit

export async function makeVyb({ firstParty = 'ZZV Hotel Heevan', phone = '+91 98765 43210' } = {}) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(SCHEMA);
  const run = (sql, ...rows) => rows.forEach((r) => db.run(sql, r));
  run('INSERT INTO kb_firms VALUES (?,?,?,?)', [1, 'ZZV Test Firm', GSTIN_OK, 'Jammu & Kashmir']);
  run('INSERT INTO kb_item_units VALUES (?,?,?)', [13, 'NUMBERS', 'Nos'], [12, 'METERS', 'Mtr']);
  run('INSERT INTO kb_tax_code VALUES (?,?,?)', [24, 'GST@18%', 18], [16, 'GST@5%', 5], [4, 'GST@0%', 0]);
  run('INSERT INTO kb_item_categories VALUES (?,?)', [4, 'CAMERA']);
  run('INSERT INTO kb_item_categories_mapping VALUES (?,?,?)', [1, 1, 4]);
  run('INSERT INTO kb_paymentTypes VALUES (?,?,?,?,?)', [1, 'CASH', 'Cash', null, null], [3, 'BANK', 'Main account', 'J&K Bank', '0392020100000364']);
  // parties: a customer who owes, a customer with a clean slate, a supplier we owe, an expense head, a bad GSTIN
  run('INSERT INTO kb_names VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [1, firstParty, phone, 'heevan@example.com', 12500.5, 'Dalgate, Srinagar', GSTIN_OK, 'Jammu & Kashmir', '190001', 50000, 1, 1, ''],
    [2, 'ZZV Walk-in Shop', '', '', 0, '', '', '', '', 0, 1, 1, ''],
    [3, 'ZZV Cable Distributor', '09123456780', '', -4000, '', '', 'Delhi', '', 0, 1, 1, ''],
    [4, 'Petrol', '', '', 0, '', '', '', '', 0, 1, 2, ''],
    [5, 'ZZV Wrong Gstin Traders', '', '', 100, '', '01ABCDE1234F1Z9', '', '', 0, 1, 1, ''],
    // two shops of one owner: the same phone, two separate accounts
    [6, 'ZZV Twin Shop A', '9111100001', '', 100, '', '', '', '', 0, 1, 1, ''],
    [7, 'ZZV Twin Shop B', '9111100001', '', 200, '', '', '', '', 0, 1, 1, '']);
  // items: priced with tax included, one with stock, one negative, one never priced (taken from the last sale)
  run('INSERT INTO kb_items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [1, 'ZZV Dome Camera', 'ZZV-CAM', 2360, 1180, 5, 2, '85258900', 24, 1, 13, 1, 1, ''],
    [2, 'ZZV CAT6 Cable', '', 30, 22, -40, 0, '', 24, 2, 12, 1, 1, ''],
    [3, 'ZZV Unpriced Item', '', 0, 0, 0, 0, '', null, 2, 13, 1, 1, ''],
    [4, 'ZZV Old Item', '', 10, 5, 3, 0, '', 4, 2, 13, 0, 1, '']);
  // documents: a sale with a charge and a discount, a payment against it, a quotation that became the sale, a purchase
  run('INSERT INTO kb_transactions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [10, 1, '2026-09-20 11:00:00', '2026-10-05 00:00:00', 1, 0, 4720, 0, 0, 0, 2, 'NE/2026/', '101', 'Camera fitting', null, null, 1, 1, 'Jammu & Kashmir', 0, 0, 0, null, null, null],
    [11, 3, '2026-09-25 15:30:00', null, 1, 2000, 0, 0, 0, 0, 2, '', '17', '', 3, 'UTR778', 3, 1, '', 0, 0, 0, null, null, null],
    [12, 27, '2026-09-10 10:00:00', null, 1, 0, 4720, 0, 0, 0, 2, '', '55', 'Quote for 2 cameras', null, null, 1, 4, '', 0, 0, 0, null, null, null],
    [13, 2, '2026-08-01 10:00:00', null, 3, 1000, 1000, 0, 0, 0, 2, '', 'NX 9', '', 1, null, 2, 1, '', 0, 0, 0, null, null, null],
    [14, 7, '2026-08-02 10:00:00', null, 4, 600, 0, 0, 0, 0, 2, '', '', '', 1, null, 3, 1, '', 0, 0, 0, null, null, null]);
  // the 2 cameras: 2 x 2000 + 18% = 4720; a unit price before tax, a line total after tax
  run('INSERT INTO kb_lineitems VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [1, 10, 1, 2, 2000, 4720, 720, 0, 13, 24, 'SN-A1, SN-A2', '', 0],
    [2, 12, 1, 2, 2000, 4720, 720, 0, 13, 24, '', '', 0],
    [3, 13, 2, 100, 20, 2000, 0, 0, 12, 4, '', '', 0],
    [4, 10, 3, 1, 500, 590, 90, 0, 13, 24, '', '', 0]);
  run('INSERT INTO kb_txn_links VALUES (?,?,?,?)', [1, 11, 10, 2000]);
  run('INSERT INTO kb_linked_transactions VALUES (?,?,?)', [1, 12, 10]);
  const bytes = db.export();
  db.close();
  return Buffer.from(zipSync({ 'ZZV.vyp': bytes }));
}

