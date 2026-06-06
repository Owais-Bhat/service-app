const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const mysql = require('mysql2/promise');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const {
    sendFast2SmsOtp,
    verifyFast2SmsOtp,
    resendFast2SmsOtp,
    normalizeIndianMobile,
    sendDltSms,
} = require('./fast2sms.cjs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Fail fast if required env is missing — better than 500s at request time.
const REQUIRED_ENV = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length) {
    console.error(`❌ Missing required env vars: ${missingEnv.join(', ')}`);
    console.error('   Set them in server/.env before starting.');
    process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 characters.');
    process.exit(1);
}

// Bills folder — stores generated invoice PDFs that we serve back as
// public URLs so they can be sent via wa.me/<phone>?text=<bill-url>.
const BILLS_DIR = path.join(__dirname, '..', 'bills');
if (!fs.existsSync(BILLS_DIR)) fs.mkdirSync(BILLS_DIR, { recursive: true });

const multer = require('multer');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Web Push (browser/OS notifications) — OPTIONAL. A missing module or bad VAPID
// config must never take the whole server down, so load it defensively.
let webpush = null;
try {
    webpush = require('web-push');
} catch {
    console.warn('[push] "web-push" not installed — push disabled. Run `npm install` in /server to enable it.');
}
let PUSH_ENABLED = !!(webpush && process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE);
if (PUSH_ENABLED) {
    try {
        webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
        console.log('[push] Web Push enabled');
    } catch (e) {
        console.error('[push] VAPID config error — push disabled:', e.message);
        PUSH_ENABLED = false;
    }
} else if (webpush) {
    console.log('[push] Web Push disabled (set VAPID_PUBLIC / VAPID_PRIVATE in .env)');
}

// Server-side invoice PDF generation. Loaded defensively so a missing module
// never crashes the server — the bill endpoint just falls back to client-side.
let PDFDocument = null;
try {
    PDFDocument = require('pdfkit');
    console.log('[bills] Server-side PDF generation enabled (pdfkit)');
} catch {
    console.warn('[bills] "pdfkit" not installed — server-side PDF disabled. Run `npm install` in /server to enable it.');
}

// Unicode font for the invoice so the ₹ glyph renders (built-in PDF fonts can't).
// Falls back to Helvetica + "Rs." if the TTFs aren't present.
const INVOICE_FONT_REG = path.join(__dirname, 'fonts', 'NotoSans-Regular.ttf');
const INVOICE_FONT_BOLD = path.join(__dirname, 'fonts', 'NotoSans-Bold.ttf');
const INVOICE_UNICODE_FONTS = !!(PDFDocument && fs.existsSync(INVOICE_FONT_REG) && fs.existsSync(INVOICE_FONT_BOLD));
if (PDFDocument) console.log(`[bills] Invoice currency glyph: ${INVOICE_UNICODE_FONTS ? '₹ (Noto Sans)' : 'Rs. (fallback — NotoSans TTFs missing in /server/fonts)'}`);

const app = express();

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
});

// Restrict CORS to known origins. CORS_ORIGINS is a comma-separated list.
// In dev we default to localhost; in prod we include the live domain and
// Hostinger preview domain used before the custom domain fully points here.
const corsOrigins = (process.env.CORS_ORIGINS || [
    'https://services.networkingexperts.in',
    'https://skyblue-goldfish-328951.hostingersite.com',
    'http://localhost:5173',
    'http://localhost:5000',
].join(','))
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

function isAllowedCorsOrigin(origin) {
    if (!origin) return true;
    const cleanOrigin = String(origin).replace(/\/+$/, '');
    if (corsOrigins.includes(cleanOrigin)) return true;
    try {
        const { hostname } = new URL(cleanOrigin);
        return hostname === 'networkingexperts.in'
            || hostname.endsWith('.networkingexperts.in')
            || hostname === 'skyblue-goldfish-328951.hostingersite.com';
    } catch {
        return false;
    }
}

app.use(cors({
    origin(origin, cb) {
        // 1. Allow same-origin (no Origin header, e.g. server-side or same-domain fetch)
        // 2. Allow listed origins
        if (isAllowedCorsOrigin(origin)) {
            return cb(null, true);
        }
        console.warn(`⚠️ CORS blocked request from origin: ${origin}`);
        return cb(null, false);
    },
    credentials: true, // Changed to true to support session/auth if needed later
}));

