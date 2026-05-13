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
    this.method = 'GET';
    this.body = null;
    this.isSingle = false;
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

  insert(data) {
    this.method = 'POST';
    this.body = data;
    return this;
  }

  upsert(data) {
    this.method = 'POST'; // Backend handles conflict with id
    this.body = data;
    return this;
  }

  update(data) {
    this.method = 'PATCH';
    this.body = data;
    return this;
  }

  async then(resolve, reject) {
    try {
      const isPost = this.method === 'POST';
      const queryString = !isPost ? `?${this._buildQuery()}` : '';
      
      const options = {
        method: this.method,
        headers: getHeaders()
      };
      if (this.body) options.body = JSON.stringify(this.body);

      const response = await fetch(`${API_URL}/data/${this.table}${queryString}`, options);
      const data = await response.json();

      if (!response.ok) return resolve({ data: null, error: { message: data.error || 'Request failed' } });

      const result = this.isSingle ? (Array.isArray(data) ? data[0] : data) : data;
      resolve({ data: result, error: null });
    } catch (err) {
      resolve({ data: null, error: { message: err.message } });
    }
  }
}

// --- SSE REALTIME LAYER ---
// Singleton EventSource shared by all channels. Channels register handlers
// that filter on { event, schema, table, filter } à la Supabase.
const realtime = (() => {
  let es = null;
  const subscribers = new Set();      // { events:Set, table, filter, cb }
  const notifySubs = new Set();       // { subjects:Set|null, cb }

  // Filter strings look like "assigned_employee_id=eq.<uuid>".
  const parseFilter = (f) => {
    if (!f) return null;
    const m = /^(\w+)=eq\.(.+)$/.exec(f);
    return m ? { col: m[1], val: m[2] } : null;
  };

  const matches = (sub, msg) => {
    if (sub.table && sub.table !== msg.table) return false;
    if (sub.events && !sub.events.has('*') && !sub.events.has(msg.type)) return false;
    if (sub.filter) {
      const p = parseFilter(sub.filter);
      if (p && msg.row && String(msg.row[p.col]) !== String(p.val)) return false;
    }
    return true;
  };

  const connect = () => {
    if (es) return;
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    const url = `${API_URL}/events?token=${encodeURIComponent(token)}`;
    es = new EventSource(url);

    es.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      if (msg.kind === 'db') {
        // Build a Supabase-compatible payload: { eventType, new, old, table, schema }.
        const payload = { eventType: msg.type, schema: 'public', table: msg.table, new: msg.row, old: null };
        subscribers.forEach(sub => {
          if (matches(sub, msg)) {
            try { sub.cb(payload); } catch (err) { console.error('[realtime] handler error', err); }
          }
        });
      } else if (msg.kind === 'notify') {
        notifySubs.forEach(sub => {
          if (sub.subjects && !sub.subjects.has(msg.subject)) return;
          try { sub.cb(msg); } catch (err) { console.error('[realtime] notify handler error', err); }
        });
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do.
    };
  };

  const disconnectIfIdle = () => {
    if (subscribers.size === 0 && notifySubs.size === 0 && es) {
      es.close(); es = null;
    }
  };

  return {
    addSub(sub) { subscribers.add(sub); connect(); return () => { subscribers.delete(sub); disconnectIfIdle(); }; },
    addNotifySub(sub) { notifySubs.add(sub); connect(); return () => { notifySubs.delete(sub); disconnectIfIdle(); }; },
    reset() { if (es) { es.close(); es = null; } subscribers.clear(); notifySubs.clear(); },
  };
})();

// Subscribe to server notifications (payment_received, new_assignment, etc.).
// subjects: array of subject strings, or null for all.
export function onNotification(subjects, cb) {
  return realtime.addNotifySub({ subjects: subjects ? new Set(subjects) : null, cb });
}

// Reset realtime on logout — the next signed-in user gets their own stream.
export function resetRealtime() { realtime.reset(); }

class RealtimeChannel {
  constructor(name) { this.name = name; this._handlers = []; this._unsubs = []; }
  on(_eventKind, cfg, cb) {
    const events = new Set([cfg.event || '*']);
    this._handlers.push({ events, table: cfg.table || null, filter: cfg.filter || null, cb });
    return this;
  }
  subscribe() {
    this._handlers.forEach(h => this._unsubs.push(realtime.addSub(h)));
    return this;
  }
  unsubscribe() { this._unsubs.forEach(u => u()); this._unsubs = []; }
}

export const supabase = {
  from: (table) => new QueryBuilder(table),
  channel: (name) => new RealtimeChannel(name),
  removeChannel: (ch) => { try { ch?.unsubscribe?.(); } catch {} },

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
    updateUser: async ({ password }) => {
      try {
        const response = await fetch(`${API_URL}/auth/update-password`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ password })
        });
        const data = await response.json();
        if (!response.ok) return { data: null, error: { message: data.error } };
        return { data: { user: data.user }, error: null };
      } catch (err) {
        return { data: null, error: { message: err.message } };
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
  resetRealtime();
  return { error: null };
}
