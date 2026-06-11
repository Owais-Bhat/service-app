/* Extra admin screens — extends window.EXTRA_SCREENS, consumed by renderScreen.
   Uses window.ScreenKit (exposed by screens.jsx). */
(function () {
  const { useState } = React;
  const K = window.ScreenKit;
  const { PageHeader, Btn, StatGrid, FilterTabs, Toolbar, Card, Table, Avatar, Stars, SB, inr, initialsOf, I } = K;
  const D = () => window.DATA.screens;

  function Toggle({ on, onChange }) {
    return React.createElement('button', { onClick: onChange, style: { width: 46, height: 26, borderRadius: 20, background: on ? 'var(--accent)' : 'var(--line-strong)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 } },
      React.createElement('span', { style: { position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' } }));
  }
  function RuleRow({ label, desc, on: initial }) {
    const [on, setOn] = useState(initial);
    return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 14, padding: '15px 4px', borderBottom: '1px solid var(--line)' } },
      React.createElement('div', { style: { flex: 1 } }, React.createElement('b', { style: { fontSize: '0.92rem' } }, label), React.createElement('div', { style: { fontSize: '0.82rem', color: 'var(--text-3)', marginTop: 2 } }, desc)),
      React.createElement(Toggle, { on, onChange: () => setOn(!on) }));
  }

  // ---- AUTO ASSIGNMENT ----
  function AutoAssignment() {
    const A = D().autoAssign;
    const [on, setOn] = useState(A.enabled);
    return React.createElement('div', { className: 'stack', style: { maxWidth: 900 } },
      React.createElement(PageHeader, { title: 'Auto Assignment', sub: 'Automatically route new requests to the right technician' }),
      React.createElement('div', { className: 'glass card in', style: { display: 'flex', alignItems: 'center', gap: 18, background: on ? 'linear-gradient(140deg, var(--accent-soft), transparent)' : 'var(--glass-bg)' } },
        React.createElement('div', { className: 'lrow-ico', style: { width: 52, height: 52, borderRadius: 16 } }, I({ name: 'refresh', size: 24 })),
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('h3', { style: { fontFamily: 'var(--font-display)', fontSize: '1.05rem' } }, 'Auto assignment is ', React.createElement('span', { style: { color: on ? 'var(--accent)' : 'var(--text-3)' } }, on ? 'ON' : 'OFF')),
          React.createElement('p', { style: { fontSize: '0.86rem', color: 'var(--text-3)', marginTop: 3 } }, on ? 'New requests are dispatched automatically using the rules below.' : 'New requests stay unassigned until you assign them manually.')),
        React.createElement(Toggle, { on, onChange: () => setOn(!on) })),
      React.createElement(Card, { title: 'Assignment Rules', icon: 'settings' }, A.rules.map((r, i) => React.createElement(RuleRow, { key: i, ...r }))),
      React.createElement(Card, { title: 'Suggested Assignments', icon: 'sparkle' },
        React.createElement(Table, { cols: [{ label: 'Ticket' }, { label: 'Service' }, { label: 'Suggested Technician' }, { label: 'Distance' }, { label: 'ETA' }, { label: '', right: true }] },
          A.queue.map((q, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('span', { className: 'tk' }, q.id)),
            React.createElement('td', null, React.createElement('b', null, q.service)),
            React.createElement('td', null, React.createElement('div', { className: 'cell-name' }, React.createElement(Avatar, { initials: initialsOf(q.suggested) }), q.suggested)),
            React.createElement('td', { className: 'muted' }, q.dist),
            React.createElement('td', { className: 'muted' }, q.eta),
            React.createElement('td', { className: 'right' }, React.createElement(Btn, { sm: true, primary: true, icon: 'check' }, 'Assign')))))));
  }

  // ---- CONTACTS ----
  function Contacts() {
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Contacts', sub: 'Customer details collected from service requests', actions: React.createElement(Btn, { icon: 'download' }, 'Export CSV') }),
      React.createElement(Toolbar, { placeholder: 'Filter by name…' }),
      React.createElement(Card, null,
        React.createElement(Table, { cols: [{ label: 'Name' }, { label: 'Phone' }, { label: 'Location' }, { label: 'Service' }, { label: 'Date' }, { label: '', right: true }] },
          D().contacts.map((c, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('div', { className: 'cell-name' }, React.createElement(Avatar, { initials: initialsOf(c.name) }), React.createElement('b', null, c.name))),
            React.createElement('td', { className: 'muted' }, c.phone),
            React.createElement('td', { className: 'muted' }, React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } }, I({ name: 'pin', size: 13 }), c.loc)),
            React.createElement('td', null, React.createElement('span', { className: 'chip' }, c.service)),
            React.createElement('td', { className: 'muted' }, c.date),
            React.createElement('td', { className: 'right' }, React.createElement('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } }, React.createElement(Btn, { sm: true, icon: 'phone' }, 'Call'), React.createElement(Btn, { sm: true, primary: true }, 'New Request'))))))));
  }

  // ---- INVENTORY ----
  function Inventory() {
    const list = D().inventory;
    const low = list.filter((x) => x.qty <= x.min).length;
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Inventory', sub: 'Stock levels for parts & devices', actions: React.createElement(Btn, { icon: 'download' }, 'Export CSV') }),
      React.createElement(StatGrid, { cols: 3, items: [
        { value: list.length, label: 'Items Tracked', icon: 'box', tone: 'sky' },
        { value: low, label: 'Low Stock', icon: 'flame', tone: 'rose' },
        { value: list.reduce((s, x) => s + x.qty, 0), label: 'Total Units', icon: 'cpu', tone: 'accent' }] }),
      React.createElement(Card, null,
        React.createElement(Table, { cols: [{ label: 'Item' }, { label: 'Stock', right: true }, { label: 'Min', right: true }, { label: 'Status', right: true }] },
          list.map((x, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('b', null, x.item)),
            React.createElement('td', { className: 'right' }, React.createElement('b', null, x.qty), ' ', React.createElement('span', { className: 'muted' }, x.unit)),
            React.createElement('td', { className: 'right muted' }, x.min),
            React.createElement('td', { className: 'right' }, React.createElement('span', { className: 'badge ' + (x.qty <= x.min ? 'high' : 'resolved') }, x.qty <= x.min ? 'Low' : 'OK')))))));
  }

  // ---- LANDING ADS ----
  function adPreview(theme, kind) {
    return React.createElement('div', { className: 'course-banner ' + theme, style: { width: 120, height: 64, borderRadius: 10, padding: 0, display: 'grid', placeItems: 'center' } },
      React.createElement('div', { className: 'pat' }),
      React.createElement('div', { style: { position: 'relative', zIndex: 1, color: '#fff' } }, I({ name: kind === 'video' ? 'play' : 'camera', size: 22 })));
  }
  function LandingAds() {
    const s = D().adStats;
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Landing Page Ads', sub: 'Slides in the rotating carousel on the public portal', actions: React.createElement(Btn, { icon: 'plus', primary: true }, 'Add Slide') }),
      React.createElement(StatGrid, { cols: 3, items: [
        { value: s.total, label: 'Total Slides', icon: 'box', tone: 'sky' },
        { value: s.active, label: 'Active', icon: 'check', tone: 'accent' },
        { value: s.hidden, label: 'Hidden', icon: 'eye', tone: 'amber' }] }),
      React.createElement(Card, { title: 'Slides', icon: 'box' },
        React.createElement(Table, { cols: [{ label: 'Pos' }, { label: 'Preview' }, { label: 'Kind' }, { label: 'Caption' }, { label: 'Duration' }, { label: 'Status' }, { label: '', right: true }] },
          D().ads.map((a, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('b', null, a.pos)),
            React.createElement('td', null, adPreview(a.theme, a.kind)),
            React.createElement('td', null, React.createElement('span', { className: 'badge ' + (a.kind === 'video' ? 'progress' : 'resolved') }, a.kind)),
            React.createElement('td', { style: { maxWidth: 240 } }, a.caption),
            React.createElement('td', { className: 'muted' }, a.dur),
            React.createElement('td', null, React.createElement('span', { className: 'badge ' + (a.active ? 'resolved' : 'high') }, a.active ? 'Active' : 'Hidden')),
            React.createElement('td', { className: 'right' }, React.createElement('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } }, React.createElement(Btn, { sm: true }, 'Edit'), React.createElement(Btn, { sm: true }, a.active ? 'Hide' : 'Show'))))))));
  }

  // ---- POPUP ADS ----
  function PopupAds() {
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Popup Ads', sub: 'Overlay promotions shown on the portal', actions: React.createElement(Btn, { icon: 'plus', primary: true }, 'New Popup') }),
      React.createElement('div', { className: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' } },
        D().popupAds.map((a, i) => React.createElement('div', { key: i, className: 'glass course in', style: { '--d': (i * 0.05) + 's' } },
          React.createElement('div', { className: 'course-banner ' + a.theme },
            React.createElement('div', { className: 'pat' }),
            React.createElement('div', { className: 'bico' }, I({ name: a.kind === 'video' ? 'play' : 'camera', size: 24 })),
            React.createElement('span', { className: 'cat' }, a.kind)),
          React.createElement('div', { className: 'course-body' },
            React.createElement('h4', null, a.title),
            React.createElement('div', { className: 'course-meta', style: { marginTop: 8 } }, React.createElement('span', null, I({ name: 'target', size: 14 }), a.target))),
          React.createElement('div', { className: 'course-foot' },
            React.createElement('span', { className: 'badge ' + (a.active ? 'resolved' : 'high'), style: { marginRight: 'auto' } }, a.active ? 'Active' : 'Hidden'),
            React.createElement(Btn, { sm: true }, 'Edit'))))));
  }

  // ---- DEVICE TYPES & COMPANIES ----
  function DeviceTypes() {
    const d = D();
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Devices & Companies', sub: 'Device types, registered companies & reported customer devices', actions: React.createElement(Btn, { icon: 'refresh' }, 'Refresh') }),
      React.createElement('div', { className: 'grid', style: { gridTemplateColumns: '1fr 1fr' } },
        React.createElement(Card, { title: 'Device Types', icon: 'box', right: React.createElement(Btn, { sm: true, primary: true, icon: 'plus' }, 'Add') },
          React.createElement(Table, { cols: [{ label: 'Name' }, { label: 'Description' }, { label: '', right: true }] },
            d.deviceTypes.map((t, i) => React.createElement('tr', { key: i },
              React.createElement('td', null, React.createElement('b', null, t.name)),
              React.createElement('td', { className: 'muted' }, t.desc),
              React.createElement('td', { className: 'right' }, React.createElement(Btn, { sm: true }, 'Edit')))))),
        React.createElement(Card, { title: 'Companies Registry', icon: 'users', right: React.createElement(Btn, { sm: true, primary: true, icon: 'plus' }, 'Add') },
          React.createElement(Table, { cols: [{ label: 'Company' }, { label: '', right: true }] },
            d.companies.map((c, i) => React.createElement('tr', { key: i },
              React.createElement('td', null, React.createElement('b', null, c.name)),
              React.createElement('td', { className: 'right' }, React.createElement(Btn, { sm: true }, 'Edit'))))))),
      React.createElement(Card, { title: 'Reported Customer Devices', icon: 'cpu', right: React.createElement(Btn, { sm: true, icon: 'download' }, 'Export') },
        React.createElement(Table, { cols: [{ label: 'Customer' }, { label: 'Company' }, { label: 'Device Type' }, { label: 'Serial No' }, { label: 'Ticket' }, { label: 'Date' }] },
          d.reportedDevices.map((r, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('b', null, r.cust)),
            React.createElement('td', { className: 'muted' }, r.company),
            React.createElement('td', null, React.createElement('span', { className: 'chip' }, r.type)),
            React.createElement('td', { className: 'muted', style: { fontFamily: 'var(--font-mono)', fontSize: '0.78rem' } }, r.serial),
            React.createElement('td', null, React.createElement('span', { className: 'tk' }, r.ticket)),
            React.createElement('td', { className: 'muted' }, r.date))))));
  }

  // ---- DISCOUNTS ----
  function Discounts() {
    const d = D(); const s = d.discountStats;
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Discounts', sub: 'Promo codes & loyalty offers', actions: React.createElement(Btn, { icon: 'plus', primary: true }, 'Add Discount') }),
      React.createElement(StatGrid, { cols: 3, items: [
        { value: s.active, label: 'Active Codes', icon: 'receipt', tone: 'accent' },
        { value: s.redeemed, label: 'Times Redeemed', icon: 'check', tone: 'sky' },
        { value: inr(s.savings), label: 'Customer Savings', icon: 'rupee', tone: 'amber' }] }),
      React.createElement(Card, { title: 'All Discounts', icon: 'receipt' },
        React.createElement(Table, { cols: [{ label: 'Code' }, { label: 'Offer' }, { label: 'Value' }, { label: 'Scope' }, { label: 'Uses', right: true }, { label: 'Status' }, { label: '', right: true }] },
          d.discounts.map((x, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('span', { className: 'tk' }, x.code)),
            React.createElement('td', null, React.createElement('b', null, x.label)),
            React.createElement('td', null, React.createElement('span', { className: 'chip', style: { color: 'var(--accent)' } }, x.type)),
            React.createElement('td', { className: 'muted' }, x.scope),
            React.createElement('td', { className: 'right' }, x.uses),
            React.createElement('td', null, React.createElement('span', { className: 'badge ' + (x.active ? 'resolved' : 'high') }, x.active ? 'Active' : 'Ended')),
            React.createElement('td', { className: 'right' }, React.createElement(Btn, { sm: true }, 'Edit')))))));
  }

  // ---- NOTIFICATIONS ----
  function Notifications() {
    const list = D().notifications;
    const unread = list.filter((n) => n.unread).length;
    return React.createElement('div', { className: 'stack', style: { maxWidth: 820 } },
      React.createElement(PageHeader, { title: 'Notifications', sub: unread + ' unread', actions: React.createElement(Btn, { icon: 'check' }, 'Mark all read') }),
      React.createElement(Card, null,
        list.map((n, i) => React.createElement('div', { key: i, className: 'notice', style: { borderColor: n.unread ? 'color-mix(in srgb, var(--accent) 30%, var(--line))' : 'var(--line)', background: n.unread ? 'var(--accent-soft)' : 'var(--panel-2)' } },
          React.createElement('div', { className: 'n-ic bg-' + n.tone }, I({ name: n.icon })),
          React.createElement('div', { className: 'n-body' },
            React.createElement('b', null, n.title),
            React.createElement('p', null, n.body),
            React.createElement('div', { className: 'n-time' }, n.time)),
          n.unread && React.createElement('span', { style: { width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 6 } })))));
  }

  // ---- EMPLOYEE TUTORIALS (admin manage) ----
  function TrainingAdmin() {
    return React.createElement('div', { className: 'stack' },
      React.createElement(PageHeader, { title: 'Employee Tutorials', sub: 'Manage how-to videos for the field team', actions: React.createElement(Btn, { icon: 'plus', primary: true }, 'Upload Video') }),
      React.createElement(Card, null,
        React.createElement(Table, { cols: [{ label: 'Title' }, { label: 'Category' }, { label: 'Views', right: true }, { label: 'Status' }, { label: '', right: true }] },
          D().adminTutorials.map((t, i) => React.createElement('tr', { key: i },
            React.createElement('td', null, React.createElement('div', { className: 'cell-name' }, React.createElement('div', { className: 'lrow-ico', style: { width: 34, height: 34 } }, I({ name: 'play', size: 16 })), React.createElement('b', null, t.title))),
            React.createElement('td', null, React.createElement('span', { className: 'chip' }, t.cat)),
            React.createElement('td', { className: 'right' }, t.views),
            React.createElement('td', null, React.createElement('span', { className: 'badge ' + (t.active ? 'resolved' : 'high') }, t.active ? 'Published' : 'Draft')),
            React.createElement('td', { className: 'right' }, React.createElement(Btn, { sm: true }, 'Edit')))))));
  }

  window.EXTRA_SCREENS = {
    auto: () => React.createElement(AutoAssignment),
    'auto-assignment': () => React.createElement(AutoAssignment),
    contacts: () => React.createElement(Contacts),
    inventory: () => React.createElement(Inventory),
    stocks: () => React.createElement(Inventory),
    ads: () => React.createElement(LandingAds),
    'popup-ads': () => React.createElement(PopupAds),
    'device-types': () => React.createElement(DeviceTypes),
    discounts: () => React.createElement(Discounts),
    'discount-details': () => React.createElement(Discounts),
    notifications: () => React.createElement(Notifications),
    'training-admin': () => React.createElement(TrainingAdmin),
  };
})();
