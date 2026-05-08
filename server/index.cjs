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

// --- AUTH ROUTES ---

app.post('/api/auth/signup', async (req, res) => {
    const { email, password, fullName, role } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        // Check if user exists
        const [users] = await connection.execute('SELECT * FROM auth_users WHERE email = ?', [email]);
        if (users.length > 0) return res.status(400).json({ error: 'User already exists' });

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
            res.status(201).json({ message: 'User created', userId });
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
        await connection.end();

        if (users.length === 0) return res.status(400).json({ error: 'User not found' });

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, email: user.email } });
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
app.get('/api/data/:table', authenticateToken, async (req, res) => {
    const { table } = req.params;
    const { select, eq, order, in: inFilter } = req.query;
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        let query = `SELECT ${select || '*'} FROM ??`;
        let params = [table];

        let whereClauses = [];
        if (eq) {
            const [field, value] = eq.split(':');
            whereClauses.push('?? = ?');
            params.push(field, value);
        }
        if (inFilter) {
            const [field, valuesStr] = inFilter.split(':');
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

app.patch('/api/data/:table', authenticateToken, async (req, res) => {
    const { table } = req.params;
    const { eq } = req.query;
    const data = req.body;

    if (!eq) return res.status(400).json({ error: 'Filter required for update' });

    try {
        const connection = await mysql.createConnection(dbConfig);
        const keys = Object.keys(data);
        const values = Object.values(data);
        const setClause = keys.map(k => `?? = ?`).join(', ');
        
        const [field, value] = eq.split(':');
        const query = `UPDATE ?? SET ${setClause} WHERE ?? = ?`;
        
        const params = [table];
        keys.forEach((k, i) => {
            params.push(k, values[i]);
        });
        params.push(field, value);

        await connection.execute(query, params);
        await connection.end();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/data/:table', authenticateToken, async (req, res) => {
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

const PORT = process.env.PORT || 5000;

// Catch-all to serve index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
