import { supabase } from '../supabase.js';
import { toggleTheme, calculateSLA, toast } from '../utils.js';
import { ICONS } from '../icons.js';
import { AdCarousel } from '../ad-carousel.js';
import '../ad-carousel.css';

const LOGO = new URL('../assets/logo.png', import.meta.url).href;

const API_URL = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

const SERVICE_CONTACT_PHONE = '8899133144';
const SERVICE_CONTACT_DISPLAY = '+91 88991 33144';
const SERVICE_CONTACT_TEL = `tel:+91${SERVICE_CONTACT_PHONE}`;
const SERVICE_CONTACT_WHATSAPP = `https://wa.me/91${SERVICE_CONTACT_PHONE}?text=${encodeURIComponent('Hello Networking Experts, I need help with a service request.')}`;

async function postPublicApi(path, body) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, ...data } : { ok: false, error: data.error || 'Request failed' };
  } catch (err) {
    return { ok: false, error: err.message || 'Network request failed' };
  }
}

const sendSmsOTP = (phone) => postPublicApi('/otp/send', { phone });
const verifySmsOTP = (phone, otp) => postPublicApi('/otp/verify', { phone, otp });
const resendSmsOTP = (phone) => postPublicApi('/otp/resend', { phone });

const AD_CACHE_KEY = 'nest_landing_ads_v2';
const AD_CACHE_TTL_MS = 10 * 60 * 1000;

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

// Hardcoded fallback used until admin-defined service categories load
// (or if the service_pricing table is empty).
const FALLBACK_ISSUE_OPTIONS = [
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
const OTHER_OPTION = { value: 'other', label: 'Other (specify below)' };

function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'option';
}

async function loadIssueOptionsFromPricing() {
  try {
    const { data, error } = await supabase.from('service_pricing').select('category');
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const seen = new Map();
    for (const r of data) {
      const cat = (r?.category || '').trim();
      if (!cat || cat.toLowerCase() === 'uncategorized') continue;
      const key = slugify(cat);
      if (!seen.has(key)) seen.set(key, { value: key, label: cat });
    }
    if (seen.size === 0) return null;
    return [...seen.values(), OTHER_OPTION];
  } catch {
    return null;
  }
}

function getCachedAds() {
  try {
    const cached = JSON.parse(localStorage.getItem(AD_CACHE_KEY) || 'null');
    if (!cached || !Array.isArray(cached.ads) || !cached.ads.length) return [];
    if (Date.now() - Number(cached.savedAt || 0) > AD_CACHE_TTL_MS) return [];
    return cached.ads.map(a => ({ ...a, url: normalizeAdUrl(a.url) })).filter(a => a.url);
  } catch {
    return [];
  }
}

function cacheAds(ads) {
  try {
    localStorage.setItem(AD_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), ads }));
  } catch {
    // Storage can be disabled or full; ads still render from memory.
  }
}

function normalizeAdUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('/')) return value;
  if (/^[A-Za-z0-9._-]+\.(png|jpe?g|gif|webp|mp4|webm|ogg)$/i.test(value)) {
    return `/uploads/${value}`;
  }
  return '';
}

function preloadAdMedia(ad) {
  if (!ad?.url) return Promise.resolve();
  const isVideo = (ad.kind || 'image').toLowerCase() === 'video';
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(resolve, 8000);
    if (isVideo) {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';
      video.playsInline = true;
      video.onloadeddata = done;
      video.onloadedmetadata = done;
      video.onerror = done;
      video.src = ad.url;
      video.load();
      return;
    }
    const img = new Image();
    img.onload = done;
    img.onerror = done;
    img.src = ad.url;
    if (img.decode) img.decode().then(done).catch(() => {});
  });
}

async function preloadAds(ads) {
  await Promise.all((ads || []).map(preloadAdMedia));
}

