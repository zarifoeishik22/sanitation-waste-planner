// The one-page PDF says which reports its figures rest on: published, uploaded, edited after upload, or typed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../scripts/engine_dump.mjs';
import { makeT } from '../js/ui/render.js';
import { buildContext, buildOwn, defaultState, reportBasis } from '../js/ui/context.js';
import { renderPrint, basisLine } from '../js/ui/views.js';

const d = { towns: load('towns.json'), sfd: load('sfd.json'), wfd: load('wfd.json'), rules: load('rules.json'), costs: load('costs.json'), params: load('params.json'),
  benchmarks: load('benchmarks.json'), strings: load('strings.en.json') };
const t = makeT(d.strings);

test('published towns: PDF says it rests on the published SFD and WFD reports, with no disclaimer line', () => {
  for (const town of d.towns.towns) {
    const html = renderPrint(buildContext(d, { ...defaultState(d), townId: String(town.id) }, t, '2026-11-15'));
    assert.ok(html.includes('Based on the published SFD and WFD reports.'), town.name);
    assert.ok(!/Not an official publication/.test(html), town.name);
  }
});

const sfd = { share_T1A1C6: '60', emptied_T1A1C6: '0', share_T1A3C10: '40', emptied_T1A3C10: '50', sludge_pct: '100', population: '1000', households: '' };
const wfd = { msw_t_day: '5', collected_pct: '50', plastic_unmanaged_t: '100', stage_uncollected_t: '100', organic_pct: '', stage_disposal_t: '' };

test('reportBasis: uploaded, edited, typed, none', () => {
  const snap = { sfd: { ...sfd }, wfd: { ...wfd } };
  assert.deepEqual(reportBasis({ ...sfd, ...wfd }, snap, true), { sfd: 'uploaded', wfd: 'uploaded' });
  assert.deepEqual(reportBasis({ ...sfd, ...wfd, share_T1A1C6: '55' }, snap, true), { sfd: 'edited', wfd: 'uploaded' });
  assert.deepEqual(reportBasis({ ...sfd, ...wfd, share_T1A1C7: '5' }, snap, true).sfd, 'edited', 'a system added after upload counts as an edit');
  assert.deepEqual(reportBasis({ ...sfd, ...wfd, organic_pct: '40' }, snap, true).wfd, 'edited', 'a blank the report left, filled by hand, counts as an edit');
  assert.deepEqual(reportBasis({ ...sfd, ...wfd }, {}, true), { sfd: 'typed', wfd: 'typed' });
  assert.deepEqual(reportBasis({ ...sfd }, { sfd: { ...sfd } }, false), { sfd: 'uploaded', wfd: 'none' });
});

test('basisLine for typed towns', () => {
  const town = (b) => ({ typed: true, basis: b });
  assert.equal(basisLine(town({ sfd: 'uploaded', wfd: 'uploaded' }), t), 'Based on the uploaded SFD and WFD reports.');
  assert.equal(basisLine(town({ sfd: 'uploaded', wfd: 'none' }), t), 'Based on: SFD uploaded report; WFD not provided.');
  assert.equal(basisLine(town({ sfd: 'edited', wfd: 'typed' }), t), 'Based on: SFD uploaded report, then edited; WFD figures typed in.');
});

test('a typed town carries its basis into the PDF', () => {
  const sysIdx = buildContext(d, defaultState(d), t, 'x').sysIdx;
  const res = buildOwn({ name: 'Test', population: '1000', ...Object.fromEntries(Object.entries(sfd).filter(([k]) => k.startsWith('share_') || k.startsWith('emptied_'))), sludge_pct: '100' }, sysIdx);
  assert.ok(res.own, JSON.stringify(res.errors));
  res.own.town.basis = reportBasis(sfd, { sfd }, false);
  const html = renderPrint(buildContext(d, { ...defaultState(d), townId: 'own', own: res.own }, t, '2026-11-15'));
  assert.ok(html.includes('SFD uploaded report; WFD not provided'));
});