// Razorpay webhook needs the raw body for signature validation.
// We register that route's parser FIRST, then JSON for everything else with a small limit.
app.use('/api/webhook/razorpay', express.raw({ type: 'application/json', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
// Bill uploads can be large (base64 PDFs) — give them their own dedicated route limit.
const BILL_UPLOAD_LIMIT = '20mb';

let razorpay = null;
try {
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== 'rzp_test_YOUR_KEY_ID') {
        razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
        console.log('✅ Razorpay initialized successfully!');
    } else {
        console.warn('⚠️ Razorpay keys missing or using placeholders. Payment link generation will be disabled.');
    }
} catch (err) {
    console.error('❌ Razorpay initialization failed:', err.message);
}

function feedbackPageHtml(initialToken = '') {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Secure Feedback - Networking Experts</title>
  <style>
    :root { color-scheme: light; --green:#10b981; --dark:#064e3b; --text:#0f172a; --soft:#64748b; --line:#d7f3e8; --bg:#f2fbf7; --card:#ffffff; --danger:#ef4444; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; font-family:Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:radial-gradient(circle at top right, #d5faeb 0, transparent 35%), var(--bg); color:var(--text); }
    .page { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:28px 16px; }
    .card { width:min(100%, 620px); background:var(--card); border:1px solid var(--line); border-radius:24px; box-shadow:0 24px 70px rgba(15, 23, 42, .10); overflow:hidden; }
    .head { padding:28px; border-bottom:1px solid var(--line); background:linear-gradient(135deg, rgba(16,185,129,.12), rgba(255,255,255,.7)); }
    .brand { font-weight:900; letter-spacing:.12em; color:var(--dark); font-size:1.05rem; margin-bottom:16px; }
    .pill { display:inline-flex; align-items:center; gap:8px; padding:7px 12px; border-radius:999px; background:#e9fbf4; color:var(--dark); font-size:.75rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; margin-bottom:12px; }
    h1 { margin:0; font-size:1.65rem; line-height:1.15; color:var(--dark); }
    .sub { margin:8px 0 0; color:var(--soft); line-height:1.5; }
    .body { padding:28px; }
    .center { text-align:center; padding:30px 8px; }
    .spinner { width:34px; height:34px; border-radius:50%; border:4px solid #d1fae5; border-top-color:var(--green); display:inline-block; animation:spin .8s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:22px; }
    .info { padding:14px; border:1px solid var(--line); border-radius:14px; background:#f8fffc; }
    .wide { grid-column:1 / -1; }
    .label { font-size:.72rem; color:var(--soft); text-transform:uppercase; letter-spacing:.06em; font-weight:800; }
    .value { margin-top:5px; font-weight:850; color:var(--text); word-break:break-word; }
    .stars { display:flex; gap:8px; margin:8px 0 6px; }
    .star { width:42px; height:42px; border:0; background:#ecfdf5; color:#94a3b8; border-radius:12px; cursor:pointer; font-size:25px; line-height:1; transition:.15s ease; }
    .star.on { color:#f59e0b; background:#fff7ed; transform:translateY(-1px); }
    textarea { width:100%; min-height:100px; resize:vertical; border:1px solid var(--line); border-radius:14px; padding:14px; font:inherit; color:var(--text); outline:none; background:#fbfffd; }
    textarea:focus { border-color:var(--green); box-shadow:0 0 0 4px rgba(16,185,129,.12); }
    .btn { width:100%; height:48px; border:0; border-radius:14px; background:linear-gradient(135deg, var(--green), #059669); color:white; font-weight:900; font:inherit; cursor:pointer; box-shadow:0 14px 34px rgba(16,185,129,.24); }
    .btn:disabled { opacity:.55; cursor:not-allowed; box-shadow:none; }
    .ghost { margin-top:12px; background:#f8fffc; color:var(--dark); border:1px solid var(--line); box-shadow:none; }
    .error { color:var(--danger); font-weight:800; }
    .done { width:64px; height:64px; border-radius:20px; display:flex; align-items:center; justify-content:center; background:#ecfdf5; color:#f59e0b; margin:0 auto 16px; font-size:34px; }
    @media (max-width:560px) { .head,.body{padding:22px;} .grid{grid-template-columns:1fr;} h1{font-size:1.4rem;} .star{width:38px;height:38px;} }
  </style>
</head>
<body>
  <main class="page">
    <section class="card">
      <div class="head">
        <div class="brand">NEST</div>
        <div class="pill">Secure Feedback</div>
        <h1>Rate your service experience</h1>
        <p class="sub">This page opens only from your secure payment feedback link.</p>
      </div>
      <div class="body" id="app">
        <div class="center"><span class="spinner"></span><p class="sub">Opening feedback...</p></div>
      </div>
    </section>
  </main>
  <script>window.__FEEDBACK_TOKEN__ = ${JSON.stringify(initialToken)};</script>
  <script>
    (function () {
      var app = document.getElementById('app');
      var params = new URLSearchParams(window.location.search);
      var token = (window.__FEEDBACK_TOKEN__ || params.get('token') || params.get('feedback') || params.get('f') || '').trim();
      var inquiry = null;
      var rating = 0;
      var techRating = 0;
      function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
          return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
        });
      }
      function setLoading(text) {
        app.innerHTML = '<div class="center"><span class="spinner"></span><p class="sub">' + esc(text || 'Loading...') + '</p></div>';
      }
      function setError(text) {
        app.innerHTML = '<div class="center"><p class="error">' + esc(text || 'Feedback link unavailable') + '</p><button class="btn ghost" id="home">Open service portal</button></div>';
        document.getElementById('home').onclick = function () { window.location.href = '/'; };
      }
      function paintStars(rowId, value) {
        var row = document.getElementById(rowId);
        if (!row) return;
        Array.prototype.forEach.call(row.querySelectorAll('.star'), function (btn) {
          btn.classList.toggle('on', Number(btn.dataset.value) <= value);
        });
      }
      function bindStars(rowId, onPick) {
        var row = document.getElementById(rowId);
        if (!row) return;
        Array.prototype.forEach.call(row.querySelectorAll('.star'), function (btn) {
          btn.onclick = function () {
            var value = Number(btn.dataset.value);
            onPick(value);
            paintStars(rowId, value);
          };
        });
      }
      function renderDone(row) {
        app.innerHTML = '<div class="center"><div class="done">★</div><h2 style="margin:0 0 8px;color:var(--dark);">Thank you for your feedback</h2><p class="sub">You rated us <b>' + esc(row.feedback_rating || rating) + '/5</b>.</p><button class="btn ghost" id="home">Open service portal</button></div>';
        document.getElementById('home').onclick = function () { window.location.href = '/'; };
      }
      function renderForm(row) {
        inquiry = row;
        if (row.feedback_rating != null) return renderDone(row);
        app.innerHTML =
          '<div class="grid">' +
            '<div class="info"><div class="label">Ticket</div><div class="value">' + esc(row.ticket_no || '-') + '</div></div>' +
            '<div class="info"><div class="label">Status</div><div class="value">' + esc(row.status || '-') + '</div></div>' +
            '<div class="info wide"><div class="label">Service</div><div class="value">' + esc(row.service_item || '-') + '</div><div class="sub">' + esc(row.full_name || 'Customer') + '</div></div>' +
          '</div>' +
          '<div class="label">Overall experience</div>' +
          '<div class="stars" id="overall">' + [1,2,3,4,5].map(function (n) { return '<button class="star" type="button" data-value="' + n + '">★</button>'; }).join('') + '</div>' +
          '<div id="ratingText" class="sub" style="min-height:22px;margin-bottom:18px;"></div>' +
          '<div class="label">Technician rating</div>' +
          '<div class="stars" id="tech">' + [1,2,3,4,5].map(function (n) { return '<button class="star" type="button" data-value="' + n + '">★</button>'; }).join('') + '</div>' +
          '<div style="height:14px"></div>' +
          '<textarea id="comment" placeholder="Tell us about your experience..."></textarea>' +
          '<div style="height:14px"></div>' +
          '<button class="btn" id="submit" disabled>Submit Feedback</button>';
        var labels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];
        bindStars('overall', function (value) {
          rating = value;
          document.getElementById('ratingText').textContent = labels[value] || '';
          document.getElementById('submit').disabled = !rating;
        });
        bindStars('tech', function (value) { techRating = value; });
        document.getElementById('submit').onclick = submit;
      }
      async function submit() {
        if (!rating) return;
        var btn = document.getElementById('submit');
        btn.disabled = true;
        btn.textContent = 'Submitting...';
        var comment = document.getElementById('comment').value.trim();
        var fullComment = [comment, techRating ? 'Technician: ' + techRating + '/5' : ''].filter(Boolean).join(' | ');
        try {
          var res = await fetch('/api/feedback/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token, rating: rating, employee_rating: techRating || null, comment: fullComment || null })
          });
          var data = await res.json().catch(function () { return {}; });
          if (!res.ok) throw new Error(data.error || 'Could not submit feedback');
          renderDone(data.inquiry || Object.assign({}, inquiry, { feedback_rating: rating, feedback_comment: fullComment }));
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Submit Feedback';
          alert(err.message || 'Could not submit feedback');
        }
      }
      async function init() {
        if (!token) return setError('Feedback token is missing.');
        setLoading('Verifying secure link...');
        try {
          var res = await fetch('/api/feedback/resolve?token=' + encodeURIComponent(token), { cache: 'no-store' });
          var data = await res.json().catch(function () { return {}; });
          if (!res.ok) throw new Error(data.error || 'This feedback link is invalid or expired.');
          renderForm(data.inquiry || {});
        } catch (err) {
          setError(err.message || 'Could not open feedback link.');
        }
      }
      init();
    })();
  </script>
</body>
</html>`;
}

app.get(['/feedback.html', '/feedback'], (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(feedbackPageHtml());
});

app.get('/f/:token', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(feedbackPageHtml(String(req.params.token || '')));
});

// Serve static files from the frontend build directory
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
        if (path.basename(filePath) === 'index.html') {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    },
}));

// Serve generated bill PDFs publicly so wa.me links can point clients here.
app.use('/bills', express.static(BILLS_DIR, {
    setHeaders: (res) => {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
    },
}));

// Serve uploaded files. Prefer the copy stored in MySQL (survives rebuilds and
// redeploys), and fall back to any legacy file still on disk.
app.get('/uploads/:file', async (req, res, next) => {
    let connection;
    try {
        connection = await getConn();
        const [rows] = await connection.query(
            'SELECT mime, data FROM uploaded_files WHERE id = ? LIMIT 1',
            [req.params.file]
        );
        if (rows.length && rows[0].data) {
            res.setHeader('Content-Type', rows[0].mime || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return res.end(rows[0].data);
        }
    } catch (err) {
        console.error('[uploads] DB serve error:', err.message);
    } finally {
        if (connection) connection.release();
    }
    next(); // legacy on-disk file
});
app.use('/uploads', express.static(UPLOADS_DIR));

// Keep uploads in memory then persist the bytes to MySQL — the on-disk uploads/
// folder is ephemeral (wiped on rebuild / not shipped on deploy), which made
// previously uploaded images break. 10 MB cap keeps inserts within MySQL limits.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
    if (!['admin', 'employee'].includes(req.user.role)) return res.sendStatus(403);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = path.extname(req.file.originalname || '') || '';
    const id = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
    let connection;
    try {
        connection = await getConn();
        await connection.query(
            'INSERT INTO uploaded_files (id, mime, data) VALUES (?, ?, ?)',
            [id, req.file.mimetype || 'application/octet-stream', req.file.buffer]
        );
        res.json({ url: `/uploads/${id}` });
    } catch (err) {
        console.error('[upload] DB store error:', err);
        res.status(500).json({ error: 'Could not store file' });
    } finally {
        if (connection) connection.release();
    }
});

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
};

// Shared connection pool — one TCP/auth handshake amortised across many requests.
// `getConn()` returns a leased connection; callers must `release()` it.
const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
    queueLimit: 0,
});
async function getConn() { return pool.getConnection(); }

async function canAccessInquiry(connection, user, inquiryId) {
    if (user?.role === 'admin') return true;
    if (user?.role !== 'employee') return false;
    const [rows] = await connection.execute(
        'SELECT assigned_employee_id FROM inquiries WHERE id = ? LIMIT 1',
        [inquiryId]
    );
    return rows.length > 0 && String(rows[0].assigned_employee_id || '') === String(user.id || '');
}

const DEFAULT_AUTO_CLOCK_OUT_TIME = process.env.AUTO_CLOCK_OUT_TIME || '18:00';
const appSettings = {
    autoClockOutTime: DEFAULT_AUTO_CLOCK_OUT_TIME,
    autoAssignmentEnabled: true,
};
const REG_KEY_SETTINGS = {
    admin: 'admin_reg_key',
    employee: 'staff_reg_key',
};

function localDateKey(date = new Date()) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function dbDateKey(value) {
    if (!value) return localDateKey();
    if (value instanceof Date) return localDateKey(value);
    return String(value).slice(0, 10);
}

function sqlDateTime(value) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    const hh = String(value.getHours()).padStart(2, '0');
    const mi = String(value.getMinutes()).padStart(2, '0');
    const ss = String(value.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function parseAutoClockOutTime(value = appSettings.autoClockOutTime || DEFAULT_AUTO_CLOCK_OUT_TIME) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
    if (!match) return { hour: 18, minute: 0, label: '18:00' };
    const hour = Math.min(23, Math.max(0, Number(match[1])));
    const minute = Math.min(59, Math.max(0, Number(match[2])));
    return {
        hour,
        minute,
        label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
}

function isValidClockOutTime(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return false;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

async function loadAppSettings(connection) {
    const [rows] = await connection.execute(
        'SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?, ?)',
        ['auto_clock_out_time', 'auto_assignment_enabled']
    );
    const autoClockOut = rows.find(row => row.setting_key === 'auto_clock_out_time')?.setting_value;
    appSettings.autoClockOutTime = parseAutoClockOutTime(autoClockOut || DEFAULT_AUTO_CLOCK_OUT_TIME).label;

    const autoAssign = rows.find(row => row.setting_key === 'auto_assignment_enabled')?.setting_value;
    if (autoAssign !== undefined) {
        appSettings.autoAssignmentEnabled = autoAssign === '1' || autoAssign === 'true';
    }
}

async function saveAppSetting(key, value) {
    const connection = await getConn();
    try {
        await connection.execute(
            `INSERT INTO app_settings (setting_key, setting_value)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
            [key, value]
        );
    } finally {
        connection.release();
    }
}

function generateRegistrationKey(role) {
    const prefix = role === 'admin' ? 'ADM' : 'EMP';
    const token = crypto.randomBytes(18).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    return `${prefix}-${token}`;
}

async function getRegistrationKeys(connection) {
    const [rows] = await connection.execute(
        'SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?, ?)',
        [REG_KEY_SETTINGS.admin, REG_KEY_SETTINGS.employee]
    );
    const byKey = new Map(rows.map(row => [row.setting_key, row.setting_value]));
    return {
        admin: byKey.get(REG_KEY_SETTINGS.admin) || process.env.ADMIN_REG_KEY || '',
        employee: byKey.get(REG_KEY_SETTINGS.employee) || process.env.STAFF_REG_KEY || '',
    };
}

function autoClockOutCutoff(now = new Date()) {
    const { hour, minute } = parseAutoClockOutTime();
    const cutoff = new Date(now);
    cutoff.setHours(hour, minute, 0, 0);
    return cutoff;
}

function isAfterAutoClockOutCutoff(now = new Date()) {
    return now >= autoClockOutCutoff(now);
}

function clockOutValueForAuto(row, now = new Date()) {
    const { hour, minute } = parseAutoClockOutTime();
    const rowDate = dbDateKey(row?.date);
    const cutoff = new Date(`${rowDate}T00:00:00`);
    cutoff.setHours(hour, minute, 0, 0);

    const clockIn = new Date(row?.clock_in || cutoff);
    if (rowDate === localDateKey(now) && clockIn > cutoff) return sqlDateTime(now);
    if (clockIn > cutoff) return sqlDateTime(clockIn);
    return sqlDateTime(cutoff);
}

async function runAutoClockOut() {
    const now = new Date();
    const cutoff = autoClockOutCutoff(now);
    if (now < cutoff) return;

    const today = localDateKey(now);
    let connection;
    try {
        connection = await getConn();
        const [openRows] = await connection.execute(
            'SELECT * FROM attendance WHERE date <= ? AND clock_in IS NOT NULL AND clock_out IS NULL',
            [today]
        );
        if (!openRows.length) return;

        for (const row of openRows) {
            const clockOut = clockOutValueForAuto(row, now);
            await connection.execute(
                'UPDATE attendance SET clock_out = ? WHERE id = ? AND clock_out IS NULL',
                [clockOut, row.id]
            );
            broadcastChange('UPDATE', 'attendance', { ...row, clock_out: clockOut });
        }
        console.log(`[attendance] Auto clocked out ${openRows.length} employee(s) at ${parseAutoClockOutTime().label}`);
    } catch (err) {
        console.error('[attendance] auto clock-out failed:', err.message);
    } finally {
        if (connection) {
            try { connection.release(); } catch {}
        }
    }
}

function startAutoClockOutJob() {
    const { label } = parseAutoClockOutTime();
    console.log(`[attendance] Auto clock-out scheduled for ${label} server time`);
    runAutoClockOut();
    setInterval(runAutoClockOut, 60_000).unref();
}

// Once a day, nudge every employee who still has device(s) in service to update
// their follow-up status. Reaches online employees instantly and is buffered for
// the audience so it is delivered when they next open the app that day.
let _lastDeviceReminderDate = null;
async function runDeviceFollowupReminders() {
    const now = new Date();
    if (now.getHours() < 10) return; // fire from 10:00 server time onward
    const today = localDateKey(now);
    if (_lastDeviceReminderDate === today) return;

    let connection;
    try {
        connection = await getConn();
        const [rows] = await connection.execute(
            `SELECT i.assigned_employee_id AS emp, COUNT(*) AS cnt
               FROM inquiries i
              WHERE i.device_service_enabled = 1
                AND i.assigned_employee_id IS NOT NULL
                AND (i.follow_up_status IS NULL OR i.follow_up_status <> 'returned')
              GROUP BY i.assigned_employee_id`
        );
        _lastDeviceReminderDate = today;
        for (const r of rows) {
            recordNotification({
                subject: 'device_followup_reminder',
                audience: { userId: r.emp },
                title: 'Device follow-up reminder',
                body: `You have ${r.cnt} device(s) in service. Please update their status today.`,
            });
        }
        if (rows.length) console.log(`[device] Sent follow-up reminders to ${rows.length} employee(s)`);
    } catch (err) {
        console.error('[device] follow-up reminder failed:', err.message);
    } finally {
        if (connection) { try { connection.release(); } catch {} }
    }
}

function startDeviceReminderJob() {
    console.log('[device] Daily follow-up reminders scheduled for 10:00 server time');
    runDeviceFollowupReminders();
    setInterval(runDeviceFollowupReminders, 60_000).unref();
}

// Working-hours SLA deadline (10:00–18:00, Sundays skipped) — mirrors the client.
function slaDeadline(createdAt, slaHours = 12) {
    let date = new Date(createdAt);
    let remaining = slaHours;
    const startHour = 10, endHour = 18;
    let guard = 0;
    while (remaining > 0 && guard++ < 1000) {
        const h = date.getHours();
        if (date.getDay() === 0) { date.setDate(date.getDate() + 1); date.setHours(startHour, 0, 0, 0); continue; }
        if (h < startHour) { date.setHours(startHour, 0, 0, 0); continue; }
        if (h >= endHour) { date.setDate(date.getDate() + 1); date.setHours(startHour, 0, 0, 0); continue; }
        const endOfDay = new Date(date); endOfDay.setHours(endHour, 0, 0, 0);
        const left = (endOfDay - date) / 3600000;
        if (remaining <= left) { date.setMilliseconds(date.getMilliseconds() + remaining * 3600000); remaining = 0; }
        else { remaining -= left; date.setDate(date.getDate() + 1); date.setHours(startHour, 0, 0, 0); }
    }
    return date;
}

// Alert admin + the assigned employee when an open ticket is within 2h of (or past)
// its SLA deadline. One alert per ticket (sla_breach_notified guard).
async function runSlaChecks() {
    let connection;
    try {
        connection = await getConn();
        const [rows] = await connection.query(
            `SELECT id, ticket_no, full_name, service_item, created_at, assigned_employee_id
               FROM inquiries
              WHERE COALESCE(sla_breach_notified,0) = 0
                AND status NOT IN ('resolved','closed','case_closed','issue_not_resolved')
                AND created_at IS NOT NULL`
        );
        const now = Date.now();
        for (const r of rows) {
            const deadline = slaDeadline(r.created_at).getTime();
            if (now < deadline - 2 * 3600000) continue; // not within the 2h warning window yet
            const overdue = now >= deadline;
            await connection.query('UPDATE inquiries SET sla_breach_notified = 1 WHERE id = ?', [r.id]);
            const label = overdue ? 'SLA breached' : 'SLA due soon';
            recordNotification({
                subject: 'sla_breach',
                title: `⏰ ${label}`,
                body: `Ticket ${r.ticket_no || ''} (${r.full_name || 'client'} — ${r.service_item || 'service'}) ${overdue ? 'has missed' : 'is about to miss'} its SLA deadline.`,
                audience: { role: 'admin' },
                data: { inquiry_id: r.id, ticket_no: r.ticket_no, overdue },
            }).catch(() => {});
            if (r.assigned_employee_id) {
                recordNotification({
                    subject: 'sla_breach',
                    title: `⏰ ${label}`,
                    body: `Your ticket ${r.ticket_no || ''} ${overdue ? 'has passed' : 'is about to pass'} its deadline — please act now.`,
                    audience: { userId: r.assigned_employee_id },
                    data: { inquiry_id: r.id, ticket_no: r.ticket_no, overdue },
                }).catch(() => {});
            }
        }
        if (rows.length) console.log(`[sla] checked ${rows.length} open ticket(s)`);
    } catch (err) {
        console.error('[sla] check failed:', err.message);
    } finally {
        if (connection) connection.release();
    }
}

function startSlaJob() {
    console.log('[sla] SLA breach checks scheduled every 15 minutes');
    runSlaChecks();
    setInterval(runSlaChecks, 15 * 60_000).unref();
}

// Once per month, push an AI (or plain) finance summary for the month that just
// ended to the admin notification feed. Dedup via app_settings.
async function runMonthlyFinanceSummary() {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    const lastDay = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
    const from = `${prevKey}-01`, to = `${prevKey}-${String(lastDay).padStart(2, '0')}`;
    let connection;
    try {
        connection = await getConn();
        const [setRows] = await connection.query("SELECT setting_value FROM app_settings WHERE setting_key = 'last_finance_summary_month'");
        if (setRows[0]?.setting_value === prevKey) { connection.release(); return; }
        const summary = await computeFinanceSummary(connection, from, to);
        connection.release(); connection = null;

        let text = '';
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (apiKey) {
            try {
                const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: process.env.OPENROUTER_MODEL || 'openrouter/free',
                        messages: [
                            { role: 'system', content: 'You are a finance analyst for an Indian field-service business. Currency INR (₹). Only use the JSON numbers. Write a short monthly summary: headline numbers, 2 insights, 1-2 actions. Plain text, under 120 words.' },
                            { role: 'user', content: `Month ${prevKey} finance JSON:\n${JSON.stringify(summary)}` },
                        ],
                        temperature: 0.3,
                    }),
                });
                const aiData = await aiRes.json();
                if (aiRes.ok) text = aiData.choices?.[0]?.message?.content || '';
            } catch (e) { console.error('[finance] monthly AI failed:', e.message); }
        }
        if (!text) {
            const t = summary.totals;
            text = `Billed ₹${Math.round(t.billed)}, Received ₹${Math.round(t.received)}, Pending ₹${Math.round(t.pending)} across ${t.billsCount} bills. GST ₹${Math.round(t.gst)}.`;
        }
        await recordNotification({
            subject: 'finance_summary',
            title: `📊 Finance summary — ${prevKey}`,
            body: text.slice(0, 1500),
            audience: { role: 'admin' },
            data: { month: prevKey },
        });
        await saveAppSetting('last_finance_summary_month', prevKey);
        console.log(`[finance] monthly summary sent for ${prevKey}`);
    } catch (err) {
        console.error('[finance] monthly summary failed:', err.message);
    } finally {
        if (connection) connection.release();
    }
}

function startFinanceSummaryJob() {
    console.log('[finance] monthly summary job active');
    runMonthlyFinanceSummary();
    setInterval(runMonthlyFinanceSummary, 60 * 60_000).unref();
}

const requiredColumns = {
    profiles: [
        { name: 'salary', definition: 'DECIMAL(10, 2) DEFAULT 0' },
        { name: 'address', definition: 'TEXT' },
        { name: 'phone', definition: 'VARCHAR(20)' },
        { name: 'company', definition: 'VARCHAR(100)' },
        { name: 'can_add_service', definition: 'TINYINT(1) DEFAULT 0' },
        { name: 'can_update_profile', definition: 'TINYINT(1) DEFAULT 0' },
        { name: 'always_assign', definition: 'TINYINT(1) DEFAULT 0' },
    ],
    inquiries: [
        { name: 'company_name', definition: 'VARCHAR(150)' },
        { name: 'bill_no', definition: 'VARCHAR(50)' },
        { name: 'ticket_no', definition: 'VARCHAR(50) UNIQUE' },
        { name: 'description', definition: 'TEXT' },
        { name: 'bill_amount', definition: 'DECIMAL(10, 2)' },
        { name: 'payment_link', definition: 'TEXT' },
        { name: 'payment_link_id', definition: 'VARCHAR(100)' },
        { name: 'payment_status', definition: "VARCHAR(20) DEFAULT 'unpaid'" },
        { name: 'payment_method', definition: 'VARCHAR(20) DEFAULT NULL' },
        { name: 'feedback_rating', definition: 'INT' },
        { name: 'feedback_comment', definition: 'TEXT' },
        { name: 'feedback_at', definition: 'TIMESTAMP NULL' },
        { name: 'feedback_token_hash', definition: 'VARCHAR(128)' },
        { name: 'feedback_token_created_at', definition: 'TIMESTAMP NULL' },
        { name: 'feedback_token_expires_at', definition: 'TIMESTAMP NULL' },
        { name: 'feedback_token_used_at', definition: 'TIMESTAMP NULL' },
        { name: 'preferred_time', definition: 'TEXT' },
        { name: 'assignment_status', definition: "VARCHAR(20) DEFAULT 'pending'" },
        { name: 'decline_reason', definition: 'TEXT' },
        { name: 'assigned_employee_id', definition: 'VARCHAR(36)' },
        { name: 'ticket_id', definition: 'VARCHAR(36)' },
        { name: 'extra_cost', definition: 'DECIMAL(10, 2) DEFAULT 0' },
        { name: 'extra_cost_reason', definition: 'TEXT' },
        { name: 'payment_received_at', definition: 'TIMESTAMP NULL' },
        { name: 'employee_rating', definition: 'INT' },
        { name: 'feedback_employee_id', definition: 'VARCHAR(36)' },
        { name: 'customer_lat', definition: 'DECIMAL(10, 7)' },
        { name: 'customer_lng', definition: 'DECIMAL(10, 7)' },
        { name: 'employee_bill_lat', definition: 'DECIMAL(10, 7)' },
        { name: 'employee_bill_lng', definition: 'DECIMAL(10, 7)' },
        { name: 'device_type', definition: 'VARCHAR(120)' },
        { name: 'device_serial_no', definition: 'VARCHAR(120)' },
        { name: 'transport_km', definition: 'DECIMAL(8, 2)' },
        { name: 'transport_fee', definition: 'DECIMAL(10, 2) DEFAULT 0' },
        { name: 'platform_fee', definition: 'DECIMAL(10, 2) DEFAULT 0' },
        { name: 'discount_amount', definition: 'DECIMAL(10, 2) DEFAULT 0' },
        { name: 'discount_reason', definition: 'TEXT' },
        { name: 'discount_label', definition: 'VARCHAR(160)' },
        { name: 'discount_preset_id', definition: 'VARCHAR(36)' },
        { name: 'gst_amount', definition: 'DECIMAL(10, 2) DEFAULT 0' },
        { name: 'bill_total', definition: 'DECIMAL(10, 2)' },
        { name: 'bill_generated_at', definition: 'TIMESTAMP NULL' },
        { name: 'bill_pdf_url', definition: 'TEXT' },
        { name: 'cash_collected_at', definition: 'TIMESTAMP NULL' },
        { name: 'cash_submitted_at', definition: 'TIMESTAMP NULL' },
        { name: 'cash_submitted_by', definition: 'VARCHAR(36)' },
        { name: 'auto_assigned', definition: "TINYINT(1) DEFAULT 0 COMMENT 'Set to 1 when assigned via round-robin automation'" },
        { name: 'employee_update_detail', definition: 'TEXT' },
        { name: 'employee_update_status', definition: 'VARCHAR(40)' },
        { name: 'employee_update_at', definition: 'TIMESTAMP NULL' },
        { name: 'device_status', definition: "VARCHAR(50) DEFAULT 'pending'" },
        { name: 'follow_up_status', definition: "VARCHAR(50) DEFAULT 'none'" },
        { name: 'device_service_enabled', definition: 'TINYINT(1) DEFAULT 0' },
        { name: 'sla_breach_notified', definition: 'TINYINT(1) DEFAULT 0' },
    ],
    attendance: [
        { name: 'latitude', definition: 'DECIMAL(10, 7)' },
        { name: 'longitude', definition: 'DECIMAL(10, 7)' },
    ],
    tickets: [
        { name: 'assigned_to', definition: 'VARCHAR(36)' },
        { name: 'updated_at', definition: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
    ],
    service_pricing: [
        { name: 'category', definition: 'VARCHAR(120)' },
        { name: 'sub_category', definition: 'VARCHAR(180)' },
        { name: 'sub_sub_category', definition: 'VARCHAR(255)' },
    ],
    ads: [
        { name: 'starts_at', definition: 'TIMESTAMP NULL' },
        { name: 'expires_at', definition: 'TIMESTAMP NULL' },
        { name: 'placement', definition: "VARCHAR(20) DEFAULT 'landing'" },
        { name: 'device_target', definition: "VARCHAR(20) DEFAULT 'both'" },
    ],
    notices: [
        { name: 'priority', definition: "VARCHAR(20) DEFAULT 'normal'" },
        { name: 'active', definition: 'TINYINT(1) DEFAULT 1' },
        { name: 'expires_at', definition: 'TIMESTAMP NULL' },
    ],
    discount_presets: [
        { name: 'description', definition: 'TEXT' },
        { name: 'active', definition: 'TINYINT(1) DEFAULT 1' },
    ],
};

const requiredTables = [
    `CREATE TABLE IF NOT EXISTS service_pricing (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(120),
        sub_category VARCHAR(180),
        sub_sub_category VARCHAR(255),
        cost DECIMAL(10, 2) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS inquiry_services (
        inquiry_id VARCHAR(36) NOT NULL,
        service_id VARCHAR(36) NOT NULL,
        PRIMARY KEY (inquiry_id, service_id)
    )`,
    `CREATE TABLE IF NOT EXISTS leave_requests (
        id VARCHAR(36) PRIMARY KEY,
        employee_id VARCHAR(36) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        reason TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS eod_reports (
        id VARCHAR(36) PRIMARY KEY,
        employee_id VARCHAR(36) NOT NULL,
        content TEXT NOT NULL,
        date DATE DEFAULT (CURRENT_DATE),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS device_types (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(150) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS companies (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(150) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS complaints (
        id VARCHAR(36) PRIMARY KEY,
        ticket_no VARCHAR(50) NOT NULL,
        inquiry_id VARCHAR(36),
        phone VARCHAR(20) NOT NULL,
        complaint_text TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'open',
        admin_response TEXT,
        resolved_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_complaint_ticket (ticket_no),
        INDEX idx_complaint_status (status)
    )`,
    `CREATE TABLE IF NOT EXISTS ads (
        id VARCHAR(36) PRIMARY KEY,
        kind VARCHAR(20) NOT NULL,
        url TEXT NOT NULL,
        caption VARCHAR(255),
        duration_ms INT DEFAULT 6000,
        active TINYINT(1) DEFAULT 1,
        placement VARCHAR(20) DEFAULT 'landing',
        device_target VARCHAR(20) DEFAULT 'both',
        position INT DEFAULT 0,
        starts_at TIMESTAMP NULL,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ads_active (active),
        INDEX idx_ads_placement (placement),
        INDEX idx_ads_device_target (device_target),
        INDEX idx_ads_position (position)
    )`,
    `CREATE TABLE IF NOT EXISTS training_items (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(180) NOT NULL,
        description TEXT,
        kind VARCHAR(20) NOT NULL,
        url TEXT NOT NULL,
        active TINYINT(1) DEFAULT 1,
        position INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_training_active (active),
        INDEX idx_training_position (position)
    )`,
    `CREATE TABLE IF NOT EXISTS training_completions (
        id VARCHAR(36) PRIMARY KEY,
        item_id VARCHAR(36) NOT NULL,
        employee_id VARCHAR(36) NOT NULL,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_training_completion (item_id, employee_id),
        INDEX idx_training_employee (employee_id),
        INDEX idx_training_item (item_id)
    )`,
    `CREATE TABLE IF NOT EXISTS notices (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(160) NOT NULL,
        body TEXT NOT NULL,
        priority VARCHAR(20) DEFAULT 'normal',
        active TINYINT(1) DEFAULT 1,
        expires_at TIMESTAMP NULL,
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notices_active (active),
        INDEX idx_notices_created (created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS discount_presets (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        description TEXT,
        active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_discount_presets_active (active)
    )`,
    `CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS auto_assignment_logs (
        id VARCHAR(36) PRIMARY KEY,
        inquiry_id VARCHAR(36) NOT NULL,
        employee_id VARCHAR(36) NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        queue_position INT NOT NULL COMMENT 'Position in the clocked-in queue (1-based)',
        INDEX idx_aal_assigned_at (assigned_at),
        INDEX idx_aal_employee (employee_id),
        INDEX idx_aal_inquiry (inquiry_id)
    )`,
    `CREATE TABLE IF NOT EXISTS device_taken_logs (
        id VARCHAR(36) PRIMARY KEY,
        inquiry_id VARCHAR(36) NOT NULL,
        employee_id VARCHAR(36),
        device_image_url TEXT,
        device_description TEXT,
        taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_device_taken_inquiry (inquiry_id),
        INDEX idx_device_taken_employee (employee_id)
    )`,
    `CREATE TABLE IF NOT EXISTS device_return_logs (
        id VARCHAR(36) PRIMARY KEY,
        inquiry_id VARCHAR(36) NOT NULL,
        device_condition VARCHAR(50) DEFAULT 'good',
        return_image_url TEXT,
        return_notes TEXT,
        returned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_device_return_inquiry (inquiry_id)
    )`,
    `CREATE TABLE IF NOT EXISTS device_follow_up_logs (
        id VARCHAR(36) PRIMARY KEY,
        inquiry_id VARCHAR(36) NOT NULL,
        status VARCHAR(50),
        notes TEXT,
        updated_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_device_followup_inquiry (inquiry_id)
    )`,
    // Uploaded images live in MySQL so they survive frontend rebuilds and
    // server redeploys (the on-disk uploads/ folder is ephemeral / not shipped).
    `CREATE TABLE IF NOT EXISTS uploaded_files (
        id VARCHAR(255) PRIMARY KEY,
        mime VARCHAR(120),
        data LONGBLOB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    // Persistent in-app notification feed (bell + notifications page).
    `CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(36) PRIMARY KEY,
        audience_role VARCHAR(20) DEFAULT NULL,
        audience_user VARCHAR(36) DEFAULT NULL,
        subject VARCHAR(50),
        title VARCHAR(200),
        body TEXT,
        data TEXT,
        read_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notif_role (audience_role),
        INDEX idx_notif_user (audience_user),
        INDEX idx_notif_created (created_at)
    )`,
    // Comprehensive training: courses → lessons + quiz, progress, assignments.
    `CREATE TABLE IF NOT EXISTS training_courses (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        category VARCHAR(100) DEFAULT 'General',
        active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS training_lessons (
        id VARCHAR(36) PRIMARY KEY,
        course_id VARCHAR(36) NOT NULL,
        title VARCHAR(200) NOT NULL,
        type VARCHAR(20) DEFAULT 'video',
        media_url TEXT,
        content TEXT,
        position INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tl_course (course_id)
    )`,
    `CREATE TABLE IF NOT EXISTS training_quiz (
        id VARCHAR(36) PRIMARY KEY,
        course_id VARCHAR(36) NOT NULL,
        question TEXT NOT NULL,
        options TEXT,
        correct_index INT DEFAULT 0,
        position INT DEFAULT 0,
        INDEX idx_tq_course (course_id)
    )`,
    `CREATE TABLE IF NOT EXISTS training_lesson_progress (
        id VARCHAR(36) PRIMARY KEY,
        course_id VARCHAR(36) NOT NULL,
        lesson_id VARCHAR(36) NOT NULL,
        employee_id VARCHAR(36) NOT NULL,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tlp_emp (employee_id),
        INDEX idx_tlp_course (course_id)
    )`,
    `CREATE TABLE IF NOT EXISTS training_course_assignments (
        id VARCHAR(36) PRIMARY KEY,
        course_id VARCHAR(36) NOT NULL,
        employee_id VARCHAR(36) DEFAULT NULL,
        due_date DATE DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tca_course (course_id),
        INDEX idx_tca_emp (employee_id)
    )`,
    `CREATE TABLE IF NOT EXISTS training_course_completions (
        id VARCHAR(36) PRIMARY KEY,
        course_id VARCHAR(36) NOT NULL,
        employee_id VARCHAR(36) NOT NULL,
        quiz_score INT DEFAULT NULL,
        passed TINYINT(1) DEFAULT 1,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tcc_emp (employee_id),
        INDEX idx_tcc_course (course_id)
    )`,
    // Web Push subscriptions (one row per browser/device per user).
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        role VARCHAR(20),
        endpoint VARCHAR(500) UNIQUE,
        p256dh TEXT,
        auth TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_push_user (user_id),
        INDEX idx_push_role (role)
    )`,
];

const videoDoorPhoneServices = [
    ['Power Issues', ['No power', 'Device dead', 'Power fluctuation', 'Adaptor/SMPS failure', 'Fuse burnt', 'Battery backup issue', 'Short circuit', 'Voltage drop']],
    ['Display & Video Issues', ['Blank screen', 'Flickering display', 'No video from outdoor unit', 'Low video quality', 'Black & white image', 'Night vision failure', 'Camera blur', 'LCD damage', 'Water spots on camera']],
    ['Audio Issues', ['No audio', 'One way audio', 'Low sound', 'Distorted voice', 'Echo/noise', 'Microphone not working', 'Speaker damaged', 'Intermittent audio']],
    ['Calling & Ringing Issues', ['Call button not working', 'Indoor monitor not ringing', 'Delayed ringing', 'Continuous ringing', 'Wrong flat/room calling', 'Touch button issue']],
    ['Door Lock & Access Issues', ['Door lock not opening', 'Magnetic lock failure', 'Relay issue', 'Exit switch not working', 'RFID card not detecting', 'Fingerprint failure', 'Password unlock issue', 'Door sensor problem']],
    ['Network & Connectivity Issues', ['IP conflict', 'Offline device', 'LAN cable fault', 'PoE issue', 'Wi-Fi connectivity issue', 'Internet unavailable', 'Cloud/P2P offline', 'Switch/router issue']],
    ['Mobile App Issues', ['App not connecting', 'QR code not scanning', 'Push notification failure', 'Remote unlock not working', 'Live view failure', 'App crash', 'Login issue', 'Device not adding']],
    ['Wiring & Cable Issues', ['Loose connection', 'Wrong wiring polarity', 'Cable cut', 'Joint leakage', 'Connector rust', 'Long distance signal loss', 'Poor crimping', 'Shorted cable']],
    ['Hardware Damage Issues', ['Motherboard damaged', 'Touch panel damaged', 'Camera module faulty', 'Speaker failure', 'Mic damaged', 'Relay burnt', 'Button damaged', 'Connector corrosion']],
    ['Software & Configuration Issues', ['Firmware corruption', 'Device hanging', 'Factory reset required', 'Wrong settings', 'SIP registration issue', 'Indoor monitor pairing issue', 'Time/date reset', 'Configuration mismatch']],
    ['Environmental Issues', ['Rain water damage', 'Moisture inside panel', 'Dust accumulation', 'Heat overheating', 'Rust/corrosion', 'Insect damage']],
    ['Installation Issues', ['Wrong mounting', 'Improper cable routing', 'Wrong power supply selection', 'Poor earthing', 'Improper lock alignment', 'Weak signal due to distance']],
    ['Maintenance & Service Issues', ['Preventive maintenance pending', 'Dirty camera lens', 'Loose terminals', 'Firmware not updated', 'Backup battery weak', 'Periodic testing required']],
    ['User Operation Issues', ['User forgot password', 'Wrong app usage', 'Muted ringtone', 'Wrong card usage', 'Unauthorized access attempt', 'Incorrect settings by user']],
].flatMap(([sub_category, items]) => items.map(leaf => ({
    category: 'Video Door Phone',
    sub_category,
    sub_sub_category: leaf,
    name: leaf,
    cost: 200,
})));

function fieldsWithRequired(relFields, requiredField) {
    if (!relFields || relFields === '*') return '*';
    const fields = relFields.split(',').map(f => f.trim()).filter(Boolean);
    if (!fields.includes(requiredField)) fields.push(requiredField);
    return fields.map(() => '??').join(', ');
}

async function ensureRequiredColumns(connection) {
    for (const query of requiredTables) {
        await connection.query(query);
    }

    for (const [table, columns] of Object.entries(requiredColumns)) {
        for (const column of columns) {
            const [rows] = await connection.execute(
                `SELECT COLUMN_NAME
                 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = ?
                   AND COLUMN_NAME = ?`,
                [table, column.name]
            );

            if (rows.length > 0) continue;

            console.log(`[Schema] Adding missing column ${table}.${column.name}`);
            await connection.query(
                `ALTER TABLE ?? ADD COLUMN ?? ${column.definition}`,
                [table, column.name]
            );
        }
    }

    // One-time migration: earlier versions stored the sub-group name in
    // `category` and the leaf in `name`, with description='Video Door Phone'.
    // Re-shape any such rows into the new (Main → Sub → Sub-Sub) structure
    // so the cascading picker can find them and the seed loop below dedupes.
    await connection.query(
        `UPDATE service_pricing
            SET sub_category = category,
                sub_sub_category = name,
                category = 'Video Door Phone'
          WHERE description = 'Video Door Phone'
            AND (sub_sub_category IS NULL OR sub_sub_category = '')
            AND category <> 'Video Door Phone'`
    );

    for (const service of videoDoorPhoneServices) {
        const [existing] = await connection.execute(
            `SELECT id FROM service_pricing
              WHERE category = ?
                AND COALESCE(sub_category, '') = ?
                AND COALESCE(sub_sub_category, name) = ?
              LIMIT 1`,
            [service.category, service.sub_category, service.sub_sub_category]
        );
        if (existing.length > 0) continue;

        await connection.execute(
            'INSERT INTO service_pricing (id, name, category, sub_category, sub_sub_category, cost, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uuidv4(), service.name, service.category, service.sub_category, service.sub_sub_category, service.cost, 'Video Door Phone']
        );
    }

    // Seed default company 'networking experts'
    const [compRows] = await connection.execute(
        'SELECT id FROM companies WHERE LOWER(name) = ? LIMIT 1',
        ['networking experts']
    );
    if (compRows.length === 0) {
        console.log(`[Schema] Seeding default company 'networking experts'`);
        await connection.execute(
            'INSERT INTO companies (id, name) VALUES (?, ?)',
            [uuidv4(), 'networking experts']
        );
    }
}

// --- REALTIME EVENT BROADCASTER (SSE + polling fallback) ---
// Active SSE clients. Each entry: { res, userId, role }
const sseClients = new Set();

// In-memory ring buffer so the polling endpoint can replay missed events.
// Each entry: { id, audience, event }
const eventBuffer = [];
const EVENT_BUFFER_LIMIT = 500;
let _eventSeq = 0;

function audienceAllows(audience, client) {
    if (!audience || audience === 'all') return true;
    if (audience.role && client.role !== audience.role) return false;
    if (audience.userId && client.userId !== audience.userId) return false;
    return true;
}

function pushEvent(audience, event) {
    const id = ++_eventSeq;
    eventBuffer.push({ id, audience: audience || 'all', event: { ...event, _id: id } });
    if (eventBuffer.length > EVENT_BUFFER_LIMIT) eventBuffer.splice(0, eventBuffer.length - EVENT_BUFFER_LIMIT);
    return id;
}

function sseSend(client, event) {
    try {
        client.res.write(`id: ${event._id}\ndata: ${JSON.stringify(event)}\n\n`);
    } catch {
        sseClients.delete(client);
    }
}

// Broadcast a DB change event to every connected client.
function broadcastChange(type, table, row) {
    const event = { kind: 'db', type, table, row: row || null, ts: Date.now() };
    pushEvent('all', event);
    sseClients.forEach(c => sseSend(c, event));
}

// Persist a notification to the feed AND broadcast it live. Acquires its own
// connection so it is safe to call from anywhere (even after the caller released
// its connection). Use this instead of broadcastNotify when the notification
// should also appear in the bell / notifications page.
async function recordNotification(payload) {
    const audience = payload.audience || 'all';
    const role = (typeof audience === 'object' && audience.role) || null;
    const userId = (typeof audience === 'object' && audience.userId) || null;
    let conn;
    try {
        conn = await getConn();
        await conn.query(
            'INSERT INTO notifications (id, audience_role, audience_user, subject, title, body, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uuidv4(), role, userId, payload.subject || null, payload.title || null, payload.body || null, payload.data ? JSON.stringify(payload.data) : null]
        );
    } catch (e) {
        console.error('[notif] persist failed:', e.message);
    } finally {
        if (conn) conn.release();
    }
    broadcastNotify(payload);
    sendWebPush(audience, payload).catch(() => {});
}

// Deliver a Web Push to every saved subscription matching the audience.
async function sendWebPush(audience, payload) {
    if (!PUSH_ENABLED) return;
    const aud = audience || 'all';
    const userId = (typeof aud === 'object' && aud.userId) || null;
    const role = (typeof aud === 'object' && aud.role) || null;
    let conn;
    try {
        conn = await getConn();
        let rows;
        if (userId) [rows] = await conn.query('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId]);
        else if (role) [rows] = await conn.query('SELECT * FROM push_subscriptions WHERE role = ?', [role]);
        else [rows] = await conn.query('SELECT * FROM push_subscriptions');
        const body = JSON.stringify({ title: payload.title || 'Update', body: payload.body || '', data: payload.data || {} });
        await Promise.all((rows || []).map(async (s) => {
            try {
                await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
            } catch (err) {
                if (err.statusCode === 404 || err.statusCode === 410) {
                    try { await conn.query('DELETE FROM push_subscriptions WHERE id = ?', [s.id]); } catch {}
                }
            }
        }));
    } catch (e) {
        console.error('[push] send failed:', e.message);
    } finally {
        if (conn) conn.release();
    }
}

// Broadcast a domain-specific notification (payment received, new assignment, etc.)
// audience: 'all' | { role?: 'admin'|'employee', userId?: '...' }
function broadcastNotify(payload) {
    const audience = payload.audience || 'all';
    const event = { kind: 'notify', ts: Date.now(), ...payload };
    pushEvent(audience, event);
    sseClients.forEach(c => {
        if (audienceAllows(audience, c)) sseSend(c, event);
    });
}

async function getTodayQueue(connection) {
    const today = dbDateKey(new Date());
    const [rows] = await connection.execute(
        `SELECT DISTINCT p.id, p.full_name, a.clock_in, p.always_assign
           FROM profiles p
           LEFT JOIN attendance a ON p.id = a.user_id AND a.date = ? AND a.clock_out IS NULL
          WHERE p.role = 'employee'
            AND (a.id IS NOT NULL OR p.always_assign = 1)
          ORDER BY p.always_assign DESC, a.clock_in ASC`,
        [today]
    );
    return rows;
}

async function autoAssignInquiry(inquiryId) {
    if (!appSettings.autoAssignmentEnabled) {
        console.log('[AutoAssign] Auto-assignment is disabled globally; skipping inquiry:', inquiryId);
        return;
    }
    let connection;
    try {
        connection = await getConn();
        const queue = await getTodayQueue(connection);
        if (!queue.length) {
            console.log('[AutoAssign] No clocked-in employees; skipping auto-assign');
            return;
        }

        const today = dbDateKey(new Date());
        const [countRows] = await connection.execute(
            `SELECT employee_id, COUNT(*) AS cnt
               FROM auto_assignment_logs
              WHERE DATE(assigned_at) = ?
                AND employee_id IN (${queue.map(() => '?').join(',')})
              GROUP BY employee_id`,
            [today, ...queue.map(e => e.id)]
        );
        const countMap = {};
        countRows.forEach(r => { countMap[r.employee_id] = Number(r.cnt); });

        let chosen = queue[0];
        let minCount = countMap[queue[0].id] ?? 0;
        for (let i = 1; i < queue.length; i++) {
            const c = countMap[queue[i].id] ?? 0;
            if (c < minCount) {
                minCount = c;
                chosen = queue[i];
            }
        }
        const queuePosition = queue.findIndex(e => e.id === chosen.id) + 1;

        const [updateResult] = await connection.execute(
            `UPDATE inquiries
                SET assigned_employee_id = ?,
                    assignment_status = 'pending',
                    auto_assigned = 1
              WHERE id = ?
                AND (assigned_employee_id IS NULL OR assigned_employee_id = '')`,
            [chosen.id, inquiryId]
        );
        if (!updateResult.affectedRows) {
            console.log(`[AutoAssign] Inquiry ${inquiryId} already assigned; skipping`);
            return;
        }

        await connection.execute(
            `INSERT INTO auto_assignment_logs (id, inquiry_id, employee_id, queue_position)
             VALUES (?, ?, ?, ?)`,
            [uuidv4(), inquiryId, chosen.id, queuePosition]
        );

        const [inqRows] = await connection.execute('SELECT * FROM inquiries WHERE id = ? LIMIT 1', [inquiryId]);
        const inq = inqRows[0];
        if (inq) broadcastChange('UPDATE', 'inquiries', inq);

        recordNotification({
            subject: 'new_assignment',
            title: '📋 New Assignment',
            body: `New service request assigned to you${inq?.service_item ? ` — ${inq.service_item}` : ''}${inq?.ticket_no ? ` (${inq.ticket_no})` : ''}.`,
            audience: { userId: chosen.id },
            data: { inquiry_id: inquiryId, ticket_no: inq?.ticket_no },
        });

        if (inq) {
            const [empRows] = await connection.execute('SELECT phone FROM profiles WHERE id = ? LIMIT 1', [chosen.id]);
            const emp = empRows[0];
            if (emp?.phone) {
                smsNotify(emp.phone, 'SMS_TID_ASSIGN_EMP', [
                    smsVar(inq.ticket_no, 'N/A', 20),
                    smsVar(inq.service_item, 'General Service', 80),
                    smsVar(inq.full_name, 'Customer', 60),
                    smsPhoneVar(inq.phone),
                    smsVar(inq.location, 'See app', 100),
                ]);
            }
        }

        console.log(`[AutoAssign] Inquiry ${inquiryId} -> employee ${chosen.full_name} (pos ${queuePosition}, ${minCount + 1} assignments today)`);
    } catch (err) {
        console.error('[AutoAssign] Error:', err.message);
    } finally {
        if (connection) {
            try { connection.release(); } catch {}
        }
    }
}

async function autoAssignUnassignedInquiries() {
    if (!appSettings.autoAssignmentEnabled) return;
    let connection;
    try {
        connection = await getConn();
        const [rows] = await connection.execute(
            `SELECT id FROM inquiries
              WHERE (assigned_employee_id IS NULL OR assigned_employee_id = '')
                AND status IN ('pending', 'open')
              ORDER BY created_at ASC`
        );
        connection.release();
        connection = null;
        for (const row of rows) {
            await autoAssignInquiry(row.id);
        }
    } catch (err) {
        console.error('[AutoAssign] Error auto-assigning unassigned inquiries:', err);
    } finally {
        if (connection) {
            try { connection.release(); } catch {}
        }
    }
}

async function markTicketPaid(connection, ticket_no, amountPaise = null) {
    const [priorRows] = await connection.execute(
        'SELECT payment_status FROM inquiries WHERE ticket_no = ? LIMIT 1', [ticket_no]
    );
    const alreadyPaid = priorRows[0]?.payment_status === 'paid';
    await connection.execute(
        `UPDATE inquiries
            SET payment_status = 'paid',
                payment_received_at = COALESCE(payment_received_at, NOW()),
                status = CASE WHEN status IN ('resolved','closed','case_closed') THEN status ELSE 'resolved' END
          WHERE ticket_no = ?`,
        [ticket_no]
    );

    const [inqRows] = await connection.execute(
        'SELECT * FROM inquiries WHERE ticket_no = ? LIMIT 1',
        [ticket_no]
    );
    const inqRow = inqRows[0];
    const ticketId = inqRow?.ticket_id;
    if (ticketId) {
        await connection.execute(
            `UPDATE tickets
                SET status = CASE WHEN status IN ('resolved','closed','case_closed') THEN status ELSE 'resolved' END
              WHERE id = ?`,
            [ticketId]
        );
    }

    if (inqRow) broadcastChange('UPDATE', 'inquiries', inqRow);
    if (ticketId) broadcastChange('UPDATE', 'tickets', { id: ticketId, status: 'resolved' });

    const amount = amountPaise ? Math.round(amountPaise / 100) : (inqRow?.bill_amount || 0);
    if (!alreadyPaid) {
        const method = (inqRow?.payment_method || '').toLowerCase().includes('cash') ? 'Cash' : 'Online';
        await recordNotification({
            subject: 'payment_received',
            title: `💰 Payment Received (${method})`,
            body: `${inqRow?.full_name || 'Client'} paid ₹${amount} via ${method} for ticket ${ticket_no}`,
            audience: { role: 'admin' },
            data: { ticket_no, inquiry_id: inqRow?.id, amount, method },
        });
        if (inqRow?.assigned_employee_id) {
            await recordNotification({
                subject: 'payment_received',
                title: '💰 Payment Received',
                body: `Your ticket ${ticket_no} just got paid! Task auto-resolved.`,
                audience: { userId: inqRow.assigned_employee_id },
                data: { ticket_no, inquiry_id: inqRow.id, amount },
            });
        }
    }

    // SMS → client: payment confirmation with amount, ticket no, bill no
    // Template variables: {customer_name} {amount} {ticket_no} {bill_no}
    if (inqRow?.phone) {
        const billTotal = inqRow.bill_total || inqRow.bill_amount || amount;
        const feedbackToken = await createFeedbackToken(connection, inqRow.id);
        const feedbackLink = feedbackToken ? feedbackLinkFromToken(feedbackToken) : publicBaseUrl();
        smsNotify(inqRow.phone, 'SMS_TID_PAYMENT', [
            smsVar(inqRow.full_name, 'Customer', 60),
            smsVar(`Rs.${Math.round(billTotal)}`, 'Rs.0', 20),
            smsVar(ticket_no, 'N/A', 20),
            smsVar(inqRow.bill_no, 'N/A', 30),
            smsVar(feedbackLink, publicBaseUrl(), 140),
        ]);
    }

    return inqRow;
}

const eventTickets = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [ticket, data] of eventTickets) {
        if (data.expiresAt <= now) eventTickets.delete(ticket);
    }
}, 60_000).unref();

app.post('/api/events/ticket', authenticateToken, (req, res) => {
    const ticket = crypto.randomBytes(32).toString('base64url');
    eventTickets.set(ticket, {
        payload: { id: req.user.id, role: req.user.role },
        expiresAt: Date.now() + 30_000,
    });
    res.json({ ticket });
});

// SSE endpoint. EventSource cannot set headers, so use a short-lived one-shot ticket.
app.get('/api/events', (req, res) => {
    const ticket = req.query.ticket;
    if (!ticket) return res.status(401).end();
    const entry = eventTickets.get(ticket);
    eventTickets.delete(ticket);
    if (!entry || entry.expiresAt <= Date.now()) return res.status(403).end();
    const payload = entry.payload;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',                  // nginx: don't buffer
        'Content-Encoding': 'identity',             // refuse gzip — buffers responses
        'Alt-Svc': 'clear',                          // discourage HTTP/3 / QUIC on this endpoint
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    res.write('retry: 3000\n\n');
    // 2 KB padding helps some proxies start streaming immediately.
    res.write(`: ${' '.repeat(2048)}\n\n`);

    const client = { res, userId: payload.id, role: payload.role };
    sseClients.add(client);
    sseSend(client, { _id: 0, kind: 'hello', ts: Date.now() });

    // Heartbeat keeps proxies from closing the connection.
    const heartbeat = setInterval(() => {
        try { res.write(': hb\n\n'); } catch {}
    }, 15000);

    req.on('close', () => {
        clearInterval(heartbeat);
        sseClients.delete(client);
    });
});

// Polling fallback for hosts/proxies that drop long-lived SSE connections.
// Returns events with id > since that this client is authorised to see.
app.get('/api/events/poll', (req, res) => {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) return res.status(401).json({ error: 'token required' });

    let payload;
    try { payload = jwt.verify(token, process.env.JWT_SECRET); }
    catch { return res.status(403).json({ error: 'invalid token' }); }

    const since = Number(req.query.since) || 0;
    const client = { userId: payload.id, role: payload.role };
    if (since <= 0) {
        const cursor = eventBuffer.length ? eventBuffer[eventBuffer.length - 1].id : 0;
        return res.json({ cursor, events: [] });
    }
    const events = eventBuffer
        .filter(e => e.id > since && audienceAllows(e.audience, client))
        .map(e => e.event);
    const cursor = eventBuffer.length ? eventBuffer[eventBuffer.length - 1].id : since;
    res.json({ cursor, events });
});

