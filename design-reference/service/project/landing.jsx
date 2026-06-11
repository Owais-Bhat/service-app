/* Public client-facing landing page: New Request (OTP flow) / Track / Complaint.
   window.ClientLanding */
(function () {
  const { useState, useRef, useEffect } = React;
  const I = (p) => React.createElement(window.Icon, p);

  const SERVICES = ['CCTV Cameras', 'Networking / Internet', 'Biometric & Attendance', 'Gate Automation', 'Intercom / VDP', 'Other'];

  function randCaptcha() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    return Array.from({ length: 5 }, () => c[Math.floor(Math.random() * c.length)]).join('');
  }
  function genTicket() {
    const d = new Date();
    const ymd = '' + (d.getFullYear() % 100) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return 'NEST-' + ymd + '-' + Math.floor(1000 + Math.random() * 9000);
  }

  // ---------------- NEW REQUEST (3-step) ----------------
  function NewRequest() {
    const [step, setStep] = useState(1);
    const [phone, setPhone] = useState('');
    const [captcha] = useState(randCaptcha);
    const [capInput, setCapInput] = useState('');
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [ticket, setTicket] = useState('');
    const otpRefs = useRef([]);

    const setOtpAt = (i, v) => {
      if (!/^\d?$/.test(v)) return;
      const next = otp.slice(); next[i] = v; setOtp(next);
      if (v && i < 5) otpRefs.current[i + 1]?.focus();
    };
    const otpKey = (i, e) => { if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus(); };

    const steps = [['Verify', 1], ['OTP', 2], ['Details', 3]];

    return React.createElement('div', null,
      // stepper
      React.createElement('div', { className: 'stepper' },
        steps.map(([lbl, n], idx) => React.createElement(React.Fragment, { key: n },
          React.createElement('div', { className: 'step' + (step === n ? ' on' : '') + (step > n ? ' done' : '') },
            React.createElement('div', { className: 'step-dot' }, step > n ? I({ name: 'check', size: 16 }) : n),
            React.createElement('div', { className: 'step-label' }, lbl)),
          idx < 2 ? React.createElement('div', { className: 'step-line' + (step > n ? ' fill' : '') }, React.createElement('i')) : null,
        ))),

      // STEP 1 — verify phone
      step === 1 && React.createElement('div', { className: 'in' },
        React.createElement('h3', null, 'Enter your mobile number'),
        React.createElement('p', { className: 'lede' }, "We'll send a one-time code to verify it's you."),
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'Phone number'),
          React.createElement('div', { className: 'phone-input' },
            I({ name: 'phone' }), React.createElement('span', { className: 'cc' }, '+91'),
            React.createElement('input', { value: phone, onChange: (e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)), placeholder: '98765 43210', inputMode: 'numeric' }))),
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'Quick check — type these letters'),
          React.createElement('div', { className: 'captcha' },
            React.createElement('div', { className: 'captcha-box' }, captcha.split('').map((c, i) => React.createElement('span', { key: i }, c))),
            React.createElement('button', { className: 'captcha-refresh', title: 'Refresh' }, I({ name: 'refreshCw' }))),
          React.createElement('input', { style: { marginTop: 10, width: '100%', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 13, padding: '12px 14px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)' }, value: capInput, onChange: (e) => setCapInput(e.target.value.toUpperCase().slice(0, 5)), placeholder: 'Enter the letters' })),
        React.createElement('button', { className: 'btn btn-primary', style: { width: '100%', padding: '14px' }, onClick: () => setStep(2) },
          I({ name: 'chat' }), 'Send code by SMS'),
      ),

      // STEP 2 — OTP
      step === 2 && React.createElement('div', { className: 'in' },
        React.createElement('h3', null, 'Enter the code'),
        React.createElement('p', { className: 'lede' }, 'We sent a 6-digit code to ', React.createElement('b', { style: { color: 'var(--text)' } }, '+91 ' + (phone || '98765 43210') + '.')),
        React.createElement('div', { className: 'otp-row' },
          otp.map((d, i) => React.createElement('input', {
            key: i, ref: (el) => otpRefs.current[i] = el, className: 'otp-box' + (d ? ' filled' : ''),
            value: d, inputMode: 'numeric', maxLength: 1,
            onChange: (e) => setOtpAt(i, e.target.value), onKeyDown: (e) => otpKey(i, e),
          }))),
        React.createElement('div', { className: 'otp-hint' }, "Didn't get it? ", React.createElement('button', { className: 'link-btn' }, 'Resend in 0:28')),
        React.createElement('div', { style: { display: 'flex', gap: 12, marginTop: 18 } },
          React.createElement('button', { className: 'btn btn-ghost', style: { flex: '0 0 auto', padding: '14px 18px' }, onClick: () => setStep(1) }, 'Back'),
          React.createElement('button', { className: 'btn btn-primary', style: { flex: 1, padding: '14px' }, onClick: () => setStep(3) }, I({ name: 'shield' }), 'Verify & continue')),
      ),

      // STEP 3 — details
      step === 3 && !ticket && React.createElement('div', { className: 'in' },
        React.createElement('h3', null, 'Tell us what you need'),
        React.createElement('p', { className: 'lede' }, "Share a few details and we'll dispatch the right technician."),
        React.createElement('div', { className: 'grid', style: { gridTemplateColumns: '1fr 1fr', gap: 0, columnGap: 16, display: 'grid' } },
          React.createElement('div', { className: 'field' }, React.createElement('label', null, 'Your name'), React.createElement('input', { placeholder: 'Full name' })),
          React.createElement('div', { className: 'field' }, React.createElement('label', null, 'Service type'),
            React.createElement('select', null, SERVICES.map((s) => React.createElement('option', { key: s }, s))))),
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'Service address'),
          React.createElement('input', { placeholder: 'Area, landmark, city' })),
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'Describe the issue'),
          React.createElement('textarea', { placeholder: 'e.g. One of our 4 cameras has gone offline since yesterday…' })),
        React.createElement('button', { className: 'btn btn-primary', style: { width: '100%', padding: '14px' }, onClick: () => setTicket(genTicket()) },
          I({ name: 'check' }), 'Submit request'),
      ),

      // SUCCESS
      ticket && React.createElement('div', { className: 'success-state' },
        React.createElement('div', { className: 'success-ring' }, I({ name: 'check', size: 40, strokeWidth: 2.4 })),
        React.createElement('h3', null, 'Request received!'),
        React.createElement('p', { className: 'lede', style: { marginBottom: 0 } }, 'A technician will be assigned shortly. Save your ticket number to track progress.'),
        React.createElement('div', { className: 'ticket-pill' }, I({ name: 'ticket' }), ticket),
        React.createElement('div', null, React.createElement('button', { className: 'btn btn-ghost', onClick: () => { setTicket(''); setStep(1); setOtp(['','','','','','']); setPhone(''); setCapInput(''); } }, I({ name: 'refreshCw' }), 'Raise another request')),
      ),
    );
  }

  // ---------------- TRACK ----------------
  function TrackRequest() {
    const [shown, setShown] = useState(false);
    return React.createElement('div', null,
      React.createElement('h3', null, 'Track your requests'),
      React.createElement('p', { className: 'lede' }, "Enter your mobile number to see every ticket you've filed. Add a ticket number to jump straight to one."),
      React.createElement('div', { className: 'field' },
        React.createElement('label', null, 'Phone number'),
        React.createElement('div', { className: 'phone-input' }, I({ name: 'phone' }), React.createElement('span', { className: 'cc' }, '+91'),
          React.createElement('input', { placeholder: '98765 43210', inputMode: 'numeric' }))),
      React.createElement('div', { className: 'field' },
        React.createElement('label', null, 'Ticket number ', React.createElement('span', { style: { color: 'var(--text-3)', fontWeight: 400 } }, '(optional)')),
        React.createElement('div', { className: 'phone-input' }, I({ name: 'ticket' }),
          React.createElement('input', { placeholder: 'NEST-260607-1234', style: { fontFamily: 'var(--font-mono)' } }))),
      React.createElement('button', { className: 'btn btn-primary', style: { width: '100%', padding: '14px' }, onClick: () => setShown(true) }, I({ name: 'search' }), 'Show my tickets'),
      shown && React.createElement('div', { className: 'track-results in' },
        React.createElement('div', { className: 'section-h' }, I({ name: 'ticket' }), 'Your tickets'),
        React.createElement('div', { className: 'list' },
          window.DATA.clientTickets.map((t, i) => React.createElement('div', { key: i, className: 'lrow' },
            React.createElement('div', { className: 'lrow-ico' }, I({ name: t.icon })),
            React.createElement('div', { className: 'lrow-main' },
              React.createElement('b', null, t.title),
              React.createElement('span', null, React.createElement('em', { className: 'id-mono', style: { fontStyle: 'normal' } }, t.id), ' · ', t.when)),
            React.createElement(window.StatusBadge, { status: t.status })))),
      ),
    );
  }

  // ---------------- COMPLAINT ----------------
  function Complaint() {
    const [sent, setSent] = useState(false);
    if (sent) return React.createElement('div', { className: 'success-state' },
      React.createElement('div', { className: 'success-ring' }, I({ name: 'check', size: 40, strokeWidth: 2.4 })),
      React.createElement('h3', null, 'Complaint registered'),
      React.createElement('p', { className: 'lede', style: { marginBottom: 0 } }, "Our team will review it against your ticket and get back to you within a few hours."),
      React.createElement('div', { style: { marginTop: 22 } }, React.createElement('button', { className: 'btn btn-ghost', onClick: () => setSent(false) }, 'File another')));
    return React.createElement('div', null,
      React.createElement('h3', null, 'File a complaint'),
      React.createElement('p', { className: 'lede' }, 'Tell us what went wrong with a previous service. We verify the ticket against your number before forwarding it to the team.'),
      React.createElement('div', { className: 'field' },
        React.createElement('label', null, 'Ticket number'),
        React.createElement('div', { className: 'phone-input' }, I({ name: 'ticket' }),
          React.createElement('input', { placeholder: 'NEST-260607-1234', style: { fontFamily: 'var(--font-mono)' } }))),
      React.createElement('div', { className: 'field' },
        React.createElement('label', null, 'Phone number'),
        React.createElement('div', { className: 'phone-input' }, I({ name: 'phone' }), React.createElement('span', { className: 'cc' }, '+91'),
          React.createElement('input', { placeholder: '98765 43210', inputMode: 'numeric' }))),
      React.createElement('div', { className: 'field' },
        React.createElement('label', null, "What's the issue?"),
        React.createElement('textarea', { placeholder: "Describe what went wrong — the issue came back, the technician didn't show, billing was wrong, etc.", style: { minHeight: 120 } })),
      React.createElement('button', { className: 'btn btn-primary', style: { width: '100%', padding: '14px' }, onClick: () => setSent(true) }, I({ name: 'edit' }), 'Submit complaint'),
    );
  }

  // ---------------- LANDING SHELL ----------------
  function ClientLanding({ theme, setTheme, onStaff, onTech }) {
    const [tab, setTab] = useState('new');
    const TABS = [['new', 'New Request', 'sparkle'], ['track', 'Track Request', 'search'], ['complaint', 'Complaint', 'shield']];
    return React.createElement('div', { className: 'landing' },
      // top bar
      React.createElement('div', { className: 'landing-top' },
        React.createElement('div', { className: 'logo-mark' }, I({ name: 'shield', size: 22 })),
        React.createElement('div', { className: 'logo-word' }, React.createElement('b', null, 'NEST'), React.createElement('small', null, 'Networking Experts')),
        React.createElement('div', { className: 'spacer' }),
        React.createElement('button', { className: 'icon-btn', onClick: () => setTheme(theme === 'light' ? 'dark' : 'light'), title: 'Toggle theme', style: { background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' } }, I({ name: theme === 'light' ? 'moon' : 'sun' })),
        React.createElement('button', { className: 'staff-btn', onClick: onTech }, I({ name: 'users' }), 'Technician'),
        React.createElement('button', { className: 'staff-btn', onClick: onStaff }, I({ name: 'lock' }), 'Staff login'),
      ),
      // hero
      React.createElement('div', { className: 'landing-hero' },
        React.createElement('div', { className: 'hero-badge in' }, I({ name: 'shield' }), 'Verified Service Request'),
        React.createElement('h1', { className: 'in', style: { '--d': '.05s' } }, 'Need help?', React.createElement('span', { className: 'a2' }, "We'll be there in minutes.")),
        React.createElement('p', { className: 'in', style: { '--d': '.1s' } }, "Raise a service request in three quick steps. We'll send a one-time code by SMS, take your details, and dispatch the right technician."),
      ),
      // grid
      React.createElement('div', { className: 'landing-grid' },
        // promo
        React.createElement('div', { className: 'promo in', style: { '--d': '.14s' } },
          React.createElement('div', { className: 'grid-pat' }),
          React.createElement('div', { className: 'promo-top' },
            React.createElement('span', { className: 'promo-tag' }, I({ name: 'camera', size: 14 }), 'NEST Smart Security'),
            React.createElement('button', { className: 'promo-play', title: 'Watch how it works' }, I({ name: 'play', size: 26 }))),
          React.createElement('div', { className: 'promo-body' },
            React.createElement('h3', null, 'CCTV, networking & automation — installed and supported by experts.'),
            React.createElement('p', null, 'From a single camera to a full smart-security setup, our certified technicians have you covered across the valley.')),
          React.createElement('div', { className: 'promo-stats' },
            React.createElement('div', { className: 'ps' }, React.createElement('b', null, '12 hr'), React.createElement('span', null, 'Avg. resolution')),
            React.createElement('div', { className: 'ps' }, React.createElement('b', null, '4,200+'), React.createElement('span', null, 'Jobs completed')),
            React.createElement('div', { className: 'ps' }, React.createElement('b', null, '4.9★'), React.createElement('span', null, 'Customer rating'))),
        ),
        // request card
        React.createElement('div', { className: 'glass req-card in', style: { '--d': '.18s' } },
          React.createElement('div', { className: 'req-tabs' },
            TABS.map(([id, lbl, ic]) => React.createElement('button', { key: id, className: 'req-tab' + (tab === id ? ' on' : ''), onClick: () => setTab(id) }, I({ name: ic }), lbl))),
          React.createElement('div', { className: 'req-body' },
            tab === 'new' ? React.createElement(NewRequest)
              : tab === 'track' ? React.createElement(TrackRequest)
              : React.createElement(Complaint)),
        ),
      ),
      // urgent support
      React.createElement('div', { className: 'glass urgent-bar in', style: { '--d': '.22s' } },
        React.createElement('div', { className: 'u-info' },
          React.createElement('div', { className: 'lbl' }, 'Need urgent support?'),
          React.createElement('div', { className: 'num' }, '+91 88991 33144'),
          React.createElement('p', null, 'Direct line for service requests, billing and technician updates.')),
        React.createElement('div', { className: 'u-actions' },
          React.createElement('a', { className: 'u-action u-call', href: 'tel:+918899133144' }, I({ name: 'phone' }), 'Call'),
          React.createElement('a', { className: 'u-action u-wa', href: '#' }, I({ name: 'chat' }), 'WhatsApp')),
      ),
    );
  }

  window.ClientLanding = ClientLanding;
})();
