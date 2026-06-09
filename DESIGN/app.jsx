/* App shell: routing, sidebar, topbar, theme + role switch, Tweaks. */
(function () {
  const { useState, useEffect } = React;
  const I = (p) => React.createElement(window.Icon, p);

  // ---- nav configs ----
  const NAV = {
    admin: [
      { type: 'section', label: 'Main' },
      { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
      { id: 'all-tickets', icon: 'ticket', label: 'All Tickets', badge: 42 },
      { id: 'notifications', icon: 'bell', label: 'Notifications', badge: 3 },
      { type: 'section', label: 'Operations' },
      { id: 'attendance', icon: 'clock', label: 'Attendance' },
      { id: 'inquiries', icon: 'inbox', label: 'Service Requests' },
      { id: 'auto', icon: 'refresh', label: 'Auto Assignment' },
      { id: 'device-tracking', icon: 'wrench', label: 'Device Follow-up' },
      { id: 'inventory', icon: 'box', label: 'Inventory' },
      { type: 'section', label: 'Management' },
      { id: 'contacts', icon: 'phone', label: 'Contacts' },
      { id: 'users', icon: 'users', label: 'Users' },
      { id: 'device-types', icon: 'cpu', label: 'Device Types' },
      { id: 'training-courses', icon: 'shield', label: 'Training Courses' },
      { id: 'training-admin', icon: 'play', label: 'Employee Tutorials' },
      { type: 'section', label: 'Reports' },
      { id: 'finance', icon: 'rupee', label: 'Finance Report' },
      { id: 'ai-report', icon: 'sparkle', label: 'AI Report' },
      { id: 'payments', icon: 'rupee', label: 'Payments' },
      { id: 'bills', icon: 'receipt', label: 'Bills' },
      { id: 'cash', icon: 'rupee', label: 'Cash Collections' },
      { id: 'salary', icon: 'rupee', label: 'Salary' },
      { id: 'leaves', icon: 'hourglass', label: 'Leave Requests' },
      { id: 'eod', icon: 'clipboard', label: 'EOD Summaries' },
      { id: 'feedback', icon: 'star', label: 'Leaderboard' },
      { id: 'complaints', icon: 'shield', label: 'Complaints' },
      { type: 'section', label: 'Marketing' },
      { id: 'ads', icon: 'box', label: 'Landing Ads' },
      { id: 'popup-ads', icon: 'box', label: 'Popup Ads' },
      { id: 'notices', icon: 'clipboard', label: 'Notices' },
      { id: 'discounts', icon: 'receipt', label: 'Discounts' },
      { id: 'pricing', icon: 'receipt', label: 'Service Pricing' },
      { type: 'section', label: 'Config' },
      { id: 'settings', icon: 'settings', label: 'Settings' },
      { id: 'profile', icon: 'user', label: 'Profile' },
    ],
    employee: [
      { type: 'section', label: 'Main' },
      { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
      { id: 'all-tickets', icon: 'ticket', label: 'My Tasks', badge: 6 },
      { id: 'notifications', icon: 'bell', label: 'Notifications' },
      { type: 'section', label: 'Work' },
      { id: 'my-attendance', icon: 'clock', label: 'Attendance Records' },
      { id: 'my-leaves', icon: 'hourglass', label: 'Leave Requests' },
      { id: 'my-eod', icon: 'clipboard', label: 'EOD Reports' },
      { id: 'my-cash', icon: 'rupee', label: 'My Cash' },
      { id: 'my-collections', icon: 'card', label: 'Collections' },
      { id: 'my-salary', icon: 'rupee', label: 'Salary' },
      { id: 'feedback', icon: 'star', label: 'Leaderboard' },
      { id: 'device-followup', icon: 'wrench', label: 'Device Follow-up' },
      { type: 'section', label: 'Services' },
      { id: 'estimator', icon: 'receipt', label: 'Estimator' },
      { type: 'section', label: 'Learn' },
      { id: 'tutorials', icon: 'play', label: 'Tutorials' },
      { id: 'my-training-courses', icon: 'shield', label: 'Training' },
      { type: 'section', label: 'Account' },
      { id: 'profile', icon: 'user', label: 'Profile' },
    ],
    client: [],
  };

  const TITLES = {
    dashboard: ['Dashboard', 'Live overview of your operations'],
    'my-training-courses': ['My Training', 'Learn at your own pace'],
    'training-courses': ['Training Academy', 'Courses, lessons & compliance'],
    notifications: ['Notifications', 'Alerts, assignments & updates'],
  };

  const ACCENTS = {
    Emerald: { a: '#15a05a', a6: '#0f8a4c', a7: '#0c6f3d', glow: 'rgba(21,160,90,0.45)', soft: 'rgba(21,160,90,0.12)' },
    Teal:    { a: '#0ea5a5', a6: '#0b8a8a', a7: '#086d6d', glow: 'rgba(14,165,165,0.45)', soft: 'rgba(14,165,165,0.12)' },
    Indigo:  { a: '#6366f1', a6: '#5046e5', a7: '#3f37c4', glow: 'rgba(99,102,241,0.45)', soft: 'rgba(99,102,241,0.12)' },
    Amber:   { a: '#e08a14', a6: '#c4760f', a7: '#9c5d0a', glow: 'rgba(224,138,20,0.45)', soft: 'rgba(224,138,20,0.12)' },
  };
  const FONTS = {
    Geometric: { d: "'Space Grotesk', sans-serif", b: "'Manrope', sans-serif" },
    Grotesk:   { d: "'Sora', sans-serif", b: "'Sora', sans-serif" },
    Rounded:   { d: "'Quicksand', sans-serif", b: "'Nunito Sans', sans-serif" },
  };

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    accent: 'Emerald',
    glass: 62,
    blur: 20,
    font: 'Geometric',
  }/*EDITMODE-END*/;

  function Placeholder({ page, role }) {
    const meta = {
      'all-tickets': ['ticket', 'Tickets board', 'A filterable, searchable ticket board with status lanes and SLA timers lives here.'],
      notifications: ['bell', 'Notifications', 'Real-time alerts for assignments, payments, and SLA breaches.'],
      attendance: ['clock', 'Attendance', 'Clock-in/out records, geofencing and monthly summaries.'],
      requests: ['inbox', 'Service Requests', 'Incoming public service requests, ready to triage and assign.'],
      auto: ['refresh', 'Auto Assignment', 'Rules that route new requests to the nearest available technician.'],
      users: ['users', 'Users', 'Manage clients, technicians and admins with roles & permissions.'],
      finance: ['rupee', 'Finance Report', 'Revenue, collections and outstanding dues at a glance.'],
      payments: ['card', 'Payments', 'Invoices, receipts and online payment history.'],
      profile: ['user', 'Profile', 'Your account details, security and preferences.'],
      eod: ['clipboard', 'EOD Reports', 'End-of-day summaries submitted by each technician.'],
      cash: ['rupee', 'My Cash', 'Cash you collected in the field, pending deposit.'],
      leaderboard: ['star', 'Leaderboard', 'Points, streaks and ranks across the technician team.'],
      tutorials: ['play', 'Tutorials', 'Short how-to videos for the field team.'],
      'my-tickets': ['ticket', 'My Tickets', 'All your raised tickets with live status tracking.'],
      devices: ['camera', 'My Devices', 'Every camera and device installed at your locations.'],
    };
    const m = meta[page] || ['box', 'Section', 'This section is part of the redesign system.'];
    return React.createElement('div', { className: 'glass card in', style: { textAlign: 'center', padding: '64px 32px', maxWidth: 520, margin: '40px auto' } },
      React.createElement('div', { className: 'lrow-ico', style: { width: 64, height: 64, borderRadius: 20, margin: '0 auto 20px' } }, I({ name: m[0], size: 30 })),
      React.createElement('h3', { style: { fontFamily: 'var(--font-display)', fontSize: '1.3rem', marginBottom: 10 } }, m[1]),
      React.createElement('p', { style: { color: 'var(--text-2)', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: 22 } }, m[2]),
      React.createElement('div', { className: 'chip', style: { margin: '0 auto', width: 'fit-content', color: 'var(--accent)' } }, I({ name: 'sparkle', size: 13 }), 'Designed in the new NEST system'),
    );
  }

  function App() {
    const LOCKED = ['admin', 'employee', 'client'].includes(window.NEST_ROLE);
    const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
    const [theme, setTheme] = useState(() => localStorage.getItem('nes-theme') || 'light');
    const [role, setRole] = useState(LOCKED ? window.NEST_ROLE : 'admin');
    const [page, setPage] = useState('dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const gotoPortal = (target) => { window.location.href = target + '.html'; };

    // apply theme + tweak tokens
    useEffect(() => {
      const r = document.documentElement;
      r.setAttribute('data-theme', theme);
      localStorage.setItem('nes-theme', theme);
    }, [theme]);
    useEffect(() => {
      const r = document.documentElement;
      const ac = ACCENTS[t.accent] || ACCENTS.Emerald;
      r.style.setProperty('--accent', ac.a);
      r.style.setProperty('--accent-600', ac.a6);
      r.style.setProperty('--accent-700', ac.a7);
      r.style.setProperty('--accent-glow', ac.glow);
      r.style.setProperty('--accent-soft', ac.soft);
      r.style.setProperty('--glass-alpha', (t.glass / 100).toFixed(2));
      r.style.setProperty('--glass-blur', t.blur + 'px');
      const f = FONTS[t.font] || FONTS.Geometric;
      r.style.setProperty('--font-display', f.d);
      r.style.setProperty('--font-body', f.b);
    }, [t.accent, t.glass, t.blur, t.font]);

    const user = window.DATA.user[role];
    const nav = NAV[role];
    const titleMeta = TITLES[page] || [nav.find((n) => n.id === page)?.label || 'Section', ''];

    const go = (id) => { setPage(id); setSidebarOpen(false); };

    // ensure page exists for role
    useEffect(() => { if (!nav.find((n) => n.id === page)) setPage('dashboard'); }, [role]);

    // CLIENT = public landing page (no app shell)
    if (role === 'client') {
      return React.createElement(React.Fragment, null,
        React.createElement(window.ClientLanding, { theme, setTheme,
          onStaff: () => { if (LOCKED) gotoPortal('admin'); else { setRole('admin'); setPage('dashboard'); } },
          onTech: () => { if (LOCKED) gotoPortal('employee'); else { setRole('employee'); setPage('dashboard'); } } }),
        React.createElement(window.TweaksPanel, { title: 'Tweaks' },
          React.createElement(window.TweakSection, { label: 'Brand accent' }),
          React.createElement(window.TweakColor, { label: 'Accent', value: (ACCENTS[t.accent] || ACCENTS.Emerald).a,
            options: Object.values(ACCENTS).map((x) => x.a),
            onChange: (v) => { const name = Object.keys(ACCENTS).find((k) => ACCENTS[k].a === v) || 'Emerald'; setTweak('accent', name); } }),
          React.createElement(window.TweakSection, { label: 'Glassmorphism' }),
          React.createElement(window.TweakSlider, { label: 'Panel opacity', value: t.glass, min: 30, max: 90, unit: '%', onChange: (v) => setTweak('glass', v) }),
          React.createElement(window.TweakSlider, { label: 'Blur', value: t.blur, min: 6, max: 34, unit: 'px', onChange: (v) => setTweak('blur', v) }),
          React.createElement(window.TweakSection, { label: 'Typography' }),
          React.createElement(window.TweakRadio, { label: 'Font', value: t.font, options: Object.keys(FONTS), onChange: (v) => setTweak('font', v) }),
          !LOCKED && React.createElement(window.TweakSection, { label: 'Preview as' }),
          !LOCKED && React.createElement(window.TweakRadio, { label: 'Role', value: 'client', options: ['admin', 'employee', 'client'], onChange: (v) => { setRole(v); setPage('dashboard'); } }),
        ),
      );
    }

    let content, ownHeader = false;
    if (page === 'dashboard') {
      content = role === 'admin' ? React.createElement(window.AdminDashboard)
        : role === 'employee' ? React.createElement(window.EmployeeDashboard)
        : React.createElement(window.ClientDashboard);
    } else if (page === 'my-training-courses' || page === 'training-courses') {
      content = React.createElement(window.TrainingCourses);
    } else {
      const screen = window.renderScreen(page, role);
      if (screen) { content = screen; ownHeader = true; }
      else content = React.createElement(Placeholder, { page, role });
    }

    return React.createElement('div', { className: 'shell' },
      // backdrop for mobile sidebar
      React.createElement('div', { className: 'sidebar-backdrop' + (sidebarOpen ? ' show' : ''), onClick: () => setSidebarOpen(false) }),
      // SIDEBAR
      React.createElement('aside', { className: 'sidebar glass' + (sidebarOpen ? ' open' : '') },
        React.createElement('div', { className: 'sidebar-logo' },
          React.createElement('div', { className: 'logo-mark' }, I({ name: 'shield', size: 22 })),
          React.createElement('div', { className: 'logo-word' },
            React.createElement('b', null, 'NEST Portal'),
            React.createElement('small', null, 'Networking Experts'))),
        React.createElement('nav', { className: 'nav-scroll' },
          nav.map((item, i) => item.type === 'section'
            ? React.createElement('div', { key: 's' + i, className: 'nav-section' }, item.label)
            : React.createElement('div', { key: item.id, className: 'nav-item' + (page === item.id ? ' active' : ''), onClick: () => go(item.id) },
                I({ name: item.icon }), React.createElement('span', { style: { flex: 1 } }, item.label),
                item.badge ? React.createElement('span', { className: 'nav-badge' }, item.badge) : null))),
        React.createElement('div', { className: 'sidebar-foot' },
          React.createElement('div', { className: 'user-card' },
            React.createElement('div', { className: 'avatar' }, user.initials),
            React.createElement('div', { className: 'user-meta' },
              React.createElement('b', null, user.name),
              React.createElement('span', null, user.role)),
            React.createElement('button', { className: 'icon-btn', title: 'Sign out', onClick: () => { if (LOCKED) gotoPortal('index'); else { setRole('client'); setPage('dashboard'); } } }, I({ name: 'logout' })))),
      ),
      // MAIN
      React.createElement('div', { className: 'main' },
        React.createElement('header', { className: 'topbar glass' },
          React.createElement('button', { className: 'icon-btn menu-toggle', onClick: () => setSidebarOpen(true) }, I({ name: 'menu' })),
          React.createElement('div', { className: 'topbar-title' },
            ownHeader
              ? React.createElement('p', { style: { fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)' } }, role === 'admin' ? 'Admin Console' : 'Technician')
              : React.createElement(React.Fragment, null,
                  React.createElement('h1', null, titleMeta[0]),
                  titleMeta[1] && React.createElement('p', { className: 'hide-sm' }, titleMeta[1]))),
          React.createElement('div', { className: 'topbar-actions' },
            React.createElement('div', { className: 'search-pill hide-lg' },
              I({ name: 'search' }), React.createElement('input', { placeholder: 'Search tickets, clients…' })),
            // role switcher — only in unlocked (single-file preview) mode
            !LOCKED && React.createElement('div', { className: 'seg hide-sm', title: 'Switch role to preview' },
              [['admin', 'Admin'], ['employee', 'Tech'], ['client', 'Client']].map(([r, lbl]) =>
                React.createElement('button', { key: r, className: role === r ? 'on' : '', onClick: () => { setRole(r); setPage('dashboard'); } }, lbl))),
            LOCKED && role === 'admin' && React.createElement('a', { href: 'employee.html', className: 'btn btn-ghost btn-sm hide-sm', style: { textDecoration: 'none' } }, I({ name: 'users', size: 15 }), 'Technician view'),
            LOCKED && role === 'employee' && React.createElement('a', { href: 'admin.html', className: 'btn btn-ghost btn-sm hide-sm', style: { textDecoration: 'none' } }, I({ name: 'shield', size: 15 }), 'Admin view'),
            React.createElement('button', { className: 'icon-btn bell' }, I({ name: 'bell' }), React.createElement('span', { className: 'dot' })),
            React.createElement('button', { className: 'icon-btn', onClick: () => setTheme(theme === 'light' ? 'dark' : 'light'), title: 'Toggle theme' },
              I({ name: theme === 'light' ? 'moon' : 'sun' }))),
        ),
        React.createElement('div', { className: 'page' }, content),
      ),
      window.ModalHost && React.createElement(window.ModalHost),
      // TWEAKS
      React.createElement(window.TweaksPanel, { title: 'Tweaks' },
        React.createElement(window.TweakSection, { label: 'Brand accent' }),
        React.createElement(window.TweakColor, { label: 'Accent', value: (ACCENTS[t.accent] || ACCENTS.Emerald).a,
          options: Object.values(ACCENTS).map((x) => x.a),
          onChange: (v) => { const name = Object.keys(ACCENTS).find((k) => ACCENTS[k].a === v) || 'Emerald'; setTweak('accent', name); } }),
        React.createElement(window.TweakSection, { label: 'Glassmorphism' }),
        React.createElement(window.TweakSlider, { label: 'Panel opacity', value: t.glass, min: 30, max: 90, unit: '%', onChange: (v) => setTweak('glass', v) }),
        React.createElement(window.TweakSlider, { label: 'Blur', value: t.blur, min: 6, max: 34, unit: 'px', onChange: (v) => setTweak('blur', v) }),
        React.createElement(window.TweakSection, { label: 'Typography' }),
        React.createElement(window.TweakRadio, { label: 'Font', value: t.font, options: Object.keys(FONTS), onChange: (v) => setTweak('font', v) }),
        !LOCKED && React.createElement(window.TweakSection, { label: 'Preview as' }),
        !LOCKED && React.createElement(window.TweakRadio, { label: 'Role', value: role, options: ['admin', 'employee', 'client'], onChange: (v) => { setRole(v); setPage('dashboard'); } }),
      ),
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})();