// --- IN-MEMORY RATE LIMITER ---
// Simple fixed-window counter keyed by (route, client IP).
// Good enough to slow brute-force and spam without pulling in a new dep.
// Behind a proxy, set app.set('trust proxy', ...) so req.ip is the client IP.
const _rateBuckets = new Map();
function rateLimit({ windowMs, max, key = 'default' }) {
    return (req, res, next) => {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const bucketKey = `${key}:${ip}`;
        const now = Date.now();
        const entry = _rateBuckets.get(bucketKey);
        if (!entry || now >= entry.resetAt) {
            _rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
            return next();
        }
        if (entry.count >= max) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            res.setHeader('Retry-After', String(retryAfter));
            return res.status(429).json({ error: 'Too many requests' });
        }
        entry.count += 1;
        next();
    };
}
// Periodic cleanup so the bucket map doesn't grow unbounded.
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _rateBuckets) if (now >= v.resetAt) _rateBuckets.delete(k);
}, 60_000).unref();

// Middleware to verify JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// --- DATA ACCESS POLICY ---
// `auth_users` is intentionally absent — credentials are touched only by the auth routes.
const ALLOWED_DATA_TABLES = new Set([
    'profiles', 'inquiries', 'tickets', 'attendance', 'ticket_comments',
    'service_pricing', 'inquiry_services', 'leave_requests', 'eod_reports',
    'device_types', 'feedback', 'stocks', 'contacts', 'cash_collections',
    'payments', 'bills', 'complaints', 'ads', 'companies', 'notices', 'discount_presets',
    'training_items', 'training_completions',
]);

// Columns that non-admins must never write through the generic data endpoint.
// `profiles.role`/`salary` are the obvious privilege-escalation vectors;
// `password_hash` should only ever be touched by /api/auth/update-password.
const ADMIN_ONLY_WRITE_COLUMNS = {
    profiles: new Set(['role', 'salary', 'password_hash', 'can_add_service', 'can_update_profile', 'always_assign']),
    auth_users: new Set(['*']), // belt-and-braces; table isn't in allowlist anyway
};

const EMPLOYEE_READ_TABLES = new Set([
    'profiles', 'attendance', 'tickets', 'inquiries', 'eod_reports', 'leave_requests',
    'ticket_comments', 'inquiry_services', 'service_pricing', 'device_types', 'companies',
    'notices', 'discount_presets', 'ads', 'training_items', 'training_completions',
]);
const EMPLOYEE_WRITE_FIELDS = {
    profiles: new Set(['id', 'full_name', 'phone', 'company', 'address']),
    attendance: new Set(['id', 'user_id', 'clock_in', 'clock_out', 'date', 'status', 'location', 'latitude', 'longitude']),
    eod_reports: new Set(['id', 'employee_id', 'content', 'date']),
    leave_requests: new Set(['id', 'employee_id', 'start_date', 'end_date', 'reason', 'status']),
    inquiries: new Set([
        'assignment_status', 'decline_reason', 'status', 'company_name', 'device_type', 'device_serial_no',
        'payment_link', 'payment_link_id', 'payment_status', 'payment_method', 'payment_received_at',
        'cash_collected_at', 'bill_amount', 'extra_cost', 'extra_cost_reason', 'transport_km',
        'transport_fee', 'platform_fee', 'discount_amount', 'gst_amount', 'bill_total',
        'discount_reason', 'discount_label', 'discount_preset_id',
        'bill_generated_at', 'bill_pdf_url',
        'employee_bill_lat', 'employee_bill_lng',
        'employee_update_detail', 'employee_update_status', 'employee_update_at',
    ]),
    tickets: new Set(['status']),
    ticket_comments: new Set(['id', 'ticket_id', 'user_id', 'content']),
    inquiry_services: new Set(['inquiry_id', 'service_id']),
    companies: new Set(['id', 'name']),
    training_completions: new Set(['id', 'item_id', 'employee_id', 'completed_at']),
};

// Identifier-safe regex for column/select tokens. Lets us reject anything that
// could include parens, spaces, quotes, or SQL keywords.
const SAFE_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseEqFilters(eqs) {
    return eqs.map(filter => {
        const idx = filter.indexOf(':');
        if (idx === -1) return null;
        const field = filter.slice(0, idx);
        const value = filter.slice(idx + 1);
        if (!SAFE_IDENT_RE.test(field)) return { error: `Invalid filter column: ${field}` };
        return { field, value };
    }).filter(Boolean);
}

function assertSafeObjectKeys(data) {
    const bad = Object.keys(data || {}).find(k => !SAFE_IDENT_RE.test(k));
    return bad ? `Invalid field: ${bad}` : null;
}

function assertAllowedFields(table, data, allowed) {
    if (!allowed) return `Not allowed to write ${table}`;
    const blocked = Object.keys(data || {}).filter(k => !allowed.has(k));
    return blocked.length ? `Not allowed to write: ${blocked.join(', ')}` : null;
}

function appendRoleScope({ table, user, method, whereClauses, params }) {
    if (!user || user.role === 'admin' || user.role === 'public') return null;
    if (user.role !== 'employee' && user.role !== 'client') {
        return { error: 'Forbidden' };
    }
    const id = user.id;
    if (method === 'GET' && !EMPLOYEE_READ_TABLES.has(table)) return { error: 'Forbidden' };
    switch (table) {
        case 'profiles':
            whereClauses.push('?? = ?');
            params.push('id', id);
            break;
        case 'attendance':
            whereClauses.push('?? = ?');
            params.push('user_id', id);
            break;
        case 'tickets':
            whereClauses.push('(?? = ? OR ?? = ?)');
            params.push('assigned_to', id, 'client_id', id);
            break;
        case 'inquiries':
            whereClauses.push('?? = ?');
            params.push('assigned_employee_id', id);
            break;
        case 'eod_reports':
        case 'leave_requests':
            whereClauses.push('?? = ?');
            params.push('employee_id', id);
            break;
        case 'ticket_comments':
            whereClauses.push('EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_comments.ticket_id AND (t.assigned_to = ? OR t.client_id = ?))');
            params.push(id, id);
            break;
        case 'inquiry_services':
            whereClauses.push('EXISTS (SELECT 1 FROM inquiries i WHERE i.id = inquiry_services.inquiry_id AND i.assigned_employee_id = ?)');
            params.push(id);
            break;
        case 'companies':
            if (user.role === 'client' && method !== 'GET') return { error: 'Forbidden' };
            break;
        case 'service_pricing':
            break;
        case 'device_types':
            if (method !== 'GET') return { error: 'Admin only' };
            break;
        case 'notices':
            if (method !== 'GET') return { error: 'Admin only' };
            whereClauses.push('?? = ?');
            params.push('active', 1);
            break;
        case 'ads':
            if (method !== 'GET') return { error: 'Admin only' };
            whereClauses.push('?? = ?');
            params.push('active', 1);
            break;
        case 'training_items':
            if (method !== 'GET') return { error: 'Admin only' };
            whereClauses.push('?? = ?');
            params.push('active', 1);
            break;
        case 'training_completions':
            whereClauses.push('?? = ?');
            params.push('employee_id', id);
            break;
        case 'discount_presets':
            if (method !== 'GET') return { error: 'Admin only' };
            whereClauses.push('?? = ?');
            params.push('active', 1);
            break;
        default:
            return { error: 'Forbidden' };
    }
    return null;
}

async function assertEmployeeInsertAllowed(connection, table, user, data) {
    if (user.role === 'admin' || user.role === 'public') return null;
    const id = user.id;

    // Fetch profile to verify employee self-service permissions.
    const [profRows] = await connection.execute(
        'SELECT can_add_service, can_update_profile FROM profiles WHERE id = ? LIMIT 1',
        [id]
    );
    const canAddService = profRows[0] && profRows[0].can_add_service === 1;
    const canUpdateProfile = profRows[0] && profRows[0].can_update_profile === 1;

    if (table === 'service_pricing') {
        if (!canAddService) return 'Only users with Add Service access can modify service pricing';
        return null;
    }

    if (table === 'profiles' && !canUpdateProfile) {
        return 'Profile updates require admin access';
    }

    let allowedFields = EMPLOYEE_WRITE_FIELDS[table];
    if (canAddService) {
        if (table === 'tickets') {
            allowedFields = new Set([...EMPLOYEE_WRITE_FIELDS.tickets, 'id', 'client_id', 'assigned_to', 'title', 'description', 'category', 'priority']);
            if (String(data.assigned_to) !== String(id)) {
                return 'Cannot register a request assigned to another employee';
            }
        } else if (table === 'inquiries') {
            allowedFields = new Set([
                ...EMPLOYEE_WRITE_FIELDS.inquiries,
                'id', 'full_name', 'phone', 'location', 'customer_lat', 'customer_lng',
                'bill_no', 'service_item', 'description', 'ticket_no', 'preferred_time',
                'assigned_employee_id', 'ticket_id',
                'discount_reason', 'discount_label', 'discount_preset_id',
            ]);
            if (String(data.assigned_employee_id) !== String(id)) {
                return 'Cannot register a request assigned to another employee';
            }
        }
    }

    const allowedErr = assertAllowedFields(table, data, allowedFields);
    if (allowedErr) return allowedErr;

    if (table === 'profiles' && String(data.id) !== String(id)) return 'Cannot write another user profile';
    if (table === 'attendance' && String(data.user_id) !== String(id)) return 'Cannot write another user attendance';
    if ((table === 'eod_reports' || table === 'leave_requests') && String(data.employee_id) !== String(id)) return 'Cannot write another employee record';
    if (table === 'training_completions' && String(data.employee_id) !== String(id)) return 'Cannot write another employee training record';
    if (table === 'leave_requests' && data.status && data.status !== 'pending') return 'Leave requests must start pending';
    if (table === 'ticket_comments') {
        if (String(data.user_id) !== String(id)) return 'Cannot comment as another user';
        const [rows] = await connection.query('SELECT id FROM tickets WHERE id = ? AND (assigned_to = ? OR client_id = ?) LIMIT 1', [data.ticket_id, id, id]);
        if (!rows.length) return 'Cannot comment on this ticket';
    }
    if (table === 'inquiry_services') {
        const [rows] = await connection.query('SELECT id FROM inquiries WHERE id = ? AND assigned_employee_id = ? LIMIT 1', [data.inquiry_id, id]);
        if (!rows.length) return 'Cannot update services for this inquiry';
    }
    return null;
}

function parseSelectClause(select) {
    if (!select || select === '*') return { columns: '*', relations: [] };
    const relations = [];
    // Pull out Supabase-style joins like "inquiries(*)" or "profiles(full_name)".
    const joinRegex = /(\w+)\(([^)]*)\)/g;
    let m;
    while ((m = joinRegex.exec(select)) !== null) {
        if (!ALLOWED_DATA_TABLES.has(m[1])) return { error: `Unknown relation: ${m[1]}` };
        if (m[2] !== '*') {
            const badRelField = m[2].split(',').map(s => s.trim()).filter(Boolean).find(f => !SAFE_IDENT_RE.test(f));
            if (badRelField) return { error: `Invalid relation column: ${badRelField}` };
        }
        relations.push({ relTable: m[1], relFields: m[2] === '*' ? '*' : m[2] });
    }
    let bare = select.replace(/,?\s*\w+\([^)]*\)/g, '').trim();
    bare = bare.replace(/^,|,$/g, '').trim();
    if (!bare || bare === '*') return { columns: '*', relations };
    const cols = bare.split(',').map(s => s.trim()).filter(Boolean);
    for (const c of cols) {
        if (!SAFE_IDENT_RE.test(c)) return { error: `Invalid column: ${c}` };
    }
    return { columns: cols, relations };
}

