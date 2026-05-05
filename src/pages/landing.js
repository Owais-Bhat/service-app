import { toggleTheme } from '../utils.js';

const LOGO = new URL('../assets/logo.png', import.meta.url).href;

export function renderLandingPage(container, onPortalClick) {
  const savedTheme = localStorage.getItem('theme') || 'light';
  
  container.innerHTML = `
    <div class="landing-page">

      <!-- Animated Wave Background -->
      <div class="wave-bg">
        <svg class="waves" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
          viewBox="0 24 150 28" preserveAspectRatio="none">
          <defs>
            <path id="w" d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z"/>
          </defs>
          <g class="parallax">
            <use xlink:href="#w" x="48" y="0" fill="rgba(37,99,235,0.08)"/>
            <use xlink:href="#w" x="48" y="3" fill="rgba(16,185,129,0.06)"/>
            <use xlink:href="#w" x="48" y="5" fill="rgba(37,99,235,0.12)"/>
            <use xlink:href="#w" x="48" y="7" fill="rgba(232,239,248,0.9)"/>
          </g>
        </svg>
      </div>

      <!-- Navbar -->
      <nav class="landing-nav">
        <img src="${LOGO}" alt="Networking Experts" onerror="this.outerHTML='<span style=\'font-size:1.2rem;font-weight:800;color:var(--primary)\'>Networking Experts</span>'"/>
        <div style="display:flex; gap:12px; align-items:center;">
          <button class="btn btn-secondary theme-toggle-btn" style="padding: 8px 12px; border-radius: 50%; font-size: 1.2rem; min-width: 42px; min-height: 42px;" title="Toggle Theme">${savedTheme === 'dark' ? '☀️' : '🌙'}</button>
          <button class="btn btn-primary" id="nav-portal-btn">Client Portal →</button>
        </div>
      </nav>

      <!-- Hero -->
      <section class="hero-section">
        <div class="hero-content">
          <div class="hero-badge">🌐 Trusted IT Solutions Since 2010</div>
          <h1 class="hero-title">
            Powering Your Business with<br/>
            <span>Smart Technology</span>
          </h1>
          <p class="hero-subtitle">
            From enterprise networking and CCTV surveillance to 24/7 IT support — 
            we keep your operations running smoothly and securely.
          </p>
          <div class="hero-actions">
            <button class="hero-btn-primary" id="hero-portal-btn">Access Client Portal</button>
            <a href="#services" class="hero-btn-secondary">Our Services</a>
          </div>
        </div>
      </section>

      <!-- Services -->
      <section class="services-section" id="services">
        <div class="section-header">
          <h2>What We Do Best</h2>
          <p>Professional solutions for modern businesses</p>
        </div>
        <div class="services-grid">
          <div class="service-card">
            <div class="service-icon">🌐</div>
            <h3>Network Infrastructure</h3>
            <p>Enterprise-grade Wi-Fi, LAN/WAN, and fiber optic solutions designed for high-speed, uninterrupted connectivity.</p>
          </div>
          <div class="service-card">
            <div class="service-icon">🛡️</div>
            <h3>CCTV & Surveillance</h3>
            <p>Advanced IP camera systems with remote monitoring, AI-powered alerts, and cloud storage for total security.</p>
          </div>
          <div class="service-card">
            <div class="service-icon">💻</div>
            <h3>IT Support & Repair</h3>
            <p>On-site and remote technical support, hardware repairs, and preventive maintenance — keeping you online 24/7.</p>
          </div>
        </div>
      </section>

      <!-- Footer -->
      <footer class="landing-footer">
        <p>&copy; 2026 Networking Experts. All rights reserved.</p>
        <button class="btn btn-primary" id="footer-portal-btn">Access Portal →</button>
      </footer>
    </div>
  `;

  const go = () => onPortalClick();
  container.querySelector('.theme-toggle-btn').onclick = toggleTheme;
  container.querySelector('#nav-portal-btn').onclick = go;
  container.querySelector('#hero-portal-btn').onclick = go;
  container.querySelector('#footer-portal-btn').onclick = go;
}
