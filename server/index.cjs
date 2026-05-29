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

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_DIR));

const uploadStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: uploadStorage });

app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: `/uploads/${req.file.filename}` });
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

const DEFAULT_AUTO_CLOCK_OUT_TIME = process.env.AUTO_CLOCK_OUT_TIME || '18:00';
const appSettings = {
    autoClockOutTime: DEFAULT_AUTO_CLOCK_OUT_TIME,
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
        'SELECT setting_key, setting_value FROM app_settings WHERE setting_key = ?',
        ['auto_clock_out_time']
    );
    const autoClockOut = rows.find(row => row.setting_key === 'auto_clock_out_time')?.setting_value;
    appSettings.autoClockOutTime = parseAutoClockOutTime(autoClockOut || DEFAULT_AUTO_CLOCK_OUT_TIME).label;
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

const requiredColumns = {
    profiles: [
        { name: 'salary', definition: 'DECIMAL(10, 2) DEFAULT 0' },
        { name: 'address', definition: 'TEXT' },
        { name: 'phone', definition: 'VARCHAR(20)' },
        { name: 'company', definition: 'VARCHAR(100)' },
        { name: 'can_add_service', definition: 'TINYINT(1) DEFAULT 0' },
        { name: 'can_update_profile', definition: 'TINYINT(1) DEFAULT 0' },
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
        position INT DEFAULT 0,
        starts_at TIMESTAMP NULL,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ads_active (active),
        INDEX idx_ads_position (position)
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
        `SELECT a.user_id AS id, p.full_name, a.clock_in
           FROM attendance a
           JOIN profiles p ON p.id = a.user_id
          WHERE a.date = ?
            AND a.clock_in IS NOT NULL
            AND a.clock_out IS NULL
            AND p.role = 'employee'
          ORDER BY a.clock_in ASC`,
        [today]
    );
    return rows;
}

