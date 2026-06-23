import { toggleTheme, toast } from '../utils.js';
import { ICONS } from '../icons.js';

const LOGO = new URL('../assets/logo.png', import.meta.url).href;

const SERVICE_CONTACT_PHONE = '8899133144';
const SERVICE_CONTACT_DISPLAY = '+91 88991 33144';
const SERVICE_CONTACT_TEL = `tel:+91${SERVICE_CONTACT_PHONE}`;
const SERVICE_CONTACT_WHATSAPP = `https://wa.me/91${SERVICE_CONTACT_PHONE}?text=${encodeURIComponent('Hello Networking Experts, I need help with a new installation.')}`;

const API_URL = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

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

const INSTALL_TYPES = [
  { label: 'CCTV Camera Installation', icon: '📹', tagline: 'HD/IP cameras, DVR/NVR & remote viewing', color: '#10B981', includes: ['Site survey & camera placement', 'Cabling, DVR/NVR & storage setup', 'Mobile + desktop remote viewing', 'Demo & 30-day support'], highlights: ['4K/2K options', 'Night vision', 'Cloud storage'] },
  { label: 'Networking & LAN Setup', icon: '🌐', tagline: 'Structured cabling, switches & routers', color: '#3B82F6', includes: ['LAN/WAN design & cabling', 'Router, switch & firewall config', 'IP planning & testing', 'Labelling & documentation'], highlights: ['Cat6/Cat6A', 'Managed switches', 'VLAN setup'] },
  { label: 'WiFi / Access Point Setup', icon: '📶', tagline: 'Whole-home / office coverage', color: '#8B5CF6', includes: ['Coverage heat-map survey', 'Access point mounting & config', 'Seamless roaming setup', 'Speed & coverage testing'], highlights: ['WiFi 6/6E', 'Mesh ready', 'Zero dead zones'] },
  { label: 'Biometric & Access Control', icon: '🔒', tagline: 'Fingerprint, RFID & door locks', color: '#F59E0B', includes: ['Device mounting & wiring', 'User enrolment & software', 'Door lock / strike integration', 'Attendance & report setup'], highlights: ['Face & finger', 'RFID cards', 'Cloud logs'] },
  { label: 'Video Door Phone / Intercom', icon: '🔔', tagline: 'See & speak to visitors', color: '#EF4444', includes: ['Outdoor + indoor unit install', 'Wiring & power setup', 'Mobile call forwarding', 'Demo & handover'], highlights: ['HD video', 'Remote unlock', 'Night vision'] },
  { label: 'Smart Home Automation', icon: '🏠', tagline: 'Lights, sensors & smart control', color: '#14B8A6', includes: ['Needs assessment', 'Device & hub installation', 'App & voice control setup', 'Training & support'], highlights: ['Alexa/Google', 'Scene control', 'Energy saving'] },
];

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function generateInstallTicketNo() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rnd = String(Math.floor(1000 + Math.random() * 9000));
  return `INST-${yy}${mm}${dd}-${rnd}`;
}

