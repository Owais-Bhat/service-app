import { signIn, supabase, getUserRole } from './supabase.js';
import { toast } from './utils.js';

const LOGO = `<svg width="160" height="44" viewBox="0 0 160 44" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="22" cy="22" r="18" fill="#1B4FD8" opacity=".15"/>
  <circle cx="22" cy="22" r="10" fill="#1B4FD8" opacity=".3"/>
  <circle cx="22" cy="22" r="5" fill="#1B4FD8"/>
  <circle cx="22" cy="22" r="2" fill="#fff"/>
  <text x="48" y="28" font-family="Inter,sans-serif" font-size="16" font-weight="800" fill="#fff">NETWORKING</text>
  <text x="48" y="42" font-family="Inter,sans-serif" font-size="10" font-weight="500" fill="#8892BB" letter-spacing="3">EXPERTS</text>
</svg>`;

export function renderAuth(onLogin) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">${LOGO}</div>
        <h1 class="auth-title">Welcome Back</h1>
        <p class="auth-subtitle">Sign in to your portal</p>
        <div id="auth-error" class="auth-error" style="display:none"></div>
        <form id="login-form">
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" id="email" placeholder="you@example.com" required autocomplete="email"/>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="password" placeholder="••••••••" required autocomplete="current-password"/>
          </div>
          <button type="submit" class="btn btn-primary" id="login-btn">Sign In</button>
        </form>
      </div>
    </div>`;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const errEl = document.getElementById('auth-error');
    errEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const { data, error } = await signIn(email, password);
    if (error) {
      errEl.textContent = error.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Sign In';
      return;
    }
    const role = await getUserRole(data.user.id);
    onLogin(data.user, role || 'client');
  });
}
