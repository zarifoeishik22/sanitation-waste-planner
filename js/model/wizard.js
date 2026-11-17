// The planning wizard's state and everything derived from it: one place the six steps, the workbook and the plan document read.
// Steps: 1 town, 2 reports, 3 your town, 4 what we found, 5 build the plan, 6 plan document. No DOM access.

import { buildContext, buildOwn, defaultState, reportBasis, WFD_FIELDS, COUNTRIES } from './context.js';
import { buildPlan } from './packages.js';
import { findings } from './describe.js';
import { moneyUnit } from './format.js';
import { templateSheets, readTemplate } from '../engine/template.js';
import { checkListing } from '../engine/pubindex.js';

export const STEPS = [
  { id: 'town', label: 'Town' }, { id: 'reports', label: 'Reports' }, { id: 'your-town', label: 'Your town' },
  { id: 'findings', label: 'What we found' }, { id: 'plan', label: 'Build the plan' }, { id: 'document', label: 'Plan document' },
];
export const ANSWER_KEYS = ['start_year', 'plan_years', 'budget', 'tankers', 'vans', 'fstp', 'site', 'land', 'pays', 'gw'];
export const CHOICES = {
  site: [['dump', 'An open dump'], ['controlled', 'A controlled site'], ['none', 'No fixed site']],
  land: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']],
  pays: [['households', 'Households'], ['subsidy', 'Households, with a subsidy'], ['municipality', 'The municipality']],
  gw: [['no', 'No'], ['some', 'Some wards'], ['most', 'Most of the town']],
};

export function defaultWizard() {
  return { townId: null, own: null, ownForm: {}, upSnap: {}, upMeta: {}, country: '', pending: null, msgs: [],
    answers: { start_year: '', plan_years: '5', budget: '', tankers: '', vans: '', fstp: '', site: '', land: '', pays: 'households', gw: '' },
    plastic: 'dataset', on: { collect: true, treat: true, toilets: true }, phase: {}, sites: { plant: null, disposal: null },
    rates: {}, ruleOverrides: {}, wards: [], gov: {}, ops: {} };
}

const n = (v) => { if (v === null || v === undefined || String(v).trim() === '') return null; const x = Number(String(v).replace(/,/g, '')); return Number.isFinite(x) ? x : null; };

/** Wizard state -> the state the context builder reads. Money typed in crore (or million) becomes plain currency units. */
export function toContextState(w, d) {
  const a = w.answers;
  const cur = w.ops.currency || (d.unit_costs ? d.unit_costs.currency : '') || 'BDT';
  const ops = { ...w.ops };
  const put = (k, v, ok = (x) => x >= 0) => { if (v !== null && ok(v)) ops[k] = v; else delete ops[k]; };
  put('start_year', n(a.start_year), (x) => x >= 2000 && x <= 2100);
  put('plan_years', n(a.plan_years), (x) => x >= 1 && x <= 20);
  put('budget_year', n(a.budget) === null ? null : n(a.budget) * moneyUnit(cur).factor, (x) => x > 0);
  put('vehicles_existing', n(a.tankers)); put('vans_existing', n(a.vans)); put('fstp_existing_m3_day', n(a.fstp));
  const portal = w.townId !== 'own' && w.plastic === 'portal' ? portalFigure(d, w.townId) : null;
  return { ...defaultState(), townId: w.townId, own: w.own, country: w.country, gw: a.gw === 'most' ? 'high' : 'low', ops,
    rates: w.rates, ruleOverrides: w.ruleOverrides, wards: w.wards, gov: w.gov, plasticTotal: portal ? portal.plastic_unmanaged_t : 0 };
}

export function portalFigure(d, townId) {
  const town = d.towns.towns.find((x) => String(x.id) === String(townId));
  return town ? (d.benchmarks.wfd_portal_figures || []).find((p) => p.town === town.name) || null : null;
}

/** Everything the screens show for the current state. */
export function compute(d, w, t, today) {
  if (w.townId === null || (w.townId === 'own' && !w.own)) return null;
  const ctx = buildContext(d, toContextState(w, d), t, today);
  // A town loaded from a workbook keeps its place on the map when its name is one of the mapped towns.
  const known = d.places && (!ctx.isOwn || !w.country || w.country === 'Bangladesh') ? d.places.towns[ctx.town.name] || null : null;
  const place = known;
  const district = ctx.town.district || (place && place.district) || null;
  const budget = typeof ctx.state.ops.budget_year === 'number' ? ctx.state.ops.budget_year : null;
  const plan = buildPlan({ ctx, on: w.on, answers: w.answers, phase: w.phase, budget });
  const find = findings(ctx, plan);
  const portal = !ctx.isOwn ? portalFigure(d, w.townId) : null;
  return { ctx, plan, find, district: !ctx.isOwn && place ? place.district : district, place, portal, population: plan.population };
}

