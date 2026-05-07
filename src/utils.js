// Toast notifications
let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function toast(message, type = 'info', duration = 3500) {
  const container = getToastContainer();
  const el = document.createElement('div');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; el.style.transition = '0.3s'; setTimeout(() => el.remove(), 300); }, duration);
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

export function debounce(fn, delay = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

export function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function exportToCSV(filename, data) {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(h => {
      const cell = row[h] === null || row[h] === undefined ? '' : String(row[h]);
      return `"${cell.replace(/"/g, '""')}"`;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Theme Management
export function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

export function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
  });
}

/**
 * Calculates a deadline based on working hours (10 AM - 6 PM).
 * Jammu & Kashmir working hours: 10:00 to 18:00 (8 hours per day).
 * @param {string|Date} createdAt - The starting date.
 * @param {number} slaHours - Total working hours to add (default 12).
 */
export function calculateSLA(createdAt, slaHours = 12) {
  let date = new Date(createdAt);
  let hoursRemaining = slaHours;

  const startHour = 10;
  const endHour = 18;

  while (hoursRemaining > 0) {
    const curHour = date.getHours();
    const day = date.getDay(); // 0 = Sunday

    // If it's Sunday, skip to Monday 10 AM
    if (day === 0) {
      date.setDate(date.getDate() + 1);
      date.setHours(startHour, 0, 0, 0);
      continue;
    }

    // If it's before 10 AM, move to 10 AM same day
    if (curHour < startHour) {
      date.setHours(startHour, 0, 0, 0);
      continue;
    }

    // If it's after 6 PM, move to 10 AM next day
    if (curHour >= endHour) {
      date.setDate(date.getDate() + 1);
      date.setHours(startHour, 0, 0, 0);
      continue;
    }

    // We are within working hours. Calculate how many hours left in current workday.
    const endOfDay = new Date(date);
    endOfDay.setHours(endHour, 0, 0, 0);
    const workdayRemainingMs = endOfDay.getTime() - date.getTime();
    const workdayRemainingHours = workdayRemainingMs / (1000 * 60 * 60);

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

export function formatTimeRemaining(deadline) {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  if (diff <= 0) return `<span style="color:var(--danger);font-weight:700">OVERDUE</span>`;

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `<span style="color:var(--primary);font-weight:600">${hours}h ${mins}m left</span>`;
}

