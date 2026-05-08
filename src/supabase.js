// Hostinger MySQL Compatibility Layer
// This file replaces the Supabase client with an API client that connects to our Node.js backend.

const isProd = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const API_URL = isProd 
  ? '/api' // Use relative path in production
  : 'http://localhost:5000/api';


// Helper to get headers with JWT
const getHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
};

// Chainable query builder to mimic Supabase
class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.params = {};
    this.eqs = [];
  }

  select(fields = '*') {
    this.params.select = fields;
    return this;
  }

  eq(column, value) {
    this.eqs.push(`${column}:${value}`);
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.params.order = `${column}:${ascending ? 'asc' : 'desc'}`;
    return this;
  }

  in(column, values) {
    this.params.in = `${column}:${values.join(',')}`;
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  _buildQuery() {
    const sp = new URLSearchParams();
    Object.entries(this.params).forEach(([k, v]) => sp.set(k, v));
    this.eqs.forEach(e => sp.append('eq', e));
    return sp.toString();
  }

  async then(resolve, reject) {
    try {
      const response = await fetch(`${API_URL}/data/${this.table}?${this._buildQuery()}`, {
        headers: getHeaders()
      });
      const data = await response.json();

      if (!response.ok) return resolve({ data: null, error: { message: data.error } });

      const result = this.isSingle ? (Array.isArray(data) ? data[0] : data) : data;
      resolve({ data: result, error: null });
    } catch (err) {
      resolve({ data: null, error: { message: err.message } });
    }
  }

  async insert(data) {
    try {
      const response = await fetch(`${API_URL}/data/${this.table}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!response.ok) return { data: null, error: { message: result.error } };
      return { data: result, error: null };
    } catch (err) {
      return { data: null, error: { message: err.message } };
    }
  }

  async update(data) {
    try {
      const response = await fetch(`${API_URL}/data/${this.table}?${this._buildQuery()}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!response.ok) return { data: null, error: { message: result.error } };
      return { data: result, error: null };
    } catch (err) {
      return { data: null, error: { message: err.message } };
    }
  }
}

export const supabase = {
  from: (table) => new QueryBuilder(table),
  
  // Mock channel for real-time (can be implemented later with WebSockets)
  channel: () => ({
    on: function() { return this; },
    subscribe: () => ({ unsubscribe: () => {} })
  }),
  removeChannel: () => {},

  auth: {
    getSession: async () => {
      const user = await supabase.auth.getUser();
      return { data: { session: user.data.user ? { user: user.data.user } : null } };
    },
    onAuthStateChange: (callback) => {
      // Very basic mock
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    getUser: async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) return { data: { user: null } };
      try {
        const response = await fetch(`${API_URL}/auth/me`, { headers: getHeaders() });
        const data = await response.json();
        if (!response.ok) return { data: { user: null } };
        return { data: { user: data.user } };
      } catch {
        return { data: { user: null } };
      }
    },
    signInWithPassword: async ({ email, password }) => {
      try {
        const response = await fetch(`${API_URL}/auth/signin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) return { data: null, error: { message: data.error } };
        
        localStorage.setItem('auth_token', data.token);
        return { data: { user: data.user }, error: null };
      } catch (err) {
        return { data: null, error: { message: err.message } };
      }
    },
    signUp: async ({ email, password, options }) => {
      try {
        const response = await fetch(`${API_URL}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            fullName: options.data.full_name,
            role: options.data.role
          })
        });
        const data = await response.json();
        if (!response.ok) return { data: null, error: { message: data.error } };
        return { data: { user: { id: data.userId, email } }, error: null };
      } catch (err) {
        return { data: null, error: { message: err.message } };
      }
    },
    signOut: async () => {
      localStorage.removeItem('auth_token');
      return { error: null };
    }
  }
};

// Re-export convenience functions
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getUserRole(userId) {
  // Prefer the role already attached to the current session — signin and /auth/me both return it.
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.role) return user.role;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (error) return 'client';
  return data?.role || 'client';
}

export async function signIn(email, password) {
  const response = await fetch(`${API_URL}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const result = await response.json();
  if (response.ok && result.token) {
    localStorage.setItem('auth_token', result.token);
    return { data: { user: result.user }, error: null };
  }
  return { data: null, error: { message: result.error || 'Sign in failed' } };
}

export async function signUp(email, password, fullName, regKey) {
  const STAFF_KEY = 'NE_STAFF_2026';
  const ADMIN_KEY = 'NE_ADMIN_SECRET';

  let role;
  if (regKey === STAFF_KEY) role = 'employee';
  else if (regKey === ADMIN_KEY) role = 'admin';
  else return { data: null, error: { message: 'Invalid access key. Use the staff or admin secret key.' } };

  const response = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, fullName, role })
  });
  const result = await response.json();
  if (response.ok) return { data: { user: result.userId }, error: null };
  return { data: null, error: { message: result.error || 'Sign up failed' } };
}

export async function signOut() {
  localStorage.removeItem('auth_token');
  return { error: null };
}
