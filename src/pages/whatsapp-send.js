// Sending a WhatsApp message through the server, and what to do when it says no.
//
// The server refuses, with the reason, when WhatsApp is not set up, when the
// customer has no valid number, or when the same message went to the same number
// a moment ago — in which case the person is asked before it is sent twice.
import { toast } from '../utils.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * @param {'document'|'payment-reminder'|'amc-renewal'} kind
 * @param {object} body what the route needs (document_id, party_id or contract_id)
 * @returns {Promise<boolean>} true when Fast2SMS accepted the message
 */
export async function sendWhatsapp(kind, body) {
  const path = `/whatsapp/send/${kind}`;
  let r = await post(path, body);
  if (!r.ok && r.data.code === 'duplicate') {
    if (!confirm(`${r.data.error}. Send it again?`)) return false;
    r = await post(path, { ...body, force: true });
  }
  if (!r.ok) {
    toast(r.data.error || 'Could not send the WhatsApp message', 'error');
    return false;
  }
  toast(`Sent to ${r.data.phone} on WhatsApp`, 'success');
  return true;
}
