import { supabase } from '../supabase.js';
import { toggleTheme, calculateSLA, formatTimeRemaining, toast } from '../utils.js';
import { ICONS } from '../icons.js';

const LOGO = new URL('../assets/logo.png', import.meta.url).href;

// ────────────────────────────────────────────────────────────────────
// WhatsApp OTP — DEV MODE
// ────────────────────────────────────────────────────────────────────
// For free testing, plug in Meta WhatsApp Cloud API:
//   1. Create a Meta developer account → register a WhatsApp Business app.
//   2. Use the free test phone number Meta provides (1000 free conversations/month).
//   3. Add an authentication template (e.g. "otp_code") with one body variable.
//   4. Move the call below into a Supabase Edge Function so the access token
//      stays server-side. Replace the body of `sendWhatsAppOTP` with:
//
//      await fetch(`https://graph.facebook.com/v20.0/${PHONE_ID}/messages`, {
//        method: 'POST',
//        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
//        body: JSON.stringify({
//          messaging_product: 'whatsapp',
//          to: phone,
//          type: 'template',
//          template: { name: 'otp_code', language: { code: 'en_US' },
//            components: [{ type: 'body', parameters: [{ type: 'text', text: code }] }] }
//        })
//      });
// ────────────────────────────────────────────────────────────────────
const DEV_OTP_MODE = true;

async function sendWhatsAppOTP(phone, code) {
  if (DEV_OTP_MODE) {
    console.info(`[DEV] WhatsApp OTP for ${phone}: ${code}`);
    return { ok: true, dev: true };
  }
  // Real provider call goes here (via Supabase Edge Function).
  return { ok: false, error: 'WhatsApp provider not configured' };
}

async function sendWhatsAppTicket(phone, ticketNo) {
  if (DEV_OTP_MODE) {
    console.info(`[DEV] WhatsApp ticket confirmation for ${phone}: ${ticketNo}`);
    return { ok: true, dev: true };
  }
  return { ok: false, error: 'WhatsApp provider not configured' };
}

function generateTicketNo() {
  // NE-YYMMDD-XXXX (4-digit random)
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rnd = String(Math.floor(1000 + Math.random() * 9000));
  return `NE-${yy}${mm}${dd}-${rnd}`;
}