const r2 = (v) => String(Math.round(v * 100) / 100);

/** The town's report figures as the workbook's form (strings, percentages). */
export function currentForm(ctx, w, district) {
  if (ctx.isOwn) return { ...w.ownForm, country: w.country, district: ctx.town.district || '' };
  const f = { name: ctx.town.name, country: 'Bangladesh', district: district || '', population: String(ctx.town.population_sfd), households: ctx.town.households_stated ? String(ctx.town.households_stated) : '',
    sfd_year: ctx.town.sfd.date ? ctx.town.sfd.date.slice(0, 4) : '', sfd_source: `SFD Lite, ${ctx.town.sfd.prepared_by || ''}`.trim(), wfd_source: w.plastic === 'portal' ? 'SFD-WFD 50-town dataset; plastic escaping from the GIZ WFD portal' : 'SFD-WFD 50-town dataset' };
  if (ctx.sfdTown) {
    for (const s of ctx.sfdTown.systems) { f[`share_${s.code}`] = r2(s.pop_share * 100); if (ctx.sysIdx[s.code].group !== 'direct') f[`emptied_${s.code}`] = r2((s.emptied_share || 0) * 100); }
    const sep = ctx.sfdTown.systems.find((s) => s.sludge_factor !== null && s.sludge_factor !== undefined);
    f.sludge_pct = sep ? r2(sep.sludge_factor * 100) : '';
  }
  const wv = ctx.wv;
  if (wv) {
    const U = wv.plastic_unmanaged_t; const sh = (keys) => keys.reduce((a, k) => a + ((wv.stages.find((s) => s.key === k) || {}).share || 0), 0) * U;
    const fate = Object.fromEntries(wv.fates.map((x) => [x.key, x.tonnes]));
    Object.assign(f, { msw_t_day: r2(wv.msw_t_day), collected_pct: r2(wv.collected_share * 100), plastic_generated_t: r2(wv.plastic_generated_t), plastic_unmanaged_t: r2(U),
      stage_uncollected_t: r2(sh(['uncollected'])), stage_collection_t: r2(sh(['collection', 'informal_collection'])), stage_sorting_t: r2(sh(['formal_sorting', 'informal_sorting'])),
      stage_transport_t: r2(sh(['transport'])), stage_disposal_t: r2(sh(['disposal'])), fate_land_t: r2(fate.land), fate_water_t: r2(fate.water), fate_burnt_t: r2(fate.burnt), fate_drains_t: r2(fate.drains),
      organic_pct: wv.organic_share === null ? '' : r2(wv.organic_share * 100), recovered_t: r2(wv.recovered_t_year || 0), disposed_t: r2(wv.disposed_t_year || 0) });
  }
  return f;
}

/* ----- reports read from files: pure steps on a form ----- */

/** An SFD report's figures laid onto a form. Returns { form, snap, meta, msgs }. */
export function applySfd(form0, p, fileName, pages, sysIdx, d, country0) {
  const f = { ...form0 };
  for (const k of Object.keys(f)) if (k.startsWith('share_') || k.startsWith('emptied_')) delete f[k];
  if (p.town) f.name = p.town;
  if (p.population) f.population = String(p.population);
  f.households = p.households ? String(p.households) : '';
  f.sludge_pct = p.sludge_factor === null ? '' : r2(p.sludge_factor * 100);
  for (const s of p.systems) {
    if (!sysIdx[s.code]) continue;
    f[`share_${s.code}`] = r2(s.share * 100);
    if (s.emptied !== null) f[`emptied_${s.code}`] = r2(s.emptied * 100);
  }
  const snap = Object.fromEntries(Object.entries(f).filter(([k]) => /^(share_|emptied_)/.test(k) || ['population', 'households', 'sludge_pct'].includes(k)));
  const country = country0 || COUNTRIES.find((c) => pages.slice(0, 2).join(' ').includes(c)) || '';
  const listing = checkListing(p.town || '', country || null, d.pubindex, fileName);
  return { form: f, snap, country, meta: { file: fileName, stated_safe: p.stated_safe, share_sum: p.share_sum, date: p.date },
    msgs: [{ kind: 'ok', text: `Sanitation report for ${p.town || 'the town'}: ${p.systems.length} systems read, covering ${r2(p.share_sum * 100)}% of people.` },
      { kind: 'note', text: listing.status === 'listed' ? `Listed on SuSanA's SFD portal${listing.entry && listing.entry.year ? ` (${listing.entry.year})` : ''}.` : listing.status === 'not_listed' ? "Not found on SuSanA's SFD portal list." : 'SuSanA listing not checked for this name.' }] };
}

