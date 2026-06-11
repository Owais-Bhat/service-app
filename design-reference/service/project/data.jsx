/* Mock data for the NEST Service Portal redesign. window.DATA */
(function () {
  const DATA = {
    user: {
      admin:    { name: 'Owais Bhat',    role: 'admin',    initials: 'OB', email: 'admin@networkingexperts.in' },
      employee: { name: 'Zeeshan Ahmad', role: 'technician', initials: 'ZA', email: 'zeeshan@networkingexperts.in' },
      client:   { name: 'Rohan Mehta',   role: 'client',   initials: 'RM', email: 'rohan@client.in' },
    },

    // ---- Admin dashboard KPIs ----
    adminKpis: [
      { label: 'Open Tickets', value: 42, gauge: 68, suffix: '', color: 'var(--sky)', trend: +12, spark: [22,28,25,31,29,38,42], icon: 'ticket' },
      { label: 'SLA Compliance', value: 94, gauge: 94, suffix: '%', color: 'var(--accent)', trend: +3, spark: [88,90,89,92,91,93,94], icon: 'target' },
      { label: 'Technicians Online', value: 18, gauge: 75, suffix: '/24', color: 'var(--violet)', trend: -2, spark: [20,19,21,18,17,19,18], icon: 'users' },
      { label: 'Collections Today', value: 86, gauge: 86, suffix: 'k', color: 'var(--amber)', trend: +18, spark: [40,52,48,61,70,78,86], icon: 'rupee' },
    ],
    ticketsTrend: { data: [34,41,38,52,47,61,58,72,64,79,71,86], labels: ['','','Mar','','','Apr','','','May','','','Jun'] },
    categoryDonut: [
      { label: 'CCTV', value: 38, color: 'var(--accent)' },
      { label: 'Networking', value: 24, color: 'var(--teal)' },
      { label: 'Biometric', value: 16, color: 'var(--violet)' },
      { label: 'Gate Automation', value: 12, color: 'var(--amber)' },
      { label: 'Other', value: 8, color: 'var(--sky)' },
    ],
    collectionsWeek: { data: [62,71,58,84,79,93,86], labels: ['M','T','W','T','F','S','S'] },

    recentRequests: [
      { id: 'NEST-8842', title: 'CCTV Camera 4 offline at warehouse', client: 'Sharma Traders', cat: 'CCTV', status: 'open', priority: 'high', icon: 'camera', when: '12 min ago' },
      { id: 'NEST-8841', title: 'New 8-channel DVR installation', client: 'Green Valley School', cat: 'CCTV', status: 'assigned', priority: 'medium', icon: 'camera', when: '38 min ago' },
      { id: 'NEST-8838', title: 'Biometric attendance not syncing', client: 'Apex Corp', cat: 'Biometric', status: 'progress', priority: 'high', icon: 'cpu', when: '1 hr ago' },
      { id: 'NEST-8835', title: 'Network switch replacement', client: 'Mehta Residency', cat: 'Networking', status: 'resolved', priority: 'low', icon: 'network', when: '2 hr ago' },
      { id: 'NEST-8833', title: 'Gate motor servicing request', client: 'Sunrise Apartments', cat: 'Gate Automation', status: 'open', priority: 'medium', icon: 'wrench', when: '3 hr ago' },
    ],
    technicians: [
      { name: 'Zeeshan Ahmad', initials: 'ZA', jobs: 28, rating: 4.9, status: 'On a job', pct: 96 },
      { name: 'Faisal Khan', initials: 'FK', jobs: 24, rating: 4.8, status: 'Available', pct: 88 },
      { name: 'Imran Wani', initials: 'IW', jobs: 21, rating: 4.7, status: 'Available', pct: 81 },
      { name: 'Sahil Dar', initials: 'SD', jobs: 17, rating: 4.6, status: 'Break', pct: 72 },
    ],

    // ---- Employee dashboard ----
    empKpis: [
      { label: "Today's Tasks", value: 6, gauge: 50, suffix: '', color: 'var(--sky)', icon: 'ticket' },
      { label: 'Attendance Streak', value: 23, gauge: 92, suffix: 'd', color: 'var(--accent)', icon: 'flame' },
      { label: 'Cash Collected', value: 14, gauge: 64, suffix: 'k', color: 'var(--amber)', icon: 'rupee' },
      { label: 'Training', value: 78, gauge: 78, suffix: '%', color: 'var(--violet)', icon: 'shield' },
    ],
    empTasks: [
      { id: 'NEST-8842', title: 'CCTV Camera 4 offline', client: 'Sharma Traders', addr: 'Lal Chowk, Srinagar', status: 'open', priority: 'high', time: '10:30 AM', icon: 'camera' },
      { id: 'NEST-8829', title: 'VDP unit reconfiguration', client: 'Bhat Villa', addr: 'Rajbagh', status: 'progress', priority: 'medium', time: '12:00 PM', icon: 'cpu' },
      { id: 'NEST-8820', title: 'Router firmware update', client: 'Cafe Aroma', addr: 'Boulevard Rd', status: 'assigned', priority: 'low', time: '02:15 PM', icon: 'network' },
      { id: 'NEST-8814', title: 'Quarterly camera cleaning', client: 'City Mall', addr: 'Sanat Nagar', status: 'assigned', priority: 'low', time: '04:00 PM', icon: 'camera' },
    ],
    empWeek: { data: [4,6,5,7,6,8,6], labels: ['M','T','W','T','F','S','S'] },
    leaderboard: [
      { rank: 1, name: 'Zeeshan Ahmad', initials: 'ZA', pts: 2840, you: true },
      { rank: 2, name: 'Faisal Khan', initials: 'FK', pts: 2610 },
      { rank: 3, name: 'Imran Wani', initials: 'IW', pts: 2390 },
    ],

    // ---- Client dashboard ----
    clientStats: { active: 2, completed: 11, devices: 8 },
    clientTickets: [
      { id: 'NEST-8842', title: 'CCTV Camera 4 offline at warehouse', status: 'progress', priority: 'high', when: 'Today, 10:30 AM', icon: 'camera' },
      { id: 'NEST-8790', title: 'Annual maintenance — 16 cameras', status: 'resolved', priority: 'medium', when: '12 May 2026', icon: 'shield' },
      { id: 'NEST-8742', title: 'Add 2 cameras to parking area', status: 'resolved', priority: 'low', when: '28 Apr 2026', icon: 'camera' },
    ],

    // ---- Training courses (employee view) ----
    courses: [
      { id: 'c1', title: 'CCTV Installation Basics', category: 'CCTV', theme: 't1', icon: 'camera',
        desc: 'Mounting, cabling, DVR/NVR setup and camera alignment for clean installations.',
        lessons: 6, quiz: 5, done: 6, completed: true, due: null },
      { id: 'c2', title: 'Network & PoE Fundamentals', category: 'Networking', theme: 't2', icon: 'network',
        desc: 'IP addressing, switches, PoE budgeting and troubleshooting connectivity issues.',
        lessons: 5, quiz: 4, done: 3, completed: false, due: '20 Jun' },
      { id: 'c3', title: 'Biometric & Access Control', category: 'Biometric', theme: 't3', icon: 'cpu',
        desc: 'Enrollment, attendance sync, door controllers and access-rule configuration.',
        lessons: 4, quiz: 4, done: 1, completed: false, due: '25 Jun' },
      { id: 'c4', title: 'Customer Handling & SLA', category: 'Soft Skills', theme: 't4', icon: 'users',
        desc: 'On-site etiquette, expectation setting, and meeting our 12-hour SLA promise.',
        lessons: 4, quiz: 3, done: 0, completed: false, due: '30 Jun' },
      { id: 'c5', title: 'Gate Automation Systems', category: 'Automation', theme: 't5', icon: 'wrench',
        desc: 'Sliding & swing gate motors, sensors, remotes and safety interlocks.',
        lessons: 5, quiz: 4, done: 0, completed: false, due: null },
      { id: 'c6', title: 'App, Billing & Estimator', category: 'App & Billing', theme: 't1', icon: 'receipt',
        desc: 'Using the NEST app for tasks, collections, estimates and digital bills.',
        lessons: 3, quiz: 3, done: 3, completed: true, due: null },
    ],

    // course player detail (used for any course opened)
    courseDetail: {
      lessons: [
        { id: 'l1', title: 'Tools & safety before you start', type: 'video', done: true,
          text: 'Cover the essential toolkit, ladder safety, and pre-site checklist every technician follows before touching a single cable.' },
        { id: 'l2', title: 'Choosing camera positions', type: 'video', done: true,
          text: 'Field-of-view planning, avoiding backlight, and the 3-metre rule for face capture at entry points.' },
        { id: 'l3', title: 'Running & terminating cable', type: 'image', done: true,
          text: 'Cat6 vs coaxial, crimping RJ45, and keeping runs under 90 metres for clean PoE delivery.' },
        { id: 'l4', title: 'DVR / NVR configuration', type: 'video', done: false,
          text: 'Recording schedules, motion zones, and remote-view setup through the NEST mobile app.' },
        { id: 'l5', title: 'Testing & client handover', type: 'pdf', done: false,
          text: 'The final QA checklist and how to walk the customer through their new system confidently.' },
      ],
      quiz: [
        { q: 'What is the maximum recommended cable run for PoE cameras?', opts: ['45 metres', '90 metres', '150 metres', 'No limit'], correct: 1 },
        { q: 'Where should a camera be mounted to reliably capture faces at an entrance?', opts: ['Directly overhead', 'About 3 metres back at ~2.5m height', 'Behind the door', 'At ground level'], correct: 1 },
        { q: 'Which cable type carries both data and power for IP cameras?', opts: ['Coaxial', 'Cat6 (PoE)', 'Fibre only', 'HDMI'], correct: 1 },
      ],
    },
  };
  window.DATA = DATA;

  // ============================================================
  // SCREEN DATASETS (faithful to the real app's tables & stats)
  // ============================================================
  DATA.screens = {
    // ---- ALL TICKETS / SERVICE REQUESTS ----
    tickets: [
      { id: 'NEST-8842', cust: 'Rohan Mehta', company: 'Sharma Traders', phone: '+91 98765 43210', service: 'CCTV Camera 4 offline', emp: 'Zeeshan Ahmad', status: 'open', pay: null, when: 'Today, 10:30 AM' },
      { id: 'NEST-8841', cust: 'Anita Roy', company: 'Green Valley School', phone: '+91 90021 88110', service: '8-channel DVR installation', emp: 'Faisal Khan', status: 'assigned', pay: 'unpaid', when: 'Today, 09:52 AM' },
      { id: 'NEST-8838', cust: 'Vikas Apex', company: 'Apex Corp', phone: '+91 99887 21340', service: 'Biometric not syncing', emp: 'Imran Wani', status: 'progress', pay: 'unpaid', when: 'Today, 09:10 AM' },
      { id: 'NEST-8835', cust: 'S. Mehta', company: 'Mehta Residency', phone: '+91 88990 14422', service: 'Network switch replacement', emp: 'Sahil Dar', status: 'resolved', pay: 'paid', when: 'Yesterday' },
      { id: 'NEST-8833', cust: 'Sunrise Soc.', company: 'Sunrise Apartments', phone: '+91 90090 55667', service: 'Gate motor servicing', emp: null, status: 'open', pay: null, when: 'Yesterday' },
      { id: 'NEST-8830', cust: 'Cafe Aroma', company: 'Cafe Aroma', phone: '+91 70021 99834', service: 'Router firmware update', emp: 'Zeeshan Ahmad', status: 'resolved', pay: 'paid', when: '2 days ago' },
      { id: 'NEST-8826', cust: 'City Mall', company: 'City Mall Mgmt', phone: '+91 98170 33221', service: 'Quarterly camera cleaning (32)', emp: 'Faisal Khan', status: 'progress', pay: 'unpaid', when: '2 days ago' },
      { id: 'NEST-8821', cust: 'Bhat Villa', company: '—', phone: '+91 96000 71245', service: 'VDP unit reconfiguration', emp: 'Imran Wani', status: 'resolved', pay: 'paid', when: '3 days ago' },
    ],
    ticketTabs: [['all', 'All'], ['open', 'Open'], ['assigned', 'Assigned'], ['progress', 'In Progress'], ['resolved', 'Resolved']],

    // ---- ATTENDANCE ----
    attStats: { today: 18, active: 12, forgotEod: 2, restricted: 1, avg: '7.4h' },
    attendance: [
      { date: 'Today', emp: 'Zeeshan Ahmad', in: '09:02 AM', out: '—', hrs: 'Active', loc: 'Lal Chowk, Srinagar', active: true },
      { date: 'Today', emp: 'Faisal Khan', in: '09:14 AM', out: '—', hrs: 'Active', loc: 'Rajbagh', active: true },
      { date: 'Today', emp: 'Imran Wani', in: '08:48 AM', out: '—', hrs: 'Active', loc: 'Boulevard Rd', active: true },
      { date: 'Today', emp: 'Sahil Dar', in: '09:31 AM', out: '01:10 PM', hrs: '3h 39m', loc: 'Sanat Nagar', active: false },
      { date: 'Yesterday', emp: 'Zeeshan Ahmad', in: '09:05 AM', out: '06:20 PM', hrs: '9h 15m', loc: 'Lal Chowk', active: false },
      { date: 'Yesterday', emp: 'Faisal Khan', in: '09:00 AM', out: '05:48 PM', hrs: '8h 48m', loc: 'Hyderpora', active: false },
    ],

    // ---- USERS ----
    users: [
      { name: 'Owais Bhat', email: 'admin@networkingexperts.in', role: 'admin', status: 'active' },
      { name: 'Zeeshan Ahmad', email: 'zeeshan@networkingexperts.in', role: 'technician', status: 'active' },
      { name: 'Faisal Khan', email: 'faisal@networkingexperts.in', role: 'technician', status: 'active' },
      { name: 'Imran Wani', email: 'imran@networkingexperts.in', role: 'technician', status: 'active' },
      { name: 'Sahil Dar', email: 'sahil@networkingexperts.in', role: 'technician', status: 'restricted' },
      { name: 'Rohan Mehta', email: 'rohan@client.in', role: 'client', status: 'active' },
      { name: 'Anita Roy', email: 'anita@greenvalley.edu', role: 'client', status: 'active' },
    ],

    // ---- CASH COLLECTIONS (per employee) ----
    cashStats: { pending: 42500, submitted: 318000, emps: 4, records: 11 },
    cashByEmp: [
      { name: 'Zeeshan Ahmad', initials: 'ZA', pending: 18500, records: [
        { id: 'NEST-8830', cust: 'Cafe Aroma', amt: 4500, when: '2 days ago' },
        { id: 'NEST-8821', cust: 'Bhat Villa', amt: 8000, when: '3 days ago' },
        { id: 'NEST-8814', cust: 'City Mall', amt: 6000, when: '4 days ago' },
      ] },
      { name: 'Faisal Khan', initials: 'FK', pending: 14000, records: [
        { id: 'NEST-8826', cust: 'City Mall Mgmt', amt: 9000, when: '2 days ago' },
        { id: 'NEST-8809', cust: 'Sharma Traders', amt: 5000, when: '5 days ago' },
      ] },
      { name: 'Imran Wani', initials: 'IW', pending: 10000, records: [
        { id: 'NEST-8821', cust: 'Apex Corp', amt: 10000, when: '3 days ago' },
      ] },
    ],

    // ---- PAYMENTS / BILLS ----
    payStats: { received: 318000, pending: 42500, paidRatio: '11 / 14' },
    billStats: { total: 64, received: 318000, pending: 42500, billed: 360500 },
    bills: [
      { date: '08 Jun', id: 'NEST-8835', cust: 'Mehta Residency', device: 'Cisco SG250 Switch', total: 12500, pay: 'paid' },
      { date: '07 Jun', id: 'NEST-8830', cust: 'Cafe Aroma', device: 'TP-Link Archer Router', total: 4500, pay: 'paid' },
      { date: '07 Jun', id: 'NEST-8826', cust: 'City Mall Mgmt', device: '32× Hikvision Dome', total: 28000, pay: 'unpaid' },
      { date: '06 Jun', id: 'NEST-8821', cust: 'Bhat Villa', device: 'Hikvision VDP', total: 8000, pay: 'paid' },
      { date: '05 Jun', id: 'NEST-8809', cust: 'Sharma Traders', device: '4× Dahua Bullet', total: 16500, pay: 'unpaid' },
    ],

    // ---- DEVICE FOLLOW-UP ----
    devices: [
      { id: 'NEST-8838', cust: 'Apex Corp', service: 'Biometric controller repair', status: 'awaiting_parts', followup: 'Part ordered — ETA 2 days', by: 'Imran Wani' },
      { id: 'NEST-8842', cust: 'Sharma Traders', service: 'IP camera RMA', status: 'in_service', followup: 'Bench testing PoE port', by: 'Zeeshan Ahmad' },
      { id: 'NEST-8799', cust: 'Green Valley School', service: 'NVR power board', status: 'returned', followup: 'Returned & installed', by: 'Faisal Khan' },
    ],
    deviceStatusLabels: { awaiting_parts: 'Awaiting Parts', in_service: 'In Service', returned: 'Returned' },

    // ---- COMPLAINTS ----
    complaintStats: { total: 9, open: 3, resolved: 6 },
    complaints: [
      { filed: 'Today', id: 'NEST-8826', phone: '+91 98170 33221', text: 'Two cameras still showing black screen after the visit.', status: 'open', response: null },
      { filed: 'Yesterday', id: 'NEST-8809', phone: '+91 70021 99834', text: 'Was billed for a part that was not replaced.', status: 'progress', response: 'Reviewing with technician' },
      { filed: '3 days ago', id: 'NEST-8780', phone: '+91 90090 55667', text: 'Technician arrived late without prior notice.', status: 'resolved', response: 'Apologised + 10% off next service' },
    ],

    // ---- FEEDBACK / LEADERBOARD ----
    feedbackStats: { reviews: 142, avg: '4.78', fiveStar: 96, rated: 4, eom: 'Zeeshan A.' },
    feedback: [
      { name: 'Zeeshan Ahmad', initials: 'ZA', avg: 4.9, reviews: 41, five: 36 },
      { name: 'Faisal Khan', initials: 'FK', avg: 4.8, reviews: 33, five: 27 },
      { name: 'Imran Wani', initials: 'IW', avg: 4.7, reviews: 29, five: 22 },
      { name: 'Sahil Dar', initials: 'SD', avg: 4.6, reviews: 21, five: 14 },
    ],

    // ---- NOTICES ----
    notices: [
      { icon: 'sparkle', title: 'New estimator pricing live', body: 'Updated CCTV + networking price list is now in the estimator. Use it for all quotes from today.', time: '2 hours ago' },
      { icon: 'shield', title: 'Mandatory: Biometric course by 25 Jun', body: 'All field technicians must complete the Biometric & Access Control course before month end.', time: 'Yesterday' },
      { icon: 'clock', title: 'Clock-in cutoff is now 9:30 AM', body: 'Clock-ins after 9:30 AM are flagged. Repeated late marks affect your attendance score.', time: '3 days ago' },
    ],

    // ---- LEAVES ----
    leaveStats: { pending: 2, approved: 5, rejected: 1 },
    leaves: [
      { emp: 'Sahil Dar', dates: '12 Jun – 13 Jun', reason: 'Family function', status: 'pending' },
      { emp: 'Imran Wani', dates: '18 Jun', reason: 'Medical appointment', status: 'pending' },
      { emp: 'Faisal Khan', dates: '02 Jun – 03 Jun', reason: 'Personal', status: 'approved' },
      { emp: 'Zeeshan Ahmad', dates: '28 May', reason: 'Sick leave', status: 'approved' },
    ],

    // ---- EOD ----
    eod: [
      { date: 'Today', staff: 'Zeeshan Ahmad', summary: 'Closed NEST-8830 (router). Bench-testing camera for NEST-8842. Collected ₹4,500 cash.' },
      { date: 'Today', staff: 'Faisal Khan', summary: 'On City Mall camera cleaning — 18 of 32 done, resuming tomorrow.' },
      { date: 'Yesterday', staff: 'Imran Wani', summary: 'Apex Corp biometric: ordered controller part, ETA 2 days. Logged follow-up.' },
    ],

    // ---- SALARY ----
    salaryStats: { emps: 12, payroll: 480000, estimated: 372000 },
    salary: [
      { name: 'Zeeshan Ahmad', monthly: 42000, present: 23, leave: 1, payable: '24 / 30', earned: 33600 },
      { name: 'Faisal Khan', monthly: 38000, present: 22, leave: 2, payable: '24 / 30', earned: 30400 },
      { name: 'Imran Wani', monthly: 36000, present: 21, leave: 1, payable: '22 / 30', earned: 26400 },
      { name: 'Sahil Dar', monthly: 34000, present: 19, leave: 0, payable: '19 / 30', earned: 21533 },
    ],

    // ---- EMPLOYEE TASKS ---- (richer than dashboard route)
    empTasksFull: [
      { id: 'NEST-8842', service: 'CCTV Camera 4 offline', cust: 'Sharma Traders', addr: 'Lal Chowk, Srinagar', status: 'open', priority: 'high', time: '10:30 AM' },
      { id: 'NEST-8829', service: 'VDP unit reconfiguration', cust: 'Bhat Villa', addr: 'Rajbagh', status: 'progress', priority: 'medium', time: '12:00 PM' },
      { id: 'NEST-8820', service: 'Router firmware update', cust: 'Cafe Aroma', addr: 'Boulevard Rd', status: 'assigned', priority: 'low', time: '02:15 PM' },
      { id: 'NEST-8814', service: 'Quarterly camera cleaning', cust: 'City Mall', addr: 'Sanat Nagar', status: 'assigned', priority: 'low', time: '04:00 PM' },
      { id: 'NEST-8802', service: 'Biometric enrollment (24 staff)', cust: 'Apex Corp', addr: 'Industrial Estate', status: 'resolved', priority: 'medium', time: 'Done' },
    ],

    // ---- ESTIMATOR pricing ----
    pricing: [
      { cat: 'CCTV', sub: 'Dome Camera 2MP', detail: 'Hikvision DS-2CD', price: 2400 },
      { cat: 'CCTV', sub: 'Bullet Camera 4MP', detail: 'Dahua IPC-HFW', price: 3200 },
      { cat: 'CCTV', sub: 'DVR 8-Channel', detail: 'Hikvision Turbo', price: 6500 },
      { cat: 'Networking', sub: 'PoE Switch 8-port', detail: 'TP-Link TL-SG', price: 4200 },
      { cat: 'Networking', sub: 'Cat6 Cabling', detail: 'per metre', price: 35 },
      { cat: 'Biometric', sub: 'Access Controller', detail: 'ESSL door unit', price: 8900 },
      { cat: 'Automation', sub: 'Sliding Gate Motor', detail: '600kg rail', price: 18500 },
    ],
    // ---- AUTO ASSIGNMENT ----
    autoAssign: {
      enabled: true,
      rules: [
        { label: 'Nearest available technician', desc: 'Route by GPS distance to the customer pin', on: true },
        { label: 'Skill match', desc: 'Prefer technicians trained in the request category', on: true },
        { label: 'Workload balancing', desc: 'Avoid assigning to technicians with 5+ open tasks', on: true },
        { label: 'Respect clock-in status', desc: 'Only assign to technicians currently clocked in', on: false },
      ],
      queue: [
        { id: 'NEST-8842', service: 'CCTV Camera 4 offline', suggested: 'Zeeshan Ahmad', dist: '1.2 km', eta: '14 min' },
        { id: 'NEST-8833', service: 'Gate motor servicing', suggested: 'Faisal Khan', dist: '3.8 km', eta: '22 min' },
      ],
    },

    // ---- CONTACTS ----
    contacts: [
      { name: 'Rohan Mehta', phone: '+91 98765 43210', loc: 'Lal Chowk, Srinagar', service: 'CCTV', date: 'Today' },
      { name: 'Anita Roy', phone: '+91 90021 88110', loc: 'Bemina', service: 'CCTV', date: 'Today' },
      { name: 'Vikas Apex', phone: '+91 99887 21340', loc: 'Industrial Estate', service: 'Biometric', date: 'Yesterday' },
      { name: 'S. Mehta', phone: '+91 88990 14422', loc: 'Rajbagh', service: 'Networking', date: '2 days ago' },
      { name: 'Sunrise Soc.', phone: '+91 90090 55667', loc: 'Hyderpora', service: 'Gate Automation', date: '3 days ago' },
    ],

    // ---- INVENTORY ----
    inventory: [
      { item: 'Hikvision 2MP Dome', qty: 42, unit: 'pcs', min: 10 },
      { item: 'Dahua 4MP Bullet', qty: 8, unit: 'pcs', min: 10 },
      { item: 'Cat6 Cable (305m box)', qty: 14, unit: 'box', min: 5 },
      { item: 'PoE Switch 8-port', qty: 3, unit: 'pcs', min: 5 },
      { item: 'BNC Connectors', qty: 240, unit: 'pcs', min: 50 },
      { item: 'NVR 8-Channel', qty: 6, unit: 'pcs', min: 4 },
    ],

    // ---- LANDING ADS ----
    adStats: { total: 5, active: 4, hidden: 1 },
    ads: [
      { pos: 1, kind: 'image', caption: 'Smart CCTV from ₹2,400 — installed in 24 hrs', dur: '6.0s', active: true, theme: 't1' },
      { pos: 2, kind: 'video', caption: 'See how NEST secures a full warehouse', dur: '12.0s', active: true, theme: 't2' },
      { pos: 3, kind: 'image', caption: 'Biometric attendance for your office', dur: '6.0s', active: true, theme: 't3' },
      { pos: 4, kind: 'image', caption: 'Gate automation — monsoon offer', dur: '5.0s', active: true, theme: 't4' },
      { pos: 5, kind: 'image', caption: 'Old summer sale (expired)', dur: '6.0s', active: false, theme: 't5' },
    ],
    popupAds: [
      { title: 'Monsoon AMC Offer', kind: 'image', target: 'All clients', active: true, theme: 't2' },
      { title: 'Refer & earn ₹500', kind: 'image', target: 'Clients', active: true, theme: 't1' },
      { title: 'New: Gate automation', kind: 'video', target: 'Guests', active: false, theme: 't4' },
    ],

    // ---- DEVICE TYPES & COMPANIES ----
    deviceTypes: [
      { name: 'Video Door Phone', desc: 'VDP / intercom units' },
      { name: 'IP Dome Camera', desc: '2MP–8MP indoor domes' },
      { name: 'Bullet Camera', desc: 'Outdoor weatherproof' },
      { name: 'Biometric Reader', desc: 'Fingerprint + RFID' },
      { name: 'NVR / DVR', desc: 'Recording units' },
      { name: 'Gate Motor', desc: 'Sliding & swing' },
    ],
    companies: [
      { name: 'Sharma Traders' }, { name: 'Green Valley School' }, { name: 'Apex Corp' },
      { name: 'Mehta Residency' }, { name: 'Sunrise Apartments' }, { name: 'City Mall Mgmt' },
    ],
    reportedDevices: [
      { cust: 'Sharma Traders', company: 'Sharma Traders', type: 'IP Dome Camera', serial: 'HK-2CD-88421', ticket: 'NEST-8842', date: 'Today' },
      { cust: 'Apex Corp', company: 'Apex Corp', type: 'Biometric Reader', serial: 'ESSL-X990-1142', ticket: 'NEST-8838', date: 'Today' },
      { cust: 'Bhat Villa', company: '—', type: 'Video Door Phone', serial: 'VDP-7741', ticket: 'NEST-8821', date: '3 days ago' },
    ],

    // ---- DISCOUNTS ----
    discountStats: { active: 4, redeemed: 38, savings: 64500 },
    discounts: [
      { code: 'MONSOON10', label: 'Monsoon 10% off', type: '10%', scope: 'All services', uses: 22, active: true },
      { code: 'LOYAL5', label: 'Loyalty 5%', type: '5%', scope: 'Repeat clients', uses: 14, active: true },
      { code: 'AMC500', label: '₹500 off AMC', type: '₹500', scope: 'Annual maintenance', uses: 2, active: true },
      { code: 'REFER500', label: 'Referral ₹500', type: '₹500', scope: 'Referrals', uses: 0, active: true },
      { code: 'SUMMER15', label: 'Summer 15% (ended)', type: '15%', scope: 'All services', uses: 0, active: false },
    ],

    // ---- NOTIFICATIONS ----
    notifications: [
      { icon: 'ticket', title: 'New service request — NEST-8842', body: 'Sharma Traders reported a CCTV camera offline.', time: '12 min ago', unread: true, tone: 'sky' },
      { icon: 'rupee', title: 'Payment received — ₹12,500', body: 'Mehta Residency paid invoice for NEST-8835.', time: '1 hr ago', unread: true, tone: 'accent' },
      { icon: 'shield', title: 'Complaint filed against NEST-8826', body: 'City Mall — two cameras still showing black screen.', time: '2 hrs ago', unread: true, tone: 'rose' },
      { icon: 'clock', title: 'EOD missing — Sahil Dar', body: 'No end-of-day report submitted yesterday.', time: '5 hrs ago', unread: false, tone: 'amber' },
      { icon: 'award', title: 'New 5★ review for Zeeshan', body: '“Quick, polite and fixed it first time.”', time: 'Yesterday', unread: false, tone: 'violet' },
    ],

    // ---- EMPLOYEE TUTORIALS (admin manage) ----
    adminTutorials: [
      { title: 'Crimping RJ45 the right way', cat: 'Networking', views: 142, active: true },
      { title: 'Aligning a dome camera FOV', cat: 'CCTV', views: 208, active: true },
      { title: 'Biometric enrollment walkthrough', cat: 'Biometric', views: 96, active: true },
      { title: 'Using the NEST estimator', cat: 'App', views: 174, active: false },
    ],

    // finance charts
    finance: {
      stats: { received: 318000, billed: 360500, pending: 42500, gst: 54720 },
      trend: [180, 210, 195, 240, 228, 265, 252, 290, 274, 312, 298, 360],
      trendLabels: ['', '', 'Mar', '', '', 'Apr', '', '', 'May', '', '', 'Jun'],
      byCategory: [
        { label: 'CCTV', value: 168, color: 'var(--accent)' },
        { label: 'Networking', value: 92, color: 'var(--teal)' },
        { label: 'Biometric', value: 54, color: 'var(--violet)' },
        { label: 'Automation', value: 46, color: 'var(--amber)' },
      ],
      aging: { data: [62, 24, 11, 3], labels: ['0-30d', '31-60d', '61-90d', '90d+'] },
      byTech: [
        { name: 'Zeeshan Ahmad', jobs: 28, billed: 142000, received: 138000 },
        { name: 'Faisal Khan', jobs: 24, billed: 118000, received: 102000 },
        { name: 'Imran Wani', jobs: 21, billed: 96000, received: 78000 },
      ],
    },
  };
})();
