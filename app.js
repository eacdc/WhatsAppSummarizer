/**
 * Shared dashboard plumbing: API base, auth, fetch wrapper, formatting.
 * No build step and no framework - open a page and it runs.
 */

/** Where the CDC backend lives. Override once here when deploying. */
const DEFAULT_API = 'http://localhost:3001';

export const API = localStorage.getItem('wa_api_base') || DEFAULT_API;
const TOKEN_KEY = 'wa_token';

export const token = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/**
 * Every call goes through here so a 401 always means the same thing: the
 * session is gone, drop the token and show the login form rather than
 * rendering a half-broken page.
 */
export async function api(path, options = {}) {
  const res = await fetch(`${API}/api/whatsapp-monitor${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.get() ?? ''}`,
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    token.clear();
    showLogin();
    throw new Error('Session expired');
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function login(username, password) {
  const res = await fetch(`${API}/api/cdc-bills/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Login failed');
  token.set(body.token);
  return body.user;
}

// ---------------------------------------------------------------- chrome

const PAGES = [
  ['index.html', 'Dashboard'],
  ['concerns.html', 'Concerns'],
  ['admin.html', 'Admin'],
];

export function chrome() {
  const here = location.pathname.split('/').pop() || 'index.html';
  const nav = PAGES.map(
    ([href, label]) =>
      `<a href="${href}"${href === here ? ' aria-current="page"' : ''}>${label}</a>`,
  ).join('');

  document.body.insertAdjacentHTML(
    'afterbegin',
    `<header class="top"><strong>WhatsApp Monitor</strong><nav>${nav}</nav>
     <button id="logout" type="button">Log out</button></header>`,
  );
  document.getElementById('logout').onclick = () => {
    token.clear();
    location.reload();
  };
}

/** Replaces the page with a login form. Shown on first visit and on any 401. */
export function showLogin() {
  document.body.innerHTML = `
    <main>
      <h1>WhatsApp Monitor</h1>
      <p class="sub">Sign in with your CDC account.</p>
      <div id="loginErr"></div>
      <form id="loginForm" class="card">
        <p><label>Username<br><input name="username" autocomplete="username" required autofocus></label></p>
        <p><label>Password<br><input name="password" type="password" autocomplete="current-password" required></label></p>
        <button class="primary" type="submit">Sign in</button>
      </form>
    </main>`;

  const form = document.getElementById('loginForm');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await login(form.username.value.trim(), form.password.value);
      location.reload();
    } catch (err) {
      document.getElementById('loginErr').innerHTML = notice(err.message, 'err');
      btn.disabled = false;
    }
  };
}

/** Call at the top of every page. Returns false when the user must log in first. */
export function requireLogin() {
  if (!token.get()) {
    showLogin();
    return false;
  }
  chrome();
  return true;
}

// ------------------------------------------------------------ formatting

/** Escapes before interpolation. Message text is written by people we don't control. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}

export function notice(text, kind = 'info') {
  return `<div class="notice ${kind}">${esc(text)}</div>`;
}

/** "4m ago", "3h ago", "2d ago" - a manager wants elapsed time, not a timestamp. */
export function ago(value) {
  if (!value) return '-';
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export function when(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export const sevPill = (s) => `<span class="pill sev-${esc(s)}">${esc(s)}</span>`;
export const statusPill = (s) => `<span class="pill st-${esc(s)}">${esc(s)}</span>`;

/**
 * Renders the four summary buckets, skipping empty ones. An empty window is a
 * correct summary, so four empty headings would be noise rather than
 * information.
 */
export function bullets(b) {
  if (!b) return '<p class="empty">No summary yet.</p>';
  const parts = [
    ['Decisions', b.decisions],
    ['Open issues', b.openIssues],
    ['Blocked', b.blocked],
    ['Notable', b.notable],
  ]
    .filter(([, items]) => items?.length)
    .map(
      ([label, items]) =>
        `<div class="bucket"><b>${label}</b><ul class="bullets">${items
          .map((i) => `<li>${esc(i)}</li>`)
          .join('')}</ul></div>`,
    );
  return parts.length ? parts.join('') : '<p class="empty">Nothing to report in this window.</p>';
}

/** Wraps a page render so an unexpected failure shows a message, not a blank screen. */
export async function render(el, fn) {
  try {
    await fn();
  } catch (err) {
    if (err.message !== 'Session expired') {
      el.innerHTML = notice(err.message, 'err');
    }
  }
}
