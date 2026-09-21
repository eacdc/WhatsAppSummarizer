/**
 * The dashboard has no build step and no framework, so this is the whole test
 * setup: stub the two browser globals app.js touches at import time, then run
 *
 *   node --test
 *
 * from this folder. It exists for one rule - which backend the page talks to -
 * because getting that wrong is silent: the page loads, the login box appears,
 * and every call fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { hostname: 'localhost', pathname: '/index.html', hash: '', search: '' };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { apiBaseFor } = await import('./app.js');

const LOCAL = 'http://localhost:3001';
const DEPLOYED = 'https://cdcapi.onrender.com';

test('a page served locally talks to a local backend', () => {
  assert.equal(apiBaseFor('localhost'), LOCAL);
  assert.equal(apiBaseFor('127.0.0.1'), LOCAL);
});

test('a page opened straight off disk does too', () => {
  // file:// gives an empty hostname, and that is a developer, not a deployment.
  assert.equal(apiBaseFor(''), LOCAL);
});

test('a page served from anywhere else talks to the deployed backend', () => {
  assert.equal(apiBaseFor('whatsappsummarizer.onrender.com'), DEPLOYED);
});

test('the deployed backend is https', () => {
  // An http address on an https page is blocked as mixed content before the
  // request is made - which is exactly how the first Render deploy broke.
  assert.match(apiBaseFor('whatsappsummarizer.onrender.com'), /^https:/);
});

test('wa_api_base still overrides everything', () => {
  // For testing the deployed dashboard against a backend on the bench.
  assert.equal(
    apiBaseFor('whatsappsummarizer.onrender.com', 'http://192.168.0.156:3001'),
    'http://192.168.0.156:3001',
  );
});
