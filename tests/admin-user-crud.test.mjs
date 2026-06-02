import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../server/.env') });

const PORT = process.env.PORT || 5000;
const API_URL = `http://localhost:${PORT}/api`;

test('Admin User CRUD Endpoints Integration Test', async (t) => {
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

  let testUserId = null;
  const testEmail = `test-user-${Date.now()}@example.com`;

  await t.test('1. Create User via POST /api/admin/users', async () => {
    const res = await fetch(`${API_URL}/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: testEmail,
        password: 'password12345',
        fullName: 'Test User Admin-CRUD',
        role: 'employee',
        phone: '9999999999',
        salary: 45000.50,
        address: '123 Test St',
        company: 'Test Company',
        can_add_service: true,
        can_update_profile: false
      })
    });

    const data = await res.json();
    assert.equal(res.status, 201, `Failed to create user: ${JSON.stringify(data)}`);
    assert.ok(data.userId, 'Response should contain created userId');
    testUserId = data.userId;
  });

  await t.test('2. Retrieve Users via GET /api/admin/users', async () => {
    const res = await fetch(`${API_URL}/admin/users`, {
      method: 'GET',
      headers
    });

    const users = await res.json();
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(users), 'Should return an array of users');

    const createdUser = users.find(u => u.id === testUserId);
    assert.ok(createdUser, 'Created user should be found in the user list');
    assert.equal(createdUser.email, testEmail);
    assert.equal(createdUser.full_name, 'Test User Admin-CRUD');
    assert.equal(createdUser.role, 'employee');
    assert.equal(createdUser.phone, '+919999999999');
    assert.equal(Number(createdUser.salary), 45000.50);
    assert.equal(createdUser.address, '123 Test St');
    assert.equal(createdUser.company, 'Test Company');
    assert.equal(createdUser.can_add_service, 1);
    assert.equal(createdUser.can_update_profile, 0);
  });

  await t.test('3. Edit User via PATCH /api/admin/users/:id', async () => {
    const updatedEmail = `updated-test-${Date.now()}@example.com`;
    const res = await fetch(`${API_URL}/admin/users/${testUserId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        email: updatedEmail,
        fullName: 'Test User Admin-CRUD Updated',
        role: 'admin',
        phone: '8888888888',
        salary: 55000.00,
        address: '456 Updated St',
        company: 'Updated Company',
        can_add_service: false,
        can_update_profile: true
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200, `Failed to update user: ${JSON.stringify(data)}`);

    // Verify updates in the database
    const verifyRes = await fetch(`${API_URL}/admin/users`, {
      method: 'GET',
      headers
    });
    const users = await verifyRes.json();
    const updatedUser = users.find(u => u.id === testUserId);
    assert.ok(updatedUser);
    assert.equal(updatedUser.email, updatedEmail);
    assert.equal(updatedUser.full_name, 'Test User Admin-CRUD Updated');
    assert.equal(updatedUser.role, 'admin');
    assert.equal(updatedUser.phone, '+918888888888');
    assert.equal(Number(updatedUser.salary), 55000.00);
    assert.equal(updatedUser.address, '456 Updated St');
    assert.equal(updatedUser.company, 'Updated Company');
    assert.equal(updatedUser.can_add_service, 0);
    assert.equal(updatedUser.can_update_profile, 1);
  });

  await t.test('4. Delete User via DELETE /api/admin/users/:id', async () => {
    const res = await fetch(`${API_URL}/admin/users/${testUserId}`, {
      method: 'DELETE',
      headers
    });

    const data = await res.json();
    assert.equal(res.status, 200, `Failed to delete user: ${JSON.stringify(data)}`);

    // Verify deletion in database
    const verifyRes = await fetch(`${API_URL}/admin/users`, {
      method: 'GET',
      headers
    });
    const users = await verifyRes.json();
    const deletedUser = users.find(u => u.id === testUserId);
    assert.equal(deletedUser, undefined, 'User should not be found in user list after deletion');
  });

  await t.test('5. Non-Admin Security Restriction', async () => {
    // Generate employee token
    const employeeToken = jwt.sign(
      { id: 'test-employee-uuid', email: 'employee@example.com', role: 'employee' },
      process.env.JWT_SECRET || 'ExpertsServicePortal_Secure_Key_2024_!@#',
      { expiresIn: '1h' }
    );

    const empHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${employeeToken}`
    };

    const res = await fetch(`${API_URL}/admin/users`, {
      method: 'GET',
      headers: empHeaders
    });
    assert.equal(res.status, 403, 'GET /api/admin/users should be forbidden for employees');

    const createRes = await fetch(`${API_URL}/admin/users`, {
      method: 'POST',
      headers: empHeaders,
      body: JSON.stringify({ email: 'hack@hack.com', password: 'password', fullName: 'Hacker' })
    });
    assert.equal(createRes.status, 403, 'POST /api/admin/users should be forbidden for employees');
  });
});