export function renderInstallPage(container, onBack) {
  const savedTheme = localStorage.getItem('theme') || 'light';
  const themeIcon = savedTheme === 'dark' ? ICONS.sun : ICONS.moon;

  container.innerHTML = `
    <style>
      .inst-page {
        min-height: 100vh;
        position: relative;
        overflow-x: hidden;
        background: var(--bg);
        display: flex;
        flex-direction: column;
      }
      .inst-page *, .inst-page *::before, .inst-page *::after { box-sizing: border-box; }

      /* Background mesh — reuse landing's bg-mesh */
      .inst-bg-mesh { position:fixed; inset:0; pointer-events:none; z-index:0; overflow:hidden; }
      .inst-bg-mesh span { position:absolute; border-radius:50%; filter:blur(90px); opacity:0.4; }
      .inst-bg-mesh .im1 { width:500px; height:500px; top:-140px; left:-80px; background:radial-gradient(circle,rgba(16,185,129,0.35),transparent 70%); animation: instFloat 20s ease-in-out infinite; }
      .inst-bg-mesh .im2 { width:420px; height:420px; bottom:-100px; right:-60px; background:radial-gradient(circle,rgba(59,130,246,0.25),transparent 70%); animation: instFloat 20s ease-in-out infinite reverse; }
      .inst-bg-mesh .im3 { width:300px; height:300px; top:40%; left:50%; background:radial-gradient(circle,rgba(139,92,246,0.2),transparent 70%); animation: instFloat 18s ease-in-out infinite 5s; }

      @keyframes instFloat {
        0%, 100% { transform: translate(0,0) scale(1); }
        50% { transform: translate(25px,-35px) scale(1.08); }
      }

      /* Nav */
      .inst-nav {
        position: relative; z-index: 10;
        display: flex; align-items: center; justify-content: space-between;
        padding: 18px clamp(20px,5vw,80px);
      }
      .inst-nav-brand {
        display: flex; align-items: center; gap: 12px; text-decoration: none;
      }
      .inst-nav-logo { height: 42px; object-fit: contain; border-radius: 12px; }
      .inst-nav-word { display: flex; flex-direction: column; }
      .inst-nav-word b { font-size: 1.05rem; font-weight: 800; color: var(--text); line-height: 1.2; }
      .inst-nav-word small { font-size: 0.72rem; color: var(--text-dim); font-weight: 600; }
      .inst-nav-actions { display: flex; gap: 10px; align-items: center; }

      /* Hero */
      .inst-hero {
        position: relative; z-index: 5;
        text-align: center;
        padding: 36px clamp(20px,5vw,80px) 24px;
        max-width: 800px; margin: 0 auto;
      }
      .inst-hero-badge {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 8px 18px; border-radius: 999px;
        background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.25);
        font-size: 0.78rem; font-weight: 700; color: var(--primary);
        margin-bottom: 18px;
      }
      .inst-hero-badge svg { width: 16px; height: 16px; }
      .inst-hero h1 {
        font-size: clamp(1.8rem, 4.2vw, 2.8rem);
        font-weight: 800; line-height: 1.15;
        color: var(--text); margin: 0 0 14px;
        letter-spacing: -0.02em;
      }
      .inst-hero h1 span {
        background: var(--gradient);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .inst-hero p {
        font-size: 1.02rem; color: var(--text-soft);
        line-height: 1.6; margin: 0; max-width: 600px; margin: 0 auto;
      }

      /* Grid */
      .inst-grid {
        position: relative; z-index: 5;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 22px;
        padding: 12px clamp(20px,5vw,80px) 40px;
        max-width: 1200px; margin: 0 auto; width: 100%;
      }

      /* Card */
      .inst-card {
        position: relative;
        border-radius: 22px;
        background: var(--glass-bg, var(--bg-soft));
        border: 1px solid var(--glass-border, var(--border));
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        padding: 0;
        display: flex; flex-direction: column;
        overflow: hidden;
        transition: transform 0.22s cubic-bezier(.4,0,.2,1), box-shadow 0.22s, border-color 0.22s;
        cursor: default;
      }
      .inst-card:hover {
        transform: translateY(-6px);
        box-shadow: 0 20px 50px rgba(15,23,42,0.12);
        border-color: var(--primary);
      }

      .inst-card-accent {
        height: 4px; width: 100%;
      }

      .inst-card-body {
        padding: 22px 22px 0;
        flex: 1;
        display: flex; flex-direction: column;
      }

      .inst-card-head {
        display: flex; align-items: flex-start; gap: 14px;
        margin-bottom: 16px;
      }
      .inst-card-icon {
        width: 52px; height: 52px;
        border-radius: 16px;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.6rem; flex-shrink: 0;
        box-shadow: 0 4px 14px rgba(0,0,0,0.08);
      }
      .inst-card-title {
        font-size: 1.08rem; font-weight: 800; color: var(--text);
        margin: 0; line-height: 1.3;
      }
      .inst-card-tagline {
        font-size: 0.82rem; color: var(--text-dim);
        margin-top: 3px; line-height: 1.3;
      }

      /* Highlights row */
      .inst-highlights {
        display: flex; flex-wrap: wrap; gap: 6px;
        margin-bottom: 14px;
      }
      .inst-hl-tag {
        font-size: 0.7rem; font-weight: 700;
        padding: 4px 10px; border-radius: 8px;
        text-transform: uppercase; letter-spacing: 0.04em;
      }

      /* Includes list */
      .inst-includes {
        list-style: none; margin: 0; padding: 0;
        display: flex; flex-direction: column; gap: 9px;
        flex: 1;
      }
      .inst-includes li {
        display: flex; align-items: flex-start; gap: 10px;
        font-size: 0.86rem; color: var(--text-soft); line-height: 1.4;
      }
      .inst-includes li svg {
        width: 16px; height: 16px; color: var(--primary);
        flex: 0 0 16px; margin-top: 2px;
      }

      /* Book button */
      .inst-card-footer {
        padding: 18px 22px;
      }
      .inst-book-btn {
        width: 100%;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        padding: 13px 20px;
        border: none; border-radius: 14px;
        font-family: inherit; font-size: 0.92rem; font-weight: 700;
        color: #fff; cursor: pointer;
        background: var(--gradient);
        box-shadow: 0 6px 22px rgba(16,185,129,0.25);
        transition: transform 0.15s, box-shadow 0.15s;
      }
      .inst-book-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 30px rgba(16,185,129,0.35);
      }
      .inst-book-btn svg { width: 18px; height: 18px; }

      /* Back button */
      .inst-back-btn {
        display: inline-flex; align-items: center; gap: 6px;
        background: var(--glass-bg, var(--bg-soft));
        border: 1px solid var(--glass-border, var(--border));
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-radius: 14px;
        padding: 10px 18px 10px 14px;
        font-family: inherit; font-size: 0.88rem; font-weight: 700;
        color: var(--text); cursor: pointer;
        transition: all 0.16s ease;
      }
      .inst-back-btn:hover { border-color: var(--primary); color: var(--primary); }
      .inst-back-btn svg { width: 18px; height: 18px; }

      /* Contact bar */
      .inst-contact {
        position: relative; z-index: 5;
        width: 100%; max-width: 1200px;
        margin: 0 auto;
        padding: 0 clamp(20px,5vw,80px) clamp(36px,5vw,60px);
        display: flex; justify-content: center;
      }
      .inst-contact-card {
        display: flex; align-items: center; justify-content: space-between;
        gap: 18px; flex-wrap: wrap;
        width: 100%;
        padding: 18px 22px; border-radius: 20px;
        background: var(--glass-bg, var(--bg-soft));
        border: 1px solid var(--glass-border, var(--border));
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
      }
      .inst-contact-copy {
        display: flex; flex-direction: column; gap: 2px;
      }
      .inst-contact-kicker {
        font-size: 0.72rem; font-weight: 800; color: var(--text-dim);
        text-transform: uppercase; letter-spacing: 0.06em;
      }
      .inst-contact-number {
        color: var(--text); font-size: 1.08rem; font-weight: 800;
        text-decoration: none; font-variant-numeric: tabular-nums;
      }
      .inst-contact-number:hover { color: var(--primary); }
      .inst-contact-note { color: var(--text-soft); font-size: 0.84rem; }
      .inst-contact-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .inst-contact-action {
        display: inline-flex; align-items: center; justify-content: center;
        gap: 8px; min-height: 42px;
        padding: 8px 14px 8px 8px;
        border-radius: 14px;
        background: var(--bg-soft); border: 1px solid var(--border);
        color: var(--text); text-decoration: none;
        font-weight: 800; font-size: 0.88rem;
        transition: all 0.16s ease;
      }
      .inst-contact-action:hover { border-color: var(--primary); color: var(--primary); transform: translateY(-1px); }
      .inst-contact-icon {
        width: 30px; height: 30px; border-radius: 10px;
        display: inline-flex; align-items: center; justify-content: center;
        color: #fff; flex: 0 0 30px;
      }
      .inst-contact-icon svg { width: 16px; height: 16px; }
      .inst-contact-call .inst-contact-icon { background: linear-gradient(135deg, var(--primary), #0c6f3d); }
      .inst-contact-whatsapp .inst-contact-icon { background: linear-gradient(135deg, #25D366, #128C7E); }

      /* Trust strip */
      .inst-trust {
        position: relative; z-index: 5;
        display: flex; justify-content: center; flex-wrap: wrap;
        gap: 28px; padding: 8px 20px 32px;
      }
      .inst-trust-item {
        display: flex; align-items: center; gap: 8px;
        font-size: 0.82rem; font-weight: 700; color: var(--text-dim);
      }
      .inst-trust-item svg { width: 18px; height: 18px; color: var(--primary); }

      /* Modal overlay for verification and form */
      .inst-modal-overlay {
        position: fixed; inset: 0; z-index: 1000;
        background: rgba(15, 23, 42, 0.65);
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        padding: 16px; animation: instFadeIn 0.2s ease-out;
      }
      .inst-modal {
        background: var(--bg-soft, #ffffff);
        border: 1px solid var(--border);
        border-radius: 30px;
        box-shadow: var(--neu-shadow, 0 25px 60px rgba(15, 23, 42, 0.15));
        display: flex; flex-direction: column; overflow: hidden;
        animation: instSlideUp 0.3s cubic-bezier(0.34, 1.4, 0.64, 1);
        position: relative;
        width: 100%; max-width: 520px;
      }
      .inst-modal-header {
        padding: 20px 24px; display: flex; align-items: center; justify-content: space-between;
        border-bottom: 1px solid var(--border);
      }
      .inst-modal-title { font-size: 1.15rem; font-weight: 800; color: var(--text); display: flex; align-items: center; gap: 8px; }
      .inst-modal-title svg { width: 20px; height: 20px; color: var(--primary); }
      .inst-modal-close {
        background: none; border: none; font-size: 1.4rem; color: var(--text-dim); cursor: pointer;
        padding: 4px; display: flex; align-items: center; justify-content: center; border-radius: 50%;
        transition: background 0.2s, color 0.2s; width: 32px; height: 32px;
      }
      .inst-modal-close:hover { background: var(--border); color: var(--text); }
      .inst-modal-close svg { width: 16px; height: 16px; flex-shrink: 0; }
      .inst-modal-body { padding: 24px; overflow-y: auto; max-height: 80vh; }
      
      /* Steps bar */
      .inst-steps { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; position: relative; }
      .inst-step-item { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; font-weight: 700; color: var(--text-dim); z-index: 2; }
      .inst-step-item.active { color: var(--primary); }
      .inst-step-num {
        width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        background: var(--bg-soft); border: 2px solid var(--border); color: var(--text-dim); font-size: 0.75rem; transition: all 0.25s;
      }
      .inst-step-item.active .inst-step-num { background: var(--primary); border-color: var(--primary); color: #fff; }
      .inst-step-line {
        position: absolute; top: 13px; left: 10px; right: 10px; height: 2px;
        background: var(--border); z-index: 1;
      }
      
      /* Form Layouts */
      .inst-form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
      .inst-form-group label { font-size: 0.82rem; font-weight: 700; color: var(--text-soft); }
      .inst-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      
      .inst-timer-text { font-size: 0.8rem; color: var(--text-dim); text-align: center; margin-top: 14px; line-height: 1.4; }
      .inst-resend-link { color: var(--primary); text-decoration: none; font-weight: 700; cursor: pointer; margin-left: 4px; }
      .inst-resend-link.disabled { color: var(--text-dim); cursor: not-allowed; text-decoration: none; font-weight: normal; }

      /* Success Screen */
      .inst-success-box { text-align: center; padding: 16px 0; }
      .inst-success-icon {
        width: 64px; height: 64px; border-radius: 50%; background: rgba(16, 185, 129, 0.1);
        border: 2px solid var(--primary); color: var(--primary); display: flex; align-items: center;
        justify-content: center; margin: 0 auto 18px; font-size: 2rem;
      }
      .inst-success-icon svg { width: 32px; height: 32px; flex-shrink: 0; }

      @keyframes instFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes instSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

      @media (max-width: 640px) {
        .inst-nav-word { display: none !important; }
        .inst-grid { grid-template-columns: 1fr; }
        .inst-hero h1 { font-size: 1.7rem; }
        .inst-form-row { grid-template-columns: 1fr; gap: 0; }
      }
    </style>

    <div class="inst-page">
      <div class="inst-bg-mesh" aria-hidden="true">
        <span class="im1"></span><span class="im2"></span><span class="im3"></span>
      </div>

      <nav class="inst-nav">
        <a class="inst-nav-brand" href="#" id="inst-back-logo">
          <img src="${LOGO}" alt="" class="inst-nav-logo"
               onerror="this.style.display='none';this.parentElement.querySelector('.inst-nav-word').innerHTML='<b>NE</b>'"/>
          <span class="inst-nav-word"><b>Networking Experts</b><small>Installation Services</small></span>
        </a>
        <div class="inst-nav-actions">
          <button class="srf-icon-btn inst-theme-btn" title="Toggle theme">${themeIcon}</button>
          <button class="inst-back-btn" id="inst-back-btn">${ICONS.arrowLeft}<span>Back</span></button>
        </div>
      </nav>

      <section class="inst-hero">
        <div class="inst-hero-badge">${ICONS.box}<span>Professional Installation</span></div>
        <h1>Expert installations,<br/><span>done right the first time.</span></h1>
        <p>CCTV, networking, smart home & more — pick a service below and book your visit in minutes. Our certified technicians cover the entire valley.</p>
      </section>

      <div class="inst-trust">
        <div class="inst-trust-item">${ICONS.shield}<span>Certified technicians</span></div>
        <div class="inst-trust-item">${ICONS.clock}<span>Same-day dispatch</span></div>
        <div class="inst-trust-item">${ICONS.star}<span>4.9★ rating</span></div>
        <div class="inst-trust-item">${ICONS.check}<span>30-day warranty</span></div>
      </div>

      <div class="inst-grid">
        ${INSTALL_TYPES.map((t, i) => `
          <div class="inst-card" data-idx="${i}">
            <div class="inst-card-accent" style="background:${t.color};"></div>
            <div class="inst-card-body">
              <div class="inst-card-head">
                <div class="inst-card-icon" style="background:${t.color}15; border: 1px solid ${t.color}30;">${t.icon}</div>
                <div>
                  <div class="inst-card-title">${escapeHTML(t.label)}</div>
                  <div class="inst-card-tagline">${escapeHTML(t.tagline)}</div>
                </div>
              </div>
              <div class="inst-highlights">
                ${t.highlights.map(h => `<span class="inst-hl-tag" style="background:${t.color}12; color:${t.color}; border: 1px solid ${t.color}20;">${escapeHTML(h)}</span>`).join('')}
              </div>
              <ul class="inst-includes">
                ${t.includes.map(x => `<li>${ICONS.check}<span>${escapeHTML(x)}</span></li>`).join('')}
              </ul>
            </div>
            <div class="inst-card-footer">
              <button class="inst-book-btn" data-install="${escapeHTML(t.label)}">
                <span>Book ${escapeHTML(t.label.split(' ')[0])}</span> ${ICONS.arrowRight}
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      <section class="inst-contact">
        <div class="inst-contact-card">
          <div class="inst-contact-copy">
            <span class="inst-contact-kicker">Need help choosing?</span>
            <a class="inst-contact-number" href="${SERVICE_CONTACT_TEL}">${SERVICE_CONTACT_DISPLAY}</a>
            <span class="inst-contact-note">Our team will help you pick the right installation package.</span>
          </div>
          <div class="inst-contact-actions">
            <a class="inst-contact-action inst-contact-call" href="${SERVICE_CONTACT_TEL}" aria-label="Call">
              <span class="inst-contact-icon">${ICONS.phone}</span><span>Call</span>
            </a>
            <a class="inst-contact-action inst-contact-whatsapp" href="${SERVICE_CONTACT_WHATSAPP}" target="_blank" rel="noopener" aria-label="WhatsApp">
              <span class="inst-contact-icon">${ICONS.whatsapp}</span><span>WhatsApp</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  `;

  // ── Event bindings ──
  const goBack = () => {
    if (typeof onBack === 'function') onBack();
  };

  container.querySelector('#inst-back-btn')?.addEventListener('click', goBack);
  container.querySelector('#inst-back-logo')?.addEventListener('click', (e) => {
    e.preventDefault();
    goBack();
  });

  container.querySelector('.inst-theme-btn')?.addEventListener('click', () => {
    toggleTheme();
    renderInstallPage(container, onBack);
  });

  // Book buttons — open the interactive OTP/booking modal
  container.querySelectorAll('.inst-book-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const label = btn.dataset.install || '';
      openBookingModal(label);
    });
  });
}

function openBookingModal(installType) {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'inst-modal-overlay';
  document.body.appendChild(overlay);

  let state = {
    step: 1, // 1: Enter Phone, 2: Enter OTP, 3: Form details, 4: Success
    phone: '',
    otp: '',
    timer: 60,
    timerInterval: null
  };

  function cleanupTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function startCountdown() {
    cleanupTimer();
    state.timer = 60;
    state.timerInterval = setInterval(() => {
      state.timer--;
      const textEl = overlay.querySelector('#inst-timer-display');
      if (textEl) {
        if (state.timer > 0) {
          textEl.innerHTML = `Resend code in <b>${state.timer}s</b>`;
        } else {
          cleanupTimer();
          textEl.innerHTML = `Didn't get code? <span class="inst-resend-link" id="inst-resend-btn">Resend OTP</span>`;
          overlay.querySelector('#inst-resend-btn')?.addEventListener('click', handleResendOtp);
        }
      }
    }, 1000);
  }

  async function handleSendOtp() {
    const phoneInput = overlay.querySelector('#inst-phone-field');
    const phoneVal = (phoneInput?.value || '').replace(/\D/g, '');
    if (phoneVal.length !== 10) {
      toast('Please enter a valid 10-digit mobile number.', 'error');
      return;
    }
    const fullPhone = `+91${phoneVal}`;
    
    const sendBtn = overlay.querySelector('#inst-send-otp-btn');
    const restoreBtn = setButtonLoading(sendBtn, 'Sending');

    const res = await postPublicApi('/otp/send', { phone: fullPhone });
    restoreBtn();

    if (res.ok) {
      state.phone = fullPhone;
      state.step = 2;
      renderModalBody();
      startCountdown();
      toast('OTP sent successfully!', 'success');
    } else {
      toast(res.error || 'Failed to send OTP. Please try again.', 'error');
    }
  }

  async function handleResendOtp() {
    const res = await postPublicApi('/otp/resend', { phone: state.phone });
    if (res.ok) {
      startCountdown();
      toast('OTP resent successfully!', 'success');
    } else {
      toast(res.error || 'Failed to resend OTP. Please try again.', 'error');
    }
  }

  async function handleVerifyOtp() {
    const otpInput = overlay.querySelector('#inst-otp-field');
    const otpVal = (otpInput?.value || '').trim();
    if (otpVal.length !== 6) {
      toast('Please enter the 6-digit verification code.', 'error');
      return;
    }

    const verifyBtn = overlay.querySelector('#inst-verify-otp-btn');
    const restoreBtn = setButtonLoading(verifyBtn, 'Verifying');

    const res = await postPublicApi('/otp/verify', { phone: state.phone, otp: otpVal });
    restoreBtn();

    if (res.ok && res.verified) {
      cleanupTimer();
      state.otp = otpVal;
      state.step = 3;
      renderModalBody();
      toast('Phone verified successfully!', 'success');
    } else {
      toast(res.error || 'Incorrect code. Please check and try again.', 'error');
    }
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    
    const submitBtn = form.querySelector('#inst-submit-request-btn');
    const restoreBtn = setButtonLoading(submitBtn, 'Registering');

    const ticketNo = generateInstallTicketNo();

    const payload = {
      ticket_no: ticketNo,
      full_name: form.elements.fullName.value.trim(),
      phone: state.phone,
      company_name: form.elements.companyName.value.trim() || null,
      location: form.elements.locationName.value.trim(),
      installation_type: installType,
      preferred_date: form.elements.prefDate.value,
      preferred_time: form.elements.prefTime.value,
      address: form.elements.address.value.trim(),
      description: form.elements.description.value.trim() || null,
      status: 'pending'
    };

    const res = await postPublicApi('/data/installations', payload);
    restoreBtn();

    if (res.ok) {
      state.step = 4;
      state.ticketNo = ticketNo;
      renderModalBody();
      toast('Installation request booked!', 'success');
    } else {
      toast(res.error || 'Could not register installation. Please try again.', 'error');
    }
  }

  function setButtonLoading(btn, label = 'Loading...') {
    if (!btn) return () => {};
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML = `<span class="btn-spinner"></span> <span>${label}</span>`;
    return () => {
      btn.disabled = false;
      btn.classList.remove('is-loading');
      btn.innerHTML = originalHTML;
    };
  }

  function renderModalBody() {
    let bodyHtml = '';

    // Header progress tracker
    let stepsHtml = '';
    if (state.step <= 3) {
      stepsHtml = `
        <div class="inst-steps">
          <div class="inst-step-line"></div>
          <div class="inst-step-item ${state.step >= 1 ? 'active' : ''}">
            <div class="inst-step-num">1</div>
            <span>Phone</span>
          </div>
          <div class="inst-step-item ${state.step >= 2 ? 'active' : ''}">
            <div class="inst-step-num">2</div>
            <span>Verify</span>
          </div>
          <div class="inst-step-item ${state.step >= 3 ? 'active' : ''}">
            <div class="inst-step-num">3</div>
            <span>Details</span>
          </div>
        </div>
      `;
    }

    if (state.step === 1) {
      bodyHtml = `
        ${stepsHtml}
        <div style="text-align: center; margin-bottom: 24px;">
          <h3 style="margin:0 0 8px; color:var(--text)">Verify Your Mobile</h3>
          <p style="margin:0; font-size:0.88rem; color:var(--text-dim)">To request an installation, please verify your mobile number first.</p>
        </div>
        <div class="inst-form-group">
          <label class="srf-label" for="inst-phone-field">Mobile Number</label>
          <div class="srf-input-wrap">
            <span class="srf-cc">+91</span>
            <input type="tel" id="inst-phone-field" class="srf-input" maxlength="10" placeholder="Enter 10-digit number" autocomplete="tel" />
          </div>
        </div>
        <button class="btn btn-primary btn-wide" id="inst-send-otp-btn" style="margin-top:10px;">
          <span>Send OTP</span> ${ICONS.arrowRight}
        </button>
      `;
    } else if (state.step === 2) {
      bodyHtml = `
        ${stepsHtml}
        <div style="text-align: center; margin-bottom: 24px;">
          <h3 style="margin:0 0 8px; color:var(--text)">Enter Verification Code</h3>
          <p style="margin:0; font-size:0.88rem; color:var(--text-dim)">We sent a 6-digit OTP code to <b style="color:var(--text)">${state.phone}</b></p>
        </div>
        <div class="inst-form-group">
          <div style="display:flex; justify-content:center; width:100%;">
            <div class="srf-input-wrap" style="max-width:200px; width:100%; justify-content:center;">
              <input type="text" id="inst-otp-field" class="srf-input" maxlength="6" placeholder="••••••" style="letter-spacing:0.4em; text-align:center; font-size:1.6rem; font-weight:800; padding:10px 0; border:none; background:transparent;" />
            </div>
          </div>
        </div>
        <button class="btn btn-primary btn-wide" id="inst-verify-otp-btn" style="margin-top:14px;">
          <span>Verify & Proceed</span> ${ICONS.check}
        </button>
        <div class="inst-timer-text" id="inst-timer-display">Resend code in <b>60s</b></div>
      `;
    } else if (state.step === 3) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const minDate = tomorrow.toISOString().split('T')[0];

      bodyHtml = `
        ${stepsHtml}
        <div style="text-align: center; margin-bottom: 20px;">
          <h3 style="margin:0 0 4px; color:var(--text)">Installation Details</h3>
          <p style="margin:0; font-size:0.85rem; color:var(--text-dim)">Booking for: <b style="color:var(--primary)">${escapeHTML(installType)}</b></p>
        </div>
        <form id="inst-booking-form">
          <div class="inst-form-group">
            <label class="srf-label">Full Name</label>
            <div class="srf-input-wrap">
              <input type="text" name="fullName" class="srf-input" placeholder="Your full name" required />
            </div>
          </div>
          <div class="inst-form-row">
            <div class="inst-form-group">
              <label class="srf-label">Company Name <span class="srf-optional">(Optional)</span></label>
              <div class="srf-input-wrap">
                <input type="text" name="companyName" class="srf-input" placeholder="e.g. Acme Corp" />
              </div>
            </div>
            <div class="inst-form-group">
              <label class="srf-label">Location Name</label>
              <div class="srf-input-wrap">
                <input type="text" name="locationName" class="srf-input" placeholder="e.g. Home, Office, Server Room" required />
              </div>
            </div>
          </div>
          <div class="inst-form-row">
            <div class="inst-form-group">
              <label class="srf-label">Preferred Date</label>
              <div class="srf-input-wrap">
                <input type="date" name="prefDate" min="${minDate}" class="srf-input" required style="width:100%; border:none; background:transparent;" />
              </div>
            </div>
            <div class="inst-form-group">
              <label class="srf-label">Time Slot</label>
              <div class="srf-input-wrap">
                <select name="prefTime" class="srf-input srf-select" required>
                  <option value="10:00 AM - 01:00 PM">10:00 AM - 01:00 PM</option>
                  <option value="01:00 PM - 04:00 PM">01:00 PM - 04:00 PM</option>
                  <option value="04:00 PM - 07:00 PM">04:00 PM - 07:00 PM</option>
                </select>
              </div>
            </div>
          </div>
          <div class="inst-form-group">
            <label class="srf-label">Complete Installation Address</label>
            <div class="srf-input-wrap" style="align-items: flex-start; padding: 10px 14px;">
              <textarea name="address" class="srf-input" placeholder="House/Office No, Building name, Street details, Landmark" rows="3" required style="resize:vertical; width:100%; border:none; background:transparent; font-family:inherit; font-size:0.98rem;"></textarea>
            </div>
          </div>
          <div class="inst-form-group">
            <label class="srf-label">Special Instructions <span class="srf-optional">(Optional)</span></label>
            <div class="srf-input-wrap" style="align-items: flex-start; padding: 10px 14px;">
              <textarea name="description" class="srf-input" placeholder="Tell us about camera heights, specific cabling routes, etc." rows="2" style="resize:vertical; width:100%; border:none; background:transparent; font-family:inherit; font-size:0.98rem;"></textarea>
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-wide" id="inst-submit-request-btn" style="margin-top:10px;">
            <span>Book Installation</span> ${ICONS.check}
          </button>
        </form>
      `;
    } else if (state.step === 4) {
      bodyHtml = `
        <div class="inst-success-box">
          <div class="inst-success-icon">${ICONS.check}</div>
          <h3 style="margin:0 0 8px; color:var(--text); font-size:1.4rem;">Booking Confirmed!</h3>
          <p style="margin:0 0 24px; font-size:0.92rem; color:var(--text-dim); line-height:1.5;">
            Your request for <b>${escapeHTML(installType)}</b> has been registered successfully.
          </p>
          <div style="background:var(--bg-soft); border:1px solid var(--border); padding:16px; border-radius:16px; margin-bottom:24px; text-align:center;">
            <span style="font-size:0.75rem; font-weight:800; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em; display:block; margin-bottom:4px;">Your Ticket Number</span>
            <code style="font-size:1.25rem; font-weight:800; color:var(--primary); font-family:monospace; letter-spacing:0.02em;">${state.ticketNo}</code>
          </div>
          <p style="font-size:0.82rem; color:var(--text-dim); margin-bottom:24px;">An SMS confirmation with details has been sent to your verified mobile number.</p>
          <button class="btn btn-primary btn-wide" id="inst-success-close-btn">
            <span>Finish</span>
          </button>
        </div>
      `;
    }

    overlay.querySelector('.inst-modal-body').innerHTML = bodyHtml;

    // Bind events inside the body
    if (state.step === 1) {
      const sendBtn = overlay.querySelector('#inst-send-otp-btn');
      sendBtn.addEventListener('click', handleSendOtp);
      const phoneInput = overlay.querySelector('#inst-phone-field');
      phoneInput.focus();
      phoneInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSendOtp();
      });
    } else if (state.step === 2) {
      const verifyBtn = overlay.querySelector('#inst-verify-otp-btn');
      verifyBtn.addEventListener('click', handleVerifyOtp);
      const otpInput = overlay.querySelector('#inst-otp-field');
      otpInput.focus();
      otpInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleVerifyOtp();
      });
    } else if (state.step === 3) {
      const form = overlay.querySelector('#inst-booking-form');
      form.addEventListener('submit', handleFormSubmit);
    } else if (state.step === 4) {
      const closeBtn = overlay.querySelector('#inst-success-close-btn');
      closeBtn.addEventListener('click', () => {
        cleanupTimer();
        overlay.remove();
      });
    }
  }

  // Initial modal shell paint
  overlay.innerHTML = `
    <div class="inst-modal">
      <div class="inst-modal-header">
        <span class="inst-modal-title">${ICONS.box} <span>Book Installation</span></span>
        <button class="inst-modal-close" id="inst-modal-close-btn">${ICONS.close}</button>
      </div>
      <div class="inst-modal-body"></div>
    </div>
  `;

  // Bind close buttons
  overlay.querySelector('#inst-modal-close-btn').onclick = () => {
    cleanupTimer();
    overlay.remove();
  };
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      cleanupTimer();
      overlay.remove();
    }
  };

  renderModalBody();
}
