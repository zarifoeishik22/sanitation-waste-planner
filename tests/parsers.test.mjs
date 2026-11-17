// Acceptance check 5: the report parsers read the Kaliakair SFD Lite report and WFD portal page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { load } from '../scripts/engine_dump.mjs';
import { parseSfdReport } from '../js/parsers/sfd-report.js';
import { parseWfdPortal } from '../js/parsers/wfd-portal.js';
import { pdfToPages } from '../js/parsers/pdf-text.js';
import { buildSfdTown, buildWfdTown } from '../js/engine/custom.js';
import { systemIndex } from '../js/engine/sfd.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pagesOf = (rel) => readFileSync(join(root, 'tests', 'fixtures', rel), 'utf8').split('\n\f\n');
const sfd = load('sfd.json'), wfd = load('wfd.json'), rules = load('rules.json');

function checkSfd(f) {
  assert.equal(f.is_sfd_report, true);
  assert.deepEqual([f.town, f.date, f.population, f.households], ['Kaliakair', '2023-03-06', 277423, 68163]);
  const shares = Object.fromEntries(f.systems.map((s) => [s.code, s.share]));
  assert.deepEqual(shares, { T1A1C6: 0.096, T1A2C5: 0.059, T1A2C6: 0.415, T1A2C7: 0.072, T1A2C8: 0.111, T1A4C10: 0.012, T1A5C10: 0.163, T1A6C10: 0.03 });
  assert.equal(f.share_sum, 0.958, 'the prose leaves out T1A1C7 (3.0%) and T1A1C8 (1.2%)');
  const emptied = Object.fromEntries(f.systems.filter((s) => s.emptied !== null).map((s) => [s.code, s.emptied]));
  assert.deepEqual(emptied, { T1A2C5: 0.25, T1A2C6: 0.27, T1A2C7: 0.27, T1A2C8: 0.27, T1A4C10: 1, T1A5C10: 0.79 });
  assert.deepEqual([f.sludge_factor, f.stated_safe, f.no_treatment, f.conflicts.length], [0.68, 0.11, true, 0]);
}

function checkWfd(f) {
  assert.equal(f.is_wfd_portal, true);
  assert.deepEqual([f.town, f.population, f.msw_t_day, f.collected_share, f.plastic_generated_t, f.plastic_unmanaged_t], ['Kaliakair', 277423, 58, 0.53, 2374, 1158]);
  assert.deepEqual([f.stage_uncollected_t, f.stage_collection_t, f.stage_sorting_t, f.stage_transport_t, f.stage_disposal_t], [675, 107, 0, 4, 372]);
  assert.deepEqual([f.checks.stage_sum, f.checks.stage_ok, f.checks.fate_ok], [1158, true, true]);
  assert.deepEqual([f.fate_land_t, f.fate_drains_t, f.fate_water_t, f.fate_burnt_t], [557, 23, 174, 405]);
  assert.deepEqual([f.organic_share, f.comp_plastics, f.model_version, f.burning_model, f.disposal_burning_level], [0.8076, 0.1116, '2.0', 'modified open burning', 'High']);
  assert.equal(f.factor_set, 'University of Leeds (GIZ original set)');
}

test('SFD Lite report: Kaliakair values, with the shortfall the prose leaves', () => checkSfd(parseSfdReport(pagesOf('sfd/kaliakair-sfd-lite.pages.txt'))));

test('SFD Lite report: values agree with the 50-town master; the shortfall is flagged, not filled', () => {
  const f = parseSfdReport(pagesOf('sfd/kaliakair-sfd-lite.pages.txt'));
  const master = Object.fromEntries(sfd.towns['1'].systems.map((s) => [s.code, s]));
  for (const s of f.systems) {
    assert.ok(Math.abs(s.share - master[s.code].pop_share) < 0.0006, `${s.code} share`);
    if (s.emptied !== null) assert.equal(s.emptied, master[s.code].emptied_share, `${s.code} emptied`);
  }
  const built = buildSfdTown({ sludge_factor: f.sludge_factor, systems: f.systems }, systemIndex(rules));
  assert.equal(built.problems[0].key, 'share_sum');
  const full = buildSfdTown({ sludge_factor: f.sludge_factor, systems: [...f.systems, { code: 'T1A1C7', share: 0.03, emptied: 0 }, { code: 'T1A1C8', share: 0.012, emptied: 0 }] }, systemIndex(rules));
  assert.deepEqual(full.problems, []);
  assert.ok(Math.abs(full.sfdTown.flows.safe - f.stated_safe) < 0.006, 'rebuilt safe share matches the 11% the report states');
});

test('WFD portal page: Kaliakair values and sum checks', () => checkWfd(parseWfdPortal(pagesOf('wfd/kaliakair-portal.pages.txt'))));

test('WFD portal page against the master: the stages before disposal agree, disposal does not (open finding D32)', () => {
  const f = parseWfdPortal(pagesOf('wfd/kaliakair-portal.pages.txt'));
  const o = wfd.towns['1'].outputs;
  assert.ok(Math.abs(f.plastic_generated_t - o.plastic_generated_t) < 1);
  assert.ok(Math.abs(f.stage_uncollected_t - o.plastic_uncollected_t) < 1);
  assert.ok(f.plastic_unmanaged_t - o.plastic_unmanaged_t > 300, 'portal counts about 346 t/y more unmanaged plastic than the master');
  assert.ok(f.fate_burnt_t - o.fate_burnt_t > 300, 'and the gap is plastic burnt');
  assert.ok(buildWfdTown(f).wfdTown, 'typed-town structure builds from the parsed values');
});

test('a file that is neither report is recognised as such', () => {
  assert.equal(parseSfdReport(['Annual report 2023', 'Nothing here']).is_sfd_report, false);
  assert.equal(parseSfdReport(['Annual report 2023']).systems.length, 0);
  assert.equal(parseWfdPortal(['Annual report 2023']).is_wfd_portal, false);
});

// The PDFs themselves, when available on this machine (the WFD portal PDF is never committed).
for (const [name, env, parse, check] of [['SFD', 'SFD_PDF', parseSfdReport, checkSfd], ['WFD', 'WFD_PDF', parseWfdPortal, checkWfd]]) {
  const path = process.env[env];
  test(`${name} PDF read with pdf.js`, { skip: path && existsSync(path) ? false : `${env} not set` }, async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), isEvalSupported: false, verbosity: 0 }).promise;
    check(parse(await pdfToPages(doc)));
  });
}
