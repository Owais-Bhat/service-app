import { toggleTheme, toast } from '../utils.js';
import { ICONS } from '../icons.js';

const LOGO = new URL('../assets/logo.png', import.meta.url).href;

const SERVICE_CONTACT_PHONE = '8899133144';
const SERVICE_CONTACT_DISPLAY = '+91 88991 33144';
const SERVICE_CONTACT_TEL = `tel:+91${SERVICE_CONTACT_PHONE}`;
const SERVICE_CONTACT_WHATSAPP = `https://wa.me/91${SERVICE_CONTACT_PHONE}?text=${encodeURIComponent('Hello Networking Experts, I need help with a new installation.')}`;

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

      @media (max-width: 640px) {
        .inst-nav-word { display: none !important; }
        .inst-grid { grid-template-columns: 1fr; }
        .inst-hero h1 { font-size: 1.7rem; }
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

  // Book buttons — go back to landing with installType pre-set
  container.querySelectorAll('.inst-book-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const label = btn.dataset.install || '';
      if (typeof onBack === 'function') onBack(label);
    });
  });
}
