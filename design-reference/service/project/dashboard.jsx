/* Dashboard screens per role. window.AdminDashboard / EmployeeDashboard / ClientDashboard */
(function () {
  const { useState } = React;
  const I = (p) => React.createElement(window.Icon, p);

  function KpiCard({ k, i }) {
    return React.createElement('div', { className: 'glass kpi in', style: { '--d': (i * 0.06) + 's' } },
      React.createElement(window.GaugeRing, { value: k.gauge, suffix: k.suffix && k.suffix.includes('%') ? '%' : '', color: k.color, size: 92, stroke: 9 }),
      React.createElement('div', { className: 'kpi-info' },
        React.createElement('div', { className: 'kpi-label' }, k.label),
        React.createElement('div', { className: 'kpi-value' }, Math.round(k.value), k.suffix && !k.suffix.includes('%') ? React.createElement('small', null, k.suffix) : (k.suffix ? '%' : '')),
        k.trend != null
          ? React.createElement('div', { className: 'kpi-trend ' + (k.trend >= 0 ? 'up' : 'down') },
              I({ name: k.trend >= 0 ? 'arrowUp' : 'arrowDown', size: 13 }),
              Math.abs(k.trend) + '% vs last week')
          : (k.spark ? React.createElement(window.Sparkline, { data: k.spark, color: k.color }) : null),
      ),
    );
  }

  function StatusBadge({ status }) {
    const map = { open: 'Open', assigned: 'Assigned', progress: 'In Progress', resolved: 'Resolved' };
    return React.createElement('span', { className: 'badge ' + status }, map[status] || status);
  }

  // ---------------- ADMIN ----------------
  function AdminDashboard() {
    const D = window.DATA;
    return React.createElement('div', { className: 'stack' },
      // KPI row
      React.createElement('div', { className: 'grid grid-kpi' },
        D.adminKpis.map((k, i) => React.createElement(KpiCard, { key: i, k, i })),
      ),
      // charts row
      React.createElement('div', { className: 'grid grid-2-1' },
        React.createElement('div', { className: 'glass card in', style: { '--d': '.12s' } },
          React.createElement('div', { className: 'card-head' },
            React.createElement('h3', null, I({ name: 'trendUp' }), 'Service Requests Trend'),
            React.createElement('span', { className: 'chip' }, I({ name: 'calendar' }), 'Last 12 months')),
          React.createElement(window.AreaChart, { data: D.ticketsTrend.data, labels: D.ticketsTrend.labels, height: 220 }),
        ),
        React.createElement('div', { className: 'glass card in', style: { '--d': '.16s' } },
          React.createElement('div', { className: 'card-head' },
            React.createElement('h3', null, I({ name: 'chart' }), 'By Category')),
          React.createElement(window.Donut, { data: D.categoryDonut }),
          React.createElement('div', { className: 'legend' },
            D.categoryDonut.map((d, i) => React.createElement('span', { key: i },
              React.createElement('i', { style: { background: d.color } }), d.label, ' · ', d.value))),
        ),
      ),
      // lists row
      React.createElement('div', { className: 'grid grid-2-1' },
        React.createElement('div', { className: 'glass card in', style: { '--d': '.2s' } },
          React.createElement('div', { className: 'card-head' },
            React.createElement('h3', null, I({ name: 'inbox' }), 'Recent Service Requests'),
            React.createElement('button', { className: 'btn btn-ghost btn-sm' }, 'View all', I({ name: 'arrowRight', size: 15 }))),
          React.createElement('div', { className: 'list' },
            D.recentRequests.map((t, i) => React.createElement('div', { key: i, className: 'lrow' },
              React.createElement('div', { className: 'lrow-ico' }, I({ name: t.icon })),
              React.createElement('div', { className: 'lrow-main' },
                React.createElement('b', null, t.title),
                React.createElement('span', null, React.createElement('em', { className: 'id-mono', style: { fontStyle: 'normal' } }, t.id), ' · ', t.client, ' · ', t.when)),
              t.priority === 'high' && React.createElement('span', { className: 'badge high hide-sm' }, 'Urgent'),
              React.createElement(StatusBadge, { status: t.status }),
            ))),
        ),
        React.createElement('div', { className: 'glass card in', style: { '--d': '.24s' } },
          React.createElement('div', { className: 'card-head' },
            React.createElement('h3', null, I({ name: 'award' }), 'Top Technicians')),
          React.createElement('div', { className: 'stack', style: { gap: '16px' } },
            D.technicians.map((t, i) => React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 13 } },
              React.createElement('div', { className: 'avatar', style: { width: 40, height: 40 } }, t.initials),
              React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 5 } },
                  React.createElement('b', { style: { fontSize: '0.88rem' } }, t.name),
                  React.createElement('span', { style: { fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 700 } }, '★ ' + t.rating)),
                React.createElement('div', { className: 'bar' }, React.createElement('i', { style: { width: t.pct + '%' } }))),
            ))),
        ),
      ),
    );
  }

  // ---------------- EMPLOYEE ----------------
  function EmployeeDashboard() {
    const D = window.DATA;
    const [clockedIn, setClockedIn] = useState(true);
    const now = new Date();
    const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    return React.createElement('div', { className: 'stack' },
      React.createElement('div', { className: 'grid grid-kpi' },
        D.empKpis.map((k, i) => React.createElement(KpiCard, { key: i, k, i })),
      ),
      React.createElement('div', { className: 'grid grid-emp' },
        // clock card
        React.createElement('div', { className: 'glass card clock-card in', style: { '--d': '.12s' } },
          React.createElement('div', { className: 'chip', style: { margin: '0 auto 14px', width: 'fit-content', color: clockedIn ? 'var(--accent)' : 'var(--text-3)' } },
            React.createElement('i', { style: { width: 8, height: 8, borderRadius: '50%', background: clockedIn ? 'var(--accent)' : 'var(--text-3)', display: 'inline-block' } }),
            clockedIn ? 'Clocked in' : 'Clocked out'),
          React.createElement('div', { className: 'clock-time' }, time),
          React.createElement('div', { className: 'clock-date' }, date),
          React.createElement('button', { className: 'btn ' + (clockedIn ? 'btn-ghost' : 'btn-primary'), style: { width: '100%' }, onClick: () => setClockedIn(!clockedIn) },
            I({ name: 'clock' }), clockedIn ? 'Clock Out' : 'Clock In'),
        ),
        // tasks
        React.createElement('div', { className: 'glass card in', style: { '--d': '.16s' } },
          React.createElement('div', { className: 'card-head' },
            React.createElement('h3', null, I({ name: 'ticket' }), "Today's Route"),
            React.createElement('span', { className: 'chip' }, D.empTasks.length + ' stops')),
          React.createElement('div', { className: 'list' },
            D.empTasks.map((t, i) => React.createElement('div', { key: i, className: 'lrow' },
              React.createElement('div', { className: 'lrow-ico' }, I({ name: t.icon })),
              React.createElement('div', { className: 'lrow-main' },
                React.createElement('b', null, t.title),
                React.createElement('span', null, I({ name: 'pin', size: 13 }), t.addr, ' · ', t.time)),
              React.createElement(StatusBadge, { status: t.status }),
            ))),
        ),
        // leaderboard + week
        React.createElement('div', { className: 'stack' },
          React.createElement('div', { className: 'glass card in', style: { '--d': '.2s' } },
            React.createElement('div', { className: 'card-head' }, React.createElement('h3', null, I({ name: 'star' }), 'Leaderboard')),
            React.createElement('div', { className: 'stack', style: { gap: '12px' } },
              D.leaderboard.map((p, i) => React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 11, padding: '6px 8px', borderRadius: 12, background: p.you ? 'var(--accent-soft)' : 'transparent' } },
                React.createElement('b', { style: { fontFamily: 'var(--font-display)', width: 18, color: i === 0 ? 'var(--amber)' : 'var(--text-3)' } }, '#' + p.rank),
                React.createElement('div', { className: 'avatar', style: { width: 32, height: 32, fontSize: '0.72rem' } }, p.initials),
                React.createElement('b', { style: { flex: 1, fontSize: '0.85rem' } }, p.you ? 'You' : p.name),
                React.createElement('span', { style: { fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-2)', fontWeight: 700 } }, p.pts)))),
          ),
          React.createElement('div', { className: 'glass card in', style: { '--d': '.24s' } },
            React.createElement('div', { className: 'card-head' }, React.createElement('h3', null, I({ name: 'chart' }), 'Jobs / day')),
            React.createElement(window.BarChart, { data: D.empWeek.data, labels: D.empWeek.labels, height: 130 }),
          ),
        ),
      ),
    );
  }

  // ---------------- CLIENT ----------------
  function ClientDashboard() {
    const D = window.DATA;
    const [sent, setSent] = useState(false);
    return React.createElement('div', { className: 'grid grid-client', style: { alignItems: 'start' } },
      // request form
      React.createElement('div', { className: 'glass card in' },
        React.createElement('div', { className: 'card-head' },
          React.createElement('h3', null, I({ name: 'bolt' }), 'New Service Request'),
          React.createElement('span', { className: 'chip', style: { color: 'var(--accent)' } }, I({ name: 'clock', size: 13 }), 'Resolved in 12 hrs')),
        React.createElement('p', { style: { color: 'var(--text-2)', fontSize: '0.88rem', marginBottom: 20, lineHeight: 1.5 } },
          'Tell us what you need. Our team dispatches the right technician — usually within the hour.'),
        React.createElement('div', { className: 'grid', style: { gridTemplateColumns: '1fr 1fr' } },
          React.createElement('div', { className: 'field' }, React.createElement('label', null, 'Full Name'), React.createElement('input', { defaultValue: 'Rohan Mehta' })),
          React.createElement('div', { className: 'field' }, React.createElement('label', null, 'Phone Number'), React.createElement('input', { defaultValue: '+91 98765 43210' })),
        ),
        React.createElement('div', { className: 'grid', style: { gridTemplateColumns: '1fr 1fr' } },
          React.createElement('div', { className: 'field' }, React.createElement('label', null, 'Location'), React.createElement('input', { placeholder: 'Area, City' })),
          React.createElement('div', { className: 'field' },
            React.createElement('label', null, 'Service Type'),
            React.createElement('select', null, ['CCTV', 'Networking', 'Biometric', 'Gate Automation', 'Other'].map((o) => React.createElement('option', { key: o }, o)))),
        ),
        React.createElement('div', { className: 'field' }, React.createElement('label', null, 'Describe what you need'),
          React.createElement('textarea', { placeholder: 'e.g. One of our 4 cameras has gone offline since yesterday…' })),
        React.createElement('button', { className: 'btn btn-primary', style: { width: '100%' }, onClick: () => { setSent(true); setTimeout(() => setSent(false), 2200); } },
          sent ? I({ name: 'check' }) : I({ name: 'arrowRight' }), sent ? 'Request sent!' : 'Submit Request'),
      ),
      // side
      React.createElement('div', { className: 'stack' },
        React.createElement('div', { className: 'glass card in', style: { '--d': '.08s' } },
          React.createElement('div', { className: 'card-head' }, React.createElement('h3', null, I({ name: 'target' }), 'Your Activity')),
          React.createElement('div', { className: 'grid', style: { gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center', gap: 12 } },
            [['active', 'Active', 'var(--sky)'], ['completed', 'Completed', 'var(--accent)'], ['devices', 'Devices', 'var(--violet)']].map(([key, lbl, c], i) =>
              React.createElement('div', { key: i },
                React.createElement('div', { style: { fontFamily: 'var(--font-display)', fontSize: '1.9rem', fontWeight: 700, color: c } }, D.clientStats[key]),
                React.createElement('div', { style: { fontSize: '0.76rem', color: 'var(--text-3)', fontWeight: 600 } }, lbl))),
          ),
        ),
        React.createElement('div', { className: 'glass card in', style: { '--d': '.12s' } },
          React.createElement('div', { className: 'card-head' }, React.createElement('h3', null, I({ name: 'ticket' }), 'My Tickets')),
          React.createElement('div', { className: 'list' },
            D.clientTickets.map((t, i) => React.createElement('div', { key: i, className: 'lrow' },
              React.createElement('div', { className: 'lrow-ico' }, I({ name: t.icon })),
              React.createElement('div', { className: 'lrow-main' },
                React.createElement('b', null, t.title),
                React.createElement('span', null, React.createElement('em', { style: { fontStyle: 'normal' }, className: 'id-mono' }, t.id), ' · ', t.when)),
              React.createElement(StatusBadge, { status: t.status }),
            ))),
        ),
        React.createElement('div', { className: 'glass card in', style: { '--d': '.16s', background: 'linear-gradient(140deg, var(--accent), var(--accent-700))', color: '#fff', border: 'none' } },
          React.createElement('h3', { style: { fontFamily: 'var(--font-display)', fontSize: '1.05rem', marginBottom: 8, color: '#fff' } }, 'Need urgent support?'),
          React.createElement('p', { style: { fontSize: '0.85rem', opacity: 0.9, marginBottom: 16 } }, 'Call our dispatch line for emergencies — 24/7.'),
          React.createElement('div', { style: { display: 'flex', gap: 10 } },
            React.createElement('button', { className: 'btn', style: { flex: 1, background: 'rgba(255,255,255,0.2)', color: '#fff', backdropFilter: 'blur(8px)' } }, I({ name: 'phone' }), 'Call'),
            React.createElement('button', { className: 'btn', style: { flex: 1, background: 'rgba(255,255,255,0.2)', color: '#fff', backdropFilter: 'blur(8px)' } }, 'WhatsApp')),
        ),
      ),
    );
  }

  Object.assign(window, { AdminDashboard, EmployeeDashboard, ClientDashboard, StatusBadge });
})();
