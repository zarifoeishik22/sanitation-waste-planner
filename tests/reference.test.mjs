// Acceptance check 2: the JS engine equals the independent Python reference
// on all 50 towns, both groundwater settings, both household bases and all cost cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { dumpAll } from '../scripts/engine_dump.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const py = spawnSync('python3', [join(root, 'scripts', 'reference_engine.py')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

test('check 2: JS engine equals the Python reference', { skip: py.error || py.status !== 0 ? 'python3 not available' : false }, () => {
  const ref = JSON.parse(py.stdout);
  const js = JSON.parse(JSON.stringify(dumpAll()));
  let n = 0;
  const walk = (a, b, path) => {
    if (a !== null && typeof a === 'object') {
      assert.deepEqual(Object.keys(a).sort(), Object.keys(b ?? {}).sort(), path);
      for (const k of Object.keys(a)) walk(a[k], b[k], `${path}/${k}`);
    } else if (typeof a === 'number' && typeof b === 'number') {
      n += 1;
      assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)), `${path}: ${a} vs ${b}`);
    } else {
      n += 1;
      assert.equal(a, b, path);
    }
  };
  walk(ref, js, '');
  assert.equal(Object.keys(ref).length, 200);
  assert.ok(n > 50000, `compared ${n} values`);
});
