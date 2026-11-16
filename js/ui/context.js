// Everything the page shows for one town, computed from the data files and the page state. No DOM access.

import { plan } from '../engine/plan.js';
import { paramMap } from '../engine/cost.js';
import { systemIndex } from '../engine/sfd.js';
import { wfdView, wfdScenario } from '../engine/wfd.js';
import { sanScenario } from '../engine/scenario.js';
import { decisions } from '../engine/decisions.js';
import { buildSfdTown, buildWfdTown } from '../engine/custom.js';
import { excretaLoad, plasticLoad, pairedRow } from '../engine/drain.js';
import { flags } from '../engine/flags.js';
import { verdict } from '../engine/verdict.js';
import { checkListing } from '../engine/pubindex.js';
import { ruleValues, sizeBridge, fullLevels } from '../engine/sizing.js';
import { sanChain, wasteChain, sanFlows, plasticFlows, contributions, completeness, phasing, insights } from '../engine/analysis.js';

export const SAMPLE_TOWN = 'Ishwardi'; // a typical town; Kaliakair is the extreme of the 50
export const WFD_FIELDS = ['msw_t_day', 'collected_pct', 'plastic_generated_t', 'plastic_unmanaged_t', 'stage_uncollected_t', 'stage_collection_t', 'stage_sorting_t', 'stage_transport_t',
  'stage_disposal_t', 'fate_land_t', 'fate_water_t', 'fate_burnt_t', 'fate_drains_t', 'organic_pct'];
export const COUNTRIES = ['Bangladesh', 'India', 'Nepal', 'Pakistan', 'Sri Lanka', 'Bhutan', 'Afghanistan', 'Maldives'];

export function defaultState() {
  return { view: 'landing', townId: null, own: null, ownForm: {}, upSnap: {}, upMeta: {}, country: '', msgs: [], reading: [], showSample: false, manual: false,
    gw: 'low', uptake: 0, treat: 0, wcol: null, wctl: 0, compost: false, ruleOverrides: {}, rates: {}, currency: '',
    route: 'overview', ops: {}, wards: [], gov: {}, phase: {}, scen: [newScenario('Scenario A')], active: 0, sort: 'safe' };
}

export const newScenario = (name) => ({ name, uptake: 0, treat: 0, wcol: null, wctl: 0, compost: false });
export const LEVERS = ['uptake', 'treat', 'wcol', 'wctl', 'compost'];

/** Levers of a scenario in engine form, given the town's solid-waste view. */
export function leversOf(s, wv) {
  return { uptake: (s.uptake || 0) / 100, treat: (s.treat || 0) / 100,
    collection: wv ? Math.max(wv.collected_share, s.wcol === null || s.wcol === undefined ? wv.collected_share : s.wcol / 100) : null,
    controlled: wv ? Math.max(wv.controlled_share, (s.wctl || 0) / 100) : null, compost: Boolean(s.compost && wv && wv.organic_share) };
}

/** Existing assets from the workbook's operations sheet, keyed by sizing line. */
export function existingOf(ops = {}) {
  const map = { vehicles: 'vehicles_existing', fstp: 'fstp_existing_m3_day', beds: 'beds_existing_m2', compost: 'compost_existing_t_day' };
  return Object.fromEntries(Object.entries(map).filter(([, k]) => typeof ops[k] === 'number').map(([id, k]) => [id, ops[k]]));
}

/** Where a typed town's figures came from: 'uploaded' (untouched since the PDF was read), 'edited' (read, then changed) or 'typed'. */
export function reportBasis(form, snap, has) {
  const one = (kind) => {
    const s = snap && snap[kind];
    if (!s || !Object.keys(s).length) return 'typed';
    const same = Object.keys(s).every((k) => String(form[k] ?? '') === s[k]);
    const extra = kind === 'sfd' && Object.keys(form).some((k) => /^(share|emptied)_/.test(k) && Number(form[k]) > 0 && !(k in s));
    return same && !extra ? 'uploaded' : 'edited';
  };
  return { sfd: has.sfd ? one('sfd') : 'none', wfd: has.wfd ? one('wfd') : 'none' };
}

