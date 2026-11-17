// The planning wizard's model: packages by payer, money by year, findings, the plan document, the Word file and the workbook.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../scripts/engine_dump.mjs';
import { makeT, money, inUnit } from '../js/model/format.js';
import { systemIndex } from '../js/engine/sfd.js';
import { buildOwn } from '../js/model/context.js';
import { defaultWizard, compute, wizardSheets, readWizardBook, applySfd, applyWfd, analyseForm, currentForm } from '../js/model/wizard.js';
import { fitToBudget } from '../js/model/packages.js';
import { packageWords } from '../js/model/describe.js';
import { planDocument } from '../js/model/document.js';
import { writeDocx } from '../js/model/docx.js';
import { writeWorkbook, readWorkbook } from '../js/xlsx/workbook.js';
import { readZip } from '../js/xlsx/zip.js';

const d = { towns: load('towns.json'), sfd: load('sfd.json'), wfd: load('wfd.json'), rules: load('rules.json'), costs: load('costs.json'), params: load('params.json'),
  benchmarks: load('benchmarks.json'), sizing: load('sizing.json'), pubindex: load('pubindex.json'), unit_costs: load('unit_costs.json'), places: load('places.json'), strings: load('strings.en.json') };
const sysIdx = systemIndex(d.rules);
const t = makeT(d.strings);
const TODAY = '2026-11-17';
const id = (name) => d.towns.towns.find((x) => x.name === name).id;
const wiz = (name, over = {}) => { const w = defaultWizard(); w.townId = id(name); return { ...w, ...over, answers: { ...w.answers, ...(over.answers || {}) } }; };
const run = (w) => compute(d, w, t, TODAY);
const crore = (v) => Math.round(v / 1e5) / 100;
const BROKEN = /NaN|undefined|Infinity|\[object|\bnull\b/;
const flat = (o) => JSON.stringify(o, (k, v) => (v === null ? undefined : v));
const docOf = (w, c) => planDocument({ ctx: c.ctx, plan: c.plan, find: c.find, w, district: c.district, portal: c.portal, today: TODAY });

test('Kaliakair: each package alone gives the agreed quantities, payers and prices', () => {
  const c = run(wiz('Kaliakair', { on: { collect: true, treat: true, toilets: false } }));
  const [collect, treat, toilets] = c.plan.packages;
  const units = (p, kind) => p.lines.find((l) => l.kind === kind).units.value;
  assert.equal(units(collect, 'collection'), 19);
  assert.equal(units(collect, 'bins'), 25552);
  assert.equal(collect.lines.find((l) => l.kind === 'bins').payer, 'households', 'bins are bought by households');
  assert.equal(crore(collect.capex.municipality), 0.29);
  assert.equal(units(treat, 'vehicles'), 7);
  assert.equal(units(treat, 'fstp'), 36);
  assert.equal(units(treat, 'land'), 130);
  assert.equal(crore(treat.capex.partners), 17.98);
  assert.deepEqual(toilets.alone.lines.map((l) => l.units.value), [40727, 8582, 838]);
  assert.equal(crore(toilets.alone_capex.households), 50.96);
  assert.equal(crore(c.plan.money.public), 18.27);
  assert.equal(Math.round(c.plan.money.per_resident_year), 132);
  assert.deepEqual(c.plan.years.map((y) => [y.year, crore(y.municipality), crore(y.partners)]), [[2027, 0.14, 6.5], [2028, 0.14, 3.83], [2029, 0, 3.83], [2030, 0, 3.83], [2031, 0, 0]]);
  assert.equal(crore(c.plan.money.running), 0.61);
  assert.equal(Math.round(c.plan.end.safe * 1000), 374);
  assert.equal(Math.round(c.plan.end.plastic), 322);
});

test('Kaliakair: with household works on, treatment grows and public money is counted once, by payer', () => {
  const c = run(wiz('Kaliakair'));
  const treat = c.plan.packages[1];
  assert.ok(treat.grows);
  assert.equal(crore(treat.capex.partners), 20.15);
  assert.equal(crore(c.plan.money.public), 20.43);
  assert.equal(crore(c.plan.money.households), 52.49, 'household works and bins stay in the households column');
  assert.ok(c.plan.end.safe > 0.999);
  const sumYears = c.plan.years.reduce((a, y) => a + y.public, 0);
  assert.ok(Math.abs(sumYears - c.plan.money.public) < 1, 'the years add up to the total');
  // The town's answers move money between payers and off the bill.
  const muni = run(wiz('Kaliakair', { answers: { pays: 'municipality' } }));
  assert.equal(crore(muni.plan.money.municipality), 51.25);
  const held = run(wiz('Kaliakair', { answers: { land: 'yes' } }));
  assert.equal(crore(held.plan.money.partners), 12.8);
  assert.equal(held.plan.groups.find((g) => g.id === 'plant').start, 0, 'with land in hand the plant can start in the first year');
  const have = run(wiz('Kaliakair', { answers: { tankers: '3', vans: '19', fstp: '10' } }));
  assert.equal(have.plan.lines.find((l) => l.kind === 'vehicles').units.value, 4);
  assert.equal(have.plan.lines.find((l) => l.kind === 'collection').units.value, 0);
  assert.equal(have.plan.lines.find((l) => l.kind === 'fstp').units.value, 30.7);
});

test('budget: the municipal share is checked year by year and can be stretched to fit', () => {
  const tight = run(wiz('Kaliakair', { answers: { budget: '0.7' } }));
  assert.equal(tight.plan.budget.value, 7e6);
  assert.ok(tight.plan.years[0].fits && !tight.plan.budget.fits === tight.plan.years.some((y) => !y.fits));
  const w = wiz('Kaliakair', { answers: { budget: '0.1' }, on: { collect: true, treat: false, toilets: false } });
  const c = run(w);
  assert.ok(!c.plan.budget.fits);
  const ph = fitToBudget(c.plan, c.plan.budget.value);
  assert.ok(ph && ph.collect.years > 2);
  const after = run({ ...w, phase: ph });
  assert.ok(after.plan.years[0].municipality < c.plan.years[0].municipality);
});

test('the plastic figure the planner chooses in step 2 carries through', () => {
  const a = run(wiz('Kaliakair'));
  const b = run(wiz('Kaliakair', { plastic: 'portal' }));
  assert.equal(Math.round(a.plan.base.plastic), 812);
  assert.equal(Math.round(b.plan.base.plastic), 1158);
  assert.ok(Math.abs(b.ctx.wv.fates.reduce((s, f) => s + f.tonnes, 0) - 1158) < 0.01, 'where it ends up still adds to the total');
  assert.ok(docOf(wiz('Kaliakair', { plastic: 'portal' }), b).confirm.some((x) => x.includes('1,158')));
});

test('every town: packages, findings and the document build with no broken values', () => {
  for (const x of d.towns.towns) {
    for (const over of [{}, { answers: { gw: 'most', pays: 'subsidy', land: 'yes', budget: '2' } }, { on: { collect: true, treat: false, toilets: false } }]) {
      const w = wiz(x.name, over);
      const c = run(w);
      assert.ok(c.district, `${x.name} has a district`);
      assert.ok(c.place && c.place.centre.length === 2, `${x.name} has a place on the map`);
      assert.ok(c.find.gaps.length >= 1 && c.find.gaps.every((g) => c.plan.packages.find((p) => p.id === g.pkg).available), `${x.name}: each gap leads to a package`);
      const words = c.plan.packages.map((p) => packageWords(p, c.plan, w.answers));
      const doc = docOf(w, c);
      const all = flat({ words, doc, find: c.find });
      assert.ok(!BROKEN.test(all), `${x.name}: broken value "${(all.match(new RegExp(`.{50}(${BROKEN.source}).{20}`)) || [])[0]}"`);
      assert.ok(!/T\dA\dC\d/.test(all), `${x.name}: an SFD system reference is visible`);
      for (const y of c.plan.years) assert.ok(Number.isFinite(y.public) && y.public >= 0);
    }
  }
  assert.equal(run(wiz('Sreepur')).district, 'Gazipur');
});

test('one report alone: only the packages that report supports are offered', () => {
  const mk = (form) => { const w = defaultWizard(); w.ownForm = form; const a = analyseForm(w, sysIdx, t); assert.ok(a.own, JSON.stringify(a.msgs)); return { ...w, townId: 'own', own: a.own }; };
  const sfd = run(mk({ name: 'A', population: '1000', share_T1A1C6: '30', share_T1A5C10: '70', emptied_T1A5C10: '10' }));
  assert.deepEqual(sfd.plan.packages.map((p) => p.reason), ['no_wfd', null, null]);
  const wfd = run(mk({ name: 'B', population: '1000', msw_t_day: '5', collected_pct: '40', plastic_generated_t: '100', plastic_unmanaged_t: '50', stage_uncollected_t: '50', fate_water_t: '20', fate_land_t: '30' }));
  assert.deepEqual(wfd.plan.packages.map((p) => p.reason), [null, 'no_sfd', 'no_sfd']);
  assert.ok(wfd.plan.money.public > 0 && wfd.find.gaps.length === 1);
});

test('reports read from files land on the form; a published town keeps its other report', () => {
  const c = run(wiz('Ishwardi'));
  const form = currentForm(c.ctx, wiz('Ishwardi'), c.district);
  const wf = applyWfd(form, { town: 'Ishwardi', population: null, msw_t_day: 30, collected_share: 0.6, plastic_generated_t: 900, plastic_unmanaged_t: 300, stage_uncollected_t: 250, stage_collection_t: 20, stage_sorting_t: 0,
    stage_transport_t: 5, stage_disposal_t: 25, fate_land_t: 200, fate_water_t: 60, fate_burnt_t: 35, fate_drains_t: 5, organic_share: 0.7, model_version: '1', burning_model: 'x' });
  assert.equal(wf.form.plastic_unmanaged_t, '300');
  assert.ok(Object.keys(wf.form).some((k) => k.startsWith('share_')), 'the SFD figures stay');
  const w = { ...defaultWizard(), ownForm: wf.form, upSnap: { wfd: wf.snap }, upMeta: { wfd: wf.meta }, country: 'Bangladesh' };
  const a = analyseForm(w, sysIdx, t);
  const own = run({ ...w, townId: 'own', own: a.own });
  assert.equal(Math.round(own.plan.base.plastic), 300);
  assert.equal(Math.round(own.plan.base.safe * 1000), Math.round(c.plan.base.safe * 1000));
  assert.ok(own.place, 'a known town keeps its place on the map');
  const sf = applySfd({}, { town: 'X', population: 5000, households: 1000, sludge_factor: 0.5, share_sum: 1, stated_safe: null, date: '2024-01-01', systems: [{ code: 'T1A2C6', share: 0.6, emptied: 0.2 }, { code: 'T1A2C5', share: 0.4, emptied: 0.5 }] }, 'x.pdf', ['Bangladesh'], sysIdx, d, '');
  assert.equal(sf.form.share_T1A2C6, '60');
  assert.equal(sf.country, 'Bangladesh');
});

test('the workbook carries every answer and choice out and back', async () => {
  const w = wiz('Kaliakair', { answers: { start_year: '2028', plan_years: '10', budget: '2.5', tankers: '2', vans: '5', fstp: '12', site: 'dump', land: 'yes', pays: 'subsidy', gw: 'some' },
    plastic: 'portal', on: { collect: true, treat: true, toilets: false }, phase: { collect: { start: 1, years: 3 } }, sites: { plant: [90.2645, 24.1033], disposal: null } });
  const c = run(w);
  const bytes = writeWorkbook(wizardSheets({ d, w, ctx: c.ctx, t, district: c.district, sysIdx }));
  const back = readWizardBook(await readWorkbook(bytes), { d, t, sysIdx });
  assert.deepEqual(back.answers, w.answers);
  assert.deepEqual(back.on, w.on);
  assert.deepEqual(back.phase, w.phase);
  assert.deepEqual(back.sites, w.sites);
  assert.equal(back.plastic, 'portal');
  assert.equal(back.ownForm.name, 'Kaliakair');
  assert.equal(back.ownForm.district, 'Gazipur');
  const again = { ...defaultWizard(), ...back, townId: 'own' };
  again.own = analyseForm(again, sysIdx, t).own;
  const c2 = run(again);
  assert.equal(crore(c2.plan.money.public), crore(c.plan.money.public), 'the reloaded plan costs the same');
  assert.equal(Math.round(c2.plan.base.plastic), 1158, 'the chosen plastic figure is in the saved WFD figures');
  const blank = readWizardBook(await readWorkbook(writeWorkbook(wizardSheets({ d, w: defaultWizard(), ctx: null, t, sysIdx, blank: true }))), { d, t, sysIdx });
  assert.equal(blank, null, 'a blank workbook is not a town');
});

test('the plan document: sections, tables that add up, and a Word file that opens', async () => {
  const w = wiz('Kaliakair');
  const c = run(w);
  const doc = docOf(w, c);
  assert.equal(doc.title, 'Kaliakair Municipality');
  assert.equal(doc.subtitle, 'Sanitation and waste management plan, 2027 to 2031');
  assert.deepEqual(doc.sections.map((s) => s.h[0]), ['1', '2', '3', '4', '5', '6']);
  const cost = doc.sections[2].blocks[0].table;
  assert.deepEqual(cost.head, ['BDT crore', '2027', '2028', '2029', '2030', '2031', 'Total']);
  assert.equal(cost.rows.at(-1).at(-1), inUnit(c.plan.money.public, 'BDT'));
  assert.ok(doc.assumed.some((x) => x.includes('No yearly budget')) && doc.confirm.some((x) => x.includes('[TO BE ASSIGNED]')));
  assert.ok(docOf(wiz('Kaliakair', { answers: { budget: '3', tankers: '0', vans: '0', fstp: '0', land: 'no', gw: 'no', site: 'dump', start_year: '2027' } }), c).assumed.every((x) => x.includes('sizing rules')), 'answered questions leave the assumed list');
  const files = await readZip(writeDocx(doc, 'footer'));
  const xml = new TextDecoder().decode(files.get('word/document.xml'));
  assert.ok(xml.includes('Kaliakair Municipality') && xml.includes('<w:tbl>') && xml.includes('20.43'));
  assert.ok(!/&(?!amp;|lt;|gt;|quot;)/.test(xml), 'text is escaped');
  assert.equal(money(2850000), 'BDT 0.29 crore');
  assert.equal(money(3907.19), 'BDT 3,900');
});
