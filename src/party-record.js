// Opens a customer's or supplier's whole record as a PDF (what they bought, paid, jobs, statement) in a new tab,
// ready to print or save. `all` means from the beginning; otherwise `from`/`to` (default: this financial year).
import { toast } from './utils.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

export async function openPartyRecord({ partyId, from = null, to = null, all = false } = {}) {
  if (!partyId) return toast('Choose a customer or supplier first', 'warning');
  const q = new URLSearchParams({ party_id: partyId });
  if (all) q.set('all', '1');
  else { if (from) q.set('from', from); if (to) q.set('to', to); }

  // Open the tab straight away (inside the click), then fill it: browsers block a window opened after a wait.
  const tab = window.open('', '_blank');
  try {
    const res = await fetch(`${API}/reports/party-record.pdf?${q}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Could not make the record');
    }
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  } catch (err) {
    if (tab) tab.close();
    toast(err.message, 'error');
  }
}