/** The check form (strings, percentages) -> town structures, or the list of problems that stop it. SFD alone, WFD alone or both. */
export function buildOwn(form, sysIdx) {
  const num = (k) => { const v = form[k]; return v === undefined || v === null || String(v).trim() === '' ? null : Number(v); };
  const errors = []; const warnings = [];
  const name = String(form.name || '').trim().slice(0, 60);
  const population = num('population');
  if (!name) errors.push({ key: 'err.name' });
  if (!(population > 0)) errors.push({ key: 'err.population' });
  const systems = Object.keys(sysIdx).map((code) => ({ code, share: (num(`share_${code}`) || 0) / 100, emptied: Math.min(100, num(`emptied_${code}`) || 0) / 100 })).filter((s) => s.share > 0);
  let sfdTown = null;
  if (systems.length) {
    const sludge = num('sludge_pct');
    const built = buildSfdTown({ sludge_factor: sludge === null ? 1 : Math.min(100, Math.max(0, sludge)) / 100, systems }, sysIdx);
    for (const p of built.problems) if (p.key === 'share_sum') errors.push({ key: 'err.share_sum', vars: { sum: (p.value * 100).toFixed(1) } });
    sfdTown = built.sfdTown;
  }
  let wfdTown = null;
  if (WFD_FIELDS.some((k) => num(k) !== null)) {
    const e = Object.fromEntries([...WFD_FIELDS, 'recovered_t', 'disposed_t'].map((k) => [k, num(k)]));
    e.collected_share = e.collected_pct === null ? null : Math.min(100, e.collected_pct) / 100;
    e.organic_share = e.organic_pct === null ? null : Math.min(100, e.organic_pct) / 100;
    const w = buildWfdTown(e);
    if (!w.wfdTown) errors.push({ key: 'err.wfd_missing' });
    else { wfdTown = w.wfdTown; for (const p of w.problems) warnings.push({ key: 'err.stage_sum', vars: { sum: Math.round(p.value), total: Math.round(p.expected) } }); }
  }
  if (!sfdTown && !wfdTown && !errors.length) errors.push({ key: 'err.nothing' });
  if (errors.length) return { errors, warnings, own: null };
  const households = num('households');
  const town = { id: 'own', typed: true, name, district: String(form.district || '').trim().slice(0, 60) || null, population_sfd: population, population_wfd: population, households_stated: households > 0 ? households : null,
    sfd: { date: '', level: '', status: '', prepared_by: '' }, wfd: {}, flags: [] };
  return { errors, warnings, own: { town, sfdTown, wfdTown } };
}

let cache = null; // the paired table depends only on the data files

function pairedTable(d, sysIdx) {
  return d.towns.towns.map((town) => {
    const r = plan(town, d.sfd.towns[String(town.id)], d.rules, d.costs, d.params, { gw: 'low' });
    const w = d.wfd.towns[String(town.id)];
    return { id: town.id, name: town.name, ...pairedRow(r, w ? wfdView(town.population_wfd, w) : null) };
  });
}

