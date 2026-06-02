import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../server/.env') });

const PORT = process.env.PORT || 5000;
const API_URL = `http://localhost:${PORT}/api`;

test('Auto Assignment Toggle Endpoints Integration Test', async (t) => {
  // Generate admin token
  const token = jwt.sign(
    { id: 'test-admin-uuid-1234', email: 'test-admin@example.com', role: 'admin' },
    process.env.JWT_SECRET || 'ExpertsServicePortal_Secure_Key_2024_!@#',
    { expiresIn: '1h' }
  );

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  let originalState = true;

  await t.test('1. Get Auto-Assignment Status & Save Original State', async () => {
    const res = await fetch(`${API_URL}/auto-assignment/status`, {
      method: 'GET',
      headers
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.hasOwnProperty('auto_assignment_enabled'), 'Response should include auto_assignment_enabled field');
    originalState = data.auto_assignment_enabled;
  });

  await t.test('2. Toggle Auto-Assignment to OFF', async () => {
    const res = await fetch(`${API_URL}/auto-assignment/status`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ enabled: false })
    });

    const data = await res.json();
    assert.equal(res.status, 200, `Failed to toggle auto-assignment: ${JSON.stringify(data)}`);
    assert.equal(data.auto_assignment_enabled, false, 'auto_assignment_enabled should be false');

    // Verify GET status also returns false
    const getRes = await fetch(`${API_URL}/auto-assignment/status`, {
      method: 'GET',
      headers
    });
    const getData = await getRes.json();
    assert.equal(getData.auto_assignment_enabled, false, 'Persistent auto_assignment_enabled should be false');
  });

  await t.test('3. Toggle Auto-Assignment to ON', async () => {
    const res = await fetch(`${API_URL}/auto-assignment/status`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ enabled: true })
    });

    const data = await res.json();
    assert.equal(res.status, 200, `Failed to toggle auto-assignment: ${JSON.stringify(data)}`);
    assert.equal(data.auto_assignment_enabled, true, 'auto_assignment_enabled should be true');

    // Verify GET status also returns true
    const getRes = await fetch(`${API_URL}/auto-assignment/status`, {
      method: 'GET',
      headers
    });
    const getData = await getRes.json();
    assert.equal(getData.auto_assignment_enabled, true, 'Persistent auto_assignment_enabled should be true');
  });

  await t.test('4. Restore Original Auto-Assignment State', async () => {
    const res = await fetch(`${API_URL}/auto-assignment/status`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ enabled: originalState })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.auto_assignment_enabled, originalState, 'Should restore the original auto assignment state');
  });
});
