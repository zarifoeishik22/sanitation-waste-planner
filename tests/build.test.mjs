// The built page: it exists, asks only for the files that were built, and allows only the map hosts beyond itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(join(root, 'index.html')) && existsSync(join(root, 'assets'));

test('the built page refers only to files in assets/', { skip: built ? false : 'run npm run build first' }, () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 2, 'a script and a stylesheet');
  for (const r of refs) assert.ok(existsSync(join(root, r)), `${r} is missing`);
  assert.ok(readdirSync(join(root, 'assets')).filter((f) => /^index-.*\.js$/.test(f)).length === 1, 'one app bundle: no stale build left behind');
});

test('the page allows only itself and OpenStreetMap, and no inline script', () => {
  for (const file of ['app/index.html', ...(built ? ['index.html'] : [])]) {
    const html = readFileSync(join(root, file), 'utf8');
    const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'(;|$)/, 'scripts only from this site');
    const hosts = [...new Set([...csp.matchAll(/https?:\/\/[^\s;]+/g)].map((m) => m[0]))].sort();
    assert.deepEqual(hosts, ['https://nominatim.openstreetmap.org', 'https://tile.openstreetmap.org'], file);
    assert.ok(!/unsafe-eval/.test(csp));
    assert.ok(!/<script(?![^>]*src=)/.test(html) && !/\son\w+=/.test(html), `${file}: no inline script or handler`);
  }
});

test('the old offline copy is removed, not served', () => {
  const sw = readFileSync(join(root, 'app/public/sw.js'), 'utf8');
  assert.ok(sw.includes('caches.delete') && sw.includes('unregister') && !sw.includes('caches.open'));
  assert.ok(!existsSync(join(root, 'js/ui')) && !existsSync(join(root, 'vendor')) && !existsSync(join(root, 'css')));
});
