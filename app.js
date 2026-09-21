/**
 * Shared dashboard plumbing: API base, auth, fetch wrapper, formatting.
 * No build step and no framework - open a page and it runs.
 */

/**
 * Where the CDC backend lives.
 *
 * A static site has no environment variables at runtime, so the deployed API
 * address is a constant here. It is the site's own public address, visible in
 * every network request the page makes - not a secret, and not the kind of
 * thing the no-hard-coding rule was written for.
 *
 * Chosen by where the page itself came from: opened from a file or served off
 * localhost, it talks to a local backend; served from anywhere else, it talks
 * to the deployed one. A plain `http://localhost:3001` default was wrong twice
 * over once this went to Render - the wrong host, and plain http from an https
 * page, which the browser blocks as mixed content before the request is made.
 */
const LOCAL_API = 'http://localhost:3001';
const DEPLOYED_API = 'https://cdcapi.onrender.com';

export function apiBaseFor(hostname, override) {
  if (override) return override;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === ''
    ? LOCAL_API
    : DEPLOYED_API;
}

export const API = apiBaseFor(location.hostname, localStorage.getItem('wa_api_base'));
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

// ---------------------------------------------------------------- routing

/**
 * Page parameters, read from the fragment (`#id=...`) rather than the query
 * string.
 *
 * A fragment is never sent to the server, so no rewrite, redirect or cached
 * redirect can strip it. A query string can be, and was: a host serving clean
 * URLs 301s `concerns.html?id=x` to `/concerns` and drops the id, and because a
 * 301 never expires, every browser that saw one keeps doing it long after the
 * host is fixed.
 *
 * `location.search` is still read as a fallback so older links and bookmarks
 * keep working.
 */
export function routeParams() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  if ([...hash.keys()].length > 0) return hash;
  return new URLSearchParams(location.search);
}

/**
 * Run a page's router now, and again whenever the fragment changes.
 *
 * Moving between `concerns.html#id=1` and `concerns.html` is a same-document
 * navigation: the browser fires `hashchange` and does NOT reload, so without
 * this the previous view would simply stay on screen.
 */
export function onRoute(fn) {
  fn();
  window.addEventListener('hashchange', fn);
}

// ---------------------------------------------------------------- chrome

const PAGES = [
  ['index.html', 'Dashboard'],
  ['concerns.html', 'Concerns'],
  ['admin.html', 'Admin'],
];

export function chrome() {
  // Hosts that serve clean URLs give a pathname of "concerns", not
  // "concerns.html", so compare with the extension stripped or the current tab
  // stops being marked.
  const here = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
  const nav = PAGES.map(
    ([href, label]) =>
      `<a href="${href}"${href.replace(/\.html$/, '') === here ? ' aria-current="page"' : ''}>${label}</a>`,
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
 * The status pills for a concern, including the advisory "possibly resolved".
 *
 * That one is not a stored status: the concern is still `open` and still needs
 * a human to press Resolve. It means the reply thread reads as though the
 * problem is over - which is a hint worth showing beside the button, not a
 * decision the tool gets to make.
 */
export const concernPills = (c) =>
  statusPill(c.status) +
  (c.status === 'open' && c.resolutionHint
    ? '<span class="pill st-possibly">possibly resolved</span>'
    : '');

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
