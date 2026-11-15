// Acceptance check 9, the static half: the offline list names every file the page can ask for, and the page allows no other origin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir) => readdirSync(join(root, dir)).flatMap((f) => {
  const rel = `${dir}/${f}`;
  if (statSync(join(root, rel)).isDirectory()) return rel === 'data/source' ? [] : walk(rel);
  return /\.(css|js|mjs|json|woff2)$/.test(f) ? [rel] : [];
});

test('the offline list covers every page file', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const list = JSON.parse(sw.slice(sw.indexOf('['), sw.indexOf('];') + 1));
  const wanted = ['index.html', ...walk('css'), ...walk('js'), ...walk('data'), ...walk('vendor')];
  assert.deepEqual(wanted.filter((f) => !list.includes(f)), [], 'files missing from PRECACHE in sw.js');
  assert.deepEqual(list.filter((f) => f !== './' && !wanted.includes(f)), [], 'PRECACHE names files that do not exist');
});

test('the page allows no other origin and no inline code', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /connect-src 'self'/);
  assert.ok(!/unsafe-inline|unsafe-eval|https?:/.test(csp), csp);
  assert.ok(!/<script(?![^>]*src=)/.test(html) && !/\sstyle=/.test(html) && !/\son\w+=/.test(html), 'no inline script, style or handler');
  const code = [...walk('js'), 'sw.js'].map((f) => readFileSync(join(root, f), 'utf8')).join('\n');
  assert.ok(!/fetch\(\s*[`'"]https?:/.test(code) && !/XMLHttpRequest|sendBeacon|WebSocket/.test(code), 'page code calls no other site');
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(code), 'nothing is stored in the browser');
});