// The public landing page submits and tracks inquiries without logging in.
// Allow anonymous access for those specific operations on the `inquiries` table:
//   - POST: anyone can create a new inquiry
//   - GET:  must filter by ticket_no (so callers can't dump the whole table)
//   - PATCH: only feedback fields may be updated, and only by id
// Anything else falls through to the normal JWT check.
const PUBLIC_INQUIRY_FEEDBACK_FIELDS = new Set(['feedback_rating', 'feedback_comment', 'feedback_at', 'employee_rating', 'feedback_employee_id']);
const PUBLIC_INQUIRY_CREATE_FIELDS = new Set([
    'id', 'full_name', 'phone', 'location', 'customer_lat', 'customer_lng',
    'bill_no', 'service_item', 'description', 'ticket_no', 'preferred_time', 'status', 'assignment_status',
]);
// Public complaint submissions: anyone with a valid ticket_no + phone (verified
// in the POST handler) can file a complaint. Field set is intentionally minimal
// so admins control status / admin_response / resolved_at.
const PUBLIC_COMPLAINT_CREATE_FIELDS = new Set([
    'id', 'ticket_no', 'phone', 'complaint_text',
]);
const dataAuth = (req, res, next) => {
    if (!ALLOWED_DATA_TABLES.has(req.params.table)) {
        return res.status(404).json({ error: 'Unknown table' });
    }
    if (req.params.table === 'inquiries') {
        const eqs = Array.isArray(req.query.eq) ? req.query.eq : (req.query.eq ? [req.query.eq] : []);

        if (req.method === 'POST' && req.headers.authorization) {
            return authenticateToken(req, res, next);
        }
        if (req.method === 'POST') {
            req.user = { role: 'public' };
            return next();
        }
        if (req.method === 'GET' && eqs.some(e => e.startsWith('ticket_no:')) && eqs.some(e => e.startsWith('phone:'))) {
            req.user = { role: 'public' };
            return next();
        }
        // Customers can also list ALL of their own tickets by phone alone
        // (the landing-page "Track Request" tab shows a list view).
        if (req.method === 'GET' && eqs.length === 1 && eqs[0].startsWith('phone:')) {
            req.user = { role: 'public' };
            return next();
        }
    }
    if (req.params.table === 'complaints' && req.method === 'POST') {
        // POST handler verifies the ticket_no/phone pair against inquiries
        // before inserting. GET/PATCH/DELETE still require staff auth.
        req.user = { role: 'public' };
        return next();
    }
    if (req.params.table === 'ads' && req.method === 'GET') {
        // Ads are public marketing content shown on the landing page.
        // Writes still require admin.
        req.user = { role: 'public' };
        return next();
    }
    if (req.params.table === 'service_pricing' && req.method === 'GET') {
        // Public landing-page form reads distinct categories from here to
        // populate the "What's the issue?" dropdown. Writes stay admin-only.
        req.user = { role: 'public' };
        return next();
    }
    return authenticateToken(req, res, next);
};

// --- PUBLIC SECURE FEEDBACK ROUTES ---
app.get('/api/feedback/resolve', rateLimit({ windowMs: 60_000, max: 30, key: 'feedback-resolve' }), async (req, res) => {
    const token = String(req.query.token || '').trim();
    if (!token || token.length < 20) return res.status(400).json({ error: 'Invalid feedback link' });

    let connection;
    try {
        connection = await getConn();
        const [rows] = await connection.execute(
            `SELECT id, ticket_no, full_name, service_item, status, payment_status,
                    bill_total, bill_amount, feedback_rating, feedback_comment, feedback_at,
                    feedback_token_expires_at, feedback_token_used_at,
                    assigned_employee_id
               FROM inquiries
              WHERE feedback_token_hash = ?
              LIMIT 1`,
            [feedbackTokenHash(token)]
        );
        connection.release();
        connection = null;

        const row = rows[0];
        if (!row) return res.status(404).json({ error: 'Feedback link not found' });
        if (row.feedback_token_used_at || row.feedback_rating != null) {
            return res.json({ used: true, inquiry: row });
        }
        if (row.feedback_token_expires_at && new Date(row.feedback_token_expires_at).getTime() <= Date.now()) {
            return res.status(410).json({ error: 'Feedback link expired' });
        }
        if (!['paid', 'completed'].includes(String(row.payment_status || '').toLowerCase())) {
            return res.status(403).json({ error: 'Feedback opens after payment is received' });
        }
        res.json({ ok: true, inquiry: row });
    } catch (err) {
        if (connection) { try { connection.release(); } catch {} }
        console.error('[feedback/resolve]', err);
        res.status(500).json({ error: 'Could not open feedback link' });
    }
});

app.post('/api/feedback/submit', rateLimit({ windowMs: 60_000, max: 10, key: 'feedback-submit' }), async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const rating = Number(req.body?.rating || 0);
    const employeeRating = Number(req.body?.employee_rating || 0);
    const comment = smsVar(req.body?.comment || '', '', 1000);
    if (!token || token.length < 20) return res.status(400).json({ error: 'Invalid feedback link' });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be from 1 to 5' });
    }
    if (employeeRating && (!Number.isInteger(employeeRating) || employeeRating < 1 || employeeRating > 5)) {
        return res.status(400).json({ error: 'Technician rating must be from 1 to 5' });
    }

    let connection;
    try {
        connection = await getConn();
        const tokenHash = feedbackTokenHash(token);
        const [rows] = await connection.execute(
            `SELECT id, ticket_no, full_name, assigned_employee_id, feedback_rating,
                    feedback_token_expires_at, feedback_token_used_at, payment_status
               FROM inquiries
              WHERE feedback_token_hash = ?
              LIMIT 1`,
            [tokenHash]
        );
        const row = rows[0];
        if (!row) {
            connection.release();
            return res.status(404).json({ error: 'Feedback link not found' });
        }
        if (row.feedback_token_used_at || row.feedback_rating != null) {
            connection.release();
            return res.status(409).json({ error: 'Feedback already submitted' });
        }
        if (row.feedback_token_expires_at && new Date(row.feedback_token_expires_at).getTime() <= Date.now()) {
            connection.release();
            return res.status(410).json({ error: 'Feedback link expired' });
        }
        if (!['paid', 'completed'].includes(String(row.payment_status || '').toLowerCase())) {
            connection.release();
            return res.status(403).json({ error: 'Feedback opens after payment is received' });
        }

        const [result] = await connection.execute(
            `UPDATE inquiries
                SET feedback_rating = ?,
                    feedback_comment = ?,
                    feedback_at = NOW(),
                    employee_rating = ?,
                    feedback_employee_id = ?,
                    feedback_token_used_at = NOW()
              WHERE id = ?
                AND feedback_token_hash = ?
                AND feedback_rating IS NULL
                AND feedback_token_used_at IS NULL`,
            [
                rating,
                comment || null,
                employeeRating || null,
                employeeRating ? row.assigned_employee_id || null : null,
                row.id,
                tokenHash,
            ]
        );
        if (!result.affectedRows) {
            connection.release();
            return res.status(409).json({ error: 'Feedback already submitted' });
        }
        const [freshRows] = await connection.execute('SELECT * FROM inquiries WHERE id = ? LIMIT 1', [row.id]);
        connection.release();
        const fresh = freshRows[0] || { id: row.id, feedback_rating: rating };
        broadcastChange('UPDATE', 'inquiries', fresh);
        broadcastNotify({
            subject: 'feedback_received',
            title: 'Customer Feedback',
            body: `${row.full_name || 'Client'} rated ${rating}/5`,
            audience: { role: 'admin' },
            data: { inquiry_id: row.id, ticket_no: row.ticket_no, rating },
        });
        res.json({ ok: true, inquiry: fresh });
    } catch (err) {
        if (connection) { try { connection.release(); } catch {} }
        console.error('[feedback/submit]', err);
        res.status(500).json({ error: 'Could not submit feedback' });
    }
});

// --- PUBLIC OTP ROUTES ---

function fast2SmsConfig() {
    return {
        apiKey: process.env.SMS_API,
        otpId: process.env.FAST2SMS_OTP_ID
            || process.env.FAST2SMS_OTP_MESSAGE_ID
            || process.env.SMS_TID_OTP
            || process.env.SMS_OTP_ID
            || process.env.OTP_ID,
        dltOtpTemplateId: process.env.SMS_TID_OTP
            || process.env.FAST2SMS_OTP_MESSAGE_ID
            || process.env.FAST2SMS_OTP_ID
            || process.env.SMS_OTP_ID
            || process.env.OTP_ID,
        senderId: process.env.FAST2SMS_SENDER_ID || 'NTWRKE',
    };
}

const localOtpStore = new Map();
const LOCAL_OTP_EXPIRY_MS = 10 * 60 * 1000;

function generateOtpCode(length = 6) {
    const min = 10 ** (length - 1);
    const max = (10 ** length) - 1;
    return String(Math.floor(min + Math.random() * (max - min + 1)));
}

function cleanupLocalOtpStore() {
    const now = Date.now();
    for (const [mobile, record] of localOtpStore.entries()) {
        if (!record || record.expiresAt <= now) localOtpStore.delete(mobile);
    }
}

async function sendLocalDltOtp({ mobile, apiKey, templateId, senderId }) {
    cleanupLocalOtpStore();
    if (!templateId) return { ok: false, error: 'OTP DLT message id is not configured.' };
    const normalizedMobile = normalizeIndianMobile(mobile);
    if (!normalizedMobile) return { ok: false, error: 'Enter a valid 10-digit Indian mobile number.' };

    const otp = generateOtpCode(6);
    const result = await sendDltSms({
        mobile: normalizedMobile,
        templateId,
        variables: [otp],
        apiKey,
        senderId,
    });
    if (!result.ok) return result;

    localOtpStore.set(normalizedMobile, {
        otp,
        expiresAt: Date.now() + LOCAL_OTP_EXPIRY_MS,
        attempts: 0,
    });
    return { ok: true, provider: result.provider };
}

function verifyLocalDltOtp({ mobile, otp }) {
    cleanupLocalOtpStore();
    const normalizedMobile = normalizeIndianMobile(mobile);
    const record = normalizedMobile ? localOtpStore.get(normalizedMobile) : null;
    if (!record) return { ok: false, missing: true };
    record.attempts += 1;
    if (record.attempts > 5) {
        localOtpStore.delete(normalizedMobile);
        return { ok: false, error: 'Too many OTP attempts. Please request a new code.' };
    }
    if (String(record.otp) !== String(otp || '').trim()) {
        return { ok: false, error: 'Incorrect OTP.' };
    }
    localOtpStore.delete(normalizedMobile);
    return { ok: true };
}

// Fire-and-forget DLT notification SMS. Never throws — failures are logged only.
// templateEnvKey: the env var name holding the Fast2SMS DLT Manager Message ID
// (e.g. 'SMS_TID_TICKET'). This is passed to Fast2SMS as the `message` param.
// variables: array of values matching {#var#} placeholders in the template
const SMS_TEMPLATE_ENV_ALIASES = {
    SMS_TID_TICKET: [
        'SMS_TID_TICKET_CONFIRMED',
        'SMS_TID_TICKET_CONFIRMATION',
        'SMS_TID_SERVICE_REQUEST',
        'SMS_TID_REQUEST_CONFIRMATION',
    ],
    SMS_TID_ASSIGN_EMP: [
        'SMS_TID_JOB_ASSIGNED',
        'SMS_TID_SERVICE_ASSIGNED',
        'SMS_TID_ASSIGNMENT',
        'SMS_TID_TECHNICIAN_ASSIGN',
    ],
    SMS_TID_ACCEPTED: [
        'SMS_TID_TECH_ACCEPTED',
        'SMS_TID_ASSIGN_ACCEPTED',
        'SMS_TID_TECHNICIAN_ACCEPTED',
    ],
    SMS_TID_PAYMENT: [
        'SMS_TID_PAYMENT_RECEIVED',
    ],
};

function resolveSmsTemplate(templateEnvKey) {
    if (process.env[templateEnvKey]) {
        return { templateId: process.env[templateEnvKey], envKey: templateEnvKey };
    }
    const alias = (SMS_TEMPLATE_ENV_ALIASES[templateEnvKey] || []).find(key => process.env[key]);
    if (alias) {
        console.warn(`[SMS ${templateEnvKey}] using fallback env ${alias}. Prefer setting ${templateEnvKey}.`);
        return { templateId: process.env[alias], envKey: alias };
    }
    return { templateId: null, envKey: templateEnvKey };
}

function smsMissingTemplateMessage(templateEnvKey) {
    const aliases = SMS_TEMPLATE_ENV_ALIASES[templateEnvKey] || [];
    return aliases.length ? `${templateEnvKey} or aliases ${aliases.join(', ')}` : templateEnvKey;
}

function smsNotify(mobile, templateEnvKey, variables) {
    const apiKey = process.env.SMS_API;
    const { templateId, envKey } = resolveSmsTemplate(templateEnvKey);
    const senderId = process.env[`FAST2SMS_SENDER_ID_${templateEnvKey}`]
        || process.env[`SMS_SENDER_ID_${templateEnvKey}`]
        || process.env.FAST2SMS_SENDER_ID
        || 'NTWRKE';
    const normalized = normalizeIndianMobile(mobile);
    if (!apiKey || !templateId || !mobile) {
        console.warn(`[SMS ${templateEnvKey}] skipped: missing ${!apiKey ? 'SMS_API' : !templateId ? smsMissingTemplateMessage(templateEnvKey) : 'mobile'} (raw mobile=${JSON.stringify(mobile)})`);
        return;
    }
    if (!normalized) {
        console.warn(`[SMS ${templateEnvKey}] skipped: could not normalize mobile=${JSON.stringify(mobile)}`);
        return;
    }
    console.log(`[SMS ${templateEnvKey}] sending → mobile=${normalized} templateId=${templateId} senderId=${senderId} vars(${variables.length})=${JSON.stringify(variables)}`);
    sendDltSms({ mobile, templateId, variables, apiKey, senderId })
        .then(r => {
            if (!r.ok) {
                console.warn(`[SMS ${templateEnvKey}] FAILED → status=${r.status || '?'} error=${r.error || 'unknown'} provider=${JSON.stringify(r.provider || null)}`);
            } else {
                console.log(`[SMS ${templateEnvKey}] sent to ${normalized} → provider=${JSON.stringify(r.provider || null)}`);
            }
        })
        .catch(e => console.error(`[SMS ${templateEnvKey}] threw:`, e.message, e.stack));
}

async function smsNotifyResult(mobile, templateEnvKey, variables) {
    const apiKey = process.env.SMS_API;
    const { templateId, envKey } = resolveSmsTemplate(templateEnvKey);
    const senderId = process.env[`FAST2SMS_SENDER_ID_${templateEnvKey}`]
        || process.env[`SMS_SENDER_ID_${templateEnvKey}`]
        || process.env.FAST2SMS_SENDER_ID
        || 'NTWRKE';
    const normalized = normalizeIndianMobile(mobile);
    if (!apiKey || !templateId || !mobile) {
        return { ok: false, error: `Missing ${!apiKey ? 'SMS_API' : !templateId ? smsMissingTemplateMessage(templateEnvKey) : 'mobile'}` };
    }
    if (!normalized) return { ok: false, error: 'Invalid mobile number' };

    console.log(`[SMS ${templateEnvKey}] sending -> mobile=${normalized} templateEnv=${envKey} templateId=${templateId} senderId=${senderId} vars(${variables.length})=${JSON.stringify(variables)}`);
    const result = await sendDltSms({ mobile, templateId, variables, apiKey, senderId });
    if (!result.ok) {
        console.warn(`[SMS ${templateEnvKey}] FAILED -> status=${result.status || '?'} error=${result.error || 'unknown'} provider=${JSON.stringify(result.provider || null)}`);
        return { ok: false, error: result.error || 'SMS failed', provider: result.provider || null };
    }
    console.log(`[SMS ${templateEnvKey}] sent to ${normalized} -> provider=${JSON.stringify(result.provider || null)}`);
    return { ok: true, provider: result.provider || null };
}