export function buildContext(d, state, t, today = '') {
  if (!cache || cache.d !== d) {
    const sysIdx = systemIndex(d.rules);
    cache = { d, sysIdx, paired: pairedTable(d, sysIdx), bench: Object.fromEntries(d.benchmarks.items.map((b) => [b.id, b])) };
  }
  const { sysIdx, paired, bench } = cache;
  const isOwn = state.townId === 'own' && state.own;
  const town = isOwn ? state.own.town : d.towns.towns.find((x) => String(x.id) === String(state.townId)) || d.towns.towns.find((x) => x.name === SAMPLE_TOWN) || d.towns.towns[0];
  const sfdTown = isOwn ? state.own.sfdTown : d.sfd.towns[String(town.id)];
  const wfdTown = isOwn ? state.own.wfdTown : d.wfd.towns[String(town.id)];
  const country = isOwn ? state.country : 'Bangladesh';
  const meta = isOwn ? (town.meta || {}) : {};

  const gw = state.gw === 'high' ? 'high' : 'low';
  const r = sfdTown ? plan(town, sfdTown, d.rules, d.costs, d.params, { gw }) : null;
  const wv = wfdTown ? wfdView(town.population_wfd, wfdTown) : null;

  // The sandbox: today, and the town with the chosen interventions.
  const levers = leversOf(state, wv);
  const touched = levers.uptake > 0 || levers.treat > 0 || levers.compost || (wv && (levers.collection > wv.collected_share + 1e-9 || levers.controlled > wv.controlled_share + 1e-9));
  const sc = r ? sanScenario(r, sfdTown, sysIdx, levers) : null;
  const ws = wv ? wfdScenario(wv, levers) : null;
  const ex0 = r ? excretaLoad(r) : null;
  const ex1 = r ? excretaLoad(r, sc) : null;
  const pl0 = plasticLoad(wv);
  const pl1 = plasticLoad(wv, ws);

  const dec = decisions(r, sfdTown, wv, null);
  const v = verdict({ r, wv, excreta: ex0, plastic: pl0, dec });
  const portal = !isOwn ? (d.benchmarks.wfd_portal_figures || []).find((p) => p.town === town.name) || null : null;
  const useBangladeshPeers = country === 'Bangladesh';
  const fl = flags({ town, r, wv, excreta: ex0, plastic: pl0, paired: useBangladeshPeers ? paired : null, meta, portal, today });

  const rules = ruleValues(d.sizing, state.ruleOverrides);
  const sizeArgs = { r, wv, rules, costs: d.costs, ruleOptions: d.rules.options, rates: state.rates, existing: existingOf(state.ops), unitCosts: d.unit_costs || null };
  const full = sizeBridge({ ...sizeArgs, levels: fullLevels(wv) });
  const sizing = touched ? sizeBridge({ ...sizeArgs, levels: levers }) : full;

  const listing = r ? checkListing(town.name, country || null, d.pubindex, meta.sfd_file || null) : null;
  const me = !isOwn ? paired.find((p) => p.id === town.id) : pairedRow0(r, wv);
  const recovered = { compost_t_day: (sizing.lines.find((l) => l.id === 'compost') || {}).units?.compost_t_day ?? null,
    sludge_solids_t_year: (() => { const b = sizing.lines.find((l) => l.id === 'beds'); return b ? b.deficit.value / 1000 : null; })() };

  // Planning layer: chains, flows, what each action does, data completeness, phasing, insights, scenario comparison.
  const chains = { san: sanChain(r, sfdTown), waste: wasteChain(wv) };
  const flows = { san: sanFlows(r), plastic: plasticFlows(wv) };
  const contrib = contributions({ r, sfdTown, sysIdx, wv, levers });
  const comp = completeness({ r, wv, ops: state.ops, wards: state.wards, gov: state.gov, rates: state.rates, lines: sizing.lines });
  const startYear = typeof state.ops.start_year === 'number' ? state.ops.start_year : Number(today.slice(0, 4) || 2026) + 1;
  const planYears = typeof state.ops.plan_years === 'number' ? state.ops.plan_years : 5;
  const phase = phasing(sizing.lines, planYears, state.phase);
  const ins = insights({ r, wv, ex0, pl0, paired: useBangladeshPeers ? paired : null, me, flags: fl, comp, sizing, isOwn });
  const scenarios = state.scen.map((s, i) => {
    const lv = leversOf(s, wv);
    const scS = r ? sanScenario(r, sfdTown, sysIdx, lv) : null;
    const wsS = wv ? wfdScenario(wv, lv) : null;
    const exS = r ? excretaLoad(r, scS) : null;
    const plS = plasticLoad(wv, wsS);
    const any = lv.uptake > 0 || lv.treat > 0 || lv.compost || (wv && (lv.collection > wv.collected_share + 1e-9 || lv.controlled > wv.controlled_share + 1e-9));
    const sz = any ? sizeBridge({ ...sizeArgs, levels: lv }) : { lines: [], totals: { capex: 0, opex: 0, priced: 0, unpriced: 0 } };
    return { i, name: s.name, levers: lv, any, safe: scS ? scS.safe : null, plastic: wsS ? wsS.unmanaged_after_t : null,
      drain_persons: exS ? exS.receivers.drain.persons : null, drain_tonnes: plS ? plS.receivers.drain.tonnes : null, sizing: sz };
  });
  const currency = state.currency || state.ops.currency || (d.unit_costs && sizing.totals.any_engineer ? d.unit_costs.currency : '');

  return { chains, flows, contrib, comp, startYear, planYears, phase, insights: ins, scenarios, currency,
    d, t, state, today, town, isOwn, country, meta, sfdTown, wfdTown, sysIdx, r, wv, levers, touched, sc, ws, ex0, ex1, pl0, pl1, dec, verdict: v, flags: fl,
    rules, full, sizing, listing, paired, pairedOn: useBangladeshPeers, me, bench, portal, recovered, base: paramMap(d.params) };
}

function pairedRow0(r, wv) {
  if (!r) return { safe: null, drain_share: null, open_share: null, plastic_kg_person: wv ? plasticLoad(wv).kg_person_drain_water : null, kg_cap_day: wv ? wv.kg_cap_day : null };
  return pairedRow(r, wv);
}
