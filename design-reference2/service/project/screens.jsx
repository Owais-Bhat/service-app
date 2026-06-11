/* Reusable screen kit + screen registry for every nav item.
   window.renderScreen(pageId, role) -> React element or null */
(function () {
  const { useState } = React;
  const I = (p) => React.createElement(window.Icon, p);
  const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');

  // ---------- building blocks ----------
  function PageHeader({ title, sub, actions }) {
    return React.createElement('div', { className: 'page-h in' },
      React.createElement('div', { className: 'topbar-title' },
        React.createElement('h1', { style: { fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.025em' } }, title),
        sub && React.createElement('p', { style: { color: 'var(--text-3)', fontSize: '0.86rem', marginTop: 3 } }, sub)),
      actions && React.createElement('div', { className: 'ph-actions' }, actions));
  }
  function Btn({ icon, children, primary, sm, onClick }) {
    return React.createElement('button', { className: 'btn ' + (primary ? 'btn-primary' : 'btn-ghost') + (sm ? ' btn-sm' : ''), onClick },
      icon && I({ name: icon, size: sm ? 15 : 17 }), children);
  }
  function StatGrid({ items, cols }) {
    return React.createElement('div', { className: 'grid-stats' + (cols === 5 ? ' g5' : cols === 3 ? ' g3' : '') },
      items.map((s, i) => React.createElement('div', { key: i, className: 'glass stat-mini in', style: { '--d': (i * 0.04) + 's' } },
        s.icon && React.createElement('div', { className: 'ic bg-' + (s.tone || 'accent') }, I({ name: s.icon, size: 20 })),
        React.createElement('div', { className: 'v' + (s.tone ? ' c-' + s.tone : '') }, s.value),
        React.createElement('div', { className: 'l' }, s.label))));
  }
  function FilterTabs({ tabs, active, counts, onPick }) {
    return React.createElement('div', { className: 'ftabs in' },
      tabs.map(([k, label]) => React.createElement('button', { key: k, className: 'ftab' + (active === k ? ' on' : ''), onClick: () => onPick(k) },
        label, counts && counts[k] != null ? React.createElement('span', { className: 'ftab-count' }, counts[k]) : null)));
  }
  function Toolbar({ placeholder, right }) {
    return React.createElement('div', { className: 'toolbar in', style: { '--d': '.05s' } },
      React.createElement('div', { className: 'search-pill' }, I({ name: 'search' }), React.createElement('input', { placeholder: placeholder || 'Search…' })),
      right);
  }
  function Card({ title, icon, right, children, pad }) {
    return React.createElement('div', { className: 'glass card in', style: { '--d': '.08s' } },
      (title || right) && React.createElement('div', { className: 'card-head' },
        title && React.createElement('h3', null, icon && I({ name: icon }), title),
        right),
      children);
  }
  function Table({ cols, children }) {
    return React.createElement('div', { className: 'tbl-wrap' },
      React.createElement('table', { className: 'tbl' },
        React.createElement('thead', null, React.createElement('tr', null, cols.map((c, i) => React.createElement('th', { key: i, className: c.right ? 'right' : '' }, c.label)))),
        React.createElement('tbody', null, children)));
  }
  function Avatar({ initials }) { return React.createElement('div', { className: 'avatar av-sm' }, initials); }
  function Stars({ n }) {
    return React.createElement('span', { className: 'stars' }, Array.from({ length: 5 }, (_, i) => I({ name: 'star', size: 14, key: i, style: { opacity: i < Math.round(n) ? 1 : 0.25 } })));
  }
  const SB = (s) => React.createElement(window.StatusBadge, { status: s });
  const initialsOf = (name) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  // ============================================================
  // ADMIN SCREENS
  // ============================================================
  function TicketsScreen({ titleOverride, role }) {
    const D = window.DATA.screens;
    const [tab, setTab] = useState('all');
    const counts = { all: D.tickets.length };
    D.ticketTabs.forEach(([k]) => { if (k !== 'all') counts[k] = D.tickets.filter((t) => t.status === k).length; });
    const rows = tab === 'all' ? D.tickets : D.tickets.filter((t) => t.status === tab);
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: titleOverride || 'Service Requests', sub: 'Manage customer requests, billing & payments',
        actions: [React.createElement(Btn, { key: 1, icon: 'plus', primary: true }, 'Register Request'), React.createElement(Btn, { key: 2, icon: 'download' }, 'Export')] }),
      React.createElement(FilterTabs, { tabs: D.ticketTabs, active: tab, counts, onPick: setTab }),
      React.createElement(Card, null,
        React.createElement(Table, { cols: [{ label: 'Ticket' }, { label: 'Customer' }, { label: 'Service' }, { label: 'Assigned' }, { label: 'Status' }, { label: 'Payment' }, { label: '', right: true }] },
          rows.map((t, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('div', { className: 'cell-stack' }, React.createElement('span', { className: 'tk' }, t.id), React.createElement('small', null, t.when))),
            React.createElement('td', null, React.createElement('div', { className: 'cell-stack' }, React.createElement('b', null, t.cust), React.createElement('small', null, t.company))),
            React.createElement('td', { style: { maxWidth: 200 } }, t.service),
            React.createElement('td', null, t.emp ? React.createElement('b', null, t.emp) : React.createElement('span', { className: 'muted' }, 'Unassigned')),
            React.createElement('td', null, SB(t.status)),
            React.createElement('td', null, t.pay ? React.createElement('span', { className: 'badge ' + (t.pay === 'paid' ? 'resolved' : 'progress') }, t.pay === 'paid' ? 'Paid' : 'Unpaid') : React.createElement('span', { className: 'muted' }, '—')),
            React.createElement('td', { className: 'right' }, React.createElement(Btn, { sm: true, primary: true, onClick: () => window.openTicket(t, role || 'admin') }, 'Manage'))))))
    );
  }

  function AttendanceScreen() {
    const D = window.DATA.screens; const s = D.attStats;
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Attendance Logs', sub: 'Track employee check-ins and locations', actions: React.createElement(Btn, { icon: 'download' }, 'Export CSV') }),
      React.createElement(StatGrid, { cols: 5, items: [
        { value: s.today, label: "Today's Attendance", icon: 'clock', tone: 'sky' },
        { value: s.active, label: 'Currently Active', icon: 'bolt', tone: 'accent' },
        { value: s.forgotEod, label: 'Forgot EOD', icon: 'clipboard', tone: 'rose' },
        { value: s.restricted, label: 'Restricted Users', icon: 'shield', tone: 'amber' },
        { value: s.avg, label: 'Avg Hours Today', icon: 'hourglass', tone: 'violet' }] }),
      React.createElement(Card, null,
        React.createElement(Table, { cols: [{ label: 'Date' }, { label: 'Employee' }, { label: 'Clock In' }, { label: 'Clock Out' }, { label: 'Hours' }, { label: 'Location' }] },
          D.attendance.map((r, i) => React.createElement('tr', { key: i },
            React.createElement('td', { className: 'muted' }, r.date),
            React.createElement('td', null, React.createElement('div', { className: 'cell-name' }, React.createElement(Avatar, { initials: initialsOf(r.emp) }), React.createElement('b', null, r.emp))),
            React.createElement('td', null, r.in),
            React.createElement('td', null, r.out),
            React.createElement('td', null, r.active ? React.createElement('span', { className: 'badge open' }, 'Active') : React.createElement('b', null, r.hrs)),
            React.createElement('td', { className: 'muted' }, React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, I({ name: 'pin', size: 13 }), r.loc))))))
    );
  }

  function UsersScreen() {
    const D = window.DATA.screens;
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Users', sub: 'Clients, technicians and admins', actions: React.createElement(Btn, { icon: 'plus', primary: true }, 'Add User') }),
      React.createElement(Toolbar, { placeholder: 'Search users…' }),
      React.createElement(Card, null,
        React.createElement(Table, { cols: [{ label: 'Name' }, { label: 'Email' }, { label: 'Role' }, { label: 'Status' }, { label: '', right: true }] },
          D.users.map((u, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('div', { className: 'cell-name' }, React.createElement(Avatar, { initials: initialsOf(u.name) }), React.createElement('b', null, u.name))),
            React.createElement('td', { className: 'muted' }, u.email),
            React.createElement('td', null, React.createElement('span', { className: 'chip', style: { textTransform: 'capitalize' } }, u.role)),
            React.createElement('td', null, React.createElement('span', { className: 'badge ' + (u.status === 'active' ? 'resolved' : 'high') }, u.status === 'active' ? 'Active' : 'Restricted')),
            React.createElement('td', { className: 'right' }, React.createElement(Btn, { sm: true }, 'Edit'))))))
    );
  }

  function FinanceScreen() {
    const F = window.DATA.screens.finance;
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Finance Report', sub: 'Revenue, collections & receivables', actions: [
        React.createElement('select', { key: 1, className: 'btn btn-ghost', style: { paddingRight: 30 } }, ['This Month', 'Last Month', 'This Year', 'All Time'].map((o) => React.createElement('option', { key: o }, o))),
        React.createElement(Btn, { key: 2, icon: 'download', primary: true }, 'Export PDF')] }),
      React.createElement(StatGrid, { items: [
        { value: inr(F.stats.received), label: 'Net Received', icon: 'rupee', tone: 'accent' },
        { value: inr(F.stats.billed), label: 'Total Billed', icon: 'receipt', tone: 'sky' },
        { value: inr(F.stats.pending), label: 'Still Pending', icon: 'hourglass', tone: 'amber' },
        { value: inr(F.stats.gst), label: 'GST Collected', icon: 'shield', tone: 'violet' }] }),
      React.createElement('div', { className: 'grid grid-2-1' },
        React.createElement(Card, { title: 'Revenue Trend — last 12 months', icon: 'trendUp' },
          React.createElement(window.AreaChart, { data: F.trend, labels: F.trendLabels, height: 230 })),
        React.createElement(Card, { title: 'Revenue by Category', icon: 'chart' },
          React.createElement(window.Donut, { data: F.byCategory }),
          React.createElement('div', { className: 'legend' }, F.byCategory.map((d, i) => React.createElement('span', { key: i }, React.createElement('i', { style: { background: d.color } }), d.label))))),
      React.createElement('div', { className: 'grid grid-2-1' },
        React.createElement(Card, { title: 'Technician Performance — collected vs billed', icon: 'award' },
          React.createElement(Table, { cols: [{ label: 'Technician' }, { label: 'Jobs', right: true }, { label: 'Billed', right: true }, { label: 'Received', right: true }] },
            F.byTech.map((r, i) => React.createElement('tr', { key: i },
              React.createElement('td', null, React.createElement('div', { className: 'cell-name' }, React.createElement(Avatar, { initials: initialsOf(r.name) }), React.createElement('b', null, r.name))),
              React.createElement('td', { className: 'right' }, r.jobs),
              React.createElement('td', { className: 'right muted' }, inr(r.billed)),
              React.createElement('td', { className: 'right', style: { color: 'var(--accent)', fontWeight: 700 } }, inr(r.received)))))),
        React.createElement(Card, { title: 'Receivables Aging', icon: 'hourglass' },
          React.createElement(window.BarChart, { data: F.aging.data, labels: F.aging.labels, height: 200 }),
          React.createElement('p', { style: { fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 12, textAlign: 'center' } }, '% of pending money by age')))
    );
  }

  function CashScreen() {
    const D = window.DATA.screens; const s = D.cashStats;
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Cash Collections', sub: 'Cash collected by technicians, grouped per employee', actions: React.createElement(Btn, { icon: 'refresh' }, 'Refresh') }),
      React.createElement(StatGrid, { items: [
        { value: inr(s.pending), label: 'Total Pending', icon: 'rupee', tone: 'amber' },
        { value: inr(s.submitted), label: 'Submitted (All Time)', icon: 'check', tone: 'accent' },
        { value: s.emps, label: 'Employees With Records', icon: 'users', tone: 'sky' },
        { value: s.records, label: 'Pending Records', icon: 'card', tone: 'violet' }] }),
      D.cashByEmp.map((e, i) => React.createElement('div', { key: i, className: 'glass card in', style: { '--d': (i * 0.05) + 's' } },
        React.createElement('div', { className: 'card-head' },
          React.createElement('h3', null, React.createElement(Avatar, { initials: e.initials }), e.name),
          React.createElement('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
            React.createElement('span', { className: 'chip', style: { color: 'var(--amber)' } }, 'Pending ', inr(e.pending)),
            React.createElement(Btn, { sm: true, primary: true, icon: 'check' }, 'Record Submission'))),
        React.createElement(Table, { cols: [{ label: 'Ticket' }, { label: 'Customer' }, { label: 'Collected' }, { label: 'When' }, { label: '', right: true }] },
          e.records.map((r, j) => React.createElement('tr', { key: j },
            React.createElement('td', null, React.createElement('span', { className: 'tk' }, r.id)),
            React.createElement('td', null, React.createElement('b', null, r.cust)),
            React.createElement('td', { style: { fontWeight: 700 } }, inr(r.amt)),
            React.createElement('td', { className: 'muted' }, r.when),
            React.createElement('td', { className: 'right' }, React.createElement('input', { type: 'checkbox', style: { width: 18, height: 18, accentColor: 'var(--accent)' } })))))))
    );
  }

  function BillsScreen() {
    const D = window.DATA.screens; const s = D.billStats;
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Bills', sub: 'All invoices generated by technicians', actions: React.createElement(Btn, { icon: 'refresh' }, 'Refresh') }),
      React.createElement(StatGrid, { items: [
        { value: s.total, label: 'Total Bills', icon: 'receipt', tone: 'sky' },
        { value: inr(s.received), label: 'Received', icon: 'rupee', tone: 'accent' },
        { value: inr(s.pending), label: 'Pending', icon: 'hourglass', tone: 'amber' },
        { value: inr(s.billed), label: 'Total Billed', icon: 'card', tone: 'violet' }] }),
      React.createElement(Toolbar, { placeholder: 'Search by name, ticket, device…' }),
      React.createElement(Card, null,
        React.createElement(Table, { cols: [{ label: 'Date' }, { label: 'Ticket' }, { label: 'Customer' }, { label: 'Device' }, { label: 'Total', right: true }, { label: 'Payment' }, { label: '', right: true }] },
          D.bills.map((b, i) => React.createElement('tr', { key: i },
            React.createElement('td', { className: 'muted' }, b.date),
            React.createElement('td', null, React.createElement('span', { className: 'tk' }, b.id)),
            React.createElement('td', null, React.createElement('b', null, b.cust)),
            React.createElement('td', { className: 'muted' }, b.device),
            React.createElement('td', { className: 'right', style: { fontWeight: 700 } }, inr(b.total)),
            React.createElement('td', null, React.createElement('span', { className: 'badge ' + (b.pay === 'paid' ? 'resolved' : 'progress') }, b.pay === 'paid' ? 'Paid' : 'Unpaid')),
            React.createElement('td', { className: 'right' }, React.createElement(Btn, { sm: true, onClick: () => window.openBill({ id: b.id, cust: b.cust, bill: window.__billFor(b), pay: b.pay }) }, 'View PDF'))))))
    );
  }

  function PaymentsScreen() {
    const D = window.DATA.screens; const s = D.payStats;
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Payment Tracker', sub: 'Monitor revenue and billing status' }),
      React.createElement(StatGrid, { cols: 3, items: [
        { value: inr(s.received), label: 'Total Received', icon: 'rupee', tone: 'accent' },
        { value: inr(s.pending), label: 'Pending Payments', icon: 'hourglass', tone: 'amber' },
        { value: s.paidRatio, label: 'Paid / Total Bills', icon: 'check', tone: 'sky' }] }),
      React.createElement(Card, null,
        React.createElement(Table, { cols: [{ label: 'Ticket' }, { label: 'Customer' }, { label: 'Bill', right: true }, { label: 'Status' }, { label: '', right: true }] },
          D.bills.map((b, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('span', { className: 'tk' }, b.id)),
            React.createElement('td', null, React.createElement('b', null, b.cust)),
            React.createElement('td', { className: 'right', style: { fontWeight: 700 } }, inr(b.total)),
            React.createElement('td', null, React.createElement('span', { className: 'badge ' + (b.pay === 'paid' ? 'resolved' : 'progress') }, b.pay === 'paid' ? 'Paid' : 'Unpaid')),
            React.createElement('td', { className: 'right' }, b.pay === 'paid' ? React.createElement(Btn, { sm: true }, 'Receipt') : React.createElement(Btn, { sm: true, primary: true }, 'Send Link'))))))
    );
  }

  function DevicesScreen() {
    const D = window.DATA.screens;
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Device Follow-up', sub: 'Devices taken for service & their status', actions: React.createElement(Btn, { icon: 'refresh' }, 'Refresh') }),
      React.createElement(Card, { title: 'Devices Taken for Service', icon: 'wrench' },
        React.createElement(Table, { cols: [{ label: 'Ticket' }, { label: 'Customer' }, { label: 'Service' }, { label: 'Device Status' }, { label: 'Follow-up' }, { label: 'Taken By' }] },
          D.devices.map((d, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('span', { className: 'tk' }, d.id)),
            React.createElement('td', null, React.createElement('b', null, d.cust)),
            React.createElement('td', { className: 'muted' }, d.service),
            React.createElement('td', null, React.createElement('span', { className: 'badge ' + (d.status === 'returned' ? 'resolved' : d.status === 'in_service' ? 'progress' : 'assigned') }, D.deviceStatusLabels[d.status])),
            React.createElement('td', { className: 'muted', style: { maxWidth: 220 } }, d.followup),
            React.createElement('td', null, d.by)))))
    );
  }

  function ComplaintsScreen() {
    const D = window.DATA.screens; const s = D.complaintStats;
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Complaints', sub: 'Customer complaints filed against tickets via the portal' }),
      React.createElement(StatGrid, { cols: 3, items: [
        { value: s.total, label: 'Total Complaints', icon: 'shield', tone: 'sky' },
        { value: s.open, label: 'Open', icon: 'flame', tone: 'rose' },
        { value: s.resolved, label: 'Resolved', icon: 'check', tone: 'accent' }] }),
      React.createElement(Card, { title: 'All Complaints', icon: 'shield' },
        React.createElement(Table, { cols: [{ label: 'Filed' }, { label: 'Ticket' }, { label: 'Phone' }, { label: 'Complaint' }, { label: 'Status' }, { label: '', right: true }] },
          D.complaints.map((c, i) => React.createElement('tr', { key: i },
            React.createElement('td', { className: 'muted' }, c.filed),
            React.createElement('td', null, React.createElement('span', { className: 'tk' }, c.id)),
            React.createElement('td', { className: 'muted' }, c.phone),
            React.createElement('td', { style: { maxWidth: 300 } }, c.text),
            React.createElement('td', null, SB(c.status)),
            React.createElement('td', { className: 'right' }, React.createElement(Btn, { sm: true, primary: c.status !== 'resolved' }, c.status === 'resolved' ? 'View' : 'Respond'))))))
    );
  }

  function FeedbackScreen() {
    const D = window.DATA.screens; const s = D.feedbackStats;
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Leaderboard & Feedback', sub: 'Ratings and comments from clients after service' }),
      React.createElement(StatGrid, { cols: 5, items: [
        { value: s.reviews, label: 'Total Reviews', icon: 'star', tone: 'sky' },
        { value: s.avg + ' / 5', label: 'Overall Average', icon: 'target', tone: 'amber' },
        { value: s.fiveStar, label: '5-Star Reviews', icon: 'award', tone: 'accent' },
        { value: s.rated, label: 'Employees Rated', icon: 'users', tone: 'violet' },
        { value: s.eom, label: 'Employee of Month', icon: 'flame', tone: 'rose' }] }),
      React.createElement(Card, { title: 'Employee Leaderboard', icon: 'award' },
        React.createElement(Table, { cols: [{ label: 'Rank' }, { label: 'Employee' }, { label: 'Average' }, { label: 'Reviews', right: true }, { label: '5★', right: true }] },
          D.feedback.map((e, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('b', { style: { fontFamily: 'var(--font-display)', color: i === 0 ? 'var(--amber)' : 'var(--text-3)' } }, '#' + (i + 1))),
            React.createElement('td', null, React.createElement('div', { className: 'cell-name' }, React.createElement(Avatar, { initials: e.initials }), React.createElement('b', null, e.name))),
            React.createElement('td', null, React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8 } }, React.createElement(Stars, { n: e.avg }), React.createElement('b', null, e.avg.toFixed(2)))),
            React.createElement('td', { className: 'right' }, e.reviews),
            React.createElement('td', { className: 'right' }, React.createElement('span', { className: 'badge resolved' }, e.five))))))
    );
  }

  function NoticesScreen() {
    const D = window.DATA.screens;
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Notices', sub: 'Announcements for staff', actions: React.createElement(Btn, { icon: 'plus', primary: true }, 'Post Notice') }),
      React.createElement(Card, null,
        D.notices.map((n, i) => React.createElement('div', { key: i, className: 'notice' },
          React.createElement('div', { className: 'n-ic' }, I({ name: n.icon })),
          React.createElement('div', { className: 'n-body' },
            React.createElement('b', null, n.title),
            React.createElement('p', null, n.body),
            React.createElement('div', { className: 'n-time' }, n.time)))))
    );
  }

  function ProfileScreen({ role }) {
    const u = window.DATA.user[role] || window.DATA.user.admin;
    return React.createElement('div', { className: 'stack', style: { maxWidth: 720 } },
      React.createElement(PageHeader, { title: 'My Profile', sub: 'Manage your account details' }),
      React.createElement(Card, { title: 'Account Information', icon: 'user' },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 } },
          React.createElement('div', { className: 'avatar', style: { width: 64, height: 64, fontSize: '1.3rem', borderRadius: 18 } }, u.initials),
          React.createElement('div', null, React.createElement('div', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' } }, u.name), React.createElement('div', { style: { color: 'var(--text-3)', fontSize: '0.86rem', textTransform: 'capitalize' } }, u.role))),
        React.createElement('div', { className: 'grid', style: { gridTemplateColumns: '1fr 1fr' } },
          React.createElement('div', { className: 'field' }, React.createElement('label', null, 'Full Name'), React.createElement('input', { defaultValue: u.name })),
          React.createElement('div', { className: 'field' }, React.createElement('label', null, 'Email'), React.createElement('input', { defaultValue: u.email }))),
        React.createElement('div', { className: 'field' }, React.createElement('label', null, 'Phone'), React.createElement('input', { defaultValue: '+91 98765 43210' })),
        React.createElement(Btn, { icon: 'check', primary: true }, 'Save Changes')),
      React.createElement(Card, { title: 'Change Password', icon: 'lock' },
        React.createElement('div', { className: 'field' }, React.createElement('label', null, 'New Password'), React.createElement('input', { type: 'password', defaultValue: '••••••••' })),
        React.createElement(Btn, null, 'Update Password'))
    );
  }

  function SettingsScreen() {
    const rows = [['Auto-assignment', 'Route new requests to the nearest available technician', true],
      ['Device tracking', 'Let technicians log devices taken for off-site service', true],
      ['Clock-in cutoff (9:30 AM)', 'Flag attendance after the cutoff time', true],
      ['SMS notifications', 'Send OTP and status updates over SMS', true],
      ['Public complaints portal', 'Allow clients to file complaints against tickets', false]];
    return React.createElement('div', { className: 'stack', style: { maxWidth: 760 } },
      React.createElement(PageHeader, { title: 'Settings', sub: 'Portal configuration' }),
      React.createElement(Card, { title: 'Operations', icon: 'settings' },
        rows.map((r, i) => React.createElement(ToggleRow, { key: i, label: r[0], desc: r[1], on: r[2] }))));
  }
  function ToggleRow({ label, desc, on }) {
    const [v, setV] = useState(on);
    return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 14, padding: '15px 4px', borderBottom: '1px solid var(--line)' } },
      React.createElement('div', { style: { flex: 1 } }, React.createElement('b', { style: { fontSize: '0.92rem' } }, label), React.createElement('div', { style: { fontSize: '0.82rem', color: 'var(--text-3)', marginTop: 2 } }, desc)),
      React.createElement('button', { onClick: () => setV(!v), style: { width: 46, height: 26, borderRadius: 20, background: v ? 'var(--accent)' : 'var(--line-strong)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 } },
        React.createElement('span', { style: { position: 'absolute', top: 3, left: v ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' } })));
  }

  function AIScreen() {
    const [out, setOut] = useState(false);
    return React.createElement('div', { className: 'stack', style: { maxWidth: 820 } },
      React.createElement(PageHeader, { title: 'AI Business Report', sub: 'Growth analysis & insights for this period' }),
      React.createElement('div', { className: 'glass card in', style: { background: 'linear-gradient(140deg, var(--accent-soft), transparent)' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 } },
          React.createElement('div', { className: 'logo-mark' }, I({ name: 'sparkle', size: 22 })),
          React.createElement('div', null, React.createElement('h3', { style: { fontFamily: 'var(--font-display)', fontSize: '1.1rem' } }, 'NEST Growth Advisor'),
            React.createElement('p', { style: { fontSize: '0.84rem', color: 'var(--text-3)' } }, 'Generate an AI summary of revenue, collections and what to do next.'))),
        React.createElement('div', { style: { display: 'flex', gap: 10, marginBottom: 18 } },
          React.createElement('input', { className: '', placeholder: 'Ask a question about this period…', style: { flex: 1, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 13, padding: '12px 14px', color: 'var(--text)', outline: 'none' } }),
          React.createElement(Btn, { primary: true, icon: 'sparkle', onClick: () => setOut(true) }, 'Generate')),
        out && React.createElement('div', { className: 'in', style: { padding: 18, borderRadius: 16, background: 'var(--panel-2)', border: '1px solid var(--line)', fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--text-2)' } },
          React.createElement('b', { style: { color: 'var(--text)' } }, 'June snapshot — strong month. '),
          'Net received is ₹3.18L against ₹3.60L billed (88% collection rate). CCTV drives 47% of revenue. Receivables are healthy — 62% under 30 days — but ₹42.5k sits in 31-90 day buckets, mostly City Mall. ',
          React.createElement('b', { style: { color: 'var(--text)' } }, 'Next: '),
          'chase the City Mall invoice, and push the biometric upsell — it has the highest margin and lowest volume.'))
    );
  }

  // ============================================================
  // EMPLOYEE SCREENS
  // ============================================================
  function EmpTasksScreen() {
    const D = window.DATA.screens;
    const [tab, setTab] = useState('all');
    const tabs = [['all', 'All'], ['open', 'Open'], ['progress', 'In Progress'], ['assigned', 'Assigned'], ['resolved', 'Done']];
    const counts = { all: D.empTasksFull.length };
    tabs.forEach(([k]) => { if (k !== 'all') counts[k] = D.empTasksFull.filter((t) => t.status === k).length; });
    const rows = tab === 'all' ? D.empTasksFull : D.empTasksFull.filter((t) => t.status === tab);
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'My Tasks', sub: "Today's assigned service jobs" }),
      React.createElement(FilterTabs, { tabs, active: tab, counts, onPick: setTab }),
      React.createElement(Card, null,
        React.createElement(Table, { cols: [{ label: 'Ticket' }, { label: 'Service' }, { label: 'Customer' }, { label: 'Location' }, { label: 'Time' }, { label: 'Status' }, { label: '', right: true }] },
          rows.map((t, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('span', { className: 'tk' }, t.id)),
            React.createElement('td', null, React.createElement('b', null, t.service)),
            React.createElement('td', null, t.cust),
            React.createElement('td', { className: 'muted' }, React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, I({ name: 'pin', size: 13 }), t.addr)),
            React.createElement('td', { className: 'muted' }, t.time),
            React.createElement('td', null, SB(t.status)),
            React.createElement('td', { className: 'right' }, React.createElement(Btn, { sm: true, primary: true, onClick: () => window.openTicket(t, 'employee') }, 'Open'))))))
    );
  }

  function EmpAttendanceScreen() {
    const mine = window.DATA.screens.attendance.filter((a) => a.emp === 'Zeeshan Ahmad');
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Attendance Records', sub: 'Your clock-in history' }),
      React.createElement(StatGrid, { cols: 3, items: [
        { value: '23 days', label: 'Present this month', icon: 'flame', tone: 'accent' },
        { value: '7.4h', label: 'Avg hours / day', icon: 'hourglass', tone: 'sky' },
        { value: '1', label: 'Approved leaves', icon: 'calendar', tone: 'violet' }] }),
      React.createElement(Card, null,
        React.createElement(Table, { cols: [{ label: 'Date' }, { label: 'Clock In' }, { label: 'Clock Out' }, { label: 'Hours' }, { label: 'Location' }] },
          mine.concat(mine).slice(0, 6).map((r, i) => React.createElement('tr', { key: i },
            React.createElement('td', { className: 'muted' }, r.date),
            React.createElement('td', null, r.in),
            React.createElement('td', null, r.out),
            React.createElement('td', null, r.active ? React.createElement('span', { className: 'badge open' }, 'Active') : React.createElement('b', null, r.hrs)),
            React.createElement('td', { className: 'muted' }, r.loc)))))
    );
  }

  function LeavesScreen({ role }) {
    const D = window.DATA.screens; const s = D.leaveStats;
    const isAdmin = role === 'admin';
    const rows = isAdmin ? D.leaves : D.leaves.filter((l) => l.emp === 'Zeeshan Ahmad');
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Leave Requests', sub: isAdmin ? 'Approve or reject time-off requests' : 'Your leave history',
        actions: !isAdmin && React.createElement(Btn, { icon: 'plus', primary: true }, 'Request Leave') }),
      React.createElement(StatGrid, { cols: 3, items: [
        { value: s.pending, label: 'Pending', icon: 'hourglass', tone: 'amber' },
        { value: s.approved, label: 'Approved', icon: 'check', tone: 'accent' },
        { value: s.rejected, label: 'Rejected', icon: 'close', tone: 'rose' }] }),
      React.createElement(Card, null,
        React.createElement(Table, { cols: [{ label: 'Employee' }, { label: 'Dates' }, { label: 'Reason' }, { label: 'Status' }, { label: '', right: true }] },
          rows.map((l, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('b', null, l.emp)),
            React.createElement('td', { className: 'muted' }, l.dates),
            React.createElement('td', null, l.reason),
            React.createElement('td', null, React.createElement('span', { className: 'badge ' + (l.status === 'approved' ? 'resolved' : l.status === 'pending' ? 'progress' : 'high') }, l.status)),
            React.createElement('td', { className: 'right' }, isAdmin && l.status === 'pending'
              ? React.createElement('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } }, React.createElement(Btn, { sm: true, primary: true }, 'Approve'), React.createElement(Btn, { sm: true }, 'Reject'))
              : React.createElement('span', { className: 'muted' }, '—'))))))
    );
  }

  function EodScreen({ role }) {
    const D = window.DATA.screens;
    const isAdmin = role === 'admin';
    const rows = isAdmin ? D.eod : D.eod.filter((e) => e.staff === 'Zeeshan Ahmad');
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: isAdmin ? 'EOD Summaries' : 'EOD Reports', sub: 'End-of-day progress reports', actions: !isAdmin && React.createElement(Btn, { icon: 'plus', primary: true }, 'Submit EOD') }),
      React.createElement(Card, null,
        React.createElement(Table, { cols: [{ label: 'Date' }, { label: 'Staff' }, { label: 'Summary' }] },
          rows.map((e, i) => React.createElement('tr', { key: i },
            React.createElement('td', { className: 'muted', style: { whiteSpace: 'nowrap' } }, e.date),
            React.createElement('td', null, React.createElement('b', null, e.staff)),
            React.createElement('td', { style: { lineHeight: 1.5 } }, e.summary)))))
    );
  }

  function SalaryScreen({ role }) {
    const D = window.DATA.screens; const s = D.salaryStats;
    if (role !== 'admin') {
      const me = D.salary[0];
      return React.createElement('div', { className: 'stack', style: { maxWidth: 620 } },
        React.createElement(PageHeader, { title: 'Salary', sub: 'Attendance-based estimate for this month' }),
        React.createElement(StatGrid, { cols: 3, items: [
          { value: inr(me.monthly), label: 'Monthly Salary', icon: 'rupee', tone: 'sky' },
          { value: me.payable, label: 'Payable Days', icon: 'calendar', tone: 'accent' },
          { value: inr(me.earned), label: 'Estimated Earned', icon: 'card', tone: 'amber' }] }),
        React.createElement(Card, { title: 'Breakdown', icon: 'rupee' },
          React.createElement('div', { className: 'list' },
            [['Present days', me.present], ['Approved leave', me.leave], ['Payable days', me.payable], ['Estimated earned', inr(me.earned)]].map((r, i) =>
              React.createElement('div', { key: i, className: 'lrow' }, React.createElement('div', { className: 'lrow-main' }, React.createElement('b', null, r[0])), React.createElement('b', null, r[1]))))));
    }
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Salary Overview', sub: 'Attendance-based salary estimate' }),
      React.createElement(StatGrid, { cols: 3, items: [
        { value: s.emps, label: 'Employees', icon: 'users', tone: 'sky' },
        { value: inr(s.payroll), label: 'Monthly Payroll', icon: 'rupee', tone: 'accent' },
        { value: inr(s.estimated), label: 'Estimated Earned', icon: 'card', tone: 'amber' }] }),
      React.createElement(Card, null,
        React.createElement(Table, { cols: [{ label: 'Employee' }, { label: 'Monthly', right: true }, { label: 'Present', right: true }, { label: 'Leave', right: true }, { label: 'Payable', right: true }, { label: 'Earned', right: true }] },
          D.salary.map((r, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('div', { className: 'cell-name' }, React.createElement(Avatar, { initials: initialsOf(r.name) }), React.createElement('b', null, r.name))),
            React.createElement('td', { className: 'right muted' }, inr(r.monthly)),
            React.createElement('td', { className: 'right' }, React.createElement('span', { className: 'badge open' }, r.present)),
            React.createElement('td', { className: 'right' }, React.createElement('span', { className: 'badge resolved' }, r.leave)),
            React.createElement('td', { className: 'right muted' }, r.payable),
            React.createElement('td', { className: 'right', style: { color: 'var(--accent)', fontWeight: 700 } }, inr(r.earned))))))
    );
  }

  function EstimatorScreen() {
    const D = window.DATA.screens;
    const [cart, setCart] = useState({});
    const add = (i) => setCart((c) => ({ ...c, [i]: (c[i] || 0) + 1 }));
    const total = Object.entries(cart).reduce((s, [i, q]) => s + D.pricing[i].price * q, 0);
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Estimator', sub: 'Build a quick quote from the price list' }),
      React.createElement('div', { className: 'grid grid-2-1', style: { alignItems: 'start' } },
        React.createElement(Card, { title: 'Service Pricing', icon: 'receipt' },
          React.createElement(Table, { cols: [{ label: 'Category' }, { label: 'Item' }, { label: 'Price', right: true }, { label: '', right: true }] },
            D.pricing.map((p, i) => React.createElement('tr', { key: i },
              React.createElement('td', null, React.createElement('span', { className: 'chip' }, p.cat)),
              React.createElement('td', null, React.createElement('div', { className: 'cell-stack' }, React.createElement('b', null, p.sub), React.createElement('small', null, p.detail))),
              React.createElement('td', { className: 'right', style: { fontWeight: 700 } }, inr(p.price)),
              React.createElement('td', { className: 'right' }, React.createElement(Btn, { sm: true, primary: true, icon: 'plus', onClick: () => add(i) }, 'Add')))))),
        React.createElement('div', { className: 'glass card in', style: { '--d': '.1s', position: 'sticky', top: 0 } },
          React.createElement('div', { className: 'card-head' }, React.createElement('h3', null, I({ name: 'receipt' }), 'Quote')),
          Object.keys(cart).length === 0
            ? React.createElement('p', { style: { color: 'var(--text-3)', fontSize: '0.88rem', textAlign: 'center', padding: '24px 0' } }, 'Add items to build a quote.')
            : React.createElement('div', { className: 'list' }, Object.entries(cart).map(([i, q]) => React.createElement('div', { key: i, className: 'lrow' },
                React.createElement('div', { className: 'lrow-main' }, React.createElement('b', null, D.pricing[i].sub), React.createElement('span', null, q + ' × ' + inr(D.pricing[i].price))),
                React.createElement('b', null, inr(D.pricing[i].price * q))))),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' } },
            React.createElement('span', { style: { color: 'var(--text-3)', fontWeight: 600 } }, 'Total'),
            React.createElement('span', { style: { fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' } }, inr(total))),
          React.createElement(Btn, { primary: true, icon: 'arrowRight' }, 'Create Bill')))
    );
  }

  function TutorialsScreen() {
    const vids = [
      { t: 'Crimping RJ45 the right way', cat: 'Networking', len: '6:12', theme: 't2' },
      { t: 'Aligning a dome camera FOV', cat: 'CCTV', len: '4:48', theme: 't1' },
      { t: 'Biometric enrollment walkthrough', cat: 'Biometric', len: '8:30', theme: 't3' },
      { t: 'Using the NEST estimator', cat: 'App', len: '3:20', theme: 't4' },
    ];
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Tutorials', sub: 'Short how-to videos for the field team' }),
      React.createElement('div', { className: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' } },
        vids.map((v, i) => React.createElement('div', { key: i, className: 'glass course in', style: { '--d': (i * 0.05) + 's' } },
          React.createElement('div', { className: 'course-banner ' + v.theme },
            React.createElement('div', { className: 'pat' }),
            React.createElement('div', { style: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 1 } },
              React.createElement('div', { className: 'promo-play', style: { width: 48, height: 48 } }, I({ name: 'play', size: 22 }))),
            React.createElement('span', { className: 'cat' }, v.cat)),
          React.createElement('div', { className: 'course-body' },
            React.createElement('h4', null, v.t),
            React.createElement('div', { className: 'course-meta', style: { marginTop: 8 } }, React.createElement('span', null, I({ name: 'clock', size: 14 }), v.len))))))
    );
  }

  // ============================================================
  // REGISTRY
  // ============================================================
  const REG = {
    // admin
    'all-tickets': (r) => r === 'admin' ? React.createElement(TicketsScreen, { titleOverride: 'All Tickets & Tasks', role: 'admin' }) : React.createElement(EmpTasksScreen),
    inquiries: () => React.createElement(TicketsScreen, { role: 'admin' }),
    attendance: () => React.createElement(AttendanceScreen),
    users: () => React.createElement(UsersScreen),
    finance: () => React.createElement(FinanceScreen),
    'ai-report': () => React.createElement(AIScreen),
    cash: () => React.createElement(CashScreen),
    collections: () => React.createElement(CashScreen),
    payments: () => React.createElement(PaymentsScreen),
    bills: () => React.createElement(BillsScreen),
    'device-tracking': () => React.createElement(DevicesScreen),
    'device-followup': () => React.createElement(DevicesScreen),
    complaints: () => React.createElement(ComplaintsScreen),
    feedback: () => React.createElement(FeedbackScreen),
    leaderboard: () => React.createElement(FeedbackScreen),
    notices: () => React.createElement(NoticesScreen),
    'admin-notices': () => React.createElement(NoticesScreen),
    settings: () => React.createElement(SettingsScreen),
    salary: (r) => React.createElement(SalaryScreen, { role: r }),
    'my-salary': (r) => React.createElement(SalaryScreen, { role: r }),
    leaves: (r) => React.createElement(LeavesScreen, { role: r }),
    'my-leaves': (r) => React.createElement(LeavesScreen, { role: r }),
    eod: (r) => React.createElement(EodScreen, { role: r }),
    'my-eod': (r) => React.createElement(EodScreen, { role: r }),
    profile: (r) => React.createElement(ProfileScreen, { role: r }),
    estimator: () => React.createElement(EstimatorScreen),
    'service-pricing': () => React.createElement(EstimatorScreen),
    pricing: () => React.createElement(EstimatorScreen),
    // employee
    'my-attendance': () => React.createElement(EmpAttendanceScreen),
    'my-cash': () => React.createElement(CashScreen),
    'my-collections': () => React.createElement(CashScreen),
    'employee-training': () => React.createElement(TutorialsScreen),
    tutorials: () => React.createElement(TutorialsScreen),
  };

  window.renderScreen = function (page, role) {
    const ext = window.EXTRA_SCREENS || {};
    const fn = ext[page] || REG[page];
    return fn ? fn(role) : null;
  };

  // expose the kit so other files (admin-extra.jsx) can build matching screens
  window.ScreenKit = { PageHeader, Btn, StatGrid, FilterTabs, Toolbar, Card, Table, Avatar, Stars, SB, inr, initialsOf, I };
})();
