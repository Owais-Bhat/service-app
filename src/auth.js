import { signIn, signUp, getUserRole } from './supabase.js';
import { toast, toggleTheme } from './utils.js';

const LOGO = new URL('./assets/logo.png', import.meta.url).href;

export function renderAuth(onLogin) {
  const app = document.getElementById('app');
  let mode = 'login';

  const render = () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    app.innerHTML = `
      <div class="auth-page">
        <button class="btn btn-secondary theme-toggle-btn" style="position: absolute; top: 20px; right: 20px; padding: 8px 12px; border-radius: 50%; font-size: 1.2rem; min-width: 42px; min-height: 42px; z-index: 10;" title="Toggle Theme">${savedTheme === 'dark' ? '☀️' : '🌙'}</button>
        <div class="auth-card">
          <div class="auth-logo">
            <img src="${LOGO}" alt="Networking Experts" onerror="this.style.display='none'" />
          </div>
          <h2 class="auth-title">${mode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
          <p class="auth-subtitle">${mode === 'login' ? 'Sign in to your portal' : 'Register as a client'}</p>
          <div id="auth-error" class="auth-error" style="display:none"></div>

          <form id="auth-form">
            ${mode === 'signup' ? `
              <div class="form-group">
                <label>Full Name</label>
                <input type="text" id="full_name" placeholder="John Doe" required />
              </div>` : ''}
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" id="email" placeholder="you@example.com" required autocomplete="email"/>
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="password" placeholder="••••••••" required autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"/>
            </div>
            <button type="submit" class="btn btn-primary btn-wide" id="submit-btn">
              ${mode === 'login' ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>

          <div style="margin-top:24px;text-align:center;font-size:.88rem;color:var(--text-soft)">
            ${mode === 'login'
              ? `Don't have an account? <a href="#" id="toggle-mode" style="color:var(--primary);font-weight:700">Sign up</a>`
              : `Already have an account? <a href="#" id="toggle-mode" style="color:var(--primary);font-weight:700">Sign in</a>`}
          </div>
        </div>
      </div>`;

    app.querySelector('.theme-toggle-btn').addEventListener('click', () => {
      toggleTheme();
      render(); // Re-render to update the icon
    });

    document.getElementById('toggle-mode').onclick = (e) => { e.preventDefault(); mode = mode === 'login' ? 'signup' : 'login'; render(); };

    document.getElementById('auth-form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      const errEl = document.getElementById('auth-error');
      errEl.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Please wait…';

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      let res;

      if (mode === 'signup') {
        const fullName = document.getElementById('full_name').value.trim();
        res = await signUp(email, password, fullName);
      } else {
        res = await signIn(email, password);
      }

      if (res.error) {
        errEl.textContent = res.error.message;
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = mode === 'login' ? 'Sign In →' : 'Create Account →';
        return;
      }

      if (mode === 'signup') {
        toast('Account created! Please sign in.', 'success');
        mode = 'login';
        render();
      } else {
        const role = await getUserRole(res.data.user.id);
        onLogin(res.data.user, role);
      }
    };
  };

  render();
}
