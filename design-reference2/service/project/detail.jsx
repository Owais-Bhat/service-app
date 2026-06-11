/* Rich detail modals: Service Request "Manage", Premium Bill.
   Global host subscribes to window events; screens call window.openTicket / window.openBill. */
(function () {
  const { useState, useEffect } = React;
  const I = (p) => React.createElement(window.Icon, p);
  const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');
  const SB = (s) => React.createElement(window.StatusBadge, { status: s });

  function Field({ l, v, mono, full }) {
    return React.createElement('div', { style: full ? { gridColumn: '1 / -1' } : null },
      React.createElement('div', { className: 'meta-l' }, l),
      React.createElement('div', { className: 'meta-v' + (mono ? ' mono' : '') }, v || '—'));
  }
  function SectionH({ icon, children }) {
    return React.createElement('div', { className: 'meta-section-h' }, I({ name: icon }), children);
  }

  // derive rich detail from a basic ticket row
  function enrich(t) {
    const bills = {
      'NEST-8842': { items: [['IP Camera RMA inspection', 1, 800], ['PoE port repair', 1, 1200]], platform: 199, transportKm: 4.2, transport: 210, discount: 0, discountLabel: '', gst: 433, total: 2842, device: 'IP Dome Camera', serial: 'HK-2CD-88421' },
      'NEST-8835': { items: [['Cisco SG250 8-port switch', 1, 9800], ['Installation & config', 1, 1500]], platform: 199, transportKm: 6.1, transport: 305, discount: 565, discountLabel: 'Loyalty 5%', gst: 1980, total: 12500, device: 'Network Switch', serial: 'CSCO-SG250-7741' },
    };
    const b = bills[t.id] || { items: [[t.service, 1, 2200]], platform: 199, transportKm: 3.4, transport: 170, discount: 0, discountLabel: '', gst: 462, total: 3031, device: 'IP Dome Camera', serial: 'HK-2CD-' + (t.id.slice(-4)) };
    return {
      ...t,
      created: t.when || 'Today, 10:30 AM',
      updated: '20 min ago',
      desc: 'Customer reports the device went offline since yesterday evening. No power LED. Requested a same-day visit if possible.',
      location: 'Lal Chowk, near Ghanta Ghar, Srinagar 190001',
      preferred: 'Today, after 2 PM',
      slaText: '11h 20m left',
      slaPct: 68,
      lat: 34.0837, lng: 74.7973,
      bill: b,
      feedback: t.status === 'resolved' ? { rating: 5, comment: 'Quick, polite and fixed it first time. Highly recommend NEST.' } : null,
      declined: t.id === 'NEST-8833' ? 'Out of service area today — please reassign.' : null,
    };
  }

  function TicketDetail({ ticket, role, onClose }) {
    const t = enrich(ticket);
    const b = t.bill;
    const hasBill = t.pay != null || t.status === 'resolved' || t.status === 'progress';
    const isAdmin = role === 'admin';

    return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target.classList.contains('modal-overlay')) onClose(); } },
      React.createElement('div', { className: 'modal wide' },
        React.createElement('div', { className: 'modal-head' },
          React.createElement('div', { className: 'logo-mark', style: { width: 38, height: 38 } }, I({ name: 'ticket', size: 20 })),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('h3', null, t.service),
            React.createElement('span', { className: 'tk' }, t.id)),
          SB(t.status),
          React.createElement('button', { className: 'icon-btn close', onClick: onClose, style: { marginLeft: 4 } }, I({ name: 'close' }))),
        React.createElement('div', { className: 'modal-body' },
          React.createElement('div', { className: 'dm-grid' },
            // LEFT: details
            React.createElement('div', null,
              React.createElement('div', { className: 'meta-card' },
                React.createElement(SectionH, { icon: 'inbox' }, 'Request Details'),
                React.createElement('div', { className: 'meta-grid' },
                  React.createElement(Field, { l: 'Customer', v: t.cust }),
                  React.createElement(Field, { l: 'Phone', v: t.phone || '+91 98765 43210' }),
                  React.createElement(Field, { l: 'Company', v: t.company !== '—' ? t.company : null }),
                  React.createElement(Field, { l: 'Service Item', v: t.service }),
                  React.createElement(Field, { l: 'Created', v: t.created }),
                  React.createElement(Field, { l: 'Last Updated', v: t.updated }),
                  React.createElement(Field, { l: 'Preferred Time', v: t.preferred }),
                  React.createElement(Field, { l: 'Priority', v: t.priority ? (t.priority[0].toUpperCase() + t.priority.slice(1)) : 'Medium' })),
                React.createElement('div', { style: { marginTop: 14 } },
                  React.createElement('div', { className: 'meta-l' }, 'Customer Description'),
                  React.createElement('div', { className: 'meta-v', style: { fontWeight: 500, color: 'var(--text-2)' } }, t.desc))),
              React.createElement('div', { className: 'meta-card' },
                React.createElement(SectionH, { icon: 'cpu' }, 'Device & Location'),
                React.createElement('div', { className: 'meta-grid' },
                  React.createElement(Field, { l: 'Device Type', v: b.device }),
                  React.createElement(Field, { l: 'Serial No', v: b.serial, mono: true }),
                  React.createElement(Field, { l: 'Location', v: t.location, full: true })),
                React.createElement('a', { href: 'https://www.google.com/maps?q=' + t.lat + ',' + t.lng, target: '_blank', rel: 'noopener', className: 'btn btn-ghost btn-sm', style: { marginTop: 14, textDecoration: 'none' } },
                  I({ name: 'pin', size: 15 }), 'Open exact client pin')),
              t.declined && React.createElement('div', { className: 'callout danger' },
                React.createElement('div', { className: 'c-l' }, 'Employee Declined'),
                React.createElement('div', { className: 'c-v' }, t.declined)),
              t.feedback && React.createElement('div', { className: 'meta-card' },
                React.createElement(SectionH, { icon: 'star' }, 'Customer Feedback'),
                React.createElement('div', { className: 'fb-block' },
                  React.createElement('span', { className: 'fb-ico' }, I({ name: 'star', size: 22 })),
                  React.createElement('div', null,
                    React.createElement('b', { style: { fontSize: '0.92rem' } }, t.feedback.rating + ' / 5 ★'),
                    React.createElement('p', { style: { fontSize: '0.86rem', color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 } }, '“' + t.feedback.comment + '”'))))),
            // RIGHT: SLA, assignment, bill, timeline
            React.createElement('div', null,
              React.createElement('div', { className: 'sla-box' },
                React.createElement(window.ProgressRing, { value: t.slaPct, size: 58, stroke: 6, color: 'var(--accent)' }),
                React.createElement('div', { className: 'sla-info' },
                  React.createElement('b', null, t.slaText),
                  React.createElement('span', null, '12-hour SLA target'))),
              React.createElement('div', { className: 'meta-card', style: { marginTop: 16 } },
                React.createElement(SectionH, { icon: 'users' }, 'Assignment'),
                t.emp
                  ? React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 11 } },
                      React.createElement('div', { className: 'avatar av-sm' }, t.emp.split(' ').map((w) => w[0]).join('')),
                      React.createElement('div', null, React.createElement('b', { style: { fontSize: '0.9rem' } }, t.emp), React.createElement('div', { style: { fontSize: '0.76rem', color: 'var(--text-3)' } }, 'Assigned technician')))
                  : React.createElement('p', { style: { fontSize: '0.86rem', color: 'var(--text-3)' } }, 'No technician assigned yet.'),
                isAdmin && React.createElement('div', { className: 'assign-row' },
                  React.createElement('select', { className: '', style: { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 11, padding: '9px 12px', color: 'var(--text)' }, defaultValue: t.emp || '' },
                    React.createElement('option', { value: '' }, '— Assign to —'),
                    ['Zeeshan Ahmad', 'Faisal Khan', 'Imran Wani', 'Sahil Dar'].map((n) => React.createElement('option', { key: n }, n))),
                  React.createElement('button', { className: 'btn btn-primary btn-sm' }, 'Save'))),
              hasBill && React.createElement('div', { className: 'bill', style: { marginTop: 16 } },
                React.createElement(SectionH, { icon: 'receipt' }, 'Bill Breakdown'),
                b.items.map((it, i) => React.createElement('div', { key: i, className: 'bill-row item' },
                  React.createElement('span', null, it[1] + '× ' + it[0]), React.createElement('b', null, inr(it[1] * it[2])))),
                React.createElement('div', { className: 'bill-row' }, React.createElement('span', null, 'Platform fee'), React.createElement('b', null, inr(b.platform))),
                React.createElement('div', { className: 'bill-row' }, React.createElement('span', null, 'Transport (' + b.transportKm + ' km)'), React.createElement('b', null, inr(b.transport))),
                b.discount > 0 && React.createElement('div', { className: 'bill-row discount' }, React.createElement('span', null, 'Discount' + (b.discountLabel ? ' · ' + b.discountLabel : '')), React.createElement('b', null, '-' + inr(b.discount))),
                React.createElement('div', { className: 'bill-row' }, React.createElement('span', null, 'GST (18%)'), React.createElement('b', null, inr(b.gst))),
                React.createElement('div', { className: 'bill-total' }, React.createElement('span', null, 'Total Payable'), React.createElement('b', null, inr(b.total))),
                React.createElement('button', { className: 'btn btn-primary', style: { width: '100%', marginTop: 14 }, onClick: () => { onClose(); window.openBill({ id: t.id, cust: t.cust, company: t.company, bill: b, pay: t.pay }); } },
                  I({ name: 'receipt', size: 16 }), 'View premium bill')),
              React.createElement('div', { className: 'meta-card', style: { marginTop: 16 } },
                React.createElement(SectionH, { icon: 'clock' }, 'Activity'),
                React.createElement('div', { className: 'timeline' },
                  [['Request created', t.created], ['Assigned to ' + (t.emp || 'technician'), '18 min later'], ['Technician en route', '40 min later'], t.status === 'resolved' ? ['Marked resolved', '2h 10m later'] : ['Awaiting update', 'now', true]].filter(Boolean).map((e, i) =>
                    React.createElement('div', { key: i, className: 'tl-item' + (e[2] ? ' muted' : '') },
                      React.createElement('b', null, e[0]), React.createElement('span', null, e[1])))))))),
        ));
  }

  function BillModal({ data, onClose }) {
    const b = data.bill;
    const sub = b.items.reduce((s, it) => s + it[1] * it[2], 0);
    return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target.classList.contains('modal-overlay')) onClose(); } },
      React.createElement('div', { className: 'modal', style: { maxWidth: 600 } },
        React.createElement('div', { className: 'modal-head' },
          React.createElement('h3', null, 'Invoice'),
          React.createElement('div', { style: { marginLeft: 'auto', display: 'flex', gap: 8 } },
            React.createElement('button', { className: 'btn btn-ghost btn-sm' }, I({ name: 'download', size: 15 }), 'PDF'),
            React.createElement('button', { className: 'icon-btn close', onClick: onClose }, I({ name: 'close' })))),
        React.createElement('div', { className: 'modal-body' },
          React.createElement('div', { className: 'bill-sheet-head' },
            React.createElement('div', { className: 'bill-brand' },
              React.createElement('div', { className: 'logo-mark' }, I({ name: 'shield', size: 22 })),
              React.createElement('div', null, React.createElement('b', null, 'NEST'), React.createElement('span', null, 'Networking Experts'))),
            React.createElement('div', { className: 'bill-meta-r' },
              React.createElement('div', { className: 'inv' }, data.id),
              React.createElement('div', { className: 'dt' }, 'Issued ' + (new Date()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })),
              React.createElement('div', { style: { marginTop: 6 } }, data.pay === 'paid' ? React.createElement('span', { className: 'badge resolved' }, 'Paid') : React.createElement('span', { className: 'badge progress' }, 'Unpaid')))),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 20, flexWrap: 'wrap' } },
            React.createElement('div', null, React.createElement('div', { className: 'meta-l' }, 'Billed To'), React.createElement('div', { className: 'meta-v' }, data.cust), data.company && data.company !== '—' ? React.createElement('div', { style: { fontSize: '0.82rem', color: 'var(--text-3)' } }, data.company) : null),
            React.createElement('div', { style: { textAlign: 'right' } }, React.createElement('div', { className: 'meta-l' }, 'Device'), React.createElement('div', { className: 'meta-v mono' }, b.serial))),
          React.createElement('table', { className: 'bill-tbl' },
            React.createElement('thead', null, React.createElement('tr', null,
              React.createElement('th', null, 'Item'), React.createElement('th', { className: 'r' }, 'Qty'), React.createElement('th', { className: 'r' }, 'Rate'), React.createElement('th', { className: 'r' }, 'Amount'))),
            React.createElement('tbody', null, b.items.map((it, i) => React.createElement('tr', { key: i },
              React.createElement('td', null, it[0]), React.createElement('td', { className: 'r' }, it[1]), React.createElement('td', { className: 'r' }, inr(it[2])), React.createElement('td', { className: 'r' }, inr(it[1] * it[2])))))),
          React.createElement('div', { className: 'bill', style: { background: 'transparent', border: 'none', padding: 0 } },
            React.createElement('div', { className: 'bill-row' }, React.createElement('span', null, 'Subtotal'), React.createElement('b', null, inr(sub))),
            React.createElement('div', { className: 'bill-row' }, React.createElement('span', null, 'Platform fee'), React.createElement('b', null, inr(b.platform))),
            React.createElement('div', { className: 'bill-row' }, React.createElement('span', null, 'Transport (' + b.transportKm + ' km)'), React.createElement('b', null, inr(b.transport))),
            b.discount > 0 && React.createElement('div', { className: 'bill-row discount' }, React.createElement('span', null, 'Discount · ' + b.discountLabel), React.createElement('b', null, '-' + inr(b.discount))),
            React.createElement('div', { className: 'bill-row' }, React.createElement('span', null, 'GST (18%)'), React.createElement('b', null, inr(b.gst))),
            React.createElement('div', { className: 'bill-total' }, React.createElement('span', null, 'Total'), React.createElement('b', null, inr(b.total)))),
          React.createElement('p', { style: { fontSize: '0.78rem', color: 'var(--text-3)', textAlign: 'center', marginTop: 18 } }, 'Thank you for choosing NEST · support@networkingexperts.in · +91 88991 33144'))));
  }

  // ---- global host ----
  function ModalHost() {
    const [ticket, setTicket] = useState(null);
    const [bill, setBill] = useState(null);
    useEffect(() => {
      const ot = (e) => setTicket(e.detail);
      const ob = (e) => setBill(e.detail);
      window.addEventListener('nest:ticket', ot);
      window.addEventListener('nest:bill', ob);
      return () => { window.removeEventListener('nest:ticket', ot); window.removeEventListener('nest:bill', ob); };
    }, []);
    return React.createElement(React.Fragment, null,
      ticket && React.createElement(TicketDetail, { ticket: ticket.t, role: ticket.role, onClose: () => setTicket(null) }),
      bill && React.createElement(BillModal, { data: bill, onClose: () => setBill(null) }));
  }

  window.openTicket = (t, role) => window.dispatchEvent(new CustomEvent('nest:ticket', { detail: { t, role } }));
  window.openBill = (data) => window.dispatchEvent(new CustomEvent('nest:bill', { detail: data }));
  // build a bill object from a Bills-screen row
  window.__billFor = (row) => {
    const base = Math.round(row.total / 1.18);
    const gst = row.total - base;
    const transport = 210;
    const platform = 199;
    const sub = base - transport - platform;
    return { items: [[row.device, 1, Math.max(sub, 1)]], platform, transportKm: 4.2, transport, discount: 0, discountLabel: '', gst, total: row.total, device: row.device, serial: 'HK-2CD-' + row.id.slice(-4) };
  };
  window.ModalHost = ModalHost;
})();
