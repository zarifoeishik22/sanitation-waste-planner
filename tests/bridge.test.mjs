// The drain loads, the listing check, the sizing bridge and the flags.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../scripts/engine_dump.mjs';
import { makeT } from '../js/model/format.js';
import { buildContext, buildOwn, defaultState, reportBasis } from '../js/model/context.js';
import { systemIndex } from '../js/engine/sfd.js';
import { checkListing, libraryFile, normName } from '../js/engine/pubindex.js';
import { ruleValues, sizeBridge, fullLevels } from '../js/engine/sizing.js';

const d = { towns: load('towns.json'), sfd: load('sfd.json'), wfd: load('wfd.json'), rules: load('rules.json'), costs: load('costs.json'), params: load('params.json'),
  benchmarks: load('benchmarks.json'), sizing: load('sizing.json'), pubindex: load('pubindex.json'), unit_costs: load('unit_costs.json'), strings: load('strings.en.json') };
const sysIdx = systemIndex(d.rules);
const missing = new Set();
const base = makeT(d.strings);
const t = (k, v) => { if (!(k in d.strings)) missing.add(k); return base(k, v); };
const BROKEN = /NaN|undefined|Infinity|\{\w+\}|>null<|\[object/;
const CODE = /T\dA\dC\d/;
const text = (html) => html.replace(/<[^>]+>/g, ' ');
const ctxOf = (state, dOver = {}) => buildContext({ ...d, ...dOver }, { ...defaultState(), view: 'work', ...state }, t, '2026-11-16');
const town = (name) => String(d.towns.towns.find((x) => x.name === name).id);

function checkHtml(html, where) {
  assert.ok(!/\sstyle=/.test(html), `${where}: no inline styles`);
  assert.ok(!BROKEN.test(html), `${where}: broken value ${(html.match(BROKEN) || [])[0]}`);
  assert.ok(!CODE.test(text(html)), `${where}: an SFD system reference is visible: ${(text(html).match(/.{20}T\dA\dC\d.{8}/) || [])[0]}`);
}

test("totals come only from the engineer's sheet or the user, never from draft figures", () => {
  const state = { townId: town('Kaliakair') };
  const noEng = ctxOf(state, { unit_costs: null });
  assert.equal(noEng.sizing.totals.priced, 0, 'without the engineer sheet nothing is priced');
  const ctx = ctxOf(state);
  for (const l of ctx.sizing.lines) {
    if (l.rate.source === 'engineer') assert.ok(l.capex_total > 0 && l.capex_range.low <= l.capex_total && l.capex_total <= l.capex_range.high, l.id);
    else assert.ok(['included', 'none'].includes(l.rate.source), `${l.id}: ${l.rate.source}`);
  }
  const compost = ctx.full.lines.find((l) => l.id === 'compost');
  assert.equal(compost.rate.source, 'none', 'the contradictory compost row is not used');
  const user = ctxOf({ ...state, rates: { vehicles: { capex: 1000, opex: 10 } } });
  const v = user.sizing.lines.find((l) => l.id === 'vehicles');
  assert.equal(v.rate.source, 'user');
  assert.equal(v.capex_total, 1000 * v.units.value);
  assert.equal(v.capex_range, null, 'a user rate has no engineer range');
});

test('sizing bridge by hand: a town of 10,000 households, half on leaking septic tanks', () => {
  const form = { name: 'Test', population: '50000', households: '10000', share_T1A2C6: '50', emptied_T1A2C6: '40', share_T1A2C5: '50', emptied_T1A2C5: '20', sludge_pct: '100',
    msw_t_day: '20', collected_pct: '50', plastic_generated_t: '700', plastic_unmanaged_t: '300', stage_uncollected_t: '300', organic_pct: '75' };
  const res = buildOwn(form, sysIdx);
  assert.ok(res.own, JSON.stringify(res.errors));
  const ctx = ctxOf({ townId: 'own', own: res.own, country: 'Bangladesh' });
  const line = (id) => ctx.full.lines.find((l) => l.id === id);
  assert.equal(line('contain:Connect septic tank to soak pit').units.value, 5000);
  // emptying households: 5,000 x 40% + 5,000 x 20% = 3,000; every 4 years = 750 emptyings; 2 m3 each = 1,500 m3 a year
  assert.equal(line('vehicles').deficit.emptyings, 750);
  assert.equal(line('vehicles').units.value, 1); // 750 / (3 x 300)
  assert.equal(line('fstp').units.value, 5); // 1,500 / 300 days
  assert.equal(line('beds').units.value, 200); // 1,500 x 20 kg / 150
  assert.equal(line('collection').units.value, 7); // 20 x (0.9 - 0.5) = 8 t/day / 1.2 -> 6.67 -> 7
  assert.equal(line('compost').units.modules, 3); // 20 x 0.9 x 0.75 x 0.5 = 6.75 t/day / 3 -> 3 modules
  assert.equal(line('compost').units.compost_t_day, 1.7); // 6.75 x 0.25
  // a changed rule changes the result
  const r2 = sizeBridge({ r: ctx.r, wv: ctx.wv, levels: fullLevels(ctx.wv), rules: ruleValues(d.sizing, { empty_interval_years: 2 }), costs: d.costs, ruleOptions: d.rules.options });
  assert.equal(r2.lines.find((l) => l.id === 'fstp').units.value, 10);
});

test('listing check: listed, not listed, not checked, and the SuSanA file name', () => {
  assert.equal(checkListing('Kaliakair', 'Bangladesh', d.pubindex).status, 'listed');
  assert.equal(checkListing('Kaliakair Paurashava', 'Bangladesh', d.pubindex).status, 'listed');
  assert.equal(checkListing('Nangalkot', 'Bangladesh', d.pubindex).status, 'not_listed', 'in a covered range and absent');
  assert.equal(checkListing('Ishwardi', 'Bangladesh', d.pubindex).status, 'not_checked', 'outside the covered ranges');
  assert.equal(checkListing('', null, d.pubindex).status, 'not_checked');
  assert.deepEqual(libraryFile('3-5207-7-1696859617.pdf'), { id: 5207, date: '2023-10-09' });
  assert.deepEqual(libraryFile('fc95a513-3-5207-7-1696859617.pdf'), { id: 5207, date: '2023-10-09' });
  assert.equal(libraryFile('report.pdf'), null);
  assert.equal(normName("Cox's Bazar Municipality"), 'coxsbazar');
  for (const e of d.pubindex.entries) assert.ok(e.name && e.country && (e.year === null || (e.year >= 2014 && e.year <= 2026)), JSON.stringify(e));
});

test('flags: the portal difference for Kaliakair; a stated figure that the shares do not rebuild; hand-filled shares', () => {
  assert.ok(ctxOf({ townId: town('Kaliakair') }).flags.some((f) => f.id === 'portal_differs'));
  const form = { name: 'Kaliakair', population: '1000', share_T1A2C6: '60', emptied_T1A2C6: '0', share_T1A2C5: '40', emptied_T1A2C5: '0', sludge_pct: '100' };
  const res = buildOwn(form, sysIdx);
  res.own.town.meta = { basis: { sfd: 'edited', wfd: 'none' }, sfd_basis: 'edited', stated_safe: 0.11, share_sum: 0.958, sfd_file: '3-5207-7-1696859617.pdf' };
  const ctx = ctxOf({ townId: 'own', own: res.own, country: 'Bangladesh' });
  const ids = ctx.flags.map((f) => f.id);
  assert.ok(ids.includes('safe_mismatch') && ids.includes('shares_filled'), ids.join(','));
  assert.equal(ctx.listing.status, 'listed');
  assert.equal(ctx.listing.file.id, 5207);
});

test('one report alone: sanitation only and solid waste only both build', () => {
  const sfdOnly = buildOwn({ name: 'A', population: '1000', share_T1A1C6: '30', share_T1A5C10: '70', emptied_T1A5C10: '10' }, sysIdx);
  let ctx = ctxOf({ townId: 'own', own: sfdOnly.own });
  assert.ok(ctx.r && !ctx.wv && ctx.pl0 === null);
  const wfdOnly = buildOwn({ name: 'B', population: '1000', msw_t_day: '5', collected_pct: '40', plastic_generated_t: '100', plastic_unmanaged_t: '50', stage_uncollected_t: '50', fate_water_t: '20', fate_land_t: '30' }, sysIdx);
  assert.ok(wfdOnly.own, JSON.stringify(wfdOnly.errors));
  ctx = ctxOf({ townId: 'own', own: wfdOnly.own });
  assert.ok(!ctx.r && ctx.wv && ctx.ex0 === null && ctx.verdict.sanitation === null && ctx.verdict.waste);
  assert.ok(ctx.sizing.lines.every((l) => l.domain === 'waste'));
  assert.equal(buildOwn({ name: 'C', population: '10' }, sysIdx).errors[0].key, 'err.nothing');
});

test('what the figures rest on: published, uploaded, edited, typed', () => {
  const sfd = { share_T1A1C6: '60', emptied_T1A1C6: '0', share_T1A3C10: '40', emptied_T1A3C10: '50', sludge_pct: '100', population: '1000', households: '' };
  const wfd = { msw_t_day: '5', collected_pct: '50', plastic_unmanaged_t: '100', organic_pct: '' };
  const snap = { sfd: { ...sfd }, wfd: { ...wfd } };
  const both = { sfd: true, wfd: true };
  assert.deepEqual(reportBasis({ ...sfd, ...wfd }, snap, both), { sfd: 'uploaded', wfd: 'uploaded' });
  assert.deepEqual(reportBasis({ ...sfd, ...wfd, share_T1A1C7: '5' }, snap, both).sfd, 'edited', 'a system added after upload counts as an edit');
  assert.deepEqual(reportBasis({ ...sfd, ...wfd, organic_pct: '40' }, snap, both).wfd, 'edited');
  assert.deepEqual(reportBasis({ ...sfd }, {}, { sfd: true, wfd: false }), { sfd: 'typed', wfd: 'none' });
});
