const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const Razorpay = require('razorpay');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json({
    verify: (req, res, buf) => {
        if (req.originalUrl === '/api/webhook/razorpay') req.rawBody = Buffer.from(buf);
    },
}));

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
app.use(express.static(distPath));

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
};

const requiredColumns = {
    profiles: [
        { name: 'salary', definition: 'DECIMAL(10, 2) DEFAULT 0' },
        { name: 'address', definition: 'TEXT' },
        { name: 'phone', definition: 'VARCHAR(20)' },
        { name: 'company', definition: 'VARCHAR(100)' },
    ],
    inquiries: [
        { name: 'company_name', definition: 'VARCHAR(150)' },
        { name: 'bill_no', definition: 'VARCHAR(50)' },
        { name: 'ticket_no', definition: 'VARCHAR(50) UNIQUE' },
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
        title: 'ðŸ’° Payment Received',
        body: `${inqRow?.full_name || 'Client'} paid â‚¹${amount} for ticket ${ticket_no}`,
        audience: { role: 'admin' },
        data: { ticket_no, inquiry_id: inqRow?.id, amount },
    });
    if (inqRow?.assigned_employee_id) {
        broadcastNotify({
            subject: 'payment_received',
            title: 'ðŸ’° Payment Received',
            body: `Your ticket ${ticket_no} just got paid! Task auto-resolved.`,
            audience: { userId: inqRow.assigned_employee_id },
            data: { ticket_no, inquiry_id: inqRow.id, amount },
        });
    }

    return inqRow;
}

