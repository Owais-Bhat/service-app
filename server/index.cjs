const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the frontend build directory
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
};

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
const PUBLIC_INQUIRY_FEEDBACK_FIELDS = new Set(['feedback_rating', 'feedback_comment', 'feedback_at']);
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
        res.status(500).json({ error: error.message });
    }
});

// Basic endpoint to handle generic Supabase-like queries (Simplified)
app.get('/api/data/:table', dataAuth, async (req, res) => {
    const { table } = req.params;
    const { select, order, in: inFilter } = req.query;
    const eqs = Array.isArray(req.query.eq) ? req.query.eq : (req.query.eq ? [req.query.eq] : []);

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

        const [rows] = await connection.execute(query, params);
        await connection.end();
        res.json(rows);
    } catch (error) {
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

        await connection.execute(query, params);
        await connection.end();
        res.json({ success: true });
    } catch (error) {
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
        
        const query = `INSERT INTO ?? (??) VALUES (${placeholders})`;
        await connection.execute(query, [table, keys, ...values]);
        await connection.end();
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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
