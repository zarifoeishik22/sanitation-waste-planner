// The planning layer (flows, contributions, phasing) and the workbook round trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../scripts/engine_dump.mjs';
import { makeT } from '../js/model/format.js';
import { buildContext, buildOwn, defaultState, WFD_FIELDS } from '../js/model/context.js';
import { systemIndex } from '../js/engine/sfd.js';
import { templateSheets, readTemplate } from '../js/engine/template.js';
import { writeWorkbook, readWorkbook } from '../js/xlsx/workbook.js';
import { phasing } from '../js/engine/analysis.js';

const d = { towns: load('towns.json'), sfd: load('sfd.json'), wfd: load('wfd.json'), rules: load('rules.json'), costs: load('costs.json'), params: load('params.json'),
  benchmarks: load('benchmarks.json'), sizing: load('sizing.json'), pubindex: load('pubindex.json'), unit_costs: load('unit_costs.json'), strings: load('strings.en.json') };
const sysIdx = systemIndex(d.rules);
const missing = new Set();
const base = makeT(d.strings);
const t = (k, v) => { if (!(k in d.strings)) missing.add(k); return base(k, v); };
const BROKEN = /NaN|undefined|Infinity|\{\w+\}|>null<|\[object/;
const CODE = /T\dA\dC\d/;
const text = (html) => html.replace(/<[^>]+>/g, ' ');
const id = (name) => String(d.towns.towns.find((x) => x.name === name).id);
const ctxOf = (state) => buildContext(d, { ...defaultState(), view: 'work', ...state }, t, '2026-11-16');

function checkHtml(html, where) {
  assert.ok(!/\sstyle=/.test(html), `${where}: no inline styles`);
  assert.ok(!BROKEN.test(html), `${where}: broken value ${(html.match(BROKEN) || [])[0]} near ${(html.match(new RegExp(`.{60}(${BROKEN.source}).{20}`)) || [])[0]}`);
  assert.ok(!CODE.test(text(html)), `${where}: an SFD system reference is visible`);
}

test('flows conserve: excreta bands add to the population, plastic escapes add to the WFD total', () => {
  for (const x of d.towns.towns) {
    const c = ctxOf({ townId: String(x.id) });
    const fates = c.flows.san.links.filter((l) => l.t.startsWith('f:')).reduce((a, l) => a + l.v, 0);
    const pop = c.flows.san.links.filter((l) => l.s.startsWith('g:')).reduce((a, l) => a + l.v, 0);
    assert.ok(Math.abs(fates - pop) / pop < 1e-4, `${x.name}: excreta in ${pop} equals excreta out ${fates}`);
    const esc = c.flows.plastic.links.filter((l) => l.t === 'p:escaped').reduce((a, l) => a + l.v, 0);
    assert.ok(Math.abs(esc - c.wv.plastic_unmanaged_t) < Math.max(0.5, 0.002 * c.wv.plastic_unmanaged_t), `${x.name}: escaped plastic ${esc} vs ${c.wv.plastic_unmanaged_t}`);
  }
});

test('the parts each action plays add up to the scenario', () => {
  const c = ctxOf({ townId: id('Kaliakair'), uptake: 60, treat: 50, wcol: 90, wctl: 100 });
  const dSafe = c.contrib.steps.reduce((a, s) => a + s.d_safe, 0);
  const dPl = c.contrib.steps.reduce((a, s) => a + s.d_plastic, 0);
  assert.ok(Math.abs(c.contrib.base.safe + dSafe - c.sc.safe) < 1e-9);
  assert.ok(Math.abs(c.contrib.base.plastic + dPl - c.ws.unmanaged_after_t) < 1e-6);
  assert.ok(!c.insights.some((i) => i.kind === 'hotspot'), 'Kaliakair: under 1% of escaping plastic reaches drains, so no shared hotspot is claimed');
  const hot = d.towns.towns.filter((x) => ctxOf({ townId: String(x.id) }).insights.some((i) => i.kind === 'hotspot'));
  assert.ok(hot.length > 0 && hot.length < d.towns.towns.length, `the shared hotspot is selective (${hot.length} towns)`);
});

test('existing assets come off the need; phasing spreads build cost over the years', () => {
  const c0 = ctxOf({ townId: id('Kaliakair'), treat: 100 });
  const v0 = c0.sizing.lines.find((l) => l.id === 'vehicles').units.value;
  const c1 = ctxOf({ townId: id('Kaliakair'), treat: 100, ops: { vehicles_existing: 2 } });
  const v1 = c1.sizing.lines.find((l) => l.id === 'vehicles');
  assert.equal(v1.units.need, v0);
  assert.equal(v1.units.value, Math.max(0, v0 - 2));
  const ph = phasing([{ id: 'x', kind: 'fstp', capex_total: 900 }], 5, {});
  assert.deepEqual(ph.spend, [0, 300, 300, 300, 0]);
});

test('the workbook goes out and comes back with every tier', async () => {
  const form = { name: 'Testpur', country: 'Bangladesh', district: 'Gazipur', population: '50000', households: '11000', sludge_pct: '40', share_T1A2C6: '60', emptied_T1A2C6: '30', share_T1A2C5: '40', emptied_T1A2C5: '20',
    msw_t_day: '20', collected_pct: '55', plastic_generated_t: '700', plastic_unmanaged_t: '300', stage_uncollected_t: '250', stage_disposal_t: '50', fate_land_t: '150', fate_water_t: '60', fate_burnt_t: '70', fate_drains_t: '20', organic_pct: '60' };
  const v = { form, ops: { vehicles_existing: 1, budget_year: 5000000, currency: 'BDT', start_year: 2027, plan_years: 6 }, wards: [{ ward: 'Ward 1', population: 6000, households: 1300, low_income_pct: 20 }],
    gov: { san_plan: 1, waste_fee: 2 }, rates: { vehicles: { capex: 4500000, opex: 300000, owner: 'Conservancy' } }, ruleOverrides: { trips_per_vehicle_day: 2 }, scenarios: [{ name: 'Quick wins', uptake: 30, treat: 50, wcol: 70, wctl: 0, compost: false }] };
  const bytes = writeWorkbook(templateSheets({ t, sysIdx, rules: d.rules, sizing: d.sizing, v, wfdFields: WFD_FIELDS, title: 'Testpur' }));
  const book = await readWorkbook(bytes);
  const r = readTemplate(book, { t, sysIdx, rules: d.rules, sizing: d.sizing, wfdFields: WFD_FIELDS });
  assert.deepEqual(r.problems, []);
  for (const [k, val] of Object.entries(form)) assert.equal(Number(r.form[k]) || r.form[k], Number(val) || val, `form ${k}`);
  assert.deepEqual(r.ops, v.ops);
  assert.deepEqual(r.wards, v.wards);
  assert.deepEqual(r.gov, v.gov);
  assert.deepEqual(r.rates.vehicles, { capex: 4500000, opex: 300000, owner: 'Conservancy' });
  assert.deepEqual(r.ruleOverrides, { trips_per_vehicle_day: 2 });
  assert.equal(r.scenarios[0].name, 'Quick wins');
  assert.equal(r.scenarios[0].uptake, 30);
  assert.deepEqual(r.tiers, { 1: ['sfd', 'wfd'], 2: ['ops', 'wards'], 3: ['costs', 'rules', 'gov'] });
  const own = buildOwn(r.form, sysIdx);
  assert.ok(own.own && own.own.sfdTown && own.own.wfdTown, 'the workbook builds a town');
  const text0 = JSON.stringify(book);
  assert.ok(!CODE.test(text0), 'no system references in the workbook');
});

test('a blank workbook reads back as empty, not as zeros', async () => {
  const book = await readWorkbook(writeWorkbook(templateSheets({ t, sysIdx, rules: d.rules, sizing: d.sizing, v: {}, wfdFields: WFD_FIELDS })));
  const r = readTemplate(book, { t, sysIdx, rules: d.rules, sizing: d.sizing, wfdFields: WFD_FIELDS });
  assert.deepEqual(r.form, {});
  assert.deepEqual(r.ops, {});
  assert.deepEqual(r.rates, {});
  assert.deepEqual(r.tiers, { 1: [], 2: [], 3: [] });
});

test("engineer's prices: conversions per household and per m3 a day are as stated", () => {
  const c = ctxOf({ townId: id('Kaliakair') });
  const pph = c.r.households.persons_per_household;
  const L = (lid) => c.full.lines.find((l) => l.id === lid);
  const uc = Object.fromEntries(d.unit_costs.items.map((i) => [i.id, i]));
  assert.ok(Math.abs(L('contain:New septic tank with soak pit').rate.capex - (uc.C07.typical + uc.C21.typical) * pph / 12.5) < 1e-6);
  assert.ok(Math.abs(L('contain:Convert dug hole to VIP latrine').rate.capex - uc.C05.typical * pph / 5) < 1e-6);
  assert.equal(L('fstp').rate.capex, uc.C12.typical / 25);
  assert.equal(L('vehicles').rate.capex, uc.C30.typical);
  assert.equal(L('beds').rate.source, 'included');
  assert.equal(L('land').units.value, Math.ceil(L('fstp').units.value * 3.6));
  assert.equal(c.currency, 'BDT');
});