/** A WFD portal page's figures laid onto a form. */
export function applyWfd(form0, p) {
  const f = { ...form0 };
  const map = { msw_t_day: p.msw_t_day, collected_pct: p.collected_share === null ? null : p.collected_share * 100, plastic_generated_t: p.plastic_generated_t, plastic_unmanaged_t: p.plastic_unmanaged_t,
    stage_uncollected_t: p.stage_uncollected_t, stage_collection_t: p.stage_collection_t, stage_sorting_t: p.stage_sorting_t, stage_transport_t: p.stage_transport_t, stage_disposal_t: p.stage_disposal_t,
    fate_land_t: p.fate_land_t, fate_water_t: p.fate_water_t, fate_burnt_t: p.fate_burnt_t, fate_drains_t: p.fate_drains_t, organic_pct: p.organic_share === null ? null : p.organic_share * 100 };
  for (const k of WFD_FIELDS) f[k] = map[k] === null || map[k] === undefined ? '' : r2(map[k]);
  delete f.recovered_t; delete f.disposed_t;
  if (!f.name && p.town) f.name = p.town;
  if (!f.population && p.population) f.population = String(p.population);
  return { form: f, snap: Object.fromEntries(WFD_FIELDS.map((k) => [k, f[k]])), meta: { portal: true, version: p.model_version, model: p.burning_model },
    msgs: [{ kind: 'ok', text: `Waste report for ${p.town || 'the town'}: ${Number(p.plastic_unmanaged_t).toLocaleString('en-GB')} tonnes of plastic escape a year.` }] };
}

/** Form -> a town the planner can run, or the problems that stop it. */
export function analyseForm(w, sysIdx, t) {
  const res = buildOwn({ ...w.ownForm, country: w.country }, sysIdx);
  if (!res.own) return { own: null, msgs: res.errors.map((e) => ({ kind: 'err', text: t(e.key, e.vars) })) };
  const basis = reportBasis(w.ownForm, w.upSnap, { sfd: Boolean(res.own.sfdTown), wfd: Boolean(res.own.wfdTown) });
  if (w.upMeta.wb) for (const k of ['sfd', 'wfd']) if (basis[k] === 'uploaded') basis[k] = 'workbook';
  const us = w.upMeta.sfd || {}; const uw = w.upMeta.wfd || {};
  res.own.town.meta = { basis, sfd_basis: basis.sfd, sfd_file: us.file || null, sfd_date: us.date || null,
    stated_safe: basis.sfd === 'uploaded' ? us.stated_safe ?? null : null, share_sum: basis.sfd === 'uploaded' ? us.share_sum ?? null : null,
    wfd_portal: Boolean(uw.portal), wfd_version: uw.version || null, wfd_model: uw.model || null };
  if (us.date) res.own.town.sfd.date = us.date;
  return { own: res.own, msgs: res.warnings.map((e) => ({ kind: 'note', text: t(e.key, e.vars) })) };
}

/* ----- the workbook: the planner's own template plus one sheet for the wizard's choices ----- */

const CHOICE_ROWS = [
  ['site', 'Where collected waste goes (dump, controlled, none)'], ['land', 'Municipality holds land for a treatment plant (yes, no, unsure)'],
  ['pays', 'Who pays for toilet and tank work at home (households, subsidy, municipality)'], ['gw', 'Flooding or high groundwater (no, some, most)'],
  ['plastic', 'Plastic escaping figure used (dataset, portal)'],
  ['on_collect', 'Package on: Collect the waste (1 = yes, 0 = no)'], ['on_treat', 'Package on: Treat the sludge (1 = yes, 0 = no)'], ['on_toilets', 'Package on: Safe toilets at home (1 = yes, 0 = no)'],
  ...['collect', 'land', 'plant', 'toilets'].flatMap((g) => [[`phase_${g}_start`, `Timeline, ${g}: starts in plan year (1 = first year)`], [`phase_${g}_years`, `Timeline, ${g}: years to build`]]),
  ['site_plant', 'Treatment plant site marked on the map (longitude, latitude)'], ['site_disposal', 'Disposal site marked on the map (longitude, latitude)'],
];