// SSE endpoint. Token passed as ?token=... since EventSource can't set headers.
app.get('/api/events', (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(401).end();

    let payload;
    try { payload = jwt.verify(token, process.env.JWT_SECRET); }
    catch { return res.status(403).end(); }

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
    const token = req.query.token || (req.headers.authorization || '').split(' ')[1];
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

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// The public landing page submits and tracks inquiries without logging in.
// Allow anonymous access for those specific operations on the `inquiries` table:
//   - POST: anyone can create a new inquiry
//   - GET:  must filter by ticket_no (so callers can't dump the whole table)
//   - PATCH: only feedback fields may be updated, and only by id
// Anything else falls through to the normal JWT check.
const PUBLIC_INQUIRY_FEEDBACK_FIELDS = new Set(['feedback_rating', 'feedback_comment', 'feedback_at', 'employee_rating', 'feedback_employee_id']);
const dataAuth = (req, res, next) => {
    if (req.params.table === 'inquiries') {
        const eqs = Array.isArray(req.query.eq) ? req.query.eq : (req.query.eq ? [req.query.eq] : []);

        if (req.method === 'POST') {
            req.user = { role: 'public' };
            return next();
        }
        if (req.method === 'GET' && eqs.some(e => e.startsWith('ticket_no:'))) {
            req.user = { role: 'public' };
            return next();
        }
        if (req.method === 'PATCH'
            && eqs.some(e => e.startsWith('id:'))
            && Object.keys(req.body || {}).every(k => PUBLIC_INQUIRY_FEEDBACK_FIELDS.has(k))) {
            req.user = { role: 'public' };
            return next();
        }
    }
    return authenticateToken(req, res, next);
};

// --- AUTH ROUTES ---

app.post('/api/auth/signup', async (req, res) => {
    const { email, password, fullName, role } = req.body;

    // Only staff/admin accounts can be created via the dashboard.
    // Clients raise requests through the public landing page (no login).
    if (role !== 'admin' && role !== 'employee') {
        return res.status(400).json({ error: 'Invalid access key. Only staff and admin can register here.' });
    }

    try {
        const connection = await mysql.createConnection(dbConfig);

        // Check if user exists
        const [users] = await connection.execute('SELECT * FROM auth_users WHERE email = ?', [email]);
        if (users.length > 0) {
            await connection.end();
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
            await connection.end();
        }
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/signin', async (req, res) => {
    const { email, password } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [users] = await connection.execute('SELECT * FROM auth_users WHERE email = ?', [email]);

        if (users.length === 0) {
            await connection.end();
            return res.status(400).json({ error: 'User not found' });
        }

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            await connection.end();
            return res.status(400).json({ error: 'Invalid password' });
        }

        // Pull role + name from profile so the client can route immediately.
        const [profiles] = await connection.execute('SELECT role, full_name FROM profiles WHERE id = ?', [user.id]);
        await connection.end();

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
        const connection = await mysql.createConnection(dbConfig);
        const [profiles] = await connection.execute('SELECT * FROM profiles WHERE id = ?', [req.user.id]);
        await connection.end();

        if (profiles.length === 0) return res.status(404).json({ error: 'Profile not found' });
        // Profile fields take precedence so the role is the canonical DB value.
        res.json({ user: { ...req.user, ...profiles[0] } });
    } catch (error) {
        console.error('Me error:', error);
        res.status(500).json({ error: error.message });
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
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'UPDATE auth_users SET password_hash = ? WHERE id = ?',
            [passwordHash, userId]
        );
        await connection.end();
        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Password update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- DATABASE ROUTES ---

app.get('/api/profiles/:id', authenticateToken, async (req, res) => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM profiles WHERE id = ?', [req.params.id]);
        await connection.end();
        res.json(rows[0]);
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Basic endpoint to handle generic Supabase-like queries (Simplified)
app.get('/api/data/:table', dataAuth, async (req, res) => {
    const { table } = req.params;
    let { select, order, in: inFilter } = req.query;
    const eqs = Array.isArray(req.query.eq) ? req.query.eq : (req.query.eq ? [req.query.eq] : []);

    // Handle Supabase-style joins: select=*,inquiries(*) or select=*,profiles(full_name)
    const relations = [];
    if (select) {
        // Regex to find things like "inquiries(*)" or "profiles(full_name)"
        const joinRegex = /(\w+)\(([^)]*)\)/g;
        let match;
        while ((match = joinRegex.exec(select)) !== null) {
            relations.push({ relTable: match[1], relFields: match[2] === '*' ? '*' : match[2] });
        }
        // Remove joins from the main SQL select clause
        select = select.replace(/,?\s*\w+\([^)]*\)/g, '').trim();
        if (select.endsWith(',')) select = select.slice(0, -1);
        if (select.startsWith(',')) select = select.slice(1);
        if (!select) select = '*';
    }

    try {
        const connection = await mysql.createConnection(dbConfig);
        let query = `SELECT ${select || '*'} FROM ??`;
        let params = [table];

        let whereClauses = [];
        eqs.forEach(filter => {
            const idx = filter.indexOf(':');
            if (idx === -1) return;
            const field = filter.slice(0, idx);
            const value = filter.slice(idx + 1);
            whereClauses.push('?? = ?');
            params.push(field, value);
        });
        if (inFilter) {
            const idx = inFilter.indexOf(':');
            const field = inFilter.slice(0, idx);
            const valuesStr = inFilter.slice(idx + 1);
            const values = valuesStr.split(',');
            whereClauses.push(`?? IN (${values.map(() => '?').join(', ')})`);
            params.push(field, ...values);
        }

        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }

        if (order) {
            const [field, direction] = order.split(':');
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

        await connection.end();
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

    try {
        const connection = await mysql.createConnection(dbConfig);
        const keys = Object.keys(data);
        const values = Object.values(data);
        const setClause = keys.map(() => `?? = ?`).join(', ');

        const whereClauses = [];
        const whereParams = [];
        eqs.forEach(filter => {
            const idx = filter.indexOf(':');
            if (idx === -1) return;
            whereClauses.push('?? = ?');
            whereParams.push(filter.slice(0, idx), filter.slice(idx + 1));
        });

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

        await connection.end();
        updatedRows.forEach(row => broadcastChange('UPDATE', table, row));
        if (updatedRows.length === 0) broadcastChange('UPDATE', table, { ...data, _filter: eqs });
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating data:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/data/:table', dataAuth, async (req, res) => {
    const { table } = req.params;
    const eqs = Array.isArray(req.query.eq) ? req.query.eq : (req.query.eq ? [req.query.eq] : []);

    if (eqs.length === 0) return res.status(400).json({ error: 'Filter required for delete' });

    try {
        const connection = await mysql.createConnection(dbConfig);

        const whereClauses = [];
        const whereParams = [];
        eqs.forEach(filter => {
            const idx = filter.indexOf(':');
            if (idx === -1) return;
            whereClauses.push('?? = ?');
            whereParams.push(filter.slice(0, idx), filter.slice(idx + 1));
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
        await connection.end();

        deletedRows.forEach(row => broadcastChange('DELETE', table, row));
        res.json({ success: true, affectedRows: result.affectedRows || 0 });
    } catch (error) {
        console.error('Error deleting data:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/data/:table', dataAuth, async (req, res) => {
    const { table } = req.params;
    const data = req.body;
    if (!data.id) data.id = uuidv4();

    try {
        const connection = await mysql.createConnection(dbConfig);
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map(() => '?').join(', ');

        // Build ON DUPLICATE KEY UPDATE clause
        const updateClause = keys.map(k => `?? = VALUES(??)`).join(', ');
        const updateParams = keys.flatMap(k => [k, k]);

        const query = `INSERT INTO ?? (??) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
        const params = [table, keys, ...values, ...updateParams];

        await connection.query(query, params);
        await connection.end();
        broadcastChange('INSERT', table, data);
        if (table === 'inquiries') {
            broadcastNotify({
                subject: 'new_service_request',
                title: 'New Service Request',
                body: `${data.full_name || 'Client'}${data.service_item ? ' - ' + data.service_item : ''}`,
                audience: { role: 'admin' },
                data: { inquiry_id: data.id, ticket_no: data.ticket_no || null },
            });
        }
        res.status(201).json(data);
    } catch (error) {
        console.error('Error inserting/upserting data:', error);
        res.status(500).json({ error: error.message });
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
        connection = await mysql.createConnection(dbConfig);
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
        if (connection) { try { await connection.end(); } catch {} }
    }
});

// --- RAZORPAY WEBHOOK (auto-mark payment paid) ---
// Razorpay calls this URL when a payment link is paid.
// Configure this URL in your Razorpay dashboard under Webhooks:
//   https://services.networkingexperts.in/api/webhook/razorpay
// Set RAZORPAY_WEBHOOK_SECRET in .env to the webhook secret from the dashboard.
app.post('/api/webhook/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {})));

    if (webhookSecret) {
        const crypto = require('crypto');
        const expectedSig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
        if (signature !== expectedSig) {
            console.warn('[Webhook] Invalid Razorpay signature');
            return res.status(400).json({ error: 'Invalid signature' });
        }
    }

    let event;
    try { event = Buffer.isBuffer(req.body) ? JSON.parse(req.body) : req.body; }
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
                connection = await mysql.createConnection(dbConfig);
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
                    'SELECT id, ticket_id, assigned_employee_id, full_name, bill_amount FROM inquiries WHERE ticket_no = ? LIMIT 1',
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
            } catch (err) {
                if (connection) { try { await connection.rollback(); } catch {} }
                console.error('[Webhook] DB update failed:', err.message);
            } finally {
                if (connection) { try { await connection.end(); } catch {} }
            }
        }
    }

    res.json({ status: 'ok' });
});

// Catch-all to serve index.html for SPA routing (Express 5 syntax)
app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

// --- START SERVER ---
const PORT = process.env.PORT || 5000;

async function startServer() {
    try {
        console.log('Testing database connection...');
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ Database connected successfully!');
        await ensureRequiredColumns(connection);
        await connection.end();

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
