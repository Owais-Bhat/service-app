// Hostinger MySQL Compatibility Layer
// This file replaces the Supabase client with an API client that connects to our Node.js backend.

const isProd = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const API_URL = isProd 
  ? '/api' // Use relative path in production
  : 'http://localhost:5000/api';


// Helper to get headers with JWT
const getHeaders = () => {
  const token = localStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

// fetch with an abort timeout so a slow/cold backend can never hang the app
// (e.g. the boot-time /auth/me call that otherwise leaves the splash spinner
// spinning forever on mobile / desktop). On timeout this throws like a network
// error, which callers already handle by falling back to the login screen.
function fetchWithTimeout(url, options = {}, ms = 12000) {
  if (typeof AbortController === 'undefined') return fetch(url, options);
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

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

  delete() {
    this.method = 'DELETE';
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

      const response = await fetchWithTimeout(`${API_URL}/data/${this.table}${queryString}`, options);
      const data = await response.json();

      if (!response.ok) {
        return resolve({
          data: null,
          error: { message: data.error || 'Request failed', status: response.status }
        });
      }

      const result = this.isSingle ? (Array.isArray(data) ? data[0] : data) : data;
      resolve({ data: result, error: null });
    } catch (err) {
      resolve({ data: null, error: { message: err.message } });
    }
  }
}

// --- REALTIME LAYER (SSE primary, polling fallback) ---
// Singleton transport shared by all channels. Channels register handlers
// that filter on { event, schema, table, filter } à la Supabase. If SSE fails
// (proxy drops long connections, HTTP/3 issues, etc.) we fall back to polling.
const POLL_INTERVAL_MS = 3000;
const SSE_FAILURE_LIMIT = 2;     // after this many failed connects, switch to polling for the session
const POLL_FALLBACK_KEY = 'realtime_force_poll';

const realtime = (() => {
  let es = null;
  let pollTimer = null;
  let pollCursor = 0;
  let sseFailureCount = 0;
  let mode = 'idle';   // 'idle' | 'sse' | 'poll'
  const subscribers = new Set();
  const notifySubs = new Set();

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

  const dispatch = (msg) => {
    if (msg.kind === 'db') {
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

  const stopSSE = () => { if (es) { try { es.close(); } catch {} es = null; } };
  const stopPolling = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };

  const startPolling = () => {
    if (mode === 'poll') return;
    stopSSE();
    mode = 'poll';
    console.warn('[realtime] using polling fallback (interval ' + POLL_INTERVAL_MS + 'ms)');

    const tick = async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/events/poll?since=${pollCursor}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.cursor === 'number') pollCursor = Math.max(pollCursor, data.cursor);
        (data.events || []).forEach(dispatch);
      } catch { /* swallow — retry next tick */ }
    };
    tick();
    pollTimer = setInterval(tick, POLL_INTERVAL_MS);
  };

  const startSSE = async () => {
    if (mode === 'sse') return;
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    if (typeof EventSource === 'undefined') return startPolling();
    if (localStorage.getItem(POLL_FALLBACK_KEY) === '1') return startPolling();

    mode = 'sse';
    let ticketRes;
    try {
      ticketRes = await fetch(`${API_URL}/events/ticket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      return startPolling();
    }
    if (!ticketRes.ok) return startPolling();
    const ticketData = await ticketRes.json();
    if (!ticketData.ticket) return startPolling();

    const url = `${API_URL}/events?ticket=${encodeURIComponent(ticketData.ticket)}`;
    es = new EventSource(url);
    let openedOk = false;

    es.onopen = () => {
      openedOk = true;
      sseFailureCount = 0;
    };

    es.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (typeof msg._id === 'number') pollCursor = Math.max(pollCursor, msg._id);
      dispatch(msg);
    };

    es.onerror = () => {
      // EventSource auto-reconnects, but if we never opened — or fail repeatedly —
      // assume the proxy is hostile and switch to polling for this session.
      if (!openedOk) sseFailureCount += 1;
      if (sseFailureCount >= SSE_FAILURE_LIMIT) {
        try { localStorage.setItem(POLL_FALLBACK_KEY, '1'); } catch {}
        startPolling();
      }
    };
  };

  const connect = () => {
    if (mode !== 'idle') return;
    startSSE();
  };

  const disconnectIfIdle = () => {
    if (subscribers.size === 0 && notifySubs.size === 0) {
      stopSSE(); stopPolling(); mode = 'idle';
    }
  };

  return {
    addSub(sub) { subscribers.add(sub); connect(); return () => { subscribers.delete(sub); disconnectIfIdle(); }; },
    addNotifySub(sub) { notifySubs.add(sub); connect(); return () => { notifySubs.delete(sub); disconnectIfIdle(); }; },
    reset() {
      stopSSE(); stopPolling();
      subscribers.clear(); notifySubs.clear();
      pollCursor = 0; sseFailureCount = 0; mode = 'idle';
    },
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
      const handler = (event) => {
        if (event.key !== 'auth_token') return;
        callback(event.newValue ? 'SIGNED_IN' : 'SIGNED_OUT', null);
      };
      window.addEventListener('storage', handler);
      return { data: { subscription: { unsubscribe: () => window.removeEventListener('storage', handler) } } };
    },
    getUser: async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) return { data: { user: null } };
      try {
        const response = await fetchWithTimeout(`${API_URL}/auth/me`, { headers: getHeaders() }, 10000);
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
        
        resetRealtime();
        localStorage.removeItem(POLL_FALLBACK_KEY);
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
            access_key: options.data.access_key || options.data.regKey
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
    resetRealtime();
    localStorage.removeItem(POLL_FALLBACK_KEY);
    localStorage.setItem('auth_token', result.token);
    return { data: { user: result.user }, error: null };
  }
  return { data: null, error: { message: result.error || 'Sign in failed' } };
}

export async function signUp(email, password, fullName, regKey) {
  const response = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, fullName, access_key: regKey })
  });
  const result = await response.json();
  if (response.ok) return { data: { user: result.userId }, error: null };
  return { data: null, error: { message: result.error || 'Sign up failed' } };
}

export async function signOut() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('realtime_force_poll');
  resetRealtime();
  return { error: null };
}