function smsVar(value, fallback = 'N/A', maxLen = 80) {
    const cleaned = String(value || fallback)
        .replace(/[|\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned.slice(0, maxLen) || fallback;
}

function calculateSlaDeadline(createdAt, slaHours = 12) {
    const date = createdAt ? new Date(createdAt) : new Date();
    if (Number.isNaN(date.getTime())) return new Date();
    let hoursRemaining = slaHours;
    const startHour = 10;
    const endHour = 18;

    while (hoursRemaining > 0) {
        const curHour = date.getHours();
        const day = date.getDay();

        if (day === 0) {
            date.setDate(date.getDate() + 1);
            date.setHours(startHour, 0, 0, 0);
            continue;
        }
        if (curHour < startHour) {
            date.setHours(startHour, 0, 0, 0);
            continue;
        }
        if (curHour >= endHour) {
            date.setDate(date.getDate() + 1);
            date.setHours(startHour, 0, 0, 0);
            continue;
        }

        const endOfDay = new Date(date);
        endOfDay.setHours(endHour, 0, 0, 0);
        const workdayRemainingHours = (endOfDay.getTime() - date.getTime()) / (1000 * 60 * 60);
        if (hoursRemaining <= workdayRemainingHours) {
            date.setMilliseconds(date.getMilliseconds() + hoursRemaining * 60 * 60 * 1000);
            hoursRemaining = 0;
        } else {
            hoursRemaining -= workdayRemainingHours;
            date.setDate(date.getDate() + 1);
            date.setHours(startHour, 0, 0, 0);
        }
    }
    return date;
}

function formatSlaDeadlineForSms(deadline) {
    const d = deadline ? new Date(deadline) : null;
    if (!d || Number.isNaN(d.getTime())) return 'As soon as possible';
    const day = d.getDate();
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    const time = d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).toLowerCase();
    return `${day} ${dayName} ${time}`;
}

function smsPhoneVar(value) {
    return normalizeIndianMobile(value) || '0000000000';
}

function publicBaseUrl(req = null) {
    const configured = (process.env.PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
    if (configured) return configured;
    if (req?.get) {
        const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
        const host = req.get('host');
        if (host) return `${proto}://${host}`.replace(/\/+$/, '');
    }
    return 'https://services.networkingexperts.in';
}

function feedbackTokenHash(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function feedbackLinkFromToken(token, req = null) {
    return `${publicBaseUrl(req)}/f/${encodeURIComponent(token)}`;
}

async function createFeedbackToken(connection, inquiryId) {
    if (!inquiryId) return null;
    const [rows] = await connection.execute(
        'SELECT id, feedback_rating FROM inquiries WHERE id = ? LIMIT 1',
        [inquiryId]
    );
    const row = rows[0];
    if (!row || row.feedback_rating != null) return null;

    const token = crypto.randomBytes(8).toString('base64url');
    const tokenHash = feedbackTokenHash(token);
    await connection.execute(
        `UPDATE inquiries
            SET feedback_token_hash = ?,
                feedback_token_created_at = NOW(),
                feedback_token_expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY),
                feedback_token_used_at = NULL
          WHERE id = ? AND feedback_rating IS NULL`,
        [tokenHash, inquiryId]
    );
    return token;
}

function sendOtpResponse(res, result, successPayload = {}) {
    if (result.ok) return res.json({ ok: true, ...successPayload });
    const status = result.status === 401 ? 503 : (result.status && result.status >= 400 ? result.status : 400);
    return res.status(status).json({ ok: false, error: result.error || 'OTP request failed' });
}

app.post('/api/otp/send', rateLimit({ windowMs: 60_000, max: 5, key: 'otp-send' }), async (req, res) => {
    try {
        const { apiKey, otpId, dltOtpTemplateId, senderId } = fast2SmsConfig();
        const mobile = req.body?.phone || req.body?.mobile;
        const normalizedMobile = normalizeIndianMobile(mobile);
        if (!normalizedMobile) return res.status(400).json({ ok: false, error: 'Enter a valid 10-digit Indian mobile number.' });
        if (!apiKey) return res.status(503).json({ ok: false, error: 'SMS_API is not configured on the server.' });
        if (!otpId) return res.status(503).json({ ok: false, error: 'OTP message id is required. Set FAST2SMS_OTP_ID or SMS_TID_OTP.' });

        const result = await sendFast2SmsOtp({ mobile: normalizedMobile, apiKey, otpId });
        if (result.ok) return sendOtpResponse(res, result);

        console.warn(`[otp/send] managed OTP failed, trying DLT fallback: status=${result.status || '?'} error=${result.error || 'unknown'}`);
        const fallback = await sendLocalDltOtp({
            mobile: normalizedMobile,
            apiKey,
            templateId: dltOtpTemplateId,
            senderId,
        });
        sendOtpResponse(res, fallback);
    } catch (err) {
        console.error('[otp/send]', err);
        res.status(500).json({ ok: false, error: 'Could not send OTP' });
    }
});

app.post('/api/otp/verify', rateLimit({ windowMs: 60_000, max: 10, key: 'otp-verify' }), async (req, res) => {
    try {
        const { apiKey, otpId } = fast2SmsConfig();
        const mobile = req.body?.phone || req.body?.mobile;
        const normalizedMobile = normalizeIndianMobile(mobile);
        if (!normalizedMobile) return res.status(400).json({ ok: false, error: 'Enter a valid 10-digit Indian mobile number.' });
        if (!apiKey) return res.status(503).json({ ok: false, error: 'SMS_API is not configured on the server.' });
        if (!otpId) return res.status(503).json({ ok: false, error: 'OTP message id is required. Set FAST2SMS_OTP_ID or SMS_TID_OTP.' });
        const localResult = verifyLocalDltOtp({ mobile: normalizedMobile, otp: req.body?.otp });
        if (localResult.ok) return sendOtpResponse(res, localResult, { verified: true });
        if (!localResult.missing) return sendOtpResponse(res, localResult);

        const result = await verifyFast2SmsOtp({
            mobile: normalizedMobile,
            otp: req.body?.otp,
            apiKey,
        });
        sendOtpResponse(res, result, { verified: true });
    } catch (err) {
        console.error('[otp/verify]', err);
        res.status(500).json({ ok: false, error: 'Could not verify OTP' });
    }
});

app.post('/api/otp/resend', rateLimit({ windowMs: 60_000, max: 3, key: 'otp-resend' }), async (req, res) => {
    try {
        const { apiKey, otpId, dltOtpTemplateId, senderId } = fast2SmsConfig();
        const mobile = req.body?.phone || req.body?.mobile;
        const normalizedMobile = normalizeIndianMobile(mobile);
        if (!normalizedMobile) return res.status(400).json({ ok: false, error: 'Enter a valid 10-digit Indian mobile number.' });
        if (!apiKey) return res.status(503).json({ ok: false, error: 'SMS_API is not configured on the server.' });
        if (!otpId) return res.status(503).json({ ok: false, error: 'OTP message id is required. Set FAST2SMS_OTP_ID or SMS_TID_OTP.' });

        if (localOtpStore.has(normalizedMobile)) {
            const fallback = await sendLocalDltOtp({
                mobile: normalizedMobile,
                apiKey,
                templateId: dltOtpTemplateId,
                senderId,
            });
            return sendOtpResponse(res, fallback);
        }

        const result = await resendFast2SmsOtp({ mobile: normalizedMobile, apiKey, otpId });
        if (result.ok) return sendOtpResponse(res, result);

        console.warn(`[otp/resend] managed OTP failed, trying DLT fallback: status=${result.status || '?'} error=${result.error || 'unknown'}`);
        const fallback = await sendLocalDltOtp({
            mobile: normalizedMobile,
            apiKey,
            templateId: dltOtpTemplateId,
            senderId,
        });
        sendOtpResponse(res, fallback);
    } catch (err) {
        console.error('[otp/resend]', err);
        res.status(500).json({ ok: false, error: 'Could not resend OTP' });
    }
});

// --- AUTH ROUTES ---

app.post('/api/auth/signup', rateLimit({ windowMs: 60_000, max: 5, key: 'signup' }), async (req, res) => {
    const { email, password, fullName, access_key, regKey } = req.body;
    const accessKey = access_key || regKey;

    // Role is derived server-side from the access key — never trust a `role` from the client.
    // Keys live in env so leaking the bundle (which used to embed them) can't grant admin.
    if (!email || typeof email !== 'string' || email.length > 254) {
        return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 8 || password.length > 200) {
        return res.status(400).json({ error: 'Password must be 8-200 characters' });
    }
    if (!fullName || typeof fullName !== 'string' || fullName.length > 120) {
        return res.status(400).json({ error: 'Valid full name is required' });
    }

    try {
        const connection = await getConn();
        const registrationKeys = await getRegistrationKeys(connection);
        if (!registrationKeys.admin || !registrationKeys.employee) {
            connection.release();
            return res.status(503).json({ error: 'Staff registration is not configured on this server.' });
        }
        let role;
        if (accessKey === registrationKeys.admin) role = 'admin';
        else if (accessKey === registrationKeys.employee) role = 'employee';
        else {
            connection.release();
            return res.status(400).json({ error: 'Invalid access key. Only staff and admin can register here.' });
        }

        // Check if user exists
        const [users] = await connection.execute('SELECT * FROM auth_users WHERE email = ?', [email]);
        if (users.length > 0) {
            connection.release();
            return res.status(400).json({ error: 'User already exists' });
        }

        const userId = uuidv4();
        const hashedPassword = await bcrypt.hash(password, 10);

        // Start transaction
        await connection.beginTransaction();

        try {
            await connection.execute(
                'INSERT INTO auth_users (id, email, password_hash) VALUES (?, ?, ?)',
                [userId, email, hashedPassword]
            );

            await connection.execute(
                'INSERT INTO profiles (id, full_name, role) VALUES (?, ?, ?)',
                [userId, fullName, role]
            );

            await connection.commit();
            res.status(201).json({ message: 'User created', userId, role });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/signin', rateLimit({ windowMs: 60_000, max: 10, key: 'signin' }), async (req, res) => {
    const { email, password } = req.body;
    try {
        const connection = await getConn();
        const [users] = await connection.execute('SELECT * FROM auth_users WHERE email = ?', [email]);

        if (users.length === 0) {
            connection.release();
            return res.status(400).json({ error: 'User not found' });
        }

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            connection.release();
            return res.status(400).json({ error: 'Invalid password' });
        }

        // Pull role + name from profile so the client can route immediately.
        const [profiles] = await connection.execute('SELECT role, full_name FROM profiles WHERE id = ?', [user.id]);
        connection.release();

        const profile = profiles[0] || { role: 'client', full_name: '' };

        // Block client logins — clients use the public landing page, not the dashboard.
        if (profile.role !== 'admin' && profile.role !== 'employee') {
            return res.status(403).json({ error: 'Client accounts cannot log in. Please use the public service request form.' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: profile.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.json({
            token,
            user: { id: user.id, email: user.email, role: profile.role, full_name: profile.full_name }
        });
    } catch (error) {
        console.error('Signin error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const connection = await getConn();
        const [profiles] = await connection.execute('SELECT * FROM profiles WHERE id = ?', [req.user.id]);
        connection.release();

        if (profiles.length === 0) return res.status(404).json({ error: 'Profile not found' });
        // Profile fields take precedence so the role is the canonical DB value.
        res.json({ user: { ...req.user, ...profiles[0] } });
    } catch (error) {
        console.error('Me error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- ADMIN USER MANAGEMENT CRUD ENDPOINTS ---

app.get('/api/admin/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const connection = await getConn();
        const [users] = await connection.execute(
            'SELECT p.*, a.email FROM profiles p LEFT JOIN auth_users a ON p.id = a.id ORDER BY p.created_at DESC'
        );
        connection.release();
        res.json(users);
    } catch (error) {
        console.error('GET admin users error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { email, password, fullName, role, phone, salary, address, company, can_add_service, can_update_profile, alwaysAssign } = req.body;

    if (!email || typeof email !== 'string' || email.length > 254) {
        return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 8 || password.length > 200) {
        return res.status(400).json({ error: 'Password must be 8-200 characters' });
    }
    if (!fullName || typeof fullName !== 'string' || fullName.length > 120) {
        return res.status(400).json({ error: 'Valid full name is required' });
    }

    try {
        const connection = await getConn();

        // Check if user exists in auth_users
        const [existing] = await connection.execute('SELECT * FROM auth_users WHERE email = ?', [email]);
        if (existing.length > 0) {
            connection.release();
            return res.status(400).json({ error: 'User already exists' });
        }

        const userId = uuidv4();
        const hashedPassword = await bcrypt.hash(password, 10);

        await connection.beginTransaction();
        try {
            await connection.execute(
                'INSERT INTO auth_users (id, email, password_hash) VALUES (?, ?, ?)',
                [userId, email, hashedPassword]
            );

            await connection.execute(
                'INSERT INTO profiles (id, full_name, role, phone, salary, address, company, can_add_service, can_update_profile, always_assign) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    userId,
                    fullName,
                    role || 'client',
                    phone || null,
                    Number(salary) || 0,
                    address || null,
                    company || null,
                    can_add_service ? 1 : 0,
                    can_update_profile ? 1 : 0,
                    alwaysAssign ? 1 : 0
                ]
            );

            await connection.commit();
            res.status(201).json({ message: 'User created successfully', userId });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('POST admin user error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.patch('/api/admin/users/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const userId = req.params.id;
    const {
        email,
        password,
        fullName,
        role,
        phone,
        salary,
        address,
        company,
        can_add_service,
        can_update_profile,
        alwaysAssign
    } = req.body;

    try {
        const connection = await getConn();

        // Check if user exists
        const [existing] = await connection.execute('SELECT id FROM profiles WHERE id = ?', [userId]);
        if (existing.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'User not found' });
        }

        // If email is provided, check if it's already used by someone else
        if (email) {
            if (typeof email !== 'string' || email.length > 254) {
                connection.release();
                return res.status(400).json({ error: 'Valid email is required' });
            }
            const [emailCheck] = await connection.execute('SELECT id FROM auth_users WHERE email = ? AND id != ?', [email, userId]);
            if (emailCheck.length > 0) {
                connection.release();
                return res.status(400).json({ error: 'Email is already in use by another user' });
            }
        }

        // Validate password if provided
        if (password) {
            if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
                connection.release();
                return res.status(400).json({ error: 'Password must be 8-200 characters' });
            }
        }

        await connection.beginTransaction();
        try {
            // 1. Update auth_users if email or password is changing
            if (email || password) {
                const authUpdates = [];
                const authParams = [];
                if (email) {
                    authUpdates.push('email = ?');
                    authParams.push(email);
                }
                if (password) {
                    const hashedPassword = await bcrypt.hash(password, 10);
                    authUpdates.push('password_hash = ?');
                    authParams.push(hashedPassword);
                }
                authParams.push(userId);
                await connection.execute(
                    `UPDATE auth_users SET ${authUpdates.join(', ')} WHERE id = ?`,
                    authParams
                );
            }

            // 2. Update profiles
            const profileUpdates = [];
            const profileParams = [];

            if (fullName !== undefined) {
                if (typeof fullName !== 'string' || fullName.length > 120) {
                    throw new Error('Valid full name is required');
                }
                profileUpdates.push('full_name = ?');
                profileParams.push(fullName);
            }
            if (role !== undefined) {
                profileUpdates.push('role = ?');
                profileParams.push(role);
            }
            if (phone !== undefined) {
                profileUpdates.push('phone = ?');
                profileParams.push(phone || null);
            }
            if (salary !== undefined) {
                profileUpdates.push('salary = ?');
                profileParams.push(Number(salary) || 0);
            }
            if (address !== undefined) {
                profileUpdates.push('address = ?');
                profileParams.push(address || null);
            }
            if (company !== undefined) {
                profileUpdates.push('company = ?');
                profileParams.push(company || null);
            }
            if (can_add_service !== undefined) {
                profileUpdates.push('can_add_service = ?');
                profileParams.push(can_add_service ? 1 : 0);
            }
            if (can_update_profile !== undefined) {
                profileUpdates.push('can_update_profile = ?');
                profileParams.push(can_update_profile ? 1 : 0);
            }
            if (alwaysAssign !== undefined) {
                profileUpdates.push('always_assign = ?');
                profileParams.push(alwaysAssign ? 1 : 0);
            }

            if (profileUpdates.length > 0) {
                profileParams.push(userId);
                await connection.execute(
                    `UPDATE profiles SET ${profileUpdates.join(', ')} WHERE id = ?`,
                    profileParams
                );
            }

            await connection.commit();
            res.json({ message: 'User updated successfully' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('PATCH admin user error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/users/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const userId = req.params.id;

    if (userId === req.user.id) {
        return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }

    try {
        const connection = await getConn();

        // Check if user exists
        const [existing] = await connection.execute('SELECT id FROM profiles WHERE id = ?', [userId]);
        if (existing.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'User not found' });
        }

        await connection.beginTransaction();
        try {
            await connection.execute('DELETE FROM profiles WHERE id = ?', [userId]);
            await connection.execute('DELETE FROM auth_users WHERE id = ?', [userId]);

            await connection.commit();
            res.json({ message: 'User deleted successfully' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('DELETE admin user error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/settings/attendance', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'employee') return res.sendStatus(403);
    res.json({ autoClockOutTime: parseAutoClockOutTime().label });
});

app.put('/api/settings/attendance', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    if (!isValidClockOutTime(req.body?.autoClockOutTime)) {
        return res.status(400).json({ error: 'Invalid clock-out time' });
    }
    const parsed = parseAutoClockOutTime(req.body?.autoClockOutTime);
    try {
        await saveAppSetting('auto_clock_out_time', parsed.label);
        appSettings.autoClockOutTime = parsed.label;
        res.json({ autoClockOutTime: parsed.label });
    } catch (error) {
        console.error('Settings update error:', error);
        res.status(500).json({ error: error.message || 'Could not save setting' });
    }
});

app.get('/api/settings/registration-keys', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    let connection;
    try {
        connection = await getConn();
        const keys = await getRegistrationKeys(connection);
        res.json(keys);
    } catch (error) {
        console.error('Registration key load error:', error);
        res.status(500).json({ error: error.message || 'Could not load registration keys' });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/settings/registration-keys/regenerate', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const role = req.body?.role;
    if (!['admin', 'employee'].includes(role)) {
        return res.status(400).json({ error: 'Role must be admin or employee' });
    }
    const key = generateRegistrationKey(role);
    try {
        await saveAppSetting(REG_KEY_SETTINGS[role], key);
        res.json({ role, key });
    } catch (error) {
        console.error('Registration key regenerate error:', error);
        res.status(500).json({ error: error.message || 'Could not regenerate key' });
    }
});

// Popup settings endpoints
app.get('/api/settings/popup', async (_, res) => {
    try {
        const connection = await getConn();
        const [rows] = await connection.execute(
            'SELECT setting_value FROM app_settings WHERE setting_key = ?',
            ['popup_enabled']
        );
        connection.release();
        const enabled = rows.length > 0 ? (rows[0].setting_value !== '0' && rows[0].setting_value !== 'false') : true;
        res.json({ enabled });
    } catch (error) {
        console.error('Popup settings load error:', error);
        res.json({ enabled: true });
    }
});

app.put('/api/settings/popup', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const enabled = req.body?.enabled !== false;
    try {
        await saveAppSetting('popup_enabled', enabled ? '1' : '0');
        res.json({ enabled });
    } catch (error) {
        console.error('Popup settings update error:', error);
        res.status(500).json({ error: error.message || 'Could not save setting' });
    }
});

// Device tracking master on/off (admin controlled, public read)
app.get('/api/settings/device-tracking', async (_, res) => {
    try {
        const connection = await getConn();
        const [rows] = await connection.execute(
            'SELECT setting_value FROM app_settings WHERE setting_key = ?',
            ['device_tracking_enabled']
        );
        connection.release();
        const enabled = rows.length > 0 ? (rows[0].setting_value !== '0' && rows[0].setting_value !== 'false') : true;
        res.json({ enabled });
    } catch (error) {
        console.error('Device tracking settings load error:', error);
        res.json({ enabled: true });
    }
});

app.put('/api/settings/device-tracking', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const enabled = req.body?.enabled !== false;
    try {
        await saveAppSetting('device_tracking_enabled', enabled ? '1' : '0');
        res.json({ enabled });
    } catch (error) {
        console.error('Device tracking settings update error:', error);
        res.status(500).json({ error: error.message || 'Could not save setting' });
    }
});

// Toggle per-ticket "device sent to service center" flag
app.post('/api/device-tracking/toggle', authenticateToken, async (req, res) => {
    const { inquiry_id, enabled } = req.body || {};
    if (!inquiry_id) return res.status(400).json({ error: 'inquiry_id is required' });
    try {
        const connection = await getConn();
        try {
            if (!(await canAccessInquiry(connection, req.user, inquiry_id))) {
                return res.sendStatus(403);
            }
            await connection.execute(
                'UPDATE inquiries SET device_service_enabled = ? WHERE id = ?',
                [enabled ? 1 : 0, inquiry_id]
            );
        } finally {
            connection.release();
        }
        res.json({ inquiry_id, enabled: !!enabled });
    } catch (error) {
        console.error('Device toggle error:', error);
        res.status(500).json({ error: error.message || 'Could not update device flag' });
    }
});

// ── FINANCE REPORT ──────────────────────────────────────────────
// Aggregated business finance summary for the admin dashboard. Pure SQL/JS —
// no AI — so the numbers are always trustworthy. Optional ?from=&to=YYYY-MM-DD.
async function computeFinanceSummary(connection, from, to) {
        const where = ['(i.bill_total > 0 OR i.bill_amount > 0)'];
        const params = [];
        if (from) { where.push('COALESCE(i.bill_generated_at, i.created_at) >= ?'); params.push(`${from} 00:00:00`); }
        if (to) { where.push('COALESCE(i.bill_generated_at, i.created_at) <= ?'); params.push(`${to} 23:59:59`); }
        const whereSql = 'WHERE ' + where.join(' AND ');

        const [rows] = await connection.query(
            `SELECT i.id, i.company_name, i.bill_total, i.bill_amount, i.gst_amount,
                    i.discount_amount, i.platform_fee, i.transport_fee, i.payment_status,
                    i.payment_method, i.bill_generated_at, i.created_at,
                    i.cash_collected_at, i.cash_submitted_at,
                    p.full_name AS technician
               FROM inquiries i
               LEFT JOIN profiles p ON p.id = i.assigned_employee_id
               ${whereSql}`,
            params
        );
        const [catRows] = await connection.query(
            `SELECT COALESCE(sp.category, 'Uncategorized') AS category,
                    SUM(COALESCE(sp.cost, 0)) AS revenue, COUNT(*) AS items
               FROM inquiry_services isv
               JOIN service_pricing sp ON sp.id = isv.service_id
               JOIN inquiries i ON i.id = isv.inquiry_id
               ${whereSql}
              GROUP BY COALESCE(sp.category, 'Uncategorized')
              ORDER BY revenue DESC`,
            params
        );

        const amt = (r) => Number(r.bill_total) || Number(r.bill_amount) || 0;
        const isPaid = (r) => r.payment_status === 'paid';
        const now = new Date();

        let billed = 0, received = 0, pending = 0, gst = 0, discounts = 0, platform = 0, transport = 0, paidCount = 0, cashInHand = 0;
        const byTech = new Map(), byCompany = new Map(), byMonth = new Map();
        const byMethod = { cash: 0, online: 0, unknown: 0 };
        const aging = { '0-7': 0, '8-30': 0, '31+': 0 };

        rows.forEach(r => {
            const a = amt(r);
            billed += a;
            gst += Number(r.gst_amount) || 0;
            discounts += Number(r.discount_amount) || 0;
            platform += Number(r.platform_fee) || 0;
            transport += Number(r.transport_fee) || 0;
            if (isPaid(r)) {
                received += a; paidCount++;
                const m = (r.payment_method || '').toLowerCase();
                if (m.includes('cash')) byMethod.cash += a;
                else if (m) byMethod.online += a;
                else byMethod.unknown += a;
            } else {
                pending += a;
                const days = Math.floor((now - new Date(r.bill_generated_at || r.created_at)) / 86400000);
                if (days <= 7) aging['0-7'] += a; else if (days <= 30) aging['8-30'] += a; else aging['31+'] += a;
            }
            if (r.cash_collected_at && !r.cash_submitted_at) cashInHand += a;

            const tName = r.technician || 'Unassigned';
            const t = byTech.get(tName) || { name: tName, billed: 0, received: 0, jobs: 0 };
            t.billed += a; if (isPaid(r)) t.received += a; t.jobs++; byTech.set(tName, t);

            const cName = r.company_name || 'networking experts';
            const c = byCompany.get(cName) || { company: cName, billed: 0, received: 0 };
            c.billed += a; if (isPaid(r)) c.received += a; byCompany.set(cName, c);

            const d = new Date(r.bill_generated_at || r.created_at);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const mo = byMonth.get(key) || { month: key, billed: 0, received: 0 };
            mo.billed += a; if (isPaid(r)) mo.received += a; byMonth.set(key, mo);
        });

        // 12-month trend (independent of the selected range) — powers the trend chart.
        const fmtDate = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        const trendStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        const [trendRows] = await connection.query(
            `SELECT DATE_FORMAT(COALESCE(i.bill_generated_at, i.created_at), '%Y-%m') AS month,
                    SUM(COALESCE(NULLIF(i.bill_total,0), i.bill_amount, 0)) AS billed,
                    SUM(CASE WHEN i.payment_status='paid' THEN COALESCE(NULLIF(i.bill_total,0), i.bill_amount,0) ELSE 0 END) AS received,
                    COUNT(*) AS bills
               FROM inquiries i
              WHERE (i.bill_total > 0 OR i.bill_amount > 0)
                AND COALESCE(i.bill_generated_at, i.created_at) >= ?
              GROUP BY month ORDER BY month`,
            [`${fmtDate(trendStart)} 00:00:00`]
        );
        const trend = trendRows.map(r => ({ month: r.month, billed: Number(r.billed) || 0, received: Number(r.received) || 0, bills: Number(r.bills) || 0 }));

        // Previous equal-length period (for growth deltas) — only when range is bounded.
        let previous = null;
        if (from && to) {
            const parse = (s) => { const [y, m, dd] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, dd); };
            const f = parse(from), tt = parse(to), dayMs = 86400000;
            const days = Math.max(1, Math.round((tt - f) / dayMs) + 1);
            const prevTo = new Date(f.getTime() - dayMs);
            const prevFrom = new Date(prevTo.getTime() - (days - 1) * dayMs);
            const [[pr]] = await connection.query(
                `SELECT SUM(COALESCE(NULLIF(i.bill_total,0), i.bill_amount, 0)) AS billed,
                        SUM(CASE WHEN i.payment_status='paid' THEN COALESCE(NULLIF(i.bill_total,0), i.bill_amount,0) ELSE 0 END) AS received,
                        COUNT(*) AS billsCount,
                        SUM(CASE WHEN i.payment_status='paid' THEN 1 ELSE 0 END) AS paidCount
                   FROM inquiries i
                  WHERE (i.bill_total > 0 OR i.bill_amount > 0)
                    AND COALESCE(i.bill_generated_at, i.created_at) >= ?
                    AND COALESCE(i.bill_generated_at, i.created_at) <= ?`,
                [`${fmtDate(prevFrom)} 00:00:00`, `${fmtDate(prevTo)} 23:59:59`]
            );
            previous = {
                billed: Number(pr.billed) || 0, received: Number(pr.received) || 0,
                billsCount: Number(pr.billsCount) || 0, paidCount: Number(pr.paidCount) || 0,
                from: fmtDate(prevFrom), to: fmtDate(prevTo),
            };
        }

        return {
            range: { from: from || null, to: to || null },
            totals: {
                billed, received, pending, billsCount: rows.length, paidCount,
                avgTicket: rows.length ? billed / rows.length : 0,
                gst, discounts, platform, transport, cashInHand,
            },
            byMethod, aging, previous, trend,
            byTechnician: [...byTech.values()].sort((a, b) => b.billed - a.billed),
            byCompany: [...byCompany.values()].sort((a, b) => b.billed - a.billed),
            byCategory: catRows.map(c => ({ category: c.category, revenue: Number(c.revenue) || 0, items: Number(c.items) || 0 })),
            byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
        };
}

app.get('/api/finance/summary', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    let connection;
    try {
        connection = await getConn();
        res.json(await computeFinanceSummary(connection, req.query.from, req.query.to));
    } catch (err) {
        console.error('[finance] summary error:', err);
        res.status(500).json({ error: err.message || 'Could not build finance summary' });
    } finally {
        if (connection) connection.release();
    }
});

// AI finance analyst (OpenRouter). Narrates / answers questions over the SAME
// aggregated numbers so it can't invent figures. Requires OPENROUTER_API_KEY in
// server/.env (optional OPENROUTER_MODEL to override the model).
app.post('/api/ai/finance', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'OPENROUTER_API_KEY is not set on the server.' });
    const { from, to, question } = req.body || {};
    const model = process.env.OPENROUTER_MODEL || 'openrouter/free';
    let connection;
    try {
        connection = await getConn();
        const summary = await computeFinanceSummary(connection, from, to);
        connection.release(); connection = null;

        const system = 'You are a finance analyst for "Networking Experts", a field-service business (CCTV, networking, video door phones) in India. Currency is INR (₹). Only use the numbers in the provided JSON — never invent figures. Be concise and practical. For a summary give: 1) headline numbers, 2) 2-4 key insights or anomalies, 3) 2-3 concrete recommendations (e.g. chase aged receivables, flag employees holding cash). Use short paragraphs and bullet points.';
        const ask = (question && String(question).trim()) ? String(question).trim() : 'Give me an executive finance summary for this period.';
        const userContent = `Finance data (JSON):\n${JSON.stringify(summary)}\n\nQuestion: ${ask}`;

        const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: userContent },
                ],
                temperature: 0.3,
            }),
        });
        const aiData = await aiRes.json();
        if (!aiRes.ok) {
            console.error('[ai/finance] OpenRouter error:', aiData);
            return res.status(502).json({ error: aiData.error?.message || 'AI request failed' });
        }
        res.json({ answer: aiData.choices?.[0]?.message?.content || 'No response.', model });
    } catch (err) {
        console.error('[ai/finance] error:', err);
        res.status(500).json({ error: err.message || 'AI finance request failed' });
    } finally {
        if (connection) connection.release();
    }
});

// ── NOTIFICATIONS FEED ──────────────────────────────────────────
// Notifications visible to a user: addressed to them, to their role, or broadcast.
function notifAudienceClause(user) {
    return {
        sql: '(audience_user = ? OR audience_role = ? OR (audience_role IS NULL AND audience_user IS NULL))',
        params: [user.id, user.role],
    };
}
const safeJsonParse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

app.get('/api/notifications', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await getConn();
        const a = notifAudienceClause(req.user);
        const [rows] = await connection.query(
            `SELECT id, subject, title, body, data, read_at, created_at
               FROM notifications WHERE ${a.sql}
              ORDER BY created_at DESC LIMIT 100`,
            a.params
        );
        const items = rows.map(r => ({ ...r, data: safeJsonParse(r.data) }));
        res.json({ items, unread: items.filter(r => !r.read_at).length });
    } catch (err) {
        console.error('[notif] list error:', err);
        res.status(500).json({ error: err.message || 'Could not load notifications' });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/notifications/unread-count', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await getConn();
        const a = notifAudienceClause(req.user);
        const [rows] = await connection.query(
            `SELECT COUNT(*) AS cnt FROM notifications WHERE read_at IS NULL AND ${a.sql}`,
            a.params
        );
        res.json({ unread: Number(rows[0]?.cnt || 0) });
    } catch {
        res.json({ unread: 0 });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await getConn();
        const a = notifAudienceClause(req.user);
        await connection.query(
            `UPDATE notifications SET read_at = NOW() WHERE id = ? AND read_at IS NULL AND ${a.sql}`,
            [req.params.id, ...a.params]
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/notifications/read-all', authenticateToken, async (req, res) => {
    let connection;
    try {
        connection = await getConn();
        const a = notifAudienceClause(req.user);
        await connection.query(
            `UPDATE notifications SET read_at = NOW() WHERE read_at IS NULL AND ${a.sql}`,
            a.params
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// ── WEB PUSH ─────────────────────────────────────────────────────
app.get('/api/push/vapid-public', (req, res) => {
    res.json({ key: PUSH_ENABLED ? process.env.VAPID_PUBLIC : null });
});

app.post('/api/push/subscribe', authenticateToken, async (req, res) => {
    if (!PUSH_ENABLED) return res.status(400).json({ error: 'Push not configured' });
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !sub?.keys) return res.status(400).json({ error: 'Invalid subscription' });
    let c;
    try {
        c = await getConn();
        await c.query(
            `INSERT INTO push_subscriptions (id, user_id, role, endpoint, p256dh, auth)
             VALUES (?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), role = VALUES(role), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
            [uuidv4(), req.user.id, req.user.role, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
        );
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

// ── TRAINING (courses → lessons + quiz, progress, assignments) ──
const trainAdmin = (req, res) => { if (req.user.role !== 'admin') { res.sendStatus(403); return false; } return true; };

// Admin: list courses with counts
app.get('/api/training/courses', authenticateToken, async (req, res) => {
    if (!trainAdmin(req, res)) return;
    let c; try {
        c = await getConn();
        const [rows] = await c.query(`
            SELECT co.*,
                (SELECT COUNT(*) FROM training_lessons l WHERE l.course_id = co.id) AS lesson_count,
                (SELECT COUNT(*) FROM training_quiz q WHERE q.course_id = co.id) AS quiz_count,
                (SELECT COUNT(*) FROM training_course_assignments a WHERE a.course_id = co.id) AS assign_count
            FROM training_courses co ORDER BY co.created_at DESC`);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

// Admin: full course (lessons + quiz with answers) for the editor
app.get('/api/training/courses/:id/full', authenticateToken, async (req, res) => {
    if (!trainAdmin(req, res)) return;
    let c; try {
        c = await getConn();
        const [[course]] = await c.query('SELECT * FROM training_courses WHERE id = ?', [req.params.id]);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        const [lessons] = await c.query('SELECT * FROM training_lessons WHERE course_id = ? ORDER BY position, created_at', [req.params.id]);
        const [quiz] = await c.query('SELECT * FROM training_quiz WHERE course_id = ? ORDER BY position', [req.params.id]);
        const [assignments] = await c.query('SELECT * FROM training_course_assignments WHERE course_id = ?', [req.params.id]);
        res.json({ course, lessons, quiz: quiz.map(q => ({ ...q, options: safeJsonParse(q.options) || [] })), assignments });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

app.post('/api/training/courses', authenticateToken, async (req, res) => {
    if (!trainAdmin(req, res)) return;
    const { title, description, category } = req.body || {};
    if (!title) return res.status(400).json({ error: 'Title is required' });
    let c; try {
        c = await getConn();
        const id = uuidv4();
        await c.query('INSERT INTO training_courses (id, title, description, category) VALUES (?,?,?,?)',
            [id, title, description || null, category || 'General']);
        res.json({ id });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

app.patch('/api/training/courses/:id', authenticateToken, async (req, res) => {
    if (!trainAdmin(req, res)) return;
    const { title, description, category, active } = req.body || {};
    let c; try {
        c = await getConn();
        await c.query('UPDATE training_courses SET title=COALESCE(?,title), description=COALESCE(?,description), category=COALESCE(?,category), active=COALESCE(?,active) WHERE id=?',
            [title ?? null, description ?? null, category ?? null, active == null ? null : (active ? 1 : 0), req.params.id]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

app.delete('/api/training/courses/:id', authenticateToken, async (req, res) => {
    if (!trainAdmin(req, res)) return;
    let c; try {
        c = await getConn();
        const id = req.params.id;
        for (const t of ['training_lessons', 'training_quiz', 'training_lesson_progress', 'training_course_assignments', 'training_course_completions'])
            await c.query(`DELETE FROM ${t} WHERE course_id = ?`, [id]);
        await c.query('DELETE FROM training_courses WHERE id = ?', [id]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

app.post('/api/training/courses/:id/lessons', authenticateToken, async (req, res) => {
    if (!trainAdmin(req, res)) return;
    const { title, type, media_url, content, position } = req.body || {};
    if (!title) return res.status(400).json({ error: 'Lesson title is required' });
    let c; try {
        c = await getConn();
        const id = uuidv4();
        await c.query('INSERT INTO training_lessons (id, course_id, title, type, media_url, content, position) VALUES (?,?,?,?,?,?,?)',
            [id, req.params.id, title, type || 'video', media_url || null, content || null, Number(position) || 0]);
        res.json({ id });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

app.delete('/api/training/lessons/:id', authenticateToken, async (req, res) => {
    if (!trainAdmin(req, res)) return;
    let c; try {
        c = await getConn();
        await c.query('DELETE FROM training_lessons WHERE id = ?', [req.params.id]);
        await c.query('DELETE FROM training_lesson_progress WHERE lesson_id = ?', [req.params.id]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

app.post('/api/training/courses/:id/quiz', authenticateToken, async (req, res) => {
    if (!trainAdmin(req, res)) return;
    const { question, options, correct_index, position } = req.body || {};
    if (!question || !Array.isArray(options) || options.length < 2) return res.status(400).json({ error: 'Question and at least 2 options required' });
    let c; try {
        c = await getConn();
        const id = uuidv4();
        await c.query('INSERT INTO training_quiz (id, course_id, question, options, correct_index, position) VALUES (?,?,?,?,?,?)',
            [id, req.params.id, question, JSON.stringify(options), Number(correct_index) || 0, Number(position) || 0]);
        res.json({ id });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

app.delete('/api/training/quiz/:id', authenticateToken, async (req, res) => {
    if (!trainAdmin(req, res)) return;
    let c; try {
        c = await getConn();
        await c.query('DELETE FROM training_quiz WHERE id = ?', [req.params.id]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

// Admin: (re)assign a course to specific employees or everyone, with optional due date
app.post('/api/training/courses/:id/assign', authenticateToken, async (req, res) => {
    if (!trainAdmin(req, res)) return;
    const { employee_ids, all, due_date } = req.body || {};
    let c; try {
        c = await getConn();
        await c.query('DELETE FROM training_course_assignments WHERE course_id = ?', [req.params.id]);
        if (all) {
            await c.query('INSERT INTO training_course_assignments (id, course_id, employee_id, due_date) VALUES (?,?,NULL,?)',
                [uuidv4(), req.params.id, due_date || null]);
        } else if (Array.isArray(employee_ids)) {
            for (const eid of employee_ids)
                await c.query('INSERT INTO training_course_assignments (id, course_id, employee_id, due_date) VALUES (?,?,?,?)',
                    [uuidv4(), req.params.id, eid, due_date || null]);
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

// Admin: compliance — completion per course per employee
app.get('/api/training/compliance', authenticateToken, async (req, res) => {
    if (!trainAdmin(req, res)) return;
    let c; try {
        c = await getConn();
        const [rows] = await c.query(`
            SELECT co.id AS course_id, co.title, co.category,
                (SELECT COUNT(*) FROM training_lessons l WHERE l.course_id = co.id) AS lessons,
                (SELECT COUNT(DISTINCT cc.employee_id) FROM training_course_completions cc WHERE cc.course_id = co.id) AS completed,
                (SELECT COUNT(*) FROM training_course_assignments a WHERE a.course_id = co.id AND a.employee_id IS NOT NULL) AS assigned
            FROM training_courses co ORDER BY co.created_at DESC`);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

// Admin: detailed per-employee progress with timestamps (who did what, and when)
app.get('/api/training/courses/:id/progress', authenticateToken, async (req, res) => {
    if (!trainAdmin(req, res)) return;
    const courseId = req.params.id;
    let c; try {
        c = await getConn();
        const [[course]] = await c.query('SELECT * FROM training_courses WHERE id = ?', [courseId]);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        const [lessons] = await c.query('SELECT id, title, position FROM training_lessons WHERE course_id = ? ORDER BY position, created_at', [courseId]);
        const [[qc]] = await c.query('SELECT COUNT(*) AS n FROM training_quiz WHERE course_id = ?', [courseId]);
        const quizCount = qc?.n || 0;
        const [assignments] = await c.query('SELECT employee_id, due_date, created_at FROM training_course_assignments WHERE course_id = ?', [courseId]);
        const globalAssign = assignments.find(a => !a.employee_id) || null;
        const [allEmployees] = await c.query("SELECT id, full_name FROM profiles WHERE role = 'employee'");
        const empName = new Map(allEmployees.map(e => [String(e.id), e.full_name]));
        const assignMeta = new Map();
        for (const a of assignments) if (a.employee_id) assignMeta.set(String(a.employee_id), a);
        const targetIds = globalAssign
            ? allEmployees.map(e => String(e.id))
            : [...new Set(assignments.filter(a => a.employee_id).map(a => String(a.employee_id)))];

        const [progress] = await c.query('SELECT lesson_id, employee_id, completed_at FROM training_lesson_progress WHERE course_id = ?', [courseId]);
        const [comps] = await c.query('SELECT employee_id, quiz_score, passed, completed_at FROM training_course_completions WHERE course_id = ?', [courseId]);
        const compMap = new Map(comps.map(x => [String(x.employee_id), x]));
        const progByEmp = new Map();
        for (const p of progress) {
            const k = String(p.employee_id);
            if (!progByEmp.has(k)) progByEmp.set(k, new Map());
            progByEmp.get(k).set(String(p.lesson_id), p.completed_at);
        }

        const employees = targetIds.map(id => {
            const lp = progByEmp.get(id) || new Map();
            const lessonRows = lessons.map(l => ({ lesson_id: l.id, title: l.title, completed_at: lp.get(String(l.id)) || null }));
            const doneCount = lessonRows.filter(l => l.completed_at).length;
            const comp = compMap.get(id) || null;
            const meta = globalAssign ? (assignMeta.get(id) || globalAssign) : assignMeta.get(id);
            let lastActivity = null;
            for (const l of lessonRows) if (l.completed_at && (!lastActivity || new Date(l.completed_at) > new Date(lastActivity))) lastActivity = l.completed_at;
            if (comp?.completed_at && (!lastActivity || new Date(comp.completed_at) > new Date(lastActivity))) lastActivity = comp.completed_at;
            let firstActivity = null;
            for (const l of lessonRows) if (l.completed_at && (!firstActivity || new Date(l.completed_at) < new Date(firstActivity))) firstActivity = l.completed_at;
            return {
                employee_id: id, name: empName.get(id) || 'Unknown',
                assigned_at: meta?.created_at || null, due_date: meta?.due_date || null,
                lessons: lessonRows, done_count: doneCount, completion: comp,
                first_activity: firstActivity, last_activity: lastActivity,
            };
        });
        employees.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        res.json({ course, lessons, quizCount, employees });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

// Employee: my visible courses with progress
app.get('/api/training/my', authenticateToken, async (req, res) => {
    const emp = req.user.id;
    let c; try {
        c = await getConn();
        const [rows] = await c.query(`
            SELECT co.*,
                (SELECT COUNT(*) FROM training_lessons l WHERE l.course_id = co.id) AS lesson_count,
                (SELECT COUNT(*) FROM training_quiz q WHERE q.course_id = co.id) AS quiz_count,
                (SELECT COUNT(*) FROM training_lesson_progress p WHERE p.course_id = co.id AND p.employee_id = ?) AS done_count,
                (SELECT MIN(a.due_date) FROM training_course_assignments a WHERE a.course_id = co.id AND (a.employee_id = ? OR a.employee_id IS NULL)) AS due_date,
                (SELECT COUNT(*) FROM training_course_completions cc WHERE cc.course_id = co.id AND cc.employee_id = ?) AS completed
            FROM training_courses co
            WHERE co.active = 1
              AND EXISTS (SELECT 1 FROM training_course_assignments a2 WHERE a2.course_id = co.id AND (a2.employee_id = ? OR a2.employee_id IS NULL))
            ORDER BY co.created_at DESC`, [emp, emp, emp, emp]);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

// Employee: full course to take (quiz without revealing answers) + my lesson progress
app.get('/api/training/course/:id', authenticateToken, async (req, res) => {
    const emp = req.user.id;
    let c; try {
        c = await getConn();
        const [[course]] = await c.query('SELECT * FROM training_courses WHERE id = ?', [req.params.id]);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        const [lessons] = await c.query('SELECT * FROM training_lessons WHERE course_id = ? ORDER BY position, created_at', [req.params.id]);
        const [quiz] = await c.query('SELECT id, question, options, position FROM training_quiz WHERE course_id = ? ORDER BY position', [req.params.id]);
        const [done] = await c.query('SELECT lesson_id, completed_at FROM training_lesson_progress WHERE course_id = ? AND employee_id = ?', [req.params.id, emp]);
        const [comp] = await c.query('SELECT * FROM training_course_completions WHERE course_id = ? AND employee_id = ? LIMIT 1', [req.params.id, emp]);
        res.json({
            course, lessons,
            quiz: quiz.map(q => ({ id: q.id, question: q.question, options: safeJsonParse(q.options) || [] })),
            doneLessonIds: done.map(d => d.lesson_id),
            doneLessons: done,
            completion: comp[0] || null,
        });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

app.post('/api/training/lessons/:id/complete', authenticateToken, async (req, res) => {
    const emp = req.user.id;
    let c; try {
        c = await getConn();
        const [[lesson]] = await c.query('SELECT course_id FROM training_lessons WHERE id = ?', [req.params.id]);
        if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
        const [exists] = await c.query('SELECT id FROM training_lesson_progress WHERE lesson_id = ? AND employee_id = ?', [req.params.id, emp]);
        if (!exists.length)
            await c.query('INSERT INTO training_lesson_progress (id, course_id, lesson_id, employee_id) VALUES (?,?,?,?)',
                [uuidv4(), lesson.course_id, req.params.id, emp]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

// Employee: submit quiz answers → grade, record completion (pass ≥ 70%)
app.post('/api/training/course/:id/quiz-submit', authenticateToken, async (req, res) => {
    const emp = req.user.id;
    const answers = req.body?.answers || {}; // { quizId: chosenIndex }
    let c; try {
        c = await getConn();
        const [quiz] = await c.query('SELECT id, correct_index FROM training_quiz WHERE course_id = ?', [req.params.id]);
        let score = 100, passed = 1;
        if (quiz.length) {
            const correct = quiz.filter(q => Number(answers[q.id]) === Number(q.correct_index)).length;
            score = Math.round((correct / quiz.length) * 100);
            passed = score >= 70 ? 1 : 0;
        }
        if (passed) {
            await c.query('DELETE FROM training_course_completions WHERE course_id = ? AND employee_id = ?', [req.params.id, emp]);
            await c.query('INSERT INTO training_course_completions (id, course_id, employee_id, quiz_score, passed) VALUES (?,?,?,?,1)',
                [uuidv4(), req.params.id, emp, score]);
        }
        res.json({ score, passed: !!passed });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { if (c) c.release(); }
});

// Get employee's devices
app.get('/api/device-tracking/employee/:employeeId', authenticateToken, async (req, res) => {
    const { employeeId } = req.params;
    if (req.user.role !== 'admin' && String(req.user.id || '') !== String(employeeId || '')) {
        return res.sendStatus(403);
    }
    let connection;
    try {
        connection = await getConn();

        // Get inquiries assigned to this employee
        const [inquiries] = await connection.execute(`
            SELECT
                i.id,
                i.ticket_no,
                i.full_name,
                i.phone,
                i.service_item,
                i.device_status,
                i.follow_up_status,
                i.device_service_enabled,
                i.status,
                i.created_at
            FROM inquiries i
            WHERE i.assigned_employee_id = ?
            ORDER BY i.created_at DESC
        `, [employeeId]);

        // Get device info for each inquiry
        const [deviceTaken] = await connection.execute('SELECT * FROM device_taken_logs');
        const [deviceReturn] = await connection.execute('SELECT * FROM device_return_logs');

        const result = inquiries.map(inq => {
            const taken = deviceTaken.find(dt => dt.inquiry_id === inq.id);
            const returned = deviceReturn.find(dr => dr.inquiry_id === inq.id);

            return {
                ...inq,
                device_taken_logs: taken || null,
                device_return_logs: returned || null
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Error fetching employee devices:', error);
        res.status(500).json({ error: error.message || 'Could not fetch devices' });
    } finally {
        if (connection) connection.release();
    }
});

// Get device status for specific inquiry
app.get('/api/device-tracking/status/:inquiryId', authenticateToken, async (req, res) => {
    let connection;
    try {
        const { inquiryId } = req.params;
        connection = await getConn();
        if (!(await canAccessInquiry(connection, req.user, inquiryId))) {
            return res.sendStatus(403);
        }

        const [inquiry] = await connection.execute(`
            SELECT device_status, follow_up_status FROM inquiries WHERE id = ?
        `, [inquiryId]);

        const [taken] = await connection.execute(`
            SELECT * FROM device_taken_logs WHERE inquiry_id = ? ORDER BY taken_at DESC LIMIT 1
        `, [inquiryId]);

        const [returned] = await connection.execute(`
            SELECT * FROM device_return_logs WHERE inquiry_id = ? ORDER BY returned_at DESC LIMIT 1
        `, [inquiryId]);

        const [followup] = await connection.execute(`
            SELECT * FROM device_follow_up_logs WHERE inquiry_id = ? ORDER BY created_at DESC
        `, [inquiryId]);

        // Get employee/updater profiles
        const [employees] = await connection.execute('SELECT id, full_name FROM profiles');
        const employeeMap = new Map(employees.map(e => [e.id, e.full_name]));

        res.json({
            inquiry: inquiry[0] || {},
            device_taken_logs: taken.length > 0 ? {
                ...taken[0],
                profiles: { full_name: employeeMap.get(taken[0].employee_id) || 'Unknown' }
            } : null,
            device_return_logs: returned[0] || null,
            device_follow_up_logs: followup.map(f => ({
                ...f,
                profiles: { full_name: employeeMap.get(f.updated_by) || 'Unknown' }
            }))
        });
    } catch (error) {
        console.error('Error fetching device status:', error);
        res.status(500).json({ error: error.message || 'Could not fetch status' });
    } finally {
        if (connection) connection.release();
    }
});

// Get all device tracking data
app.get('/api/device-tracking/all', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    let connection;
    try {
        connection = await getConn();

        // Get all inquiries with device tracking
        const [inquiries] = await connection.execute(`
            SELECT
                i.id,
                i.ticket_no,
                i.full_name,
                i.phone,
                i.service_item,
                i.device_status,
                i.follow_up_status,
                i.status,
                i.created_at
            FROM inquiries i
            ORDER BY i.created_at DESC
        `);

        // Get all device logs
        const [deviceTaken] = await connection.execute('SELECT * FROM device_taken_logs');
        const [deviceReturn] = await connection.execute('SELECT * FROM device_return_logs');
        const [deviceFollowup] = await connection.execute('SELECT * FROM device_follow_up_logs');

        // Get employee names for device taken logs
        const [employees] = await connection.execute('SELECT id, full_name FROM profiles WHERE role = "employee"');
        const employeeMap = new Map(employees.map(e => [e.id, e.full_name]));

        // Only inquiries whose device was actually taken belong on this screen.
        const takenInquiryIds = new Set(deviceTaken.map(dt => dt.inquiry_id));

        // Combine data
        const result = inquiries
            .filter(inq => takenInquiryIds.has(inq.id))
            .map(inq => {
                const taken = deviceTaken.filter(dt => dt.inquiry_id === inq.id);
                const returned = deviceReturn.filter(dr => dr.inquiry_id === inq.id);
                const followup = deviceFollowup.filter(df => df.inquiry_id === inq.id);

                return {
                    ...inq,
                    device_taken_logs: taken.map(t => ({
                        ...t,
                        profiles: { full_name: employeeMap.get(t.employee_id) || 'Unknown' }
                    })),
                    device_return_logs: returned,
                    device_follow_up_logs: followup.map(f => ({
                        ...f,
                        profiles: { full_name: employeeMap.get(f.updated_by) || 'Unknown' }
                    }))
                };
            });

        res.json(result);
    } catch (error) {
        console.error('Error fetching device tracking:', error);
        res.status(500).json({ error: error.message || 'Could not fetch device tracking data' });
    } finally {
        if (connection) connection.release();
    }
});

// Device Tracking Endpoints
app.post('/api/device-tracking/taken', authenticateToken, async (req, res) => {
    const { inquiry_id, description, device_image_url } = req.body;
    const employee_id = req.user.id;

    if (!inquiry_id) return res.status(400).json({ error: 'inquiry_id required' });

    let connection;
    try {
        connection = await getConn();
        const logId = uuidv4();
        if (!(await canAccessInquiry(connection, req.user, inquiry_id))) {
            return res.sendStatus(403);
        }

        await connection.execute(
            `INSERT INTO device_taken_logs (id, inquiry_id, employee_id, device_description, device_image_url, taken_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [logId, inquiry_id, employee_id, description || null, device_image_url || null]
        );

        // Update inquiry device_status
        await connection.execute(
            'UPDATE inquiries SET device_status = ? WHERE id = ?',
            ['taken', inquiry_id]
        );

        res.json({ id: logId, message: 'Device taken logged successfully' });
    } catch (error) {
        console.error('Device taken log error:', error);
        res.status(500).json({ error: error.message || 'Could not log device taken' });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/device-tracking/return', authenticateToken, async (req, res) => {
    const { inquiry_id, device_condition, return_notes, return_image_url } = req.body;

    if (!inquiry_id) return res.status(400).json({ error: 'inquiry_id required' });

    let connection;
    try {
        connection = await getConn();
        const logId = uuidv4();
        if (!(await canAccessInquiry(connection, req.user, inquiry_id))) {
            return res.sendStatus(403);
        }

        await connection.execute(
            `INSERT INTO device_return_logs (id, inquiry_id, device_condition, return_notes, return_image_url, returned_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [logId, inquiry_id, device_condition || 'good', return_notes || null, return_image_url || null]
        );

        // Update inquiry device_status
        await connection.execute(
            'UPDATE inquiries SET device_status = ? WHERE id = ?',
            ['returned', inquiry_id]
        );

        res.json({ id: logId, message: 'Device return logged successfully' });
    } catch (error) {
        console.error('Device return log error:', error);
        res.status(500).json({ error: error.message || 'Could not log device return' });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/device-tracking/followup', authenticateToken, async (req, res) => {
    const { inquiry_id, status, notes } = req.body;
    const updated_by = req.user.id;

    if (!inquiry_id || !status) return res.status(400).json({ error: 'inquiry_id and status required' });

    let connection;
    try {
        connection = await getConn();
        const logId = uuidv4();
        if (!(await canAccessInquiry(connection, req.user, inquiry_id))) {
            return res.sendStatus(403);
        }

        await connection.execute(
            `INSERT INTO device_follow_up_logs (id, inquiry_id, status, notes, updated_by)
             VALUES (?, ?, ?, ?, ?)`,
            [logId, inquiry_id, status, notes || null, updated_by]
        );

        // Update inquiry follow_up_status
        await connection.execute(
            'UPDATE inquiries SET follow_up_status = ? WHERE id = ?',
            [status, inquiry_id]
        );

        res.json({ id: logId, message: 'Follow-up status updated successfully' });
    } catch (error) {
        console.error('Device follow-up log error:', error);
        res.status(500).json({ error: error.message || 'Could not update follow-up status' });
    } finally {
        if (connection) connection.release();
    }
});

// Update password
app.post('/api/auth/update-password', authenticateToken, async (req, res) => {
    const { password } = req.body;
    const userId = req.user.id;

    if (!password || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const connection = await getConn();
        await connection.execute(
            'UPDATE auth_users SET password_hash = ? WHERE id = ?',
            [passwordHash, userId]
        );
        connection.release();
        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Password update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- DATABASE ROUTES ---

app.get('/api/profiles/:id', authenticateToken, async (req, res) => {
    try {
        const connection = await getConn();
        const [rows] = await connection.execute('SELECT * FROM profiles WHERE id = ?', [req.params.id]);
        connection.release();
        res.json(rows[0]);
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Basic endpoint to handle generic Supabase-like queries (Simplified)
app.get('/api/data/:table', dataAuth, async (req, res) => {
    const { table } = req.params;
    const { order, in: inFilter } = req.query;
    const eqs = Array.isArray(req.query.eq) ? req.query.eq : (req.query.eq ? [req.query.eq] : []);
    const parsedEqs = parseEqFilters(eqs);
    const eqErr = parsedEqs.find(e => e.error)?.error;
    if (eqErr) return res.status(400).json({ error: eqErr });

    // Parse + validate the select clause. Column tokens must be plain identifiers —
    // rejects any attempt to smuggle SQL through `?select=*,(SELECT password_hash...)`.
    const parsed = parseSelectClause(req.query.select);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { columns: selectCols, relations } = parsed;

    try {
        const connection = await getConn();
        // selectCols is either the literal '*' (built into the SQL) or a list of validated
        // identifiers; identifiers go through `??` for proper escaping.
        const selectSql = selectCols === '*' ? '*' : selectCols.map(() => '??').join(', ');
        let query = `SELECT ${selectSql} FROM ??`;
        let params = selectCols === '*' ? [table] : [...selectCols, table];

        let whereClauses = [];
        parsedEqs.forEach(({ field, value }) => {
            whereClauses.push('?? = ?');
            params.push(field, value);
        });
        if (inFilter) {
            const idx = inFilter.indexOf(':');
            const field = inFilter.slice(0, idx);
            const valuesStr = inFilter.slice(idx + 1);
            if (!SAFE_IDENT_RE.test(field)) return res.status(400).json({ error: `Invalid filter column: ${field}` });
            const values = valuesStr.split(',');
            whereClauses.push(`?? IN (${values.map(() => '?').join(', ')})`);
            params.push(field, ...values);
        }
        const scopeErr = appendRoleScope({ table, user: req.user, method: 'GET', whereClauses, params });
        if (scopeErr?.error) {
            connection.release();
            return res.status(403).json({ error: scopeErr.error });
        }

        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }

        if (order) {
            const [field, direction] = order.split(':');
            if (!SAFE_IDENT_RE.test(field)) {
                connection.release();
                return res.status(400).json({ error: `Invalid order column: ${field}` });
            }
            query += ' ORDER BY ?? ' + (direction === 'desc' ? 'DESC' : 'ASC');
            params.push(field);
        }

        const [rows] = await connection.query(query, params);

        // Fetch relations if requested
        if (relations.length > 0 && rows.length > 0) {
            for (const rel of relations) {
                const { relTable, relFields } = rel;
                
                // Case A: relTable has the FK (One-to-Many / Child Join)
                // e.g. tickets (table) -> inquiries (relTable), inquiries has ticket_id
                let fkInRel = null;
                if (relTable === 'inquiries' && table === 'tickets') fkInRel = 'ticket_id';
                else if (relTable === 'ticket_comments' && table === 'tickets') fkInRel = 'ticket_id';
                else if (relTable === 'feedback' && table === 'tickets') fkInRel = 'ticket_id';
                else if (relTable === 'feedback' && table === 'inquiries') fkInRel = 'inquiry_id';
                
                if (fkInRel) {
                    const ids = rows.map(r => r.id);
                    const relSelect = fieldsWithRequired(relFields, fkInRel);
                    const relSelectParams = relSelect === '*' ? [] : relFields.split(',').map(f => f.trim()).filter(Boolean).concat(
                        relFields.split(',').map(f => f.trim()).filter(Boolean).includes(fkInRel) ? [] : [fkInRel]
                    );
                    const [relRows] = await connection.query(
                        `SELECT ${relSelect} FROM ?? WHERE ?? IN (${ids.map(() => '?').join(', ')})`,
                        [...relSelectParams, relTable, fkInRel, ...ids]
                    );
                    rows.forEach(row => {
                        row[relTable] = relRows.filter(r => r[fkInRel] === row.id);
                    });
                    continue;
                }

                // Case B: table has the FK (Many-to-One / Parent Join)
                // e.g. attendance (table) -> profiles (relTable), attendance has user_id
                let fkInTable = null;
                if (table === 'attendance' && relTable === 'profiles') fkInTable = 'user_id';
                else if (table === 'tickets' && relTable === 'profiles') fkInTable = 'assigned_to';
                else if (table === 'inquiries' && relTable === 'profiles') fkInTable = 'assigned_employee_id';
                else if (table === 'eod_reports' && relTable === 'profiles') fkInTable = 'employee_id';
                else if (table === 'leave_requests' && relTable === 'profiles') fkInTable = 'employee_id';
                else if (table === 'ticket_comments' && relTable === 'profiles') fkInTable = 'user_id';
                else if (table === 'training_completions' && relTable === 'profiles') fkInTable = 'employee_id';
                else if (table === 'training_completions' && relTable === 'training_items') fkInTable = 'item_id';
                
                if (fkInTable) {
                    const ids = [...new Set(rows.map(r => r[fkInTable]).filter(Boolean))];
                    if (ids.length === 0) {
                        rows.forEach(row => row[relTable] = null);
                        continue;
                    }
                    const relSelect = fieldsWithRequired(relFields, 'id');
                    const relSelectParams = relSelect === '*' ? [] : relFields.split(',').map(f => f.trim()).filter(Boolean).concat(
                        relFields.split(',').map(f => f.trim()).filter(Boolean).includes('id') ? [] : ['id']
                    );
                    const [relRows] = await connection.query(
                        `SELECT ${relSelect} FROM ?? WHERE id IN (${ids.map(() => '?').join(', ')})`,
                        [...relSelectParams, relTable, ...ids]
                    );
                    rows.forEach(row => {
                        row[relTable] = relRows.find(r => r.id === row[fkInTable]) || null;
                    });
                    continue;
                }
            }
        }

        connection.release();
        res.json(rows);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: error.message });
    }
});

app.patch('/api/data/:table', dataAuth, async (req, res) => {
    const { table } = req.params;
    const eqs = Array.isArray(req.query.eq) ? req.query.eq : (req.query.eq ? [req.query.eq] : []);
    const data = req.body;

    if (eqs.length === 0) return res.status(400).json({ error: 'Filter required for update' });
    const keyErr = assertSafeObjectKeys(data);
    if (keyErr) return res.status(400).json({ error: keyErr });
    const parsedEqs = parseEqFilters(eqs);
    const eqErr = parsedEqs.find(e => e.error)?.error;
    if (eqErr) return res.status(400).json({ error: eqErr });

    // Block non-admins from setting privileged columns (role, salary, password_hash).
    if (req.user.role !== 'admin') {
        let allowedErr = null;
        if (table === 'service_pricing' && req.user.role === 'employee') {
            try {
                const connection = await getConn();
                const [profRows] = await connection.execute(
                    'SELECT can_add_service FROM profiles WHERE id = ? LIMIT 1',
                    [req.user.id]
                );
                connection.release();
                const canAddService = profRows[0] && profRows[0].can_add_service === 1;
                if (!canAddService) {
                    return res.status(403).json({ error: 'Only users with Add Service access can modify service pricing' });
                }
            } catch (err) {
                return res.status(500).json({ error: 'Access check failed' });
            }
        } else if (table === 'profiles' && req.user.role === 'employee') {
            try {
                const connection = await getConn();
                const [profRows] = await connection.execute(
                    'SELECT can_update_profile FROM profiles WHERE id = ? LIMIT 1',
                    [req.user.id]
                );
                connection.release();
                const canUpdateProfile = profRows[0] && profRows[0].can_update_profile === 1;
                if (!canUpdateProfile) {
                    return res.status(403).json({ error: 'Profile updates require admin access' });
                }
            } catch (err) {
                return res.status(500).json({ error: 'Access check failed' });
            }
            allowedErr = assertAllowedFields(table, data, EMPLOYEE_WRITE_FIELDS[table]);
            if (allowedErr) return res.status(403).json({ error: allowedErr });
        } else {
            allowedErr = assertAllowedFields(table, data, EMPLOYEE_WRITE_FIELDS[table]);
            if (req.user.role !== 'public' && allowedErr) return res.status(403).json({ error: allowedErr });
        }
        const restricted = ADMIN_ONLY_WRITE_COLUMNS[table];
        if (restricted) {
            const blocked = Object.keys(data || {}).filter(k => restricted.has(k) || restricted.has('*'));
            if (blocked.length) {
                return res.status(403).json({ error: `Not allowed to update: ${blocked.join(', ')}` });
            }
        }
    }

    try {
        const connection = await getConn();
        const keys = Object.keys(data);
        const values = Object.values(data);
        const setClause = keys.map(() => `?? = ?`).join(', ');

        const whereClauses = [];
        const whereParams = [];
        parsedEqs.forEach(({ field, value }) => {
            whereClauses.push('?? = ?');
            whereParams.push(field, value);
        });
        const scopeErr = appendRoleScope({ table, user: req.user, method: 'PATCH', whereClauses, params: whereParams });
        if (scopeErr?.error) {
            connection.release();
            return res.status(403).json({ error: scopeErr.error });
        }
        if (req.user.role === 'public' && table === 'inquiries') {
            whereClauses.push('feedback_rating IS NULL');
        }

        const query = `UPDATE ?? SET ${setClause} WHERE ${whereClauses.join(' AND ')}`;

        const params = [table];
        keys.forEach((k, i) => {
            params.push(k, values[i]);
        });
        params.push(...whereParams);

        await connection.query(query, params);

        // Fetch the updated rows so subscribers can update their cached view.
        let updatedRows = [];
        try {
            const selectWhere = whereClauses.join(' AND ');
            const [rows] = await connection.query(
                `SELECT * FROM ?? WHERE ${selectWhere}`,
                [table, ...whereParams]
            );
            updatedRows = rows;
        } catch { /* fall through, broadcast at least the patch */ }

        connection.release();
        updatedRows.forEach(row => broadcastChange('UPDATE', table, row));
        if (updatedRows.length === 0) broadcastChange('UPDATE', table, { ...data, _filter: eqs });

        // Trigger notification SMS based on what changed in the inquiry.
        if (table === 'inquiries' && updatedRows.length > 0) {
            const row = updatedRows[0];

            // Manual / cash "Mark Paid" doesn't go through markTicketPaid, so raise
            // the in-app admin notification here too.
            if (data.payment_status === 'paid') {
                const payAmount = row.bill_total || row.bill_amount || 0;
                const method = (data.payment_method || row.payment_method || '').toLowerCase().includes('cash') ? 'Cash' : 'Online';
                recordNotification({
                    subject: 'payment_received',
                    title: `💰 Payment Received (${method})`,
                    body: `${row.full_name || 'Client'} paid ₹${Math.round(Number(payAmount) || 0)} via ${method} for ticket ${row.ticket_no || ''}`,
                    audience: { role: 'admin' },
                    data: { ticket_no: row.ticket_no, inquiry_id: row.id, amount: Math.round(Number(payAmount) || 0), method },
                }).catch(() => {});
            }

            // Any manual/admin/cash payment completion should also notify the client.
            // Template variables: {customer_name} {amount} {ticket_no} {bill_no} {feedback_link}
            if (data.payment_status === 'paid' && row.phone) {
                const amount = row.bill_total || row.bill_amount || 0;
                const smsConn = await getConn();
                const feedbackToken = await createFeedbackToken(smsConn, row.id);
                smsConn.release();
                const feedbackLink = feedbackToken ? feedbackLinkFromToken(feedbackToken, req) : publicBaseUrl(req);
                smsNotify(row.phone, 'SMS_TID_PAYMENT', [
                    smsVar(row.full_name, 'Customer', 60),
                    smsVar(`Rs.${Math.round(Number(amount) || 0)}`, 'Rs.0', 20),
                    smsVar(row.ticket_no, 'N/A', 20),
                    smsVar(row.bill_no, 'N/A', 30),
                    smsVar(feedbackLink, publicBaseUrl(req), 140),
                ]);
            }

            // Admin assigns employee → SMS to employee with full job details
            // Template variables: {ticket_no} {service_item} {customer_name} {customer_phone} {location}
            // Fire when PATCH set assigned_employee_id, OR when the row currently
            // has one and the assignment_status was just bumped to 'pending'
            // (catches reassigns where the same empId is reapplied).
            const empIdToNotify = data.assigned_employee_id
                || (data.assignment_status === 'pending' && row.assigned_employee_id);
            if (empIdToNotify) {
                console.log(`[SMS SMS_TID_ASSIGN_EMP] trigger → empId=${empIdToNotify} ticket=${row.ticket_no} (patch keys: ${Object.keys(data).join(',')})`);
                recordNotification({
                    subject: 'new_assignment',
                    title: '📋 New Assignment',
                    body: `${row.full_name || 'A client'} — ${row.service_item || 'service request'}${row.ticket_no ? ` (${row.ticket_no})` : ''}`,
                    audience: { userId: empIdToNotify },
                    data: { inquiry_id: row.id, ticket_no: row.ticket_no },
                }).catch(() => {});
                (async () => {
                    try {
                        const conn = await getConn();
                        const [emp] = await conn.execute(
                            'SELECT phone, full_name FROM profiles WHERE id = ? LIMIT 1',
                            [empIdToNotify]
                        );
                        conn.release();
                        console.log(`[SMS SMS_TID_ASSIGN_EMP] employee lookup → ${JSON.stringify(emp[0] || null)}`);
                        if (emp[0]?.phone) {
                            smsNotify(emp[0].phone, 'SMS_TID_ASSIGN_EMP', [
                                smsVar(row.ticket_no, 'N/A', 20),
                                smsVar(row.service_item, 'General Service', 80),
                                smsVar(row.full_name, 'Customer', 60),
                                smsPhoneVar(row.phone),
                                smsVar(row.location, 'See app', 100),
                            ]);
                        } else {
                            console.warn(`[SMS SMS_TID_ASSIGN_EMP] skipped: employee ${empIdToNotify} has no phone (row=${JSON.stringify(emp[0] || null)})`);
                        }
                    } catch (err) {
                        console.error('[SMS SMS_TID_ASSIGN_EMP] db error:', err.message, err.stack);
                    }
                })();
            }

            // Employee accepts assignment → SMS to client with technician contact
            // Template variables: {ticket_no} {emp_name} {emp_phone}
            if (data.assignment_status === 'accepted' && row.phone && row.assigned_employee_id) {
                (async () => {
                    try {
                        const conn = await getConn();
                        const [emp] = await conn.execute(
                            'SELECT phone, full_name FROM profiles WHERE id = ? LIMIT 1',
                            [row.assigned_employee_id]
                        );
                        conn.release();
                        smsNotify(row.phone, 'SMS_TID_ACCEPTED', [
                            smsVar(row.ticket_no, 'N/A', 20),
                            smsVar(emp[0]?.full_name, 'our technician', 60),
                            smsPhoneVar(emp[0]?.phone),
                        ]);
                    } catch (err) {
                        console.error('[SMS SMS_TID_ACCEPTED]', err.message);
                    }
                })();
            }
        }

        // Complaint admin_response updated → SMS to client with ticket no and reply
        // Template variables: {ticket_no} {admin_response}
        let smsResult = null;
        if (table === 'complaints' && data.admin_response && updatedRows.length > 0) {
            const row = updatedRows[0];
            if (row.phone) {
                smsResult = await smsNotifyResult(row.phone, 'SMS_TID_COMPLAINT', [
                    smsVar(row.ticket_no, 'N/A', 20),
                    smsVar(data.admin_response, 'We are checking your complaint', 120),
                ]);
            } else {
                smsResult = { ok: false, error: 'Complaint has no phone number' };
            }
        }

        if (table === 'attendance' && data.clock_out && updatedRows.length > 0) {
            updatedRows.forEach(row => {
                broadcastNotify({
                    subject: 'employee_clock_out',
                    title: 'Employee Clocked Out',
                    body: row.location ? `Last location: ${String(row.location).slice(0, 90)}` : 'Employee is offline',
                    audience: { role: 'admin' },
                    data: { user_id: row.user_id, attendance_id: row.id || null },
                });
            });
        }

        res.json({ success: true, sms: smsResult });
    } catch (error) {
        console.error('Error updating data:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/data/:table', dataAuth, async (req, res) => {
    const { table } = req.params;
    const eqs = Array.isArray(req.query.eq) ? req.query.eq : (req.query.eq ? [req.query.eq] : []);

    if (eqs.length === 0) return res.status(400).json({ error: 'Filter required for delete' });
    const parsedEqs = parseEqFilters(eqs);
    const eqErr = parsedEqs.find(e => e.error)?.error;
    if (eqErr) return res.status(400).json({ error: eqErr });
    // Only admins can delete via the generic endpoint — stops an employee from
    // wiping rows they happen to have ids for.
    // Exception: Allow employees with can_add_service = 1 to delete service_pricing records.
    if (req.user.role !== 'admin') {
        if (table === 'service_pricing' && req.user.role === 'employee') {
            try {
                const connection = await getConn();
                const [profRows] = await connection.execute(
                    'SELECT can_add_service FROM profiles WHERE id = ? LIMIT 1',
                    [req.user.id]
                );
                connection.release();
                const canAddService = profRows[0] && profRows[0].can_add_service === 1;
                if (!canAddService) {
                    return res.status(403).json({ error: 'Only users with Add Service access can modify service pricing' });
                }
            } catch (err) {
                return res.status(500).json({ error: 'Access check failed' });
            }
        } else {
            return res.status(403).json({ error: 'Admin only' });
        }
    }

    try {
        const connection = await getConn();

        const whereClauses = [];
        const whereParams = [];
        parsedEqs.forEach(({ field, value }) => {
            whereClauses.push('?? = ?');
            whereParams.push(field, value);
        });

        // Capture rows being deleted so we can broadcast their ids to subscribers.
        let deletedRows = [];
        try {
            const [rows] = await connection.query(
                `SELECT * FROM ?? WHERE ${whereClauses.join(' AND ')}`,
                [table, ...whereParams]
            );
            deletedRows = rows;
        } catch { /* ignore — proceed with delete */ }

        const query = `DELETE FROM ?? WHERE ${whereClauses.join(' AND ')}`;
        const [result] = await connection.query(query, [table, ...whereParams]);
        connection.release();

        deletedRows.forEach(row => broadcastChange('DELETE', table, row));
        res.json({ success: true, affectedRows: result.affectedRows || 0 });
    } catch (error) {
        console.error('Error deleting data:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/data/:table', rateLimit({ windowMs: 60_000, max: 30, key: 'data-post' }), dataAuth, async (req, res) => {
    const { table } = req.params;
    const input = req.body;
    const rowsToInsert = Array.isArray(input) ? input : [input];
    if (!rowsToInsert.length) return res.status(400).json({ error: 'No rows provided' });
    for (const row of rowsToInsert) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            return res.status(400).json({ error: 'Invalid row payload' });
        }
        if (!row.id) row.id = uuidv4();
        const keyErr = assertSafeObjectKeys(row);
        if (keyErr) return res.status(400).json({ error: keyErr });
    }

    const data = rowsToInsert[0];
    if (req.user?.role === 'public') {
        if (rowsToInsert.length > 1) return res.status(400).json({ error: 'Bulk public inserts are not supported' });
        if (table === 'inquiries') {
            const blocked = Object.keys(data || {}).filter(k => !PUBLIC_INQUIRY_CREATE_FIELDS.has(k));
            if (blocked.length) return res.status(403).json({ error: `Not allowed to set: ${blocked.join(', ')}` });
            data.status = 'open';
            data.assignment_status = 'none';
        } else if (table === 'complaints') {
            const blocked = Object.keys(data || {}).filter(k => !PUBLIC_COMPLAINT_CREATE_FIELDS.has(k));
            if (blocked.length) return res.status(403).json({ error: `Not allowed to set: ${blocked.join(', ')}` });
            if (!data.ticket_no || !data.phone || !data.complaint_text) {
                return res.status(400).json({ error: 'ticket_no, phone, and complaint_text are required' });
            }
            if (String(data.complaint_text).length > 2000) {
                return res.status(400).json({ error: 'Complaint is too long (max 2000 chars)' });
            }
            // Verify the ticket belongs to this phone before letting an anonymous
            // user attach a complaint to it.
            try {
                const conn = await getConn();
                const [rows] = await conn.execute(
                    'SELECT id FROM inquiries WHERE ticket_no = ? AND phone = ? LIMIT 1',
                    [data.ticket_no, data.phone]
                );
                conn.release();
                if (!rows.length) {
                    return res.status(404).json({ error: 'No ticket found for that number and phone' });
                }
                data.inquiry_id = rows[0].id;
            } catch (err) {
                console.error('Complaint ownership check failed:', err);
                return res.status(500).json({ error: 'Ticket verification failed' });
            }
            data.status = 'open';
            data.admin_response = null;
            data.resolved_at = null;
        } else {
            return res.status(403).json({ error: 'Forbidden' });
        }
    }

    // Same admin-only column guard as PATCH — a non-admin upsert that includes a
    // privileged column (role/salary) would otherwise silently elevate.
    if (req.user.role !== 'admin') {
        const restricted = ADMIN_ONLY_WRITE_COLUMNS[table];
        if (restricted) {
            const blocked = [...new Set(rowsToInsert.flatMap(row =>
                Object.keys(row || {}).filter(k => restricted.has(k) || restricted.has('*'))
            ))];
            if (blocked.length) {
                return res.status(403).json({ error: `Not allowed to set: ${blocked.join(', ')}` });
            }
        }
    }

    try {
        const connection = await getConn();
        for (const row of rowsToInsert) {
            const authErr = await assertEmployeeInsertAllowed(connection, table, req.user, row);
            if (authErr) {
                connection.release();
                return res.status(403).json({ error: authErr });
            }
            if (table === 'attendance' && req.user.role === 'employee' && row.clock_in && !row.clock_out) {
                const now = new Date();
                const cutoffLabel = parseAutoClockOutTime().label;
                if (isAfterAutoClockOutCutoff(now)) {
                    connection.release();
                    return res.status(403).json({ error: `Clock-in is closed after ${cutoffLabel}. Please contact admin.` });
                }
                const rowDate = dbDateKey(row.date || now);
                const [existingRows] = await connection.execute(
                    'SELECT id, clock_out FROM attendance WHERE user_id = ? AND date = ? AND clock_in IS NOT NULL LIMIT 1',
                    [row.user_id, rowDate]
                );
                if (existingRows.length > 0) {
                    connection.release();
                    return res.status(403).json({ error: 'You have already clocked in today. A second clock-in is not allowed after clock-out.' });
                }
            }
            const keys = Object.keys(row);
            const values = Object.values(row);
            const placeholders = keys.map(() => '?').join(', ');

            // Build ON DUPLICATE KEY UPDATE clause
            const updateClause = keys.map(k => `?? = VALUES(??)`).join(', ');
            const updateParams = keys.flatMap(k => [k, k]);

            const query = `INSERT INTO ?? (??) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
            const params = [table, keys, ...values, ...updateParams];

            await connection.query(query, params);
        }
        connection.release();
        rowsToInsert.forEach(row => broadcastChange('INSERT', table, row));
        if (table === 'inquiries') {
            rowsToInsert.forEach(inquiry => {
                broadcastNotify({
                    subject: 'new_service_request',
                    title: 'New Service Request',
                    body: `${inquiry.full_name || 'Client'}${inquiry.service_item ? ' - ' + inquiry.service_item : ''}`,
                    audience: { role: 'admin' },
                    data: { inquiry_id: inquiry.id, ticket_no: inquiry.ticket_no || null },
                });
                // SMS to client: {name} {ticket_no} {service_item} {sla_deadline}
                if (inquiry.phone && inquiry.ticket_no) {
                    const slaDeadlineText = formatSlaDeadlineForSms(calculateSlaDeadline(inquiry.created_at || new Date()));
                    smsNotify(inquiry.phone, 'SMS_TID_TICKET', [
                        smsVar(inquiry.full_name, 'Customer', 60),
                        smsVar(inquiry.ticket_no, 'N/A', 20),
                        smsVar(inquiry.service_item, 'General Service', 80),
                        smsVar(slaDeadlineText, 'As soon as possible', 40),
                    ]);
                } else {
                    console.warn(`[SMS SMS_TID_TICKET] skipped: inquiry missing phone or ticket_no (id=${inquiry.id || 'unknown'})`);
                }
                if (!inquiry.assigned_employee_id) {
                    autoAssignInquiry(inquiry.id);
                }
            });
        }
            // SMS → client: ticket confirmed with ticket no, service type, preferred time
        if (table === 'complaints') {
            broadcastNotify({
                subject: 'new_complaint',
                title: 'New Complaint Filed',
                body: `Ticket ${data.ticket_no} — ${String(data.complaint_text || '').slice(0, 80)}`,
                audience: { role: 'admin' },
                data: { complaint_id: data.id, ticket_no: data.ticket_no, inquiry_id: data.inquiry_id || null },
            });
        }
        if (table === 'attendance' && data.clock_in && !data.clock_out) {
            broadcastNotify({
                subject: 'employee_clock_in',
                title: 'Employee Clocked In',
                body: data.location ? `Clock-in location: ${String(data.location).slice(0, 90)}` : 'Employee is online',
                audience: { role: 'admin' },
                data: { user_id: data.user_id, attendance_id: data.id || null },
            });
        }
        res.status(201).json(Array.isArray(input) ? rowsToInsert : data);
    } catch (error) {
        console.error('Error inserting/upserting data:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/auto-assignment/status', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    let connection;
    try {
        connection = await getConn();
        const queue = await getTodayQueue(connection);
        const today = dbDateKey(new Date());

        let countMap = {};
        if (queue.length) {
            const [countRows] = await connection.execute(
                `SELECT employee_id, COUNT(*) AS cnt
                   FROM auto_assignment_logs
                  WHERE DATE(assigned_at) = ?
                    AND employee_id IN (${queue.map(() => '?').join(',')})
                  GROUP BY employee_id`,
                [today, ...queue.map(e => e.id)]
            );
            countRows.forEach(r => { countMap[r.employee_id] = Number(r.cnt); });
        }

        const [totals] = await connection.execute(
            `SELECT COUNT(*) AS total FROM auto_assignment_logs WHERE DATE(assigned_at) = ?`,
            [today]
        );

        let nextEmployee = null;
        if (queue.length) {
            let chosen = queue[0];
            let minCount = countMap[queue[0].id] ?? 0;
            for (let i = 1; i < queue.length; i++) {
                const c = countMap[queue[i].id] ?? 0;
                if (c < minCount) {
                    minCount = c;
                    chosen = queue[i];
                }
            }
            nextEmployee = chosen;
        }

        res.json({
            queue: queue.map((e, i) => ({
                ...e,
                queue_position: i + 1,
                assignments_today: countMap[e.id] ?? 0,
                is_next: nextEmployee?.id === e.id,
            })),
            total_today: Number(totals[0].total),
            next_employee_id: nextEmployee?.id || null,
            auto_assignment_enabled: appSettings.autoAssignmentEnabled,
        });
    } catch (err) {
        console.error('[AutoAssign status]', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

app.put('/api/auto-assignment/status', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { enabled } = req.body;
    if (enabled === undefined) {
        return res.status(400).json({ error: 'Field "enabled" is required' });
    }
    const isEnabled = enabled === true || enabled === 1 || enabled === '1' || enabled === 'true';
    try {
        await saveAppSetting('auto_assignment_enabled', isEnabled ? '1' : '0');
        appSettings.autoAssignmentEnabled = isEnabled;
        if (isEnabled) {
            autoAssignUnassignedInquiries().catch(err => console.error('[AutoAssign] background error:', err));
        }
        res.json({ auto_assignment_enabled: appSettings.autoAssignmentEnabled });
    } catch (error) {
        console.error('[AutoAssign toggle]', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/auto-assignment/logs', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    let connection;
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const offset = parseInt(req.query.offset, 10) || 0;
        const dateFilter = req.query.date;
        connection = await getConn();
        let where = '';
        const params = [];
        if (dateFilter) {
            where = 'WHERE DATE(l.assigned_at) = ?';
            params.push(dateFilter);
        }
        const [rows] = await connection.execute(
            `SELECT l.id, l.inquiry_id, l.employee_id, l.assigned_at, l.queue_position,
                    p.full_name AS employee_name,
                    i.ticket_no, i.full_name AS customer_name, i.service_item, i.status AS inquiry_status
               FROM auto_assignment_logs l
               JOIN profiles p ON p.id = l.employee_id
               JOIN inquiries i ON i.id = l.inquiry_id
             ${where}
             ORDER BY l.assigned_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        const [totalRows] = await connection.execute(
            `SELECT COUNT(*) AS total FROM auto_assignment_logs l ${where}`,
            params
        );
        res.json({ logs: rows, total: Number(totalRows[0].total), limit, offset });
    } catch (err) {
        console.error('[AutoAssign logs]', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- PAYMENT ROUTES ---

app.post('/api/payments/create-link', authenticateToken, async (req, res) => {
    const { amount, description, customer, ticket_no } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Valid amount is required' });
    }

    if (!razorpay) {
        return res.status(503).json({ error: 'Payment gateway not configured. Please add Razorpay keys to .env file.' });
    }

    try {
        const options = {
            amount: Math.round(amount * 100), // amount in the smallest currency unit (paise)
            currency: 'INR',
            accept_partial: false,
            description: description || `Payment for Ticket ${ticket_no}`,
            customer: {
                name: customer?.name || 'Customer',
                contact: customer?.phone || '',
                email: customer?.email || ''
            },
            notify: {
                sms: true,
                whatsapp: true
            },
            reminder_enable: true,
            notes: {
                ticket_no: ticket_no
            }
        };

        const paymentLink = await razorpay.paymentLink.create(options);
        res.json({ id: paymentLink.id, short_url: paymentLink.short_url });
    } catch (error) {
        console.error('Razorpay Error:', error);
        res.status(500).json({ error: error.description || error.message || 'Failed to create payment link' });
    }
});

app.post('/api/payments/check-status', authenticateToken, async (req, res) => {
    const { inquiry_id } = req.body || {};
    if (!inquiry_id) return res.status(400).json({ error: 'inquiry_id is required' });
    if (!razorpay) return res.status(503).json({ error: 'Payment gateway not configured.' });

    let connection;
    try {
        connection = await getConn();
        const [rows] = await connection.execute(
            'SELECT id, ticket_no, ticket_id, payment_status, payment_received_at, payment_link_id FROM inquiries WHERE id = ? LIMIT 1',
            [inquiry_id]
        );
        const inquiry = rows[0];
        if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });
        if (inquiry.payment_status === 'paid') {
            return res.json({ payment_status: 'paid', payment_received_at: inquiry.payment_received_at });
        }
        if (!inquiry.payment_link_id) {
            return res.json({ payment_status: inquiry.payment_status || 'unpaid', payment_received_at: inquiry.payment_received_at || null });
        }

        const paymentLink = await razorpay.paymentLink.fetch(inquiry.payment_link_id);
        const isPaid = paymentLink?.status === 'paid' || Number(paymentLink?.amount_paid || 0) > 0;
        if (!isPaid) {
            return res.json({
                payment_status: inquiry.payment_status || 'unpaid',
                payment_received_at: inquiry.payment_received_at || null,
                gateway_status: paymentLink?.status || 'unknown',
            });
        }

        await markTicketPaid(connection, inquiry.ticket_no, paymentLink?.amount_paid);
        const [freshRows] = await connection.execute(
            'SELECT payment_status, payment_received_at FROM inquiries WHERE id = ? LIMIT 1',
            [inquiry_id]
        );
        res.json(freshRows[0] || { payment_status: 'paid' });
    } catch (error) {
        console.error('Razorpay status check failed:', error);
        res.status(500).json({ error: error.description || error.message || 'Failed to check payment status' });
    } finally {
        if (connection) { try { connection.release(); } catch {} }
    }
});

// --- RAZORPAY WEBHOOK (auto-mark payment paid) ---
// Razorpay calls this URL when a payment link is paid.
// Configure this URL in your Razorpay dashboard under Webhooks:
//   https://services.networkingexperts.in/api/webhook/razorpay
// RAZORPAY_WEBHOOK_SECRET MUST be set — without it, any anonymous POST here
// could forge a "payment_link.paid" event and mark a ticket paid for free.
app.post('/api/webhook/razorpay', async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error('[Webhook] RAZORPAY_WEBHOOK_SECRET is not configured — refusing to process webhook');
        return res.status(503).json({ error: 'Webhook not configured' });
    }
    if (!signature) {
        return res.status(400).json({ error: 'Missing signature' });
    }
    // express.raw is registered globally for this path — req.body is a Buffer.
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const crypto = require('crypto');
    const expectedSig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    // Constant-time compare to avoid signature-timing oracles.
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        console.warn('[Webhook] Invalid Razorpay signature');
        return res.status(400).json({ error: 'Invalid signature' });
    }

    let event;
    try { event = JSON.parse(rawBody.toString('utf8')); }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }

    if (event.event === 'payment_link.paid') {
        const notes = event.payload?.payment_link?.entity?.notes || {};
        const ticket_no = notes.ticket_no;
        const amountPaise = event.payload?.payment_link?.entity?.amount_paid
            || event.payload?.payment?.entity?.amount;
        console.log(`[Webhook] Payment received for ticket: ${ticket_no}`);

        if (ticket_no) {
            let connection;
            try {
                connection = await getConn();
                await connection.beginTransaction();

                // Mark inquiry paid and auto-resolve (don't downgrade an already-closed ticket).
                await connection.execute(
                    `UPDATE inquiries
                        SET payment_status = 'paid',
                            payment_received_at = COALESCE(payment_received_at, NOW()),
                            status = CASE WHEN status IN ('resolved','closed','case_closed') THEN status ELSE 'resolved' END
                      WHERE ticket_no = ?`,
                    [ticket_no]
                );

                // Cascade resolve to the linked ticket so the employee dashboard reflects it.
                const [inqRows] = await connection.execute(
                    'SELECT id, ticket_id, assigned_employee_id, full_name, phone, bill_no, bill_amount, bill_total FROM inquiries WHERE ticket_no = ? LIMIT 1',
                    [ticket_no]
                );
                const inqRow = inqRows[0];
                const ticketId = inqRow?.ticket_id;
                if (ticketId) {
                    await connection.execute(
                        `UPDATE tickets
                            SET status = CASE WHEN status IN ('resolved','closed','case_closed') THEN status ELSE 'resolved' END
                          WHERE id = ?`,
                        [ticketId]
                    );
                }

                // Re-fetch the full row to broadcast a clean payload.
                const [freshRows] = await connection.execute(
                    'SELECT * FROM inquiries WHERE ticket_no = ? LIMIT 1',
                    [ticket_no]
                );
                await connection.commit();
                console.log(`[Webhook] Marked paid + resolved: ${ticket_no}`);

                // Broadcast DB change + targeted notifications.
                if (freshRows[0]) broadcastChange('UPDATE', 'inquiries', freshRows[0]);
                if (ticketId) broadcastChange('UPDATE', 'tickets', { id: ticketId, status: 'resolved' });

                const amount = amountPaise ? Math.round(amountPaise / 100) : (inqRow?.bill_amount || 0);
                await recordNotification({
                    subject: 'payment_received',
                    title: '💰 Payment Received (Online)',
                    body: `${inqRow?.full_name || 'Client'} paid ₹${amount} via Online for ticket ${ticket_no}`,
                    audience: { role: 'admin' },
                    data: { ticket_no, inquiry_id: inqRow?.id, amount, method: 'Online' },
                });
                if (inqRow?.assigned_employee_id) {
                    await recordNotification({
                        subject: 'payment_received',
                        title: '💰 Payment Received',
                        body: `Your ticket ${ticket_no} just got paid! Task auto-resolved.`,
                        audience: { userId: inqRow.assigned_employee_id },
                        data: { ticket_no, inquiry_id: inqRow.id, amount },
                    });
                }

                // SMS → client: payment confirmation
                if (inqRow?.phone) {
                    const billTotal = inqRow.bill_total || inqRow.bill_amount || amount;
                    const feedbackToken = await createFeedbackToken(connection, inqRow.id);
                    const feedbackLink = feedbackToken ? feedbackLinkFromToken(feedbackToken, req) : publicBaseUrl(req);
                    smsNotify(inqRow.phone, 'SMS_TID_PAYMENT', [
                        smsVar(inqRow.full_name, 'Customer', 60),
                        smsVar(`Rs.${Math.round(billTotal)}`, 'Rs.0', 20),
                        smsVar(ticket_no, 'N/A', 20),
                        smsVar(inqRow.bill_no, 'N/A', 30),
                        smsVar(feedbackLink, publicBaseUrl(req), 140),
                    ]);
                }
            } catch (err) {
                if (connection) { try { await connection.rollback(); } catch {} }
                console.error('[Webhook] DB update failed:', err.message);
            } finally {
                if (connection) { try { connection.release(); } catch {} }
            }
        }
    }

    res.json({ status: 'ok' });
});

// --- SERVER-SIDE INVOICE PDF ---
// Renders a premium tax invoice to a PDF Buffer with pdfkit. Built entirely on
// the server so the output is identical every time (no browser/CDN rendering).
// Uses the embedded Noto Sans font so the ₹ glyph renders; falls back to
// Helvetica + "Rs." when the TTFs aren't present.
async function buildInvoicePdfBuffer(billData) {
    if (!PDFDocument) throw new Error('pdfkit not available');
    const d = billData || {};
    const cust = d.customer || {};
    const services = Array.isArray(d.services) ? d.services : [];
    const RUPEE = INVOICE_UNICODE_FONTS ? '₹' : 'Rs. ';
    const inr = (n) => RUPEE + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const GREEN = '#10B981', DGREEN = '#064E3B', DARK = '#0F172A', GRAY = '#6B7280', LIGHT = '#9CA3AF', BORDER = '#E5E7EB', SOFT = '#F9FAFB';

    // Optional payment QR — fetched up front so drawing stays synchronous.
    let qrBuf = null;
    if (d.paymentLink) {
        try {
            const r = await fetch('https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(d.paymentLink));
            if (r.ok) qrBuf = Buffer.from(await r.arrayBuffer());
        } catch { /* QR optional */ }
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    const done = new Promise((resolve, reject) => {
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });

    // Font aliases — Noto Sans (₹-capable) when available, else built-in Helvetica.
    let FONT = 'Helvetica', FONT_BOLD = 'Helvetica-Bold', FONT_OBL = 'Helvetica-Oblique';
    if (INVOICE_UNICODE_FONTS) {
        try {
            doc.registerFont('inv', INVOICE_FONT_REG);
            doc.registerFont('inv-bold', INVOICE_FONT_BOLD);
            FONT = 'inv'; FONT_BOLD = 'inv-bold'; FONT_OBL = 'inv'; // Noto download has no italic
        } catch { /* keep Helvetica */ }
    }

    const M = 40, W = doc.page.width, right = W - M, contentW = W - M * 2;
    const dline = (x1, yy, x2, color, width = 0.5) => { doc.lineWidth(width).strokeColor(color).dash(2, { space: 2 }); doc.moveTo(x1, yy).lineTo(x2, yy).stroke(); doc.undash(); };
    let y = M;

    // Header — brand + logo
    let brandX = M;
    try {
        const logoPath = path.join(__dirname, '..', 'src', 'assets', 'logo.png');
        if (fs.existsSync(logoPath)) { doc.image(logoPath, M, y, { width: 46, height: 46 }); brandX = M + 58; }
    } catch { /* logo optional */ }
    doc.fillColor(DGREEN).font(FONT_BOLD).fontSize(18).text(BUSINESS.name, brandX, y + 2);
    doc.fillColor(GRAY).font(FONT).fontSize(8).text(String(BUSINESS.tagline).toUpperCase(), brandX, y + 25, { characterSpacing: 1 });

    // Header — invoice badge + meta (right)
    const badgeW = 96, badgeX = right - badgeW;
    doc.roundedRect(badgeX, y, badgeW, 18, 9).fill(GREEN);
    doc.fillColor('#ffffff').font(FONT_BOLD).fontSize(9).text('TAX INVOICE', badgeX, y + 5, { width: badgeW, align: 'center' });
    const billNo = 'NX-' + String(cust.ticket_no || Date.now()).slice(-8);
    const t0 = new Date();
    const issued = `${String(t0.getDate()).padStart(2, '0')}/${String(t0.getMonth() + 1).padStart(2, '0')}/${t0.getFullYear()}`;
    doc.fillColor(GRAY).font(FONT).fontSize(9);
    doc.text(`Bill #: ${billNo}`, badgeX - 60, y + 26, { width: badgeW + 60, align: 'right' });
    doc.text(`Date: ${issued}`, badgeX - 60, y + 39, { width: badgeW + 60, align: 'right' });

    y += 60; dline(M, y, right, BORDER); y += 16;

    // Parties — two columns
    const colW = (contentW - 30) / 2, col2X = M + colW + 30, pTop = y;
    doc.fillColor(GREEN).font(FONT_BOLD).fontSize(8).text('BILLED TO', M, y);
    doc.fillColor(DARK).font(FONT_BOLD).fontSize(13).text(cust.name || '-', M, y + 12, { width: colW });
    let ly = doc.y + 1;
    doc.font(FONT).fontSize(10);
    if (cust.phone) { doc.fillColor(GRAY).text(String(cust.phone), M, ly, { width: colW }); ly = doc.y; }
    if (cust.company) { doc.fillColor(GRAY).text(String(cust.company), M, ly, { width: colW }); ly = doc.y; }
    if (cust.location) { doc.fillColor(LIGHT).font(FONT_OBL).text(String(cust.location), M, ly, { width: colW }); }

    doc.fillColor(GREEN).font(FONT_BOLD).fontSize(8).text('SERVICE DETAILS', col2X, pTop);
    let ry = pTop + 14;
    const detail = (label, val) => { if (!val) return; doc.fillColor(GRAY).font(FONT).fontSize(10).text(`${label}: ${val}`, col2X, ry, { width: colW }); ry = doc.y + 2; };
    detail('Ticket', cust.ticket_no);
    detail('Service', cust.service_item);
    detail('Device', cust.device_type);
    detail('Technician', d.technician);

    y = Math.max(doc.y, ry) + 12; dline(M, y, right, BORDER); y += 14;

    // Items table
    const amtW = 110, descX = M + 34, descW = contentW - 34 - amtW;
    doc.rect(M, y, contentW, 22).fill(SOFT);
    doc.lineWidth(1.5).strokeColor(GREEN); doc.moveTo(M, y + 22).lineTo(right, y + 22).stroke();
    doc.fillColor(DGREEN).font(FONT_BOLD).fontSize(9);
    doc.text('#', M + 8, y + 7);
    doc.text('DESCRIPTION', descX, y + 7);
    doc.text('AMOUNT', right - amtW - 8, y + 7, { width: amtW, align: 'right' });
    y += 22;

    const items = services.map((s, i) => ({ idx: i + 1, name: s.name, amt: s.cost }));
    if (Number(d.extra) > 0) items.push({ idx: items.length + 1, name: 'Additional charges' + (d.extraReason ? ` (${d.extraReason})` : ''), amt: d.extra });
    if (!items.length) {
        doc.fillColor(LIGHT).font(FONT).fontSize(10).text('No itemised services', M, y + 8, { width: contentW, align: 'center' });
        y += 28;
    } else {
        items.forEach(r => {
            if (y > doc.page.height - 120) { doc.addPage(); y = M; }
            const h = Math.max(22, doc.heightOfString(String(r.name || ''), { width: descW }) + 12);
            doc.fillColor(LIGHT).font(FONT).fontSize(10).text(String(r.idx), M + 8, y + 6);
            doc.fillColor(DARK).font(FONT).fontSize(10).text(String(r.name || ''), descX, y + 6, { width: descW });
            doc.fillColor(DARK).font(FONT_BOLD).text(inr(r.amt), right - amtW - 8, y + 6, { width: amtW, align: 'right' });
            y += h;
            doc.lineWidth(0.5).strokeColor(BORDER); doc.moveTo(M, y).lineTo(right, y).stroke();
        });
    }
    y += 16;

    // Totals box (right)
    const tRows = [['Services subtotal', inr(d.servicesSubtotal)]];
    if (Number(d.extra) > 0) tRows.push(['Extra charges', inr(d.extra)]);
    tRows.push(['Platform fee', inr(d.platform)]);
    tRows.push(['Transport' + (Number(d.km) > 0 ? ` (${d.km} km)` : ''), inr(d.transport)]);
    if (Number(d.discount) > 0) tRows.push([d.discountLabel || 'Discount', '-' + inr(d.discount), GREEN]);
    const taxIdx = tRows.length; // separator drawn above this row
    tRows.push(['Taxable', inr(d.taxable)]);
    tRows.push(['GST (18%)', inr(d.gst)]);
    const boxW = 270, boxX = right - boxW, pad = 12, lh = 18;
    const boxH = pad + tRows.length * lh + 6 + 34 + pad;
    if (y + boxH > doc.page.height - 70) { doc.addPage(); y = M; }
    doc.roundedRect(boxX, y, boxW, boxH, 10).fill(SOFT);
    let ty = y + pad;
    tRows.forEach((row, i) => {
        if (i === taxIdx) { doc.lineWidth(0.5).strokeColor(BORDER); doc.moveTo(boxX + pad, ty).lineTo(boxX + boxW - pad, ty).stroke(); ty += 5; }
        const color = row[2] || null;
        doc.font(FONT).fontSize(10).fillColor(color || GRAY).text(row[0], boxX + pad, ty, { width: boxW - pad * 2 - 70 });
        doc.font(FONT_BOLD).fillColor(color || DARK).text(row[1], boxX + boxW / 2, ty, { width: boxW / 2 - pad, align: 'right' });
        ty += lh;
    });
    doc.lineWidth(1.5).strokeColor(GREEN); doc.moveTo(boxX + pad, ty + 2).lineTo(boxX + boxW - pad, ty + 2).stroke(); ty += 9;
    doc.font(FONT_BOLD).fontSize(13).fillColor(DGREEN).text('Total', boxX + pad, ty, { width: boxW / 2 });
    doc.fillColor(GREEN).text(inr(d.total), boxX + boxW / 2, ty, { width: boxW / 2 - pad, align: 'right' });
    y += boxH + 18;

    // Payment box (optional)
    if (d.paymentLink) {
        const ph = qrBuf ? 150 : 60;
        if (y + ph > doc.page.height - 80) { doc.addPage(); y = M; }
        doc.lineWidth(1).strokeColor(GREEN).dash(3, { space: 2 }).roundedRect(M, y, contentW, ph, 10).stroke().undash();
        doc.fillColor(DGREEN).font(FONT_BOLD).fontSize(9).text('SECURE PAYMENT', M, y + 12, { width: contentW, align: 'center' });
        if (qrBuf) doc.image(qrBuf, W / 2 - 45, y + 28, { width: 90, height: 90 });
        doc.fillColor('#2563EB').font(FONT).fontSize(8).text(String(d.paymentLink), M + 12, y + (qrBuf ? 124 : 34), { width: contentW - 24, align: 'center' });
        y += ph + 14;
    }

    // Footer (bottom of current page)
    const fy = doc.page.height - 58;
    dline(M, fy, right, BORDER);
    doc.fillColor(GREEN).font(FONT_BOLD).fontSize(11).text('Thank you for your business!', M, fy + 8, { width: contentW, align: 'center' });
    doc.fillColor(GRAY).font(FONT).fontSize(8).text(`${BUSINESS.address}  |  ${BUSINESS.phone}  |  ${BUSINESS.email}`, M, fy + 24, { width: contentW, align: 'center' });
    doc.fillColor(LIGHT).fontSize(7.5).text(`GSTIN: ${BUSINESS.gstin}  |  Computer Generated Invoice`, M, fy + 35, { width: contentW, align: 'center' });

    doc.end();
    return done;
}

// Generate the invoice PDF on the server and return a public URL.
// Body: { billData, inquiry_id?, filename? }
app.post('/api/bills/generate', authenticateToken, express.json({ limit: BILL_UPLOAD_LIMIT }), async (req, res) => {
    if (!PDFDocument) return res.status(501).json({ error: 'Server PDF generation not available' });
    try {
        const { billData, inquiry_id, filename } = req.body || {};
        if (!billData || typeof billData !== 'object') return res.status(400).json({ error: 'billData is required' });
        const buf = await buildInvoicePdfBuffer(billData);
        if (!buf || buf.length < 5) return res.status(500).json({ error: 'PDF generation failed' });

        const token = uuidv4();
        const safeName = (filename || `Invoice-${billData.customer?.ticket_no || 'service'}.pdf`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
        const storedName = `${token}-${safeName.endsWith('.pdf') ? safeName : safeName + '.pdf'}`;
        await fsp.writeFile(path.join(BILLS_DIR, storedName), buf);

        const proto = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const url = `${proto}://${host}/bills/${storedName}`;

        if (inquiry_id) {
            let connection;
            try {
                connection = await getConn();
                await connection.execute('UPDATE inquiries SET bill_pdf_url = ? WHERE id = ?', [url, inquiry_id]);
            } catch (err) {
                console.error('[bills/generate] failed to persist URL:', err.message);
            } finally {
                if (connection) { try { connection.release(); } catch {} }
            }
        }
        res.json({ url });
    } catch (err) {
        console.error('[bills/generate]', err);
        res.status(500).json({ error: err.message });
    }
});

// --- BILL PDF UPLOAD ---
// Stores a generated bill PDF on disk and returns a public URL the client
// can open from WhatsApp. Body: { dataBase64, filename, inquiry_id? }
// Body parser limit raised just for this route — the global limit is 1MB.
app.post('/api/bills/upload', authenticateToken, express.json({ limit: BILL_UPLOAD_LIMIT }), async (req, res) => {
    try {
        const { dataBase64, filename, inquiry_id } = req.body || {};
        if (!dataBase64) return res.status(400).json({ error: 'dataBase64 is required' });

        // Strip data URL prefix if present (e.g. "data:application/pdf;base64,...").
        const cleaned = String(dataBase64).replace(/^data:application\/pdf;base64,/, '');
        const buf = Buffer.from(cleaned, 'base64');
        if (!buf.length) return res.status(400).json({ error: 'Empty PDF' });
        // Sanity-check the magic bytes — %PDF — to reject non-PDF uploads.
        if (buf.length < 5 || buf.subarray(0, 4).toString('ascii') !== '%PDF') {
            return res.status(400).json({ error: 'File is not a valid PDF' });
        }

        // Pick a safe filename — token avoids enumeration, original name kept as a label.
        const token = uuidv4();
        const safeName = (filename || 'invoice.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
        const storedName = `${token}-${safeName.endsWith('.pdf') ? safeName : safeName + '.pdf'}`;
        const filePath = path.join(BILLS_DIR, storedName);
        await fsp.writeFile(filePath, buf);

        // Absolute URL — WhatsApp recipients open this from another device,
        // so a relative path would 404 for them. Honour reverse-proxy headers.
        const proto = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const url = `${proto}://${host}/bills/${storedName}`;

        // Persist on the inquiry if provided, so admin can re-fetch the PDF later.
        if (inquiry_id) {
            let connection;
            try {
                connection = await getConn();
                await connection.execute(
                    'UPDATE inquiries SET bill_pdf_url = ? WHERE id = ?',
                    [url, inquiry_id]
                );
            } catch (err) {
                console.error('[bills/upload] failed to persist URL:', err.message);
            } finally {
                if (connection) { try { connection.release(); } catch {} }
            }
        }

        res.json({ url });
    } catch (err) {
        console.error('[bills/upload]', err);
        res.status(500).json({ error: err.message });
    }
});

// Catch-all to serve index.html for SPA routing (Express 5 syntax)
app.get('/assets/{*asset}', (req, res) => {
    res.status(404).type('text/plain').send('Asset not found');
});

app.get('/{*splat}', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(distPath, 'index.html'));
});

// --- START SERVER ---
const PORT = process.env.PORT || 5000;

async function startServer() {
    try {
        console.log('Testing database connection...');
        const connection = await getConn();
        console.log('✅ Database connected successfully!');
        await ensureRequiredColumns(connection);
        await loadAppSettings(connection);
        connection.release();
        startAutoClockOutJob();
        startDeviceReminderJob();
        startSlaJob();
        startFinanceSummaryJob();

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`Serving frontend from: ${distPath}`);
        });
    } catch (error) {
        console.error('❌ CRITICAL ERROR: Could not connect to database!');
        console.error(error);
        // Still start the server so we can at least see the logs and 404/500 errors instead of 503
        app.listen(PORT, () => {
            console.log(`⚠️ Server started in ERROR MODE on port ${PORT}. Database is offline.`);
        });
    }
}

startServer();