const STATUS_FLOW = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];
const STATUS_LABELS = {
  pending: 'Received',
  open: 'Received',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const ISSUE_OPTIONS = [
  { value: 'internet-down', label: 'Internet down' },
  { value: 'slow-connection', label: 'Slow connection' },
  { value: 'wifi-issue', label: 'Wi-Fi issue' },
  { value: 'cctv-not-working', label: 'CCTV not working' },
  { value: 'camera-offline', label: 'Camera offline' },
  { value: 'hardware-repair', label: 'Hardware repair' },
  { value: 'software-issue', label: 'Software issue' },
  { value: 'new-installation', label: 'New installation' },
  { value: 'other', label: 'Other (specify below)' },
];

// ────────────────────────────────────────────────────────────────────
// State + flow
// ────────────────────────────────────────────────────────────────────
export function renderLandingPage(container, onPortalClick) {
  const state = {
    mode: 'new', // 'new' | 'track'
    step: 1, // 1=phone+captcha, 2=otp, 3=form, 4=success
    phone: '',
    otp: '',
    expectedOTP: '',
    captcha: makeCaptcha(),
    locationMode: 'gps', // 'gps' | 'manual'
    locationValue: '',
    coords: null,
    ticketNo: '',         // generated on submit, shown on success
    // tracker state
    trackTicketNo: '',
    trackPhone: '',
    trackResult: null,    // inquiry row or null
    trackLoading: false,
  };

  function render() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const themeIcon = savedTheme === 'dark' ? ICONS.sun : ICONS.moon;

    container.innerHTML = `
      <div class="srf-page">
        <div class="srf-bg-orb srf-orb-1"></div>
        <div class="srf-bg-orb srf-orb-2"></div>
        <div class="srf-bg-orb srf-orb-3"></div>

        <nav class="srf-nav">
          <img src="${LOGO}" alt="Networking Experts" class="srf-logo"
               onerror="this.outerHTML='<span class=\\'srf-brand\\'>Networking Experts</span>'"/>
          <div class="srf-nav-actions">
            <button class="srf-icon-btn theme-toggle-btn" title="Toggle theme">${themeIcon}</button>
            <button class="srf-icon-btn srf-staff-btn" title="Staff Login">${ICONS.staff}</button>
          </div>
        </nav>

        <main class="srf-main">
          <section class="srf-intro">
            <div class="srf-badge">${ICONS.shield}<span>Verified Service Request</span></div>
            <h1 class="srf-title">Need help?<br/><span class="srf-grad">We'll be there in minutes.</span></h1>
            <p class="srf-sub">Raise a service request in three quick steps. We'll send a one-time code on WhatsApp, take your details, and dispatch the right technician.</p>
            <ul class="srf-perks">
              <li>${ICONS.whatsapp}<span>WhatsApp verification</span></li>
              <li>${ICONS.crosshair}<span>Auto-detect your location</span></li>
              <li>${ICONS.wrench}<span>Specialised technicians</span></li>
            </ul>
          </section>

          <section class="srf-card-wrap">
            <div class="srf-mode-tabs" role="tablist">
              <button class="srf-mode-tab ${state.mode === 'new' ? 'active' : ''}" data-mode="new" role="tab">
                ${ICONS.wrench}<span>New Request</span>
              </button>
              <button class="srf-mode-tab ${state.mode === 'track' ? 'active' : ''}" data-mode="track" role="tab">
                ${ICONS.search}<span>Track Request</span>
              </button>
            </div>

            ${state.mode === 'new' ? `
              <div class="srf-stepper">
                ${[1, 2, 3].map(n => `
                  <div class="srf-step ${state.step === n ? 'active' : ''} ${state.step > n ? 'done' : ''}">
                    <div class="srf-step-dot">${state.step > n ? ICONS.check : n}</div>
                    <span>${['Verify', 'OTP', 'Details'][n - 1]}</span>
                  </div>
                  ${n < 3 ? `<div class="srf-step-line ${state.step > n ? 'done' : ''}"></div>` : ''}
                `).join('')}
              </div>
            ` : ''}

            <div class="srf-card" id="srf-card">
              ${renderStep()}
            </div>
          </section>
        </main>
      </div>
    `;

    bindCommon();
    bindStep();
  }

  function renderStep() {
    if (state.mode === 'track') return stepTrack();
    if (state.step === 1) return stepPhone();
    if (state.step === 2) return stepOTP();
    if (state.step === 3) return stepForm();
    return stepSuccess();
  }

  // ── STEP 1: phone + captcha ──────────────────────────
  function stepPhone() {
    return `
      <h2 class="srf-card-title">Enter your WhatsApp number</h2>
      <p class="srf-card-sub">We'll send a one-time code to verify it's you.</p>

      <label class="srf-label" for="srf-phone">Phone number</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.phone}</span>
        <span class="srf-cc">+91</span>
        <input id="srf-phone" type="tel" inputmode="numeric" maxlength="10"
               placeholder="98765 43210" class="srf-input srf-input-cc" value="${state.phone}" />
      </div>

      <label class="srf-label" for="srf-captcha">Quick check: ${state.captcha.a} + ${state.captcha.b} = ?</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.shield}</span>
        <input id="srf-captcha" type="number" inputmode="numeric"
               placeholder="Enter the answer" class="srf-input" />
        <button type="button" class="srf-input-action" id="srf-refresh-captcha" title="New question">${ICONS.refresh}</button>
      </div>

      <button class="srf-btn srf-btn-primary" id="srf-send-otp">
        <span>Send OTP on WhatsApp</span> ${ICONS.arrowRight}
      </button>

      <p class="srf-fineprint">${ICONS.shield}<span>Your number is only used to verify and contact you about this request.</span></p>
    `;
  }

  // ── STEP 2: OTP ──────────────────────────────────────
  function stepOTP() {
    return `
      <button class="srf-back" id="srf-back">${ICONS.arrowLeft}<span>Back</span></button>
      <h2 class="srf-card-title">Enter the 6-digit code</h2>
      <p class="srf-card-sub">Sent on WhatsApp to <strong>+91 ${formatPhone(state.phone)}</strong></p>

      <div class="srf-otp-row">
        ${Array.from({ length: 6 }).map((_, i) => `
          <input class="srf-otp-box" maxlength="1" inputmode="numeric" data-idx="${i}" />
        `).join('')}
      </div>

      ${DEV_OTP_MODE ? `<div class="srf-dev-hint">${ICONS.shield}<span>Dev mode: your code is <strong>${state.expectedOTP}</strong></span></div>` : ''}

      <button class="srf-btn srf-btn-primary" id="srf-verify-otp">
        <span>Verify & continue</span> ${ICONS.arrowRight}
      </button>

      <button class="srf-btn-link" id="srf-resend">Resend code</button>
    `;
  }

  // ── STEP 3: service form ─────────────────────────────
  function stepForm() {
    return `
      <h2 class="srf-card-title">Tell us what's wrong</h2>
      <p class="srf-card-sub">A few quick details so we can help fast.</p>

      <label class="srf-label" for="srf-name">Your name</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.user}</span>
        <input id="srf-name" type="text" placeholder="Full name" class="srf-input" />
      </div>

      <label class="srf-label">Location</label>
      <div class="srf-segmented">
        <button type="button" data-mode="gps" class="srf-seg ${state.locationMode === 'gps' ? 'active' : ''}">
          ${ICONS.crosshair}<span>Current</span>
        </button>
        <button type="button" data-mode="manual" class="srf-seg ${state.locationMode === 'manual' ? 'active' : ''}">
          ${ICONS.edit}<span>Manual</span>
        </button>
      </div>

      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.pin}</span>
        <input id="srf-location" type="text"
               placeholder="${state.locationMode === 'gps' ? 'Tap "Detect" to auto-fill…' : 'Type your address…'}"
               class="srf-input" value="${state.locationValue}" ${state.locationMode === 'gps' ? 'readonly' : ''}/>
        ${state.locationMode === 'gps' ? `<button type="button" class="srf-input-action" id="srf-detect">${ICONS.crosshair}</button>` : ''}
      </div>

      <label class="srf-label" for="srf-time">Preferred Visit Time</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.clock}</span>
        <select id="srf-time" class="srf-input srf-select">
          <option value="Morning (10 AM - 1 PM)">Morning (10 AM - 1 PM)</option>
          <option value="Afternoon (1 PM - 4 PM)">Afternoon (1 PM - 4 PM)</option>
          <option value="Evening (4 PM - 6 PM)">Evening (4 PM - 6 PM)</option>
          <option value="Tomorrow Morning">Tomorrow Morning</option>
          <option value="Flexible">I'm Flexible</option>
        </select>
      </div>

      <label class="srf-label" for="srf-bill">Device bill number <span class="srf-optional">(optional)</span></label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.receipt}</span>
        <input id="srf-bill" type="text" placeholder="e.g. INV-2024-001" class="srf-input" />
      </div>

      <label class="srf-label" for="srf-issue">What's the issue?</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.wrench}</span>
        <select id="srf-issue" class="srf-input srf-select">
          <option value="">Select an issue…</option>
          ${ISSUE_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
        </select>
      </div>

      <div class="srf-input-wrap srf-other-wrap" id="srf-other-wrap" style="display:none;">
        <span class="srf-input-icon">${ICONS.edit}</span>
        <input id="srf-other" type="text" placeholder="Describe your issue briefly" class="srf-input" />
      </div>

      <button class="srf-btn srf-btn-primary" id="srf-submit">
        <span>Submit request</span> ${ICONS.arrowRight}
      </button>
    `;
  }

  // ── STEP 4: success ──────────────────────────────────
  function stepSuccess() {
    return `
      <div class="srf-success">
        <div class="srf-success-ring">${ICONS.check}</div>
        <h2 class="srf-card-title">Request received!</h2>
        <p class="srf-card-sub">Save your ticket number — you can track progress anytime from the <strong>Track Request</strong> tab.</p>

        <div class="srf-ticket-pill">
          ${ICONS.ticket}
          <span class="srf-ticket-no" id="srf-ticket-no">${state.ticketNo}</span>
          <button type="button" class="srf-input-action" id="srf-copy-ticket" title="Copy">${ICONS.clipboard}</button>
        </div>

        <p class="srf-fineprint" style="justify-content:center;text-align:center;">
          ${ICONS.whatsapp}<span>A confirmation has been sent to your WhatsApp.</span>
        </p>

        <button class="srf-btn srf-btn-primary" id="srf-track-now">
          <span>Track this request</span> ${ICONS.arrowRight}
        </button>
        <button class="srf-btn-link" id="srf-new">Submit another request</button>
      </div>
    `;
  }

  // ── TRACK MODE ──────────────────────────────────────
  function stepTrack() {
    const r = state.trackResult;
    if (!r) {
      return `
        <h2 class="srf-card-title">Track your request</h2>
        <p class="srf-card-sub">Enter your ticket number and the WhatsApp number you used.</p>

        <label class="srf-label" for="srf-track-tno">Ticket number</label>
        <div class="srf-input-wrap">
          <span class="srf-input-icon">${ICONS.ticket}</span>
          <input id="srf-track-tno" type="text" placeholder="NE-260506-1234" class="srf-input"
                 value="${state.trackTicketNo}" autocomplete="off"/>
        </div>

        <label class="srf-label" for="srf-track-phone">Phone number</label>
        <div class="srf-input-wrap">
          <span class="srf-input-icon">${ICONS.phone}</span>
          <span class="srf-cc">+91</span>
          <input id="srf-track-phone" type="tel" inputmode="numeric" maxlength="10"
                 placeholder="98765 43210" class="srf-input srf-input-cc" value="${state.trackPhone}"/>
        </div>

        <button class="srf-btn srf-btn-primary" id="srf-track-go" ${state.trackLoading ? 'disabled' : ''}>
          ${state.trackLoading ? '<span class="srf-spin"></span>' : ''}<span>Get status</span> ${ICONS.arrowRight}
        </button>
      `;
    }
    return renderTrackResult(r);
  }

  function renderTrackResult(r) {
    const status = r.status || 'open';
    const flowIdx = STATUS_FLOW.indexOf(status === 'pending' ? 'open' : status);
    const closed = status === 'closed';
    const hasBill = r.bill_amount != null && Number(r.bill_amount) > 0;
    const paid = r.payment_status === 'paid';
    const hasFeedback = r.feedback_rating != null;

    return `
      <button class="srf-back" id="srf-track-back">${ICONS.arrowLeft}<span>Look up another</span></button>
      <h2 class="srf-card-title">Ticket ${r.ticket_no || r.id.slice(0, 8)}</h2>
      <p class="srf-card-sub">${r.full_name} · ${r.service_item}</p>

      ${!closed ? `
        <div style="background:var(--bg-soft); padding:16px; border-radius:16px; margin:20px 0; border:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Service SLA</div>
            <div style="font-size:0.9rem; color:var(--text-soft); margin-top:4px;">Expected resolution within 12 working hours</div>
          </div>
          <div id="live-sla-timer" style="font-family:monospace; font-weight:900; font-size:1.4rem; color:var(--primary); letter-spacing:-0.5px;">
            ${formatTimeRemaining(calculateSLA(r.created_at))}
          </div>
        </div>
      ` : ''}

      <div class="srf-timeline">
        ${STATUS_FLOW.map((s, i) => `
          <div class="srf-tl-step ${i <= flowIdx ? 'done' : ''} ${i === flowIdx ? 'current' : ''}">
            <div class="srf-tl-dot">${i <= flowIdx ? ICONS.check : i + 1}</div>
            <div class="srf-tl-label">${STATUS_LABELS[s]}</div>
          </div>
          ${i < STATUS_FLOW.length - 1 ? `<div class="srf-tl-line ${i < flowIdx ? 'done' : ''}"></div>` : ''}
        `).join('')}
      </div>

      ${hasBill ? `
        <div class="srf-bill-card">
          <div class="srf-bill-row">
            <div class="srf-bill-icon">${ICONS.rupee}</div>
            <div class="srf-bill-info">
              <div class="srf-bill-label">${paid ? 'Amount paid' : 'Amount due'}</div>
              <div class="srf-bill-amount">₹${Number(r.bill_amount).toLocaleString('en-IN')}</div>
            </div>
            ${paid
              ? `<span class="srf-bill-paid">${ICONS.check}<span>Paid</span></span>`
              : (r.payment_link
                  ? `<a class="srf-btn srf-btn-primary srf-pay-btn" href="${escapeAttr(r.payment_link)}" target="_blank" rel="noopener">${ICONS.card}<span>Pay now</span></a>`
                  : `<span class="srf-bill-pending">${ICONS.hourglass}<span>Link pending</span></span>`)
            }
          </div>
        </div>
      ` : ''}

      ${closed && !hasFeedback ? `
        <div class="srf-feedback">
          <h3 class="srf-fb-title">How did we do?</h3>
          <p class="srf-fb-sub">A quick rating helps our technicians improve.</p>
          <div class="srf-stars" id="srf-stars" data-rating="0">
            ${[1,2,3,4,5].map(n => `<button type="button" class="srf-star" data-val="${n}">${ICONS.starOutline}</button>`).join('')}
          </div>
          <div class="srf-input-wrap">
            <span class="srf-input-icon">${ICONS.edit}</span>
            <input id="srf-fb-comment" type="text" placeholder="Optional comment…" class="srf-input"/>
          </div>
          <button class="srf-btn srf-btn-primary" id="srf-fb-submit">
            <span>Submit feedback</span> ${ICONS.arrowRight}
          </button>
        </div>
      ` : ''}

      ${closed && hasFeedback ? `
        <div class="srf-dev-hint" style="border-style:solid;">
          ${ICONS.star}<span>Thanks for your feedback — you rated us <strong>${r.feedback_rating}/5</strong>.</span>
        </div>
      ` : ''}
    `;
  }

  // ── Bindings ─────────────────────────────────────────
  function bindCommon() {
    container.querySelector('.theme-toggle-btn').onclick = () => { toggleTheme(); render(); };
    container.querySelector('.srf-staff-btn').onclick = () => onPortalClick();
    container.querySelectorAll('.srf-mode-tab').forEach(t => {
      t.onclick = () => {
        if (state.mode === t.dataset.mode) return;
        state.mode = t.dataset.mode;
        if (state.mode === 'track') {
          state.trackResult = null;
        }
        render();
      };
    });
  }

  function bindStep() {
    if (state.mode === 'track') return bindTrack();
    if (state.step === 1) bindPhone();
    else if (state.step === 2) bindOTP();
    else if (state.step === 3) bindForm();
    else bindSuccess();
  }

  function bindPhone() {
    const phoneEl = container.querySelector('#srf-phone');
    const capEl = container.querySelector('#srf-captcha');
    const sendBtn = container.querySelector('#srf-send-otp');

    phoneEl.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
      state.phone = e.target.value;
    });

    container.querySelector('#srf-refresh-captcha').onclick = () => {
      state.captcha = makeCaptcha();
      render();
    };

    sendBtn.onclick = async () => {
      if (!/^\d{10}$/.test(state.phone)) return toast('Enter a valid 10-digit number', 'error');
      const ans = parseInt(capEl.value, 10);
      if (ans !== state.captcha.a + state.captcha.b) {
        toast('Captcha is incorrect', 'error');
        state.captcha = makeCaptcha();
        return render();
      }

      sendBtn.disabled = true;
      sendBtn.innerHTML = `<span class="srf-spin"></span><span>Sending…</span>`;
      const code = String(Math.floor(100000 + Math.random() * 900000));
      state.expectedOTP = code;
      const res = await sendWhatsAppOTP('+91' + state.phone, code);
      if (!res.ok) { toast(res.error || 'Could not send OTP', 'error'); render(); return; }
      if (res.dev) toast('Dev OTP shown on screen — check console', 'info');
      else toast('OTP sent on WhatsApp', 'success');
      state.step = 2;
      render();
    };
  }

  function bindOTP() {
    const boxes = [...container.querySelectorAll('.srf-otp-box')];
    boxes[0]?.focus();
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        b.value = b.value.replace(/\D/g, '');
        if (b.value && i < boxes.length - 1) boxes[i + 1].focus();
      });
      b.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !b.value && i > 0) boxes[i - 1].focus();
      });
      b.addEventListener('paste', e => {
        const txt = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        if (!txt) return;
        e.preventDefault();
        boxes.forEach((bx, ix) => bx.value = txt[ix] || '');
        boxes[Math.min(txt.length, 5)].focus();
      });
    });

    container.querySelector('#srf-back').onclick = () => { state.step = 1; render(); };

    container.querySelector('#srf-verify-otp').onclick = () => {
      const entered = boxes.map(b => b.value).join('');
      if (entered.length !== 6) return toast('Enter the full 6-digit code', 'error');
      if (entered !== state.expectedOTP) return toast('Incorrect code', 'error');
      state.step = 3;
      render();
    };

    container.querySelector('#srf-resend').onclick = async () => {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      state.expectedOTP = code;
      await sendWhatsAppOTP('+91' + state.phone, code);
      toast('New code sent', 'success');
      render();
    };
  }

  function bindForm() {
    const issueEl = container.querySelector('#srf-issue');
    const otherWrap = container.querySelector('#srf-other-wrap');
    issueEl.onchange = () => {
      otherWrap.style.display = issueEl.value === 'other' ? '' : 'none';
    };

    container.querySelectorAll('.srf-seg').forEach(seg => {
      seg.onclick = () => {
        state.locationMode = seg.dataset.mode;
        state.locationValue = '';
        state.coords = null;
        render();
      };
    });

    const detectBtn = container.querySelector('#srf-detect');
    if (detectBtn) {
      detectBtn.onclick = () => {
        if (!navigator.geolocation) return toast('Geolocation not supported', 'error');
        detectBtn.innerHTML = `<span class="srf-spin"></span>`;
        navigator.geolocation.getCurrentPosition(
          async pos => {
            const { latitude: lat, longitude: lng } = pos.coords;
            state.coords = { lat, lng };
            
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
              const data = await res.json();
              state.locationValue = data.display_name || `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            } catch (err) {
              console.error('Reverse geocoding failed:', err);
              state.locationValue = `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            }
            
            container.querySelector('#srf-location').value = state.locationValue;
            detectBtn.innerHTML = ICONS.crosshair;
            toast('Location detected', 'success');
          },
          () => {
            toast('Could not detect location — switch to Manual', 'error');
            detectBtn.innerHTML = ICONS.crosshair;
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      };
    }

    const locEl = container.querySelector('#srf-location');
    locEl.addEventListener('input', e => { state.locationValue = e.target.value; });

    container.querySelector('#srf-submit').onclick = async () => {
      const name = container.querySelector('#srf-name').value.trim();
      const bill = container.querySelector('#srf-bill').value.trim();
      const preferred_time = container.querySelector('#srf-time').value;
      const issueVal = issueEl.value;
      const issueLabel = ISSUE_OPTIONS.find(o => o.value === issueVal)?.label || '';
      const otherText = container.querySelector('#srf-other')?.value.trim() || '';

      if (!name) return toast('Please enter your name', 'error');
      if (!state.locationValue) return toast('Please add your location', 'error');
      if (!issueVal) return toast('Please pick an issue', 'error');
      if (issueVal === 'other' && !otherText) return toast('Please describe the issue', 'error');

      const service_item = issueVal === 'other' ? `Other: ${otherText}` : issueLabel;
      const submitBtn = container.querySelector('#srf-submit');
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="srf-spin"></span><span>Submitting…</span>`;

      const ticket_no = generateTicketNo();
      const { error } = await supabase.from('inquiries').insert({
        full_name: name,
        phone: '+91' + state.phone,
        location: state.locationValue,
        bill_no: bill || null,
        service_item,
        status: 'open',
        assignment_status: 'none',
        ticket_no,
        preferred_time
      });

      if (error) {
        toast(error.code === '42501'
          ? 'Submission blocked by database policy. Ask admin to run migrations.sql.'
          : 'Could not submit — please try again', 'error');
        console.error(error);
        render();
        return;
      }

      state.ticketNo = ticket_no;
      await sendWhatsAppTicket('+91' + state.phone, ticket_no);
      toast('Request submitted', 'success');
      state.step = 4;
      render();
    };
  }

  function bindSuccess() {
    container.querySelector('#srf-copy-ticket').onclick = async () => {
      try {
        await navigator.clipboard.writeText(state.ticketNo);
        toast('Ticket number copied', 'success');
      } catch {
        toast('Copy failed — select and copy manually', 'error');
      }
    };

    container.querySelector('#srf-track-now').onclick = () => {
      state.mode = 'track';
      state.trackTicketNo = state.ticketNo;
      state.trackPhone = state.phone;
      state.trackResult = null;
      render();
    };

    container.querySelector('#srf-new').onclick = () => {
      state.step = 1;
      state.phone = '';
      state.otp = '';
      state.expectedOTP = '';
      state.ticketNo = '';
      state.captcha = makeCaptcha();
      state.locationMode = 'gps';
      state.locationValue = '';
      state.coords = null;
      render();
    };
  }

  function bindTrack() {
    if (state.trackResult) {
      container.querySelector('#srf-track-back').onclick = () => {
        state.trackResult = null;
        render();
      };

      const stars = container.querySelector('#srf-stars');
      if (stars) {
        const starButtons = [...stars.querySelectorAll('.srf-star')];
        let chosen = 0;
        const paint = (val) => {
          starButtons.forEach((b, i) => {
            b.innerHTML = i < val ? ICONS.star : ICONS.starOutline;
            b.classList.toggle('on', i < val);
          });
        };
        starButtons.forEach((b, i) => {
          b.onmouseenter = () => paint(i + 1);
          b.onmouseleave = () => paint(chosen);
          b.onclick = () => { chosen = i + 1; stars.dataset.rating = chosen; paint(chosen); };
        });

        container.querySelector('#srf-fb-submit').onclick = async () => {
          if (!chosen) return toast('Please pick a star rating', 'error');
          const comment = container.querySelector('#srf-fb-comment').value.trim();
          const btn = container.querySelector('#srf-fb-submit');
          btn.disabled = true;
          btn.innerHTML = `<span class="srf-spin"></span><span>Submitting…</span>`;
          const { error } = await supabase.from('inquiries').update({
            feedback_rating: chosen,
            feedback_comment: comment || null,
            feedback_at: new Date().toISOString(),
          }).eq('id', state.trackResult.id);
          if (error) {
            toast('Could not submit feedback', 'error');
            console.error(error);
            btn.disabled = false;
            btn.innerHTML = `<span>Submit feedback</span> ${ICONS.arrowRight}`;
            return;
          }
          state.trackResult = { ...state.trackResult, feedback_rating: chosen, feedback_comment: comment || null };
          toast('Thanks for your feedback!', 'success');
          render();
        };
      }
      return;
    }

    const tnoEl = container.querySelector('#srf-track-tno');
    const phEl = container.querySelector('#srf-track-phone');
    tnoEl.addEventListener('input', e => { state.trackTicketNo = e.target.value.trim().toUpperCase(); e.target.value = state.trackTicketNo; });
    phEl.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
      state.trackPhone = e.target.value;
    });

    container.querySelector('#srf-track-go').onclick = async () => {
      const tno = state.trackTicketNo;
      const ph = state.trackPhone;
      if (!tno) return toast('Enter your ticket number', 'error');
      if (!/^\d{10}$/.test(ph)) return toast('Enter a valid 10-digit number', 'error');

      state.trackLoading = true;
      render();

      const { data, error } = await supabase.from('inquiries')
        .select('*')
        .eq('ticket_no', tno)
        .eq('phone', '+91' + ph)
        .maybeSingle();

      state.trackLoading = false;
      if (error) {
        console.error(error);
        toast('Lookup failed', 'error');
        render();
        return;
      }
      if (!data) {
        toast('No matching ticket. Check the number and phone.', 'error');
        render();
        return;
      }
      state.trackResult = data;
      render();
    };

    // Live SLA Timer update for tracker
    const timerEl = container.querySelector('#live-sla-timer');
    if (timerEl && state.trackResult && state.trackResult.status !== 'closed') {
      const interval = setInterval(() => {
        if (!container.querySelector('#live-sla-timer')) return clearInterval(interval);
        timerEl.innerHTML = formatTimeRemaining(calculateSLA(state.trackResult.created_at));
      }, 1000);
    }
  }

  render();
}

// ────────────────────────────────────────────────────────────────────
function makeCaptcha() {
  return { a: 1 + Math.floor(Math.random() * 8), b: 1 + Math.floor(Math.random() * 8) };
}

function formatPhone(p) {
  return p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p;
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
