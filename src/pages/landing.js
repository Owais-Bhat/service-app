import { supabase } from '../supabase.js';
import { toggleTheme, calculateSLA, toast } from '../utils.js';
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
// Defaults ON so a real WhatsApp provider isn't required to demo the flow.
// Set VITE_DEV_OTP_MODE=false in Vercel env (and redeploy) once the provider is wired up.
const DEV_OTP_MODE = String(import.meta.env.VITE_DEV_OTP_MODE ?? 'true').toLowerCase() !== 'false';

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

const STATUS_FLOW = ['open', 'assigned', 'in_progress', 'resolved'];
const STATUS_LABELS = {
  pending: 'Received',
  open: 'Received',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Resolved',
};

function displayStatus(status) {
  return status === 'closed' ? 'resolved' : (status || 'open');
}

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
  // Read URL params — support ?tab=track&ticket=NE-...&phone=...
  const urlParams = new URLSearchParams(window.location.search);
  const urlTab    = urlParams.get('tab');
  const urlTicket = urlParams.get('ticket') || '';
  const urlPhone  = (urlParams.get('phone') || '').replace(/^\+91/, '').replace(/\D/g, '');

  const state = {
    mode: urlTab === 'track' ? 'track' : 'new',
    step: 1,
    phone: '',
    otp: '',
    expectedOTP: '',
    captcha: makeCaptcha(),
    locationMode: 'gps',
    locationValue: '',
    coords: null,
    ticketNo: '',
    trackTicketNo: urlTicket,
    trackPhone: urlPhone,
    trackResult: null,
    trackList: null,
    trackLoading: false,
    // Complaint tab state
    complaintTicketNo: '',
    complaintPhone: '',
    complaintText: '',
    complaintLoading: false,
    complaintSubmitted: false,
    // Ads carousel state
    ads: [],
    _adTimer: null,
  };

  function render() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const themeIcon = savedTheme === 'dark' ? ICONS.sun : ICONS.moon;

    container.innerHTML = `
      <style>
        @media (max-width: 640px) { .srf-nav-title { display: none !important; } }
        @keyframes srfAdZoom {
          0% { transform: scale(1); }
          100% { transform: scale(1.08); }
        }
        @keyframes srfFadeUp {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      </style>
      <div class="srf-page">
        <div class="srf-bg-orb srf-orb-1"></div>
        <div class="srf-bg-orb srf-orb-2"></div>
        <div class="srf-bg-orb srf-orb-3"></div>

        <nav class="srf-nav">
          <div style="display:flex; align-items:center; gap:16px;">
            <img src="${LOGO}" alt="Networking Experts" class="srf-logo"
                 onerror="this.outerHTML='<span class=\\'srf-brand\\'>Networking Experts</span>'"/>
            <div class="srf-nav-title">
              <span style="font-weight:800; color:var(--text); font-size:1.1rem;">Need help?</span> <span class="srf-grad" style="font-size:1.1rem;">We'll be there in minutes.</span>
            </div>
          </div>
          <div class="srf-nav-actions">
            <button class="srf-icon-btn theme-toggle-btn" title="Toggle theme">${themeIcon}</button>
            <button class="srf-icon-btn srf-staff-btn" title="Staff Login">${ICONS.staff}</button>
          </div>
        </nav>

        <section class="srf-top-banner" style="max-width:1400px; margin:0 auto; padding: 24px 40px 0; text-align:center;">
          <div style="display:flex; justify-content:center; gap:32px; flex-wrap:wrap;">
             <div style="display:flex; align-items:center; gap:12px; font-weight:700; color:var(--text); font-size:1.05rem;">
               <span style="width:44px; height:44px; border-radius:14px; background:rgba(37,211,102,0.15); color:#25D366; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px rgba(37,211,102,0.12);">
                 ${ICONS.whatsapp}
               </span> 
               WhatsApp verification
             </div>
             <div style="display:flex; align-items:center; gap:12px; font-weight:700; color:var(--text); font-size:1.05rem;">
               <span style="width:44px; height:44px; border-radius:14px; background:rgba(56,189,248,0.15); color:var(--primary); display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px rgba(56,189,248,0.12);">
                 ${ICONS.crosshair}
               </span> 
               Auto-detect location
             </div>
             <div style="display:flex; align-items:center; gap:12px; font-weight:700; color:var(--text); font-size:1.05rem;">
               <span style="width:44px; height:44px; border-radius:14px; background:rgba(245,158,11,0.15); color:var(--warning); display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px rgba(245,158,11,0.12);">
                 ${ICONS.wrench}
               </span> 
               Specialised technicians
             </div>
          </div>
        </section>

        <main class="srf-main" style="align-items: flex-start; padding-top: 32px;">
          <section class="srf-intro">
            ${state.ads.length > 0 ? `
              <div class="srf-ads" id="srf-ads" style="width:100%; max-width:800px; margin:0 auto; border-radius:24px; overflow:hidden; box-shadow:0 12px 32px rgba(0,0,0,0.1); background:var(--bg-soft);">
                <div class="srf-ad-slot" id="srf-ad-slot" style="height:350px; position:relative; overflow:hidden; background:#000;"></div>
                ${state.ads.length > 1 ? `
                  <div class="srf-ad-dots" id="srf-ad-dots" style="display:flex; justify-content:center; gap:8px; padding:12px; background:var(--bg-soft);">
                    ${state.ads.map((_, i) => `<button type="button" class="srf-ad-dot" data-idx="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}
                  </div>
                ` : ''}
              </div>
            ` : `
               <div style="text-align:center; padding: 40px; border-radius:24px; background:var(--bg-soft); box-shadow:var(--neu); height: 350px; display:flex; flex-direction:column; align-items:center; justify-content:center; max-width:800px; margin:0 auto;">
                  <h2 style="font-size:1.5rem; font-weight:800; color:var(--text); margin-bottom:12px;">Welcome to Networking Experts</h2>
                  <p style="color:var(--text-soft); font-size:1rem;">Your trusted partner for all networking needs.</p>
               </div>
            `}
          </section>

          <section class="srf-card-wrap">
            <div class="srf-mode-tabs" role="tablist">
              <button class="srf-mode-tab ${state.mode === 'new' ? 'active' : ''}" data-mode="new" role="tab">
                ${ICONS.wrench}<span>New Request</span>
              </button>
              <button class="srf-mode-tab ${state.mode === 'track' ? 'active' : ''}" data-mode="track" role="tab">
                ${ICONS.search}<span>Track Request</span>
              </button>
              <button class="srf-mode-tab ${state.mode === 'complaint' ? 'active' : ''}" data-mode="complaint" role="tab">
                ${ICONS.shield}<span>Complaint</span>
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
    mountAdCarousel();
  }

  function mountAdCarousel() {
    if (state._adTimer) { clearTimeout(state._adTimer); state._adTimer = null; }
    if (!state.ads.length) return;
    const slot = container.querySelector('#srf-ad-slot');
    if (!slot) return;
    const dots = [...container.querySelectorAll('.srf-ad-dot')];
    let idx = 0;

    const paint = () => {
      const ad = state.ads[idx];
      const isVideo = (ad.kind || 'image').toLowerCase() === 'video';
      const media = isVideo
        ? `<video src="${escapeAttr(ad.url)}" autoplay muted loop playsinline style="width:100%; height:100%; object-fit:cover; animation: srfAdZoom 15s alternate infinite ease-in-out;"></video>`
        : `<img src="${escapeAttr(ad.url)}" alt="${escapeAttr(ad.caption || 'Advertisement')}" style="width:100%; height:100%; object-fit:cover; animation: srfAdZoom 15s alternate infinite ease-in-out;" loading="lazy"/>`;
      
      const captionHtml = ad.caption 
        ? `<div style="position:absolute; bottom:0; left:0; right:0; padding:60px 24px 24px; background:linear-gradient(transparent, rgba(0,0,0,0.85)); display:flex; flex-direction:column; justify-content:flex-end;">
             <span style="color:#fff; font-size:1.15rem; font-weight:700; letter-spacing:0.02em; text-shadow:0 2px 6px rgba(0,0,0,0.6); animation: srfFadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;">${escapeHTML(ad.caption)}</span>
           </div>` 
        : '';

      slot.innerHTML = `${media}${captionHtml}`;
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    };

    const schedule = () => {
      if (state._adTimer) clearTimeout(state._adTimer);
      if (state.ads.length <= 1) return;
      const ms = Math.max(1500, Number(state.ads[idx].duration_ms) || 6000);
      state._adTimer = setTimeout(() => {
        idx = (idx + 1) % state.ads.length;
        paint();
        schedule();
      }, ms);
    };

    dots.forEach((d, i) => {
      d.onclick = () => { idx = i; paint(); schedule(); };
    });

    paint();
    schedule();
  }

  async function loadAds() {
    try {
      const { data } = await supabase.from('ads')
        .select('*')
        .eq('active', 1)
        .order('position', { ascending: true });
      
      const now = new Date().getTime();
      const ads = (data || []).filter(a => {
        if (!a.url || (a.kind !== 'image' && a.kind !== 'video')) return false;
        if (a.starts_at && new Date(a.starts_at).getTime() > now) return false;
        if (a.expires_at && new Date(a.expires_at).getTime() <= now) return false;
        return true;
      });

      if (ads.length) {
        state.ads = ads;
        render();
      }
    } catch (err) {
      console.warn('Could not load ads:', err);
    }
  }

  function renderStep() {
    if (state.mode === 'track') return stepTrack();
    if (state.mode === 'complaint') return stepComplaint();
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

      ${DEV_OTP_MODE ? `
        <button class="srf-btn srf-btn-secondary" id="srf-demo-fill" style="margin-top:12px; background:rgba(16,185,129,0.1); border:1px dashed var(--primary); color:var(--primary);">
          ${ICONS.shield} <span>Fill Demo Data</span>
        </button>
      ` : ''}

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

      ${DEV_OTP_MODE ? `
        <button class="srf-btn srf-btn-secondary" id="srf-demo-fill-form" style="margin-top:12px; background:rgba(16,185,129,0.1); border:1px dashed var(--primary); color:var(--primary);">
          ${ICONS.shield} <span>Fill Demo Details</span>
        </button>
      ` : ''}

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

  // ── COMPLAINT MODE ──────────────────────────────────
  function stepComplaint() {
    if (state.complaintSubmitted) {
      return `
        <div class="srf-success">
          <div class="srf-success-ring">${ICONS.check}</div>
          <h2 class="srf-card-title">Complaint received</h2>
          <p class="srf-card-sub">Our team has been notified and will follow up on ticket <strong>${state.complaintTicketNo}</strong> soon.</p>
          <button class="srf-btn srf-btn-primary" id="srf-complaint-another">
            <span>File another complaint</span> ${ICONS.arrowRight}
          </button>
          <button class="srf-btn-link" id="srf-complaint-to-track">Track this ticket instead</button>
        </div>
      `;
    }
    return `
      <h2 class="srf-card-title">File a complaint</h2>
      <p class="srf-card-sub">Tell us what went wrong with a previous service. We verify the ticket against your WhatsApp number before forwarding it to the team.</p>

      <label class="srf-label" for="srf-cmp-tno">Ticket number</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.ticket}</span>
        <input id="srf-cmp-tno" type="text" placeholder="NE-260506-1234" class="srf-input"
               value="${state.complaintTicketNo}" autocomplete="off"/>
      </div>

      <label class="srf-label" for="srf-cmp-phone">Phone number</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.phone}</span>
        <span class="srf-cc">+91</span>
        <input id="srf-cmp-phone" type="tel" inputmode="numeric" maxlength="10"
               placeholder="98765 43210" class="srf-input srf-input-cc" value="${state.complaintPhone}"/>
      </div>

      <label class="srf-label" for="srf-cmp-text">What's the issue?</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.edit}</span>
        <textarea id="srf-cmp-text" placeholder="Describe what went wrong — the issue came back, the technician didn't show, billing was wrong, etc." class="srf-input" rows="4" maxlength="2000" style="padding-top:12px;padding-bottom:12px;resize:vertical;min-height:100px;">${escapeHTML(state.complaintText)}</textarea>
      </div>

      <button class="srf-btn srf-btn-primary" id="srf-cmp-submit" ${state.complaintLoading ? 'disabled' : ''}>
        ${state.complaintLoading ? '<span class="srf-spin"></span>' : ''}<span>Submit complaint</span> ${ICONS.arrowRight}
      </button>
    `;
  }

  // ── TRACK MODE ──────────────────────────────────────
  function stepTrack() {
    if (state.trackResult) return renderTrackResult(state.trackResult);
    if (state.trackList) return renderTrackList(state.trackList);
    return `
      <h2 class="srf-card-title">Track your requests</h2>
      <p class="srf-card-sub">Enter your WhatsApp number to see all the tickets you've filed. Add a ticket number to jump to one directly.</p>

      <label class="srf-label" for="srf-track-phone">Phone number</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.phone}</span>
        <span class="srf-cc">+91</span>
        <input id="srf-track-phone" type="tel" inputmode="numeric" maxlength="10"
               placeholder="98765 43210" class="srf-input srf-input-cc" value="${state.trackPhone}"/>
      </div>

      <label class="srf-label" for="srf-track-tno">Ticket number <span class="srf-optional">(optional)</span></label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.ticket}</span>
        <input id="srf-track-tno" type="text" placeholder="NE-260506-1234" class="srf-input"
               value="${state.trackTicketNo}" autocomplete="off"/>
      </div>

      <button class="srf-btn srf-btn-primary" id="srf-track-go" ${state.trackLoading ? 'disabled' : ''}>
        ${state.trackLoading ? '<span class="srf-spin"></span>' : ''}<span>${state.trackTicketNo ? 'Get this ticket' : 'Show my tickets'}</span> ${ICONS.arrowRight}
      </button>
    `;
  }

  function renderTrackList(tickets) {
    return `
      <button class="srf-back" id="srf-track-back">${ICONS.arrowLeft}<span>New search</span></button>
      <h2 class="srf-card-title">Your tickets</h2>
      <p class="srf-card-sub">${tickets.length} ticket${tickets.length === 1 ? '' : 's'} found for +91 ${formatPhone(state.trackPhone)}</p>

      <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;">
        ${tickets.length === 0 ? `
          <div style="padding:24px;text-align:center;color:var(--text-soft);background:var(--bg-soft);border-radius:14px;">
            No tickets found for this phone number.
          </div>
        ` : tickets.map(t => {
          const st = displayStatus(t.status);
          const stLabel = STATUS_LABELS[st === 'pending' ? 'open' : st] || st;
          const stColor = st === 'resolved' ? 'var(--success)'
            : st === 'in_progress' ? 'var(--warning)'
            : st === 'assigned' ? 'var(--primary)'
            : 'var(--text-dim)';
          return `
            <button type="button" class="srf-ticket-row" data-ticket-id="${t.id}"
              style="display:flex;align-items:center;gap:14px;padding:14px;border-radius:14px;background:var(--bg-soft);border:1px solid var(--border);cursor:pointer;text-align:left;font-family:inherit;width:100%;">
              <div style="flex-shrink:0;width:44px;height:44px;border-radius:12px;background:var(--bg);color:${stColor};display:flex;align-items:center;justify-content:center;">${ICONS.ticket}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:800;font-size:0.95rem;color:var(--text);">${escapeHTML(t.ticket_no || t.id.slice(0,8))}</div>
                <div style="font-size:0.82rem;color:var(--text-soft);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(t.service_item || '—')}</div>
                <div style="font-size:0.74rem;color:var(--text-dim);margin-top:2px;">${t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</div>
              </div>
              <span style="font-size:0.75rem;font-weight:700;padding:6px 12px;border-radius:999px;background:${stColor}1a;color:${stColor};white-space:nowrap;">${stLabel}</span>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderTrackResult(r) {
    const status = displayStatus(r.status);
    const flowStatus = status === 'pending' ? 'open' : status;
    const flowIdx = Math.max(0, STATUS_FLOW.indexOf(flowStatus));
    const resolved = status === 'resolved';
    const hasBill = r.bill_amount != null && Number(r.bill_amount) > 0;
    const paid = r.payment_status === 'paid';
    const hasFeedback = r.feedback_rating != null;
    const employee = r.profiles || null;

    return `
      <button class="srf-back" id="srf-track-back">${ICONS.arrowLeft}<span>Look up another</span></button>
      <h2 class="srf-card-title">Ticket ${r.ticket_no || r.id.slice(0, 8)}</h2>
      <p class="srf-card-sub">${r.full_name} · ${r.service_item}</p>

      ${!resolved ? `
        <div style="background:var(--bg-soft); padding:18px 20px; border-radius:16px; margin:20px 0; border:1px solid var(--border); display:flex; align-items:center; gap:16px;">
          <div style="width:48px;height:48px;border-radius:14px;background:var(--gradient);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 6px 16px rgba(16,185,129,0.25);">${ICONS.clock}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.72rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Service commitment</div>
            <div style="font-size:0.85rem; color:var(--text-soft); margin-top:2px;">Resolved by</div>
            <div style="font-size:1.2rem; color:var(--text); font-weight:800; margin-top:4px; letter-spacing:-0.01em;">${formatDeadlineLong(calculateSLA(r.created_at))}</div>
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

      ${renderStatusPanel(flowStatus, r, employee)}

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

      ${!hasFeedback ? `
        <div class="srf-feedback">
          <h3 class="srf-fb-title">How did we do?</h3>
          <p class="srf-fb-sub">Your honest feedback helps us serve you better.</p>

          <div style="margin-bottom:18px;">
            <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Overall Experience</div>
            <div class="srf-stars" id="srf-stars" data-rating="0">
              ${[1,2,3,4,5].map(n => `<button type="button" class="srf-star" data-val="${n}">${ICONS.starOutline}</button>`).join('')}
            </div>
            <div id="srf-rating-label" style="font-size:0.82rem;color:var(--primary);font-weight:700;margin-top:6px;min-height:18px;"></div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
            <div>
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Service Quality</div>
              <div class="srf-stars" id="srf-stars-quality" data-rating="0" style="gap:2px;">
                ${[1,2,3,4,5].map(n => `<button type="button" class="srf-star" data-val="${n}" style="padding:2px;">${ICONS.starOutline}</button>`).join('')}
              </div>
            </div>
            <div>
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Technician</div>
              <div class="srf-stars" id="srf-stars-tech" data-rating="0" style="gap:2px;">
                ${[1,2,3,4,5].map(n => `<button type="button" class="srf-star" data-val="${n}" style="padding:2px;">${ICONS.starOutline}</button>`).join('')}
              </div>
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-bottom:18px;" id="srf-rec-wrap">
            <button class="srf-rec-btn" id="srf-rec-yes" data-val="yes" style="flex:1;padding:10px 8px;border-radius:12px;border:2px solid var(--border);background:var(--bg-soft);font-weight:700;font-size:0.82rem;cursor:pointer;color:var(--text-soft);font-family:inherit;transition:all 0.2s;">👍 Recommend</button>
            <button class="srf-rec-btn" id="srf-rec-no" data-val="no" style="flex:1;padding:10px 8px;border-radius:12px;border:2px solid var(--border);background:var(--bg-soft);font-weight:700;font-size:0.82rem;cursor:pointer;color:var(--text-soft);font-family:inherit;transition:all 0.2s;">👎 Would Not</button>
          </div>

          <div class="srf-input-wrap" style="margin-bottom:14px;">
            <span class="srf-input-icon">${ICONS.edit}</span>
            <textarea id="srf-fb-comment" placeholder="Tell us about your experience — what went well, what could improve…" class="srf-input" rows="3" style="padding-top:12px;padding-bottom:12px;resize:vertical;min-height:72px;"></textarea>
          </div>

          <button class="srf-btn srf-btn-primary" id="srf-fb-submit" disabled style="opacity:0.5;cursor:not-allowed;">
            <span>Submit Feedback</span> ${ICONS.arrowRight}
          </button>
          <p style="text-align:center;font-size:0.75rem;color:var(--text-dim);margin-top:8px;">Overall star rating is required</p>
        </div>
      ` : ''}

      ${hasFeedback ? `
        <div class="srf-fb-done">
          <div class="srf-fb-done-ring">${ICONS.star}</div>
          <h3 style="font-weight:800;font-size:1.1rem;color:var(--text);margin:0 0 6px;">Thank you for your feedback!</h3>
          <p style="font-size:0.9rem;color:var(--text-soft);margin:0 0 8px;">You rated us <strong style="color:var(--warning)">${r.feedback_rating}/5 ★</strong></p>
          ${r.feedback_comment ? `<p style="font-size:0.85rem;color:var(--text-soft);font-style:italic;margin:0;">"${r.feedback_comment}"</p>` : ''}
        </div>
      ` : ''}
    `;
  }

  // ── Bindings ─────────────────────────────────────────
  const bind = (sel, cb, event = 'onclick') => {
    const el = container.querySelector(sel);
    if (el) el[event] = cb;
  };

  function bindCommon() {
    bind('.theme-toggle-btn', () => { toggleTheme(); render(); });
    bind('.srf-staff-btn', onPortalClick);
    container.querySelectorAll('.srf-mode-tab').forEach(t => {
      t.onclick = () => {
        if (state.mode === t.dataset.mode) return;
        state.mode = t.dataset.mode;
        if (state.mode === 'track') {
          state.trackResult = null;
          state.trackList = null;
        }
        if (state.mode === 'complaint') {
          state.complaintSubmitted = false;
        }
        render();
      };
    });
  }

  function bindStep() {
    if (state.mode === 'track') return bindTrack();
    if (state.mode === 'complaint') return bindComplaint();
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

    bind('#srf-refresh-captcha', () => {
      state.captcha = makeCaptcha();
      render();
    });

    bind('#srf-demo-fill', () => {
      state.phone = '9876543210';
      state.captcha = { a: 1, b: 1 };
      render();
      container.querySelector('#srf-captcha').value = '2';
    });

    if (sendBtn) sendBtn.onclick = async () => {
      if (!/^\d{10}$/.test(state.phone)) return toast('Enter a valid 10-digit number', 'error');
      const ans = parseInt(capEl.value, 10);
      if (ans !== state.captcha.a + state.captcha.b) {
        toast('Captcha is incorrect', 'error');
        state.captcha = makeCaptcha();
        return render();
      }

      sendBtn.disabled = true;
      sendBtn.innerHTML = `<span class="srf-spin"></span><span>Sending…</span>`;
      const code = DEV_OTP_MODE ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
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

    bind('#srf-back', () => { state.step = 1; render(); });

    bind('#srf-verify-otp', () => {
      const entered = boxes.map(b => b.value).join('');
      if (entered.length !== 6) return toast('Enter the full 6-digit code', 'error');
      if (entered !== state.expectedOTP) return toast('Incorrect code', 'error');
      state.step = 3;
      render();
    });

    bind('#srf-resend', async () => {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      state.expectedOTP = code;
      await sendWhatsAppOTP('+91' + state.phone, code);
      toast('New code sent', 'success');
      render();
    });
  }

  function bindForm() {
    const issueEl = container.querySelector('#srf-issue');
    const otherWrap = container.querySelector('#srf-other-wrap');
    issueEl.onchange = () => {
      otherWrap.style.display = issueEl.value === 'other' ? '' : 'none';
    };

    bind('#srf-demo-fill-form', () => {
      container.querySelector('#srf-name').value = 'John Doe (Demo)';
      state.locationMode = 'manual';
      state.locationValue = '123 Tech Park, Silicon Valley';
      container.querySelector('#srf-location').value = state.locationValue;
      container.querySelector('#srf-issue').value = 'internet-down';
      container.querySelector('#srf-time').value = 'Morning (10 AM - 1 PM)';
    });

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

    bind('#srf-submit', async () => {
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
        customer_lat: state.coords?.lat ?? null,
        customer_lng: state.coords?.lng ?? null,
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
    });
  }

  function bindSuccess() {
    bind('#srf-copy-ticket', async () => {
      try {
        await navigator.clipboard.writeText(state.ticketNo);
        toast('Ticket number copied', 'success');
      } catch {
        toast('Copy failed — select and copy manually', 'error');
      }
    });

    bind('#srf-track-now', () => {
      state.mode = 'track';
      state.trackTicketNo = state.ticketNo;
      state.trackPhone = state.phone;
      state.trackResult = null;
      render();
    });

    bind('#srf-new', () => {
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
    });
  }

  function bindTrack() {
    if (state.trackResult) {
      container.querySelector('#srf-track-back').onclick = () => {
        // Clearing trackResult naturally falls back to the list (if we came from
        // one) or the search form (if we arrived via ticket_no + phone direct).
        state.trackResult = null;
        render();
      };

      const stars = container.querySelector('#srf-stars');
      if (stars) {
        // Helper: wire up a star row
        const wireStars = (el, onPick) => {
          if (!el) return;
          const btns = [...el.querySelectorAll('.srf-star')];
          let val = 0;
          const paint = (v) => btns.forEach((b, i) => {
            b.innerHTML = i < v ? ICONS.star : ICONS.starOutline;
            b.classList.toggle('on', i < v);
          });
          btns.forEach((b, i) => {
            b.onmouseenter = () => paint(i + 1);
            b.onmouseleave = () => paint(val);
            b.onclick = () => { val = i + 1; el.dataset.rating = val; paint(val); if (onPick) onPick(val); };
          });
          return () => val;
        };

        const RATING_LABELS = ['', '😞 Poor', '😐 Fair', '😊 Good', '😁 Great', '🤩 Excellent!'];
        let chosenOverall = 0;
        let recommendVal = '';

        const submitBtn = container.querySelector('#srf-fb-submit');
        const checkReady = () => {
          if (submitBtn) { submitBtn.disabled = !chosenOverall; submitBtn.style.opacity = chosenOverall ? '1' : '0.5'; submitBtn.style.cursor = chosenOverall ? 'pointer' : 'not-allowed'; }
        };

        wireStars(stars, (v) => {
          chosenOverall = v;
          const lbl = container.querySelector('#srf-rating-label');
          if (lbl) lbl.textContent = RATING_LABELS[v] || '';
          checkReady();
        });
        wireStars(container.querySelector('#srf-stars-quality'));
        wireStars(container.querySelector('#srf-stars-tech'));

        // Recommend buttons
        container.querySelectorAll('.srf-rec-btn').forEach(btn => {
          btn.onclick = () => {
            recommendVal = btn.dataset.val;
            container.querySelectorAll('.srf-rec-btn').forEach(b => {
              b.style.borderColor = b.dataset.val === recommendVal ? 'var(--primary)' : 'var(--border)';
              b.style.color = b.dataset.val === recommendVal ? 'var(--primary)' : 'var(--text-soft)';
              b.style.background = b.dataset.val === recommendVal ? 'rgba(16,185,129,0.08)' : 'var(--bg-soft)';
            });
          };
        });

        bind('#srf-fb-submit', async () => {
          if (!chosenOverall) return toast('Please pick an overall star rating', 'warning');
          const qualityRating = Number(container.querySelector('#srf-stars-quality')?.dataset.rating || 0);
          const techRating = Number(container.querySelector('#srf-stars-tech')?.dataset.rating || 0);
          const comment = container.querySelector('#srf-fb-comment').value.trim();
          const fullComment = [
            comment,
            qualityRating ? `Service quality: ${qualityRating}/5` : '',
            techRating ? `Technician: ${techRating}/5` : '',
            recommendVal ? (recommendVal === 'yes' ? 'Would recommend ✓' : 'Would not recommend') : '',
          ].filter(Boolean).join(' | ');

          const btn = container.querySelector('#srf-fb-submit');
          btn.disabled = true;
          btn.innerHTML = `<span class="srf-spin"></span><span>Submitting…</span>`;
          const fbPayload = {
            feedback_rating: chosenOverall,
            feedback_comment: fullComment || null,
            feedback_at: new Date().toISOString(),
          };
          // Capture the explicit employee rating so admins can rank technicians.
          if (techRating) {
            fbPayload.employee_rating = techRating;
            if (state.trackResult.assigned_employee_id) {
              fbPayload.feedback_employee_id = state.trackResult.assigned_employee_id;
            }
          }
          const { error } = await supabase.from('inquiries')
            .update(fbPayload)
            .eq('id', state.trackResult.id)
            .eq('ticket_no', state.trackResult.ticket_no)
            .eq('phone', state.trackResult.phone);
          if (error) {
            toast('Could not submit feedback', 'error');
            btn.disabled = false;
            btn.innerHTML = `<span>Submit Feedback</span> ${ICONS.arrowRight}`;
            return;
          }
          state.trackResult = { ...state.trackResult, ...fbPayload };
          toast('Thanks for your feedback! 🙏', 'success');
          render();
        });
      }
      return;
    }

    // List view: wire ticket cards + back-to-search button.
    if (state.trackList) {
      bind('#srf-track-back', () => {
        state.trackList = null;
        render();
      });
      container.querySelectorAll('.srf-ticket-row').forEach(row => {
        row.onclick = async () => {
          const id = row.dataset.ticketId;
          const ticket = state.trackList.find(t => t.id === id);
          if (!ticket) return;
          // The list endpoint doesn't include joined profiles, so re-fetch the
          // full row by ticket_no + phone to get the assigned-employee details.
          state.trackLoading = true;
          render();
          const { data } = await supabase.from('inquiries')
            .select('*,profiles(id,full_name,phone,role)')
            .eq('ticket_no', ticket.ticket_no)
            .eq('phone', ticket.phone)
            .maybeSingle();
          state.trackLoading = false;
          state.trackResult = data || ticket;
          render();
        };
      });
      return;
    }

    // Search form
    const tnoEl = container.querySelector('#srf-track-tno');
    const phEl = container.querySelector('#srf-track-phone');
    tnoEl.addEventListener('input', e => { state.trackTicketNo = e.target.value.trim().toUpperCase(); e.target.value = state.trackTicketNo; });
    phEl.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
      state.trackPhone = e.target.value;
    });

    bind('#srf-track-go', async () => {
      const tno = state.trackTicketNo;
      const ph = state.trackPhone;
      if (!/^\d{10}$/.test(ph)) return toast('Enter a valid 10-digit phone number', 'error');

      state.trackLoading = true;
      render();

      // Direct-ticket lookup (phone + ticket_no) — single result, jump straight to detail view.
      if (tno) {
        const { data, error } = await supabase.from('inquiries')
          .select('*,profiles(id,full_name,phone,role)')
          .eq('ticket_no', tno)
          .eq('phone', '+91' + ph)
          .maybeSingle();
        state.trackLoading = false;
        if (error) { console.error(error); toast('Lookup failed', 'error'); render(); return; }
        if (!data) { toast('No matching ticket. Check the number and phone.', 'error'); render(); return; }
        state.trackResult = data;
        render();
        return;
      }

      // Phone-only listing — show all this phone's tickets.
      const { data, error } = await supabase.from('inquiries')
        .select('*')
        .eq('phone', '+91' + ph)
        .order('created_at', { ascending: false });
      state.trackLoading = false;
      if (error) { console.error(error); toast('Lookup failed', 'error'); render(); return; }
      const list = Array.isArray(data) ? data : (data ? [data] : []);
      if (!list.length) { toast('No tickets found for that phone number.', 'error'); render(); return; }
      // If exactly one ticket, skip the list and go straight to detail view
      // (re-fetched with profiles join).
      if (list.length === 1) {
        const { data: full } = await supabase.from('inquiries')
          .select('*,profiles(id,full_name,phone,role)')
          .eq('ticket_no', list[0].ticket_no)
          .eq('phone', list[0].phone)
          .maybeSingle();
        state.trackResult = full || list[0];
      } else {
        state.trackList = list;
      }
      render();
    });

  }

  function bindComplaint() {
    if (state.complaintSubmitted) {
      bind('#srf-complaint-another', () => {
        state.complaintSubmitted = false;
        state.complaintTicketNo = '';
        state.complaintText = '';
        render();
      });
      bind('#srf-complaint-to-track', () => {
        state.mode = 'track';
        state.trackTicketNo = state.complaintTicketNo;
        state.trackPhone = state.complaintPhone;
        state.trackResult = null;
        state.trackList = null;
        render();
      });
      return;
    }

    const tnoEl = container.querySelector('#srf-cmp-tno');
    const phEl  = container.querySelector('#srf-cmp-phone');
    const txtEl = container.querySelector('#srf-cmp-text');

    tnoEl.addEventListener('input', e => {
      state.complaintTicketNo = e.target.value.trim().toUpperCase();
      e.target.value = state.complaintTicketNo;
    });
    phEl.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
      state.complaintPhone = e.target.value;
    });
    txtEl.addEventListener('input', e => { state.complaintText = e.target.value; });

    bind('#srf-cmp-submit', async () => {
      const tno = state.complaintTicketNo;
      const ph  = state.complaintPhone;
      const txt = state.complaintText.trim();

      if (!tno) return toast('Enter your ticket number', 'error');
      if (!/^\d{10}$/.test(ph)) return toast('Enter a valid 10-digit number', 'error');
      if (txt.length < 10) return toast('Please describe the issue (at least 10 characters)', 'error');

      state.complaintLoading = true;
      render();

      const { error } = await supabase.from('complaints').insert({
        ticket_no: tno,
        phone: '+91' + ph,
        complaint_text: txt,
      });

      state.complaintLoading = false;
      if (error) {
        const msg = /No ticket found/i.test(error.message || '')
          ? 'No ticket matches that number and phone. Double-check and try again.'
          : 'Could not submit complaint — please try again.';
        toast(msg, 'error');
        render();
        return;
      }
      state.complaintSubmitted = true;
      toast('Complaint received', 'success');
      render();
    });
  }

  render();
  loadAds();

  // Auto-fetch inquiry when URL has ?tab=track&ticket=...&phone=...
  if (urlTab === 'track' && urlTicket && urlPhone && urlPhone.length === 10) {
    (async () => {
      state.trackLoading = true;
      render();
      const { data } = await supabase.from('inquiries')
        .select('*,profiles(id,full_name,phone,role)')
        .eq('ticket_no', urlTicket)
        .eq('phone', '+91' + urlPhone)
        .maybeSingle();
      state.trackLoading = false;
      if (data) { state.trackResult = data; }
      render();
    })();
  }
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

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function formatDeadlineLong(d) {
  const date = d instanceof Date ? d : new Date(d);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  const year = date.getFullYear();
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${time}, ${weekday} ${day} ${month} ${year}`;
}

// Status-aware info panel shown beneath the timeline on the tracking view.
// Received → reassuring customer-detail card; Assigned/In-Progress → technician card.
// Resolved is intentionally empty — the feedback block handles that state.
function renderStatusPanel(flowStatus, r, employee) {
  const cardOpen = `<div style="margin:18px 0;padding:18px;border-radius:18px;background:var(--bg-soft);box-shadow:var(--neu-in);border:1px solid var(--border);">`;
  const cardClose = `</div>`;
  const heading = (title, sub) => `
    <div style="font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;font-weight:800;letter-spacing:0.5px;">${title}</div>
    ${sub ? `<div style="font-size:0.85rem;color:var(--text-soft);margin-top:2px;">${sub}</div>` : ''}
  `;
  const row = (icon, label, value) => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-top:1px solid var(--border);">
      <div style="width:32px;height:32px;border-radius:10px;background:var(--bg);color:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${icon}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;font-weight:700;letter-spacing:0.4px;">${label}</div>
        <div style="font-size:0.92rem;color:var(--text);font-weight:600;word-break:break-word;">${value}</div>
      </div>
    </div>
  `;

  if (flowStatus === 'open') {
    return `
      ${cardOpen}
        ${heading('Request received', "We're reviewing your request and will dispatch the right technician shortly. You'll see their details here as soon as they're assigned.")}
        <div style="margin-top:10px;">
          ${row(ICONS.user, 'Customer', escapeHTML(r.full_name))}
          ${row(ICONS.phone, 'Contact', escapeHTML(r.phone))}
          ${row(ICONS.pin, 'Location', escapeHTML(r.location || '—'))}
          ${row(ICONS.wrench, 'Service', escapeHTML(r.service_item || '—'))}
          ${r.preferred_time ? row(ICONS.clock, 'Preferred time', escapeHTML(r.preferred_time)) : ''}
        </div>
      ${cardClose}
    `;
  }

  if (flowStatus === 'assigned' || flowStatus === 'in_progress') {
    const title = flowStatus === 'assigned' ? 'Technician assigned' : 'Technician on the job';
    const sub = flowStatus === 'assigned'
      ? 'Your technician has been dispatched and will reach out shortly.'
      : 'Your technician is actively working on your service.';
    if (!employee) {
      return `
        ${cardOpen}
          ${heading(title, 'Technician details will appear here once assignment is confirmed.')}
        ${cardClose}
      `;
    }
    return `
      ${cardOpen}
        ${heading(title, sub)}
        <div style="margin-top:10px;">
          ${row(ICONS.user, 'Name', escapeHTML(employee.full_name || 'Technician'))}
          ${employee.phone ? row(ICONS.phone, 'Phone', `<a href="tel:${escapeAttr(employee.phone)}" style="color:var(--primary);text-decoration:none;">${escapeHTML(employee.phone)}</a>`) : ''}
          ${employee.role ? row(ICONS.shield, 'Role', escapeHTML(employee.role.charAt(0).toUpperCase() + employee.role.slice(1))) : ''}
        </div>
      ${cardClose}
    `;
  }

  return '';
}