// Watches for several GPS fixes within `maxWaitMs`, returns the most accurate
// reading seen — or short-circuits as soon as accuracy <= desiredAccuracy.
// The cold first fix is usually 100-500m off; this keeps sampling until we
// see a real GPS lock (typically <20m on phones).
function getHighAccuracyPosition({ desiredAccuracy = 25, maxWaitMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    let best = null;
    let settled = false;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (pos.coords.accuracy <= desiredAccuracy && !settled) {
          settled = true;
          navigator.geolocation.clearWatch(watchId);
          clearTimeout(timer);
          resolve(best);
        }
      },
      (err) => {
        if (settled) return;
        if (best) {
          settled = true;
          navigator.geolocation.clearWatch(watchId);
          clearTimeout(timer);
          resolve(best);
        } else {
          settled = true;
          reject(err);
        }
      },
      { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 }
    );
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      if (best) resolve(best);
      else reject(new Error('Geolocation timed out'));
    }, maxWaitMs);
  });
}

async function reverseGeocode(lat, lng) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
  const data = await res.json();
  return data.display_name || '';
}

function mapLink(lat, lng) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

// ────────────────────────────────────────────────────────────────────
// State + flow
// ────────────────────────────────────────────────────────────────────
export function renderLandingPage(container, onPortalClick) {
  // Read URL params — support ?tab=track&ticket=NE-...&phone=...
  const urlParams = new URLSearchParams(window.location.search);
  const urlTab = urlParams.get('tab');
  const urlTicket = urlParams.get('ticket') || '';
  const urlPhone = (urlParams.get('phone') || '').replace(/^\+91/, '').replace(/\D/g, '');
  const cachedAds = getCachedAds();

  const state = {
    mode: urlTab === 'track' ? 'track' : 'new',
    step: 1,
    phone: '',
    otp: '',
    captcha: makeCaptcha(),
    locationMode: 'gps',
    locationValue: '',
    coords: null,
    customerName: '',
    billNo: '',
    preferredTime: 'Morning (10 AM - 1 PM)',
    otherIssue: '',
    description: '',
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
    ads: cachedAds,
    adsLoading: cachedAds.length === 0,
    popupAds: [],
    adIndex: 0,
    _adTimer: null,
    issueOptions: FALLBACK_ISSUE_OPTIONS,
    issueValue: '',
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
        ${state.adsLoading ? `
          <div class="srf-loading-screen" role="status" aria-live="polite">
            <div class="srf-loading-card">
              <img src="${LOGO}" alt="Networking Experts" class="srf-loading-logo"
                   onerror="this.style.display='none'"/>
              <span class="srf-loading-spinner"></span>
              <div class="srf-loading-title">Loading service portal</div>
            </div>
          </div>
        ` : ''}
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

        <section class="srf-top-banner" style="max-width:1000px; margin:0 auto; padding: 24px 20px 0; text-align:center;">
          <div class="srf-badge" style="margin: 0 auto 16px;">${ICONS.shield}<span>Verified Service Request</span></div>
          <h1 class="srf-title" style="text-align:center; margin-bottom:18px;">Need help?<br/><span class="srf-grad">We'll be there in minutes.</span></h1>
          <p class="srf-sub" style="margin: 0 auto 32px; text-align:center; max-width:600px;">Raise a service request in three quick steps. We'll send a one-time code by SMS, take your details, and dispatch the right technician.</p>
        </section>

        <main class="srf-main">
          <section class="srf-intro">
            ${state.ads.length > 0 ? `
              <div id="srf-ad-slot"></div>
            ` : `
               <div class="srf-ad-empty">
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

            <div id="srf-stepper-wrap">${stepperHtml()}</div>

            <div class="srf-card" id="srf-card">
              ${renderStep()}
            </div>
          </section>
        </main>
        <section class="srf-contact-section">
          <div class="srf-contact-card" aria-label="Contact Networking Experts">
            <div class="srf-contact-copy">
              <span class="srf-contact-kicker">Need urgent support?</span>
              <a class="srf-contact-number" href="${SERVICE_CONTACT_TEL}">${SERVICE_CONTACT_DISPLAY}</a>
              <span class="srf-contact-note">Direct support for service requests, billing, and technician updates.</span>
            </div>
            <div class="srf-contact-actions">
              <a class="srf-contact-action srf-contact-call" href="${SERVICE_CONTACT_TEL}" aria-label="Call Networking Experts at ${SERVICE_CONTACT_DISPLAY}">
                <span class="srf-contact-icon">${ICONS.phone}</span>
                <span>Call</span>
              </a>
              <a class="srf-contact-action srf-contact-whatsapp" href="${SERVICE_CONTACT_WHATSAPP}" target="_blank" rel="noopener" aria-label="Message Networking Experts on WhatsApp">
                <span class="srf-contact-icon">${ICONS.whatsapp}</span>
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
        </section>
      </div>
    `;

    bindCommon();
    bindStep();
    mountAdCarousel();
    maybeShowLandingPopup();
  }

  function showPopupAd(item) {
    if (!item?.url || sessionStorage.getItem(`landing-popup-${item.id}`) === '1') return;
    sessionStorage.setItem(`landing-popup-${item.id}`, '1');
    const isVideo = (item.kind || 'image').toLowerCase() === 'video';
    const overlay = document.createElement('div');
    overlay.className = 'media-popup-overlay';
    overlay.innerHTML = `
      <div class="media-popup-dialog" role="dialog" aria-modal="true">
        <button type="button" class="media-popup-close" aria-label="Close">${ICONS.close}</button>
        <div class="media-popup-frame">
          ${isVideo
            ? `<video src="${escapeAttr(item.url)}" controls autoplay muted playsinline></video>`
            : `<img src="${escapeAttr(item.url)}" alt="${escapeAttr(item.caption || 'Advertisement')}"/>`}
        </div>
        ${item.caption ? `<div class="media-popup-caption">${escapeHTML(item.caption)}</div>` : ''}
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.media-popup-close').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  }

  function maybeShowLandingPopup() {
    const item = state.popupAds.find(Boolean);
    if (item) setTimeout(() => showPopupAd(item), 500);
  }

  function mountAdCarousel() {
    // Cleanup old timer if exists
    if (state._adTimer) { clearTimeout(state._adTimer); state._adTimer = null; }
    if (state._adCarousel) { state._adCarousel.destroy(); }

    if (!state.ads.length) return;

    const slot = container.querySelector('#srf-ad-slot');
    if (!slot) return;

    // Mount new AdCarousel component
    try {
      state._adCarousel = new AdCarousel('srf-ad-slot', state.ads, {
        autoRotateMs: 5000,
      });
    } catch (err) {
      console.warn('AdCarousel mount failed:', err);
    }
  }

  async function loadAds() {
    try {
      const { data } = await supabase.from('ads')
        .select('*')
        .eq('active', 1)
        .order('position', { ascending: true });

      const now = new Date().getTime();
      const isMobileView = window.matchMedia('(max-width: 767px)').matches;
      const allAds = (data || []).map(a => ({ ...a, url: normalizeAdUrl(a.url) })).filter(a => {
        if (!a.url || (a.kind !== 'image' && a.kind !== 'video')) return false;
        const target = a.device_target || 'both';
        if (target === 'mobile' && !isMobileView) return false;
        if (target === 'desktop' && isMobileView) return false;
        if (a.starts_at && new Date(a.starts_at).getTime() > now) return false;
        if (a.expires_at && new Date(a.expires_at).getTime() <= now) return false;
        return true;
      });
      const ads = allAds.filter(a => (a.placement || 'landing') === 'landing');
      state.popupAds = allAds.filter(a => a.placement === 'popup_landing');

      if (ads.length) {
        await preloadAds(ads);
        cacheAds(ads);
        state.ads = ads;
      }
      maybeShowLandingPopup();
    } catch (err) {
      console.warn('Could not load ads:', err);
    } finally {
      state.adsLoading = false;
      render();
    }
  }

  function stepperHtml() {
    if (state.mode !== 'new') return '';
    return `
      <div class="srf-stepper">
        ${[1, 2, 3].map(n => `
          <div class="srf-step ${state.step === n ? 'active' : ''} ${state.step > n ? 'done' : ''}">
            <div class="srf-step-dot">${state.step > n ? ICONS.check : n}</div>
            <span>${['Verify', 'OTP', 'Details'][n - 1]}</span>
          </div>
          ${n < 3 ? `<div class="srf-step-line ${state.step > n ? 'done' : ''}"></div>` : ''}
        `).join('')}
      </div>
    `;
  }

  function renderCardOnly() {
    container.querySelectorAll('.srf-mode-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.mode === state.mode);
    });
    const stepper = container.querySelector('#srf-stepper-wrap');
    if (stepper) stepper.innerHTML = stepperHtml();
    const card = container.querySelector('#srf-card');
    if (card) card.innerHTML = renderStep();
    bindStep();
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
      <h2 class="srf-card-title">Enter your mobile number</h2>
      <p class="srf-card-sub">We'll send a one-time code to verify it's you.</p>

      <label class="srf-label" for="srf-phone">Phone number</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.phone}</span>
        <span class="srf-cc">+91</span>
        <input id="srf-phone" type="tel" inputmode="numeric" maxlength="10"
               placeholder="98765 43210" class="srf-input srf-input-cc" value="${state.phone}" />
      </div>

      <label class="srf-label" for="srf-captcha">Quick check: type these letters</label>
      <div style="display:inline-flex;gap:6px;align-items:center;margin:2px 0 8px;padding:8px 12px;border-radius:10px;background:var(--bg-soft);border:1px solid var(--border);font-size:1.05rem;font-weight:900;letter-spacing:0.22em;color:var(--primary);user-select:none;">
        ${state.captcha.code.split('').map(ch => `<span>${ch}</span>`).join('')}
      </div>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.shield}</span>
        <input id="srf-captcha" type="text" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false"
               placeholder="Enter the letters" class="srf-input" />
        <button type="button" class="srf-input-action" id="srf-refresh-captcha" title="New question">${ICONS.refresh}</button>
      </div>

      <button class="srf-btn srf-btn-primary" id="srf-send-otp">
        <span>Send OTP by SMS</span> ${ICONS.arrowRight}
      </button>

      <p class="srf-fineprint">${ICONS.shield}<span>Your number is only used to verify and contact you about this request.</span></p>
    `;
  }

  // ── STEP 2: OTP ──────────────────────────────────────
  function stepOTP() {
    return `
      <button class="srf-back" id="srf-back">${ICONS.arrowLeft}<span>Back</span></button>
      <h2 class="srf-card-title">Enter the 6-digit code</h2>
      <p class="srf-card-sub">Sent by SMS to <strong>+91 ${formatPhone(state.phone)}</strong></p>

      <div class="srf-otp-row">
        ${Array.from({ length: 6 }).map((_, i) => `
          <input class="srf-otp-box" maxlength="1" inputmode="numeric" data-idx="${i}" />
        `).join('')}
      </div>

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
        <input id="srf-name" type="text" placeholder="Full name" class="srf-input" value="${escapeAttr(state.customerName)}" />
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

      ${state.coords ? `
        <a href="${escapeAttr(mapLink(state.coords.lat, state.coords.lng))}" target="_blank" rel="noopener"
           style="display:inline-flex;align-items:center;gap:6px;margin:6px 0 12px;color:var(--primary);font-size:0.78rem;font-weight:700;text-decoration:none;">
          ${ICONS.pin}<span>Open exact pin (${Math.round(Number(state.coords.accuracy) || 0)}m accuracy)</span>
        </a>
      ` : ''}

      <label class="srf-label" for="srf-time">Preferred Visit Time</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.clock}</span>
        <select id="srf-time" class="srf-input srf-select">
          ${[
            'Morning (10 AM - 1 PM)',
            'Afternoon (1 PM - 4 PM)',
            'Evening (4 PM - 6 PM)',
            'Tomorrow Morning',
            "I'm Flexible",
          ].map(t => `<option value="${escapeAttr(t)}" ${state.preferredTime === t ? 'selected' : ''}>${escapeHTML(t)}</option>`).join('')}
        </select>
      </div>

      <label class="srf-label" for="srf-bill">Device bill number <span class="srf-optional">(optional)</span></label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.receipt}</span>
        <input id="srf-bill" type="text" placeholder="e.g. INV-2024-001" class="srf-input" value="${escapeAttr(state.billNo)}" />
      </div>

      <label class="srf-label" for="srf-issue">What's the issue?</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${ICONS.wrench}</span>
        <select id="srf-issue" class="srf-input srf-select">
          <option value="">Select an issue…</option>
          ${state.issueOptions.map(o => `
            <option value="${escapeAttr(o.value)}" ${state.issueValue === o.value ? 'selected' : ''}>
              ${escapeHTML(o.label)}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="srf-input-wrap srf-other-wrap" id="srf-other-wrap" style="display:none;">
        <span class="srf-input-icon">${ICONS.edit}</span>
        <input id="srf-other" type="text" placeholder="Describe your issue briefly" class="srf-input" value="${escapeAttr(state.otherIssue)}" />
      </div>

      <label class="srf-label" for="srf-desc">Describe the problem <span class="srf-optional">(optional)</span></label>
      <div class="srf-input-wrap" style="align-items:flex-start;">
        <span class="srf-input-icon" style="margin-top:12px;">${ICONS.edit}</span>
        <textarea id="srf-desc" rows="3" maxlength="1000"
                  placeholder="Anything our technician should know — model, when it started, what you tried, etc."
                  class="srf-input"
                  style="padding-top:12px;padding-bottom:12px;resize:vertical;min-height:84px;">${state.description ? String(state.description).replace(/[<>]/g, '') : ''}</textarea>
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
          ${ICONS.phone}<span>Your request has been saved with this mobile number.</span>
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
      <p class="srf-card-sub">Tell us what went wrong with a previous service. We verify the ticket against your mobile number before forwarding it to the team.</p>

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
      <p class="srf-card-sub">Enter your mobile number to see all the tickets you've filed. Add a ticket number to jump to one directly.</p>

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
                <div style="font-weight:800;font-size:0.95rem;color:var(--text);">${escapeHTML(t.ticket_no || t.id.slice(0, 8))}</div>
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

      ${resolved && !hasFeedback ? `
        <div class="srf-feedback">
          <h3 class="srf-fb-title">How did we do?</h3>
          <p class="srf-fb-sub">Your honest feedback helps us serve you better.</p>

          <div style="margin-bottom:18px;">
            <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Overall Experience</div>
            <div class="srf-stars" id="srf-stars" data-rating="0">
              ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="srf-star" data-val="${n}">${ICONS.starOutline}</button>`).join('')}
            </div>
            <div id="srf-rating-label" style="font-size:0.82rem;color:var(--primary);font-weight:700;margin-top:6px;min-height:18px;"></div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
            <div>
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Service Quality</div>
              <div class="srf-stars" id="srf-stars-quality" data-rating="0" style="gap:2px;">
                ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="srf-star" data-val="${n}" style="padding:2px;">${ICONS.starOutline}</button>`).join('')}
              </div>
            </div>
            <div>
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Technician</div>
              <div class="srf-stars" id="srf-stars-tech" data-rating="0" style="gap:2px;">
                ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="srf-star" data-val="${n}" style="padding:2px;">${ICONS.starOutline}</button>`).join('')}
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

      ${resolved && hasFeedback ? `
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
        renderCardOnly();
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
      let v = e.target.value.replace(/\D/g, '');
      // Strip country code from pasted numbers (e.g. +91 or 0 prefix)
      if (v.length > 10 && v.startsWith('91')) v = v.slice(2);
      else if (v.length === 11 && v.startsWith('0')) v = v.slice(1);
      e.target.value = v.slice(0, 10);
      state.phone = e.target.value;
    });

    bind('#srf-refresh-captcha', () => {
      state.captcha = makeCaptcha();
      render();
    });

    if (sendBtn) sendBtn.onclick = async () => {
      if (!/^\d{10}$/.test(state.phone)) return toast('Enter a valid 10-digit number', 'error');
      const ans = String(capEl.value || '').trim().toLowerCase();
      if (ans !== state.captcha.code.toLowerCase()) {
        toast('Captcha is incorrect', 'error');
        state.captcha = makeCaptcha();
        return render();
      }

      sendBtn.disabled = true;
      sendBtn.innerHTML = `<span class="srf-spin"></span><span>Sending…</span>`;
      const res = await sendSmsOTP('+91' + state.phone);
      if (!res.ok) { toast(res.error || 'Could not send OTP', 'error'); render(); return; }
      toast('OTP sent by SMS', 'success');
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

    bind('#srf-verify-otp', async () => {
      const entered = boxes.map(b => b.value).join('');
      if (entered.length !== 6) return toast('Enter the full 6-digit code', 'error');
      const btn = container.querySelector('#srf-verify-otp');
      btn.disabled = true;
      btn.innerHTML = `<span class="srf-spin"></span><span>Verifying...</span>`;
      const res = await verifySmsOTP('+91' + state.phone, entered);
      if (!res.ok) { toast(res.error || 'Incorrect code', 'error'); render(); return; }
      state.step = 3;
      render();
    });

    bind('#srf-resend', async () => {
      const res = await resendSmsOTP('+91' + state.phone);
      if (!res.ok) return toast(res.error || 'Could not resend OTP', 'error');
      toast('New code sent', 'success');
      render();
    });
  }

  function bindForm() {
    const issueEl = container.querySelector('#srf-issue');
    const otherWrap = container.querySelector('#srf-other-wrap');
    const syncFormState = () => {
      state.customerName = container.querySelector('#srf-name')?.value || state.customerName;
      state.billNo = container.querySelector('#srf-bill')?.value || '';
      state.preferredTime = container.querySelector('#srf-time')?.value || state.preferredTime;
      state.issueValue = issueEl?.value || state.issueValue;
      state.otherIssue = container.querySelector('#srf-other')?.value || '';
      state.description = container.querySelector('#srf-desc')?.value || '';
      state.locationValue = container.querySelector('#srf-location')?.value || state.locationValue;
    };
    otherWrap.style.display = issueEl.value === 'other' ? '' : 'none';
    issueEl.onchange = () => {
      state.issueValue = issueEl.value;
      otherWrap.style.display = issueEl.value === 'other' ? '' : 'none';
    };

    container.querySelectorAll('.srf-seg').forEach(seg => {
      seg.onclick = () => {
        syncFormState();
        state.locationMode = seg.dataset.mode;
        state.locationValue = '';
        state.coords = null;
        render();
      };
    });

    const detectBtn = container.querySelector('#srf-detect');
    if (detectBtn) {
      detectBtn.onclick = async () => {
        syncFormState();
        detectBtn.innerHTML = `<span class="srf-spin"></span>`;
        try {
          const pos = await getHighAccuracyPosition();
          const { latitude: lat, longitude: lng, accuracy } = pos.coords;
          state.coords = { lat, lng, accuracy };
          try {
            state.locationValue = await reverseGeocode(lat, lng) || `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          } catch (err) {
            console.error('Reverse geocoding failed:', err);
            state.locationValue = `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          }
          container.querySelector('#srf-location').value = state.locationValue;
          toast(`Location detected (${Math.round(Number(accuracy) || 0)}m accuracy)`, 'success');
          renderCardOnly();
        } catch {
          toast('Could not detect location - switch to Manual', 'error');
          detectBtn.innerHTML = ICONS.crosshair;
        }
        return;
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

    const nameEl = container.querySelector('#srf-name');
    if (nameEl) nameEl.addEventListener('input', e => { state.customerName = e.target.value; });

    const billEl = container.querySelector('#srf-bill');
    if (billEl) billEl.addEventListener('input', e => { state.billNo = e.target.value; });

    const timeEl = container.querySelector('#srf-time');
    if (timeEl) timeEl.addEventListener('change', e => { state.preferredTime = e.target.value; });

    const otherEl = container.querySelector('#srf-other');
    if (otherEl) otherEl.addEventListener('input', e => { state.otherIssue = e.target.value; });

    const descEl = container.querySelector('#srf-desc');
    if (descEl) descEl.addEventListener('input', e => { state.description = e.target.value; });

    bind('#srf-submit', async () => {
      syncFormState();
      const name = container.querySelector('#srf-name').value.trim();
      const bill = container.querySelector('#srf-bill').value.trim();
      const preferred_time = container.querySelector('#srf-time').value;
      const issueVal = issueEl.value;
      state.issueValue = issueVal;
      const issueLabel = state.issueOptions.find(o => o.value === issueVal)?.label || '';
      const otherText = container.querySelector('#srf-other')?.value.trim() || '';

      if (!name) return toast('Please enter your name', 'error');
      if (!state.locationValue) return toast('Please add your location', 'error');
      if (!issueVal) return toast('Please pick an issue', 'error');
      if (issueVal === 'other' && !otherText) return toast('Please describe the issue', 'error');

      const service_item = issueVal === 'other' ? `Other: ${otherText}` : issueLabel;
      const description = (state.description || '').trim().slice(0, 1000) || null;
      const submitBtn = container.querySelector('#srf-submit');
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="srf-spin"></span><span>Submitting…</span>`;

      const ticket_no = generateTicketNo();
      const booking = await postPublicApi('/data/inquiries', {
        full_name: name,
        phone: '+91' + state.phone,
        location: state.locationValue,
        customer_lat: state.coords?.lat ?? null,
        customer_lng: state.coords?.lng ?? null,
        bill_no: bill || null,
        service_item,
        description,
        status: 'open',
        assignment_status: 'none',
        ticket_no,
        preferred_time
      });

      if (!booking.ok) {
        toast(booking.error || 'Could not submit - please try again', 'error');
        console.error(booking);
        render();
        return;
      }

      state.ticketNo = ticket_no;
      toast('Request submitted', 'success');
      state.step = 4;
      render();
    });
  }

  async function loadIssueOptions() {
    const loadedOptions = await loadIssueOptionsFromPricing();
    state.issueOptions = loadedOptions || FALLBACK_ISSUE_OPTIONS;
    if (state.issueValue && !state.issueOptions.some(o => o.value === state.issueValue)) {
      state.issueValue = '';
    }
    render();
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
      state.ticketNo = '';
      state.captcha = makeCaptcha();
      state.locationMode = 'gps';
      state.locationValue = '';
      state.coords = null;
      state.customerName = '';
      state.billNo = '';
      state.preferredTime = 'Morning (10 AM - 1 PM)';
      state.otherIssue = '';
      state.description = '';
      state.issueValue = '';
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
    const phEl = container.querySelector('#srf-cmp-phone');
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
      const ph = state.complaintPhone;
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
  loadIssueOptions();
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
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const code = Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  return { code };
}

function formatPhone(p) {
  return p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p;
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
          ${r.description ? row(ICONS.edit, 'Description', escapeHTML(r.description)) : ''}
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
