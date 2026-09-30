// A search box for choosing an item — type a few letters of the name, brand,
// model or SKU and pick from what matches. A plain <select> of hundreds of items
// cannot be searched, and stock is exactly where that hurts.
//
//   const picker = attachItemPicker(input, {
//     items: () => items,                       // the list to search (called each time)
//     hint: (item) => '12 pcs',                 // the small grey text on the right
//     onPick: (item) => { ... },                // called when one is chosen
//   });
//   picker.value()   -> the chosen item's id, or ''
//   picker.set(item) / picker.clear()
//
// The dropdown is attached to <body> and positioned under the input, so a modal or
// a table cell with overflow hidden cannot clip it.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const haystack = (i) => [i.name, i.sku, i.brand, i.model, i.category].filter(Boolean).join(' ').toLowerCase();

/** Items whose name, SKU, brand, model or category contains every word typed. */
export function searchItems(items, text, limit = 40) {
  const words = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? items.filter(i => { const h = haystack(i); return words.every(w => h.includes(w)); }) : items;
  return hits.slice(0, limit);
}

export function attachItemPicker(input, { items, hint = () => '', onPick = () => {} }) {
  let chosen = null;
  let list = null;
  let active = -1;
  let shown = [];

  input.setAttribute('autocomplete', 'off');
  input.setAttribute('role', 'combobox');

  const close = () => { list?.remove(); list = null; active = -1; };

  const place = () => {
    if (!list) return;
    const r = input.getBoundingClientRect();
    Object.assign(list.style, {
      position: 'fixed', left: `${r.left}px`, top: `${r.bottom + 4}px`, width: `${Math.max(r.width, 280)}px`,
      maxHeight: '260px', overflowY: 'auto', zIndex: 10100, background: 'var(--surface, var(--bg, #fff))',
      border: '1.5px solid var(--border, #ccc)', borderRadius: '12px', boxShadow: '0 16px 32px -12px rgba(0,0,0,0.35)', padding: '4px',
    });
  };

  const paint = () => {
    shown = searchItems(items(), input.value);
    if (!list) { list = document.createElement('div'); list.className = 'item-picker-list'; document.body.appendChild(list); }
    place();
    list.innerHTML = shown.length
      ? shown.map((i, n) => `
        <div class="ip-row" data-n="${n}" style="display:flex;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:0.84rem;${n === active ? 'background:rgba(21,160,90,0.14)' : ''}">
          <span><b>${esc(i.name)}</b>${i.sku ? ` <small style="color:var(--text-dim)">${esc(i.sku)}</small>` : ''}</span>
          <small style="color:var(--text-dim);white-space:nowrap">${esc(hint(i))}</small>
        </div>`).join('')
      : '<div style="padding:10px;font-size:0.82rem;color:var(--text-dim)">No item matches. Check the spelling, or add it in Items.</div>';
    list.querySelectorAll('.ip-row').forEach(row => {
      // mousedown, not click: the input's blur would close the list before a click lands.
      row.onmousedown = (e) => { e.preventDefault(); pick(shown[Number(row.dataset.n)]); };
    });
  };

  const pick = (item) => {
    if (!item) return;
    chosen = item;
    input.value = item.name;
    input.dataset.itemId = item.id;
    close();
    onPick(item);
  };

  input.addEventListener('focus', () => { input.select?.(); paint(); });
  input.addEventListener('input', () => {
    // Typing after a choice starts a new search; the old choice no longer stands.
    if (chosen && input.value !== chosen.name) { chosen = null; input.dataset.itemId = ''; }
    active = 0;
    paint();
  });
  input.addEventListener('keydown', (e) => {
    if (!list && ['ArrowDown', 'ArrowUp'].includes(e.key)) paint();
    if (e.key === 'ArrowDown') { active = Math.min(shown.length - 1, active + 1); e.preventDefault(); paint(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); e.preventDefault(); paint(); }
    else if (e.key === 'Enter' && list && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(() => {
    close();
    // Left the box with something typed but nothing chosen: put the last real choice back.
    if (!chosen) { input.value = ''; input.dataset.itemId = ''; } else input.value = chosen.name;
  }, 120));
  window.addEventListener('scroll', place, true);

  return {
    value: () => (chosen ? chosen.id : ''),
    item: () => chosen,
    set(item) { chosen = item; input.value = item ? item.name : ''; input.dataset.itemId = item ? item.id : ''; },
    clear() { chosen = null; input.value = ''; input.dataset.itemId = ''; },
    destroy() { close(); window.removeEventListener('scroll', place, true); },
  };
}
