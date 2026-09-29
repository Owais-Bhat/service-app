// Units of measure for line items. The field stays free text — a business can
// sell "per point" or "per drop" — but the common ones are one click away, and
// an item picked from the catalogue brings its own unit with it.
export const UNITS = [
  'Nos', 'Pcs', 'Meter', 'Feet', 'Roll', 'Box', 'Set', 'Pair', 'Kg', 'Ltr',
  'Point', 'Camera', 'Job', 'Visit', 'Hour', 'Day', 'Month', 'Year', 'Lot',
];

export const DEFAULT_UNIT = 'Nos';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** <datalist> that any unit <input list="…"> can point at. */
export const unitDatalist = (id = 'at2-units') =>
  `<datalist id="${id}">${UNITS.map(u => `<option value="${esc(u)}">`).join('')}</datalist>`;

/** "Nos", "nos", "NOS" and "pcs" all read as one unit; the first spelling in UNITS wins. */
export function tidyUnit(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  return UNITS.find(u => u.toLowerCase() === v.toLowerCase()) || v;
}