export function wizardSheets({ d, w, ctx, t, district, sysIdx, blank = false }) {
  const defaults = {};
  if (!blank) for (const l of ctx.full.lines) {
    if (l.rate.source === 'engineer' || (l.rate.source === 'user' && l.rate.low !== null)) defaults[l.id] = `Engineer's sheet (${l.rate.eng_items.join(' + ')}): ${Math.round(l.rate.low)} to ${Math.round(l.rate.high)} ${t(`per.${l.rate_unit}`)} for this town`;
    else if (l.rate.source === 'included') defaults[l.id] = 'Included in the treatment plant price';
  }
  const v = blank ? {} : { defaults, form: currentForm(ctx, w, district), ops: { ...ctx.state.ops, currency: ctx.currency || ctx.state.ops.currency }, wards: w.wards, gov: w.gov, rates: w.rates, ruleOverrides: w.ruleOverrides, scenarios: [] };
  const sheets = templateSheets({ t, sysIdx, rules: d.rules, sizing: d.sizing, v, wfdFields: WFD_FIELDS, title: blank ? '' : ctx.town.name }).filter((s) => s.name !== 'Scenarios');
  const val = {};
  if (!blank) {
    for (const k of ['site', 'land', 'pays', 'gw']) val[k] = w.answers[k] || null;
    val.plastic = w.plastic;
    for (const k of ['collect', 'treat', 'toilets']) val[`on_${k}`] = w.on[k] ? 1 : 0;
    for (const [g, p] of Object.entries(w.phase)) { if (typeof p.start === 'number') val[`phase_${g}_start`] = p.start + 1; if (typeof p.years === 'number') val[`phase_${g}_years`] = p.years; }
    for (const k of ['plant', 'disposal']) if (w.sites[k]) val[`site_${k}`] = w.sites[k].map((x) => x.toFixed(5)).join(', ');
  }
  sheets.push({ name: 'Plan choices', widths: [70, 26, 22], freeze: true,
    rows: [[{ v: 'Choice', s: 'head' }, { v: 'Value', s: 'head' }, { v: 'key', s: 'head' }], ...CHOICE_ROWS.map(([k, label]) => [label, { v: val[k] ?? null, s: 'input' }, { v: k, s: 'note' }])] });
  return sheets;
}

/** A filled workbook -> the parts of the wizard state it carries. */
export function readWizardBook(book, { d, t, sysIdx }) {
  const res = readTemplate(book, { t, sysIdx, rules: d.rules, sizing: d.sizing, wfdFields: WFD_FIELDS });
  if (!res.tiers[1].length && !res.form.name) return null;
  const base = defaultWizard();
  const a = { ...base.answers };
  const o = res.ops || {};
  const cur = o.currency || (d.unit_costs ? d.unit_costs.currency : '') || 'BDT';
  if (typeof o.start_year === 'number') a.start_year = String(o.start_year);
  if (typeof o.plan_years === 'number') a.plan_years = String(o.plan_years);
  if (typeof o.budget_year === 'number') a.budget = r2(o.budget_year / moneyUnit(cur).factor);
  if (typeof o.vehicles_existing === 'number') a.tankers = String(o.vehicles_existing);
  if (typeof o.vans_existing === 'number') a.vans = String(o.vans_existing);
  if (typeof o.fstp_existing_m3_day === 'number') a.fstp = String(o.fstp_existing_m3_day);
  const out = { answers: a, plastic: 'dataset', on: { ...base.on }, phase: {}, sites: { plant: null, disposal: null } };
  const rows = book['Plan choices'];
  if (rows) {
    const m = new Map(rows.slice(1).filter((r) => typeof r[2] === 'string').map((r) => [r[2].trim(), r[1]]));
    const s = (k) => (m.get(k) === null || m.get(k) === undefined ? '' : String(m.get(k)).trim().toLowerCase());
    for (const k of ['site', 'land', 'pays', 'gw']) if (CHOICES[k].some(([id]) => id === s(k))) a[k] = s(k);
    if (s('plastic') === 'portal') out.plastic = 'portal';
    for (const k of ['collect', 'treat', 'toilets']) if (s(`on_${k}`) !== '') out.on[k] = Number(s(`on_${k}`)) !== 0;
    for (const g of ['collect', 'land', 'plant', 'toilets']) {
      const st = n(m.get(`phase_${g}_start`)); const yr = n(m.get(`phase_${g}_years`));
      if (st !== null || yr !== null) out.phase[g] = { ...(st !== null && st >= 1 ? { start: Math.round(st) - 1 } : {}), ...(yr !== null && yr >= 1 ? { years: Math.round(yr) } : {}) };
    }
    for (const k of ['plant', 'disposal']) { const p = s(`site_${k}`).split(',').map(Number); if (p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90) out.sites[k] = p; }
  }
  const snap = (keys) => Object.fromEntries(Object.entries(res.form).filter(([k]) => keys(k)));
  return { ...out, ownForm: { ...res.form }, country: res.form.country ? (COUNTRIES.includes(res.form.country) ? res.form.country : 'other') : '',
    upSnap: { sfd: snap((k) => /^(share_|emptied_)/.test(k) || ['population', 'households', 'sludge_pct'].includes(k)), wfd: snap((k) => WFD_FIELDS.includes(k)) },
    upMeta: { wb: true, sfd: { file: null, date: res.form.sfd_year ? `${res.form.sfd_year}` : null }, wfd: {} },
    ops: { ...o }, wards: res.wards, gov: res.gov, rates: res.rates, ruleOverrides: res.ruleOverrides, problems: res.problems, tiers: res.tiers };
}