async function autoAssignInquiry(inquiryId) {
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

        broadcastNotify({
            subject: 'new_assignment',
            title: 'New Assignment',
            body: 'You have been auto-assigned a new service request.',
            audience: { userId: chosen.id },
            data: { inquiry_id: inquiryId },
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

async function markTicketPaid(connection, ticket_no, amountPaise = null) {
    await connection.execute(
        `UPDATE inquiries
            SET payment_status = 'paid',
                payment_received_at = COALESCE(payment_received_at, NOW()),
                status = CASE WHEN status IN ('resolved','closed') THEN status ELSE 'resolved' END
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
                SET status = CASE WHEN status IN ('resolved','closed') THEN status ELSE 'resolved' END
              WHERE id = ?`,
            [ticketId]
        );
    }

    if (inqRow) broadcastChange('UPDATE', 'inquiries', inqRow);
    if (ticketId) broadcastChange('UPDATE', 'tickets', { id: ticketId, status: 'resolved' });

    const amount = amountPaise ? Math.round(amountPaise / 100) : (inqRow?.bill_amount || 0);
    broadcastNotify({
        subject: 'payment_received',
        title: '💰 Payment Received',
        body: `${inqRow?.full_name || 'Client'} paid ₹${amount} for ticket ${ticket_no}`,
        audience: { role: 'admin' },
        data: { ticket_no, inquiry_id: inqRow?.id, amount },
    });
    if (inqRow?.assigned_employee_id) {
        broadcastNotify({
            subject: 'payment_received',
            title: '💰 Payment Received',
            body: `Your ticket ${ticket_no} just got paid! Task auto-resolved.`,
            audience: { userId: inqRow.assigned_employee_id },
            data: { ticket_no, inquiry_id: inqRow.id, amount },
        });
    }

    // SMS → client: payment confirmation with amount, ticket no, bill no
    // Template variables: {customer_name} {amount} {ticket_no} {bill_no}
    if (inqRow?.phone) {
        const billTotal = inqRow.bill_total || inqRow.bill_amount || amount;
        smsNotify(inqRow.phone, 'SMS_TID_PAYMENT', [
            smsVar(inqRow.full_name, 'Customer', 60),
            smsVar(`Rs.${Math.round(billTotal)}`, 'Rs.0', 20),
            smsVar(ticket_no, 'N/A', 20),
            smsVar(inqRow.bill_no, 'N/A', 30),
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
]);

// Columns that non-admins must never write through the generic data endpoint.
// `profiles.role`/`salary` are the obvious privilege-escalation vectors;
// `password_hash` should only ever be touched by /api/auth/update-password.
const ADMIN_ONLY_WRITE_COLUMNS = {
    profiles: new Set(['role', 'salary', 'password_hash', 'can_add_service', 'can_update_profile']),
    auth_users: new Set(['*']), // belt-and-braces; table isn't in allowlist anyway
};

const EMPLOYEE_READ_TABLES = new Set([
    'profiles', 'attendance', 'tickets', 'inquiries', 'eod_reports', 'leave_requests',
    'ticket_comments', 'inquiry_services', 'service_pricing', 'device_types', 'companies',
    'notices', 'discount_presets',
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
    ]),
    tickets: new Set(['status']),
    ticket_comments: new Set(['id', 'ticket_id', 'user_id', 'content']),
    inquiry_services: new Set(['inquiry_id', 'service_id']),
    companies: new Set(['id', 'name']),
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
        if (req.method === 'PATCH'
            && eqs.some(e => e.startsWith('id:'))
            && eqs.some(e => e.startsWith('ticket_no:'))
            && eqs.some(e => e.startsWith('phone:'))
            && Object.keys(req.body || {}).every(k => PUBLIC_INQUIRY_FEEDBACK_FIELDS.has(k))) {
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
function smsNotify(mobile, templateEnvKey, variables) {
    const apiKey = process.env.SMS_API;
    const templateId = process.env[templateEnvKey];
    const senderId = process.env[`FAST2SMS_SENDER_ID_${templateEnvKey}`]
        || process.env[`SMS_SENDER_ID_${templateEnvKey}`]
        || process.env.FAST2SMS_SENDER_ID
        || 'NTWRKE';
    const normalized = normalizeIndianMobile(mobile);
    if (!apiKey || !templateId || !mobile) {
        console.warn(`[SMS ${templateEnvKey}] skipped: missing ${!apiKey ? 'SMS_API' : !templateId ? templateEnvKey : 'mobile'} (raw mobile=${JSON.stringify(mobile)})`);
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
    const templateId = process.env[templateEnvKey];
    const senderId = process.env[`FAST2SMS_SENDER_ID_${templateEnvKey}`]
        || process.env[`SMS_SENDER_ID_${templateEnvKey}`]
        || process.env.FAST2SMS_SENDER_ID
        || 'NTWRKE';
    const normalized = normalizeIndianMobile(mobile);
    if (!apiKey || !templateId || !mobile) {
        return { ok: false, error: `Missing ${!apiKey ? 'SMS_API' : !templateId ? templateEnvKey : 'mobile'}` };
    }
    if (!normalized) return { ok: false, error: 'Invalid mobile number' };

    console.log(`[SMS ${templateEnvKey}] sending -> mobile=${normalized} templateId=${templateId} senderId=${senderId} vars(${variables.length})=${JSON.stringify(variables)}`);
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

function smsPhoneVar(value) {
    return normalizeIndianMobile(value) || '0000000000';
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
    if (!process.env.ADMIN_REG_KEY || !process.env.STAFF_REG_KEY) {
        return res.status(503).json({ error: 'Staff registration is not configured on this server.' });
    }
    let role;
    if (accessKey === process.env.ADMIN_REG_KEY) role = 'admin';
    else if (accessKey === process.env.STAFF_REG_KEY) role = 'employee';
    else return res.status(400).json({ error: 'Invalid access key. Only staff and admin can register here.' });

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

app.get('/api/settings/attendance', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
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

            // Any manual/admin/cash payment completion should also notify the client.
            // Template variables: {customer_name} {amount} {ticket_no} {bill_no}
            if (data.payment_status === 'paid' && row.phone) {
                const amount = row.bill_total || row.bill_amount || 0;
                smsNotify(row.phone, 'SMS_TID_PAYMENT', [
                    smsVar(row.full_name, 'Customer', 60),
                    smsVar(`Rs.${Math.round(Number(amount) || 0)}`, 'Rs.0', 20),
                    smsVar(row.ticket_no, 'N/A', 20),
                    smsVar(row.bill_no, 'N/A', 30),
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
            broadcastNotify({
                subject: 'new_service_request',
                title: 'New Service Request',
                body: `${data.full_name || 'Client'}${data.service_item ? ' - ' + data.service_item : ''}`,
                audience: { role: 'admin' },
                data: { inquiry_id: data.id, ticket_no: data.ticket_no || null },
            });
            // SMS → client: ticket confirmed with ticket no, service type, preferred time
            // Template variables: {name} {ticket_no} {service_item} {preferred_time}
            if (data.phone && data.ticket_no) {
                smsNotify(data.phone, 'SMS_TID_TICKET', [
                    smsVar(data.full_name, 'Customer', 60),
                    smsVar(data.ticket_no, 'N/A', 20),
                    smsVar(data.service_item, 'General Service', 80),
                    smsVar(data.preferred_time, 'As soon as possible', 60),
                ]);
            }
            if (!data.assigned_employee_id) {
                autoAssignInquiry(data.id);
            }
        }
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
        });
    } catch (err) {
        console.error('[AutoAssign status]', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
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
                            status = CASE WHEN status IN ('resolved','closed') THEN status ELSE 'resolved' END
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
                            SET status = CASE WHEN status IN ('resolved','closed') THEN status ELSE 'resolved' END
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
                broadcastNotify({
                    subject: 'payment_received',
                    title: '💰 Payment Received',
                    body: `${inqRow?.full_name || 'Client'} paid ₹${amount} for ticket ${ticket_no}`,
                    audience: { role: 'admin' },
                    data: { ticket_no, inquiry_id: inqRow?.id, amount },
                });
                if (inqRow?.assigned_employee_id) {
                    broadcastNotify({
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
                    smsNotify(inqRow.phone, 'SMS_TID_PAYMENT', [
                        smsVar(inqRow.full_name, 'Customer', 60),
                        smsVar(`Rs.${Math.round(billTotal)}`, 'Rs.0', 20),
                        smsVar(ticket_no, 'N/A', 20),
                        smsVar(inqRow.bill_no, 'N/A', 30),
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
