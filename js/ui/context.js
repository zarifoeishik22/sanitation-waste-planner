// Everything a tab needs for one town, computed from the data files and the page state. No DOM access.

import { plan } from '../engine/plan.js';
import { paramMap, applyCostOverrides } from '../engine/cost.js';
import { peerTable, systemIndex } from '../engine/sfd.js';
import { wfdView, wfdPeers } from '../engine/wfd.js';
import { decisions } from '../engine/decisions.js';
import { buildSfdTown, buildWfdTown } from '../engine/custom.js';

export const DEFAULT_TOWN = 'Ishwardi'; // a typical town; Kaliakair is the extreme of the 50

export function defaultState(d) {
  const base = paramMap(d.params);
  const first = d.towns.towns.find((x) => x.name === DEFAULT_TOWN) || d.towns.towns[0];
  return { townId: String(first.id), tab: 'overview', gw: 'low', case: base.cost_case, basis: base.hh_basis, hh: base.hh_size, disc: +(base.disc_rate * 100).toFixed(2),
    uptake: 0, treat: 0, target: '', wcol: null, wctl: 0, costOverrides: {}, costMsg: '', own: null, ownForm: {}, ownMsgs: [], upSnap: {} };
}

/** Where a typed town's figures came from: 'uploaded' (untouched since the PDF was read), 'edited' (read, then changed) or 'typed'. */
export function reportBasis(form, snap, hasWfd) {
  const one = (kind) => {
    const s = snap && snap[kind];
    if (!s || !Object.keys(s).length) return 'typed';
    const same = Object.keys(s).every((k) => String(form[k] ?? '') === s[k]);
    const extra = kind === 'sfd' && Object.keys(form).some((k) => /^(share|emptied)_/.test(k) && Number(form[k]) > 0 && !(k in s));
    return same && !extra ? 'uploaded' : 'edited';
  };
  return { sfd: one('sfd'), wfd: hasWfd ? one('wfd') : 'none' };
}

function ownPeer(name, sfdTown, sysIdx) {
  let nc = 0; let open = 0;
  for (const x of sfdTown.systems) {
    const m = sysIdx[x.code];
    if (!m.contained_gw_low) nc += x.pop_share;
    if (m.contained_gw_low && !m.contained_gw_high) open += x.pop_share;
  }
  return { id: 'own', name, not_contained: nc, safe: sfdTown.flows.safe, f11: sfdTown.flows.f11, flips_if_gw_high: open };
}

/** The typed-town form (strings, percentages) -> town structures, or the list of problems that stop it. */
export function buildOwn(form, sysIdx) {
  const num = (k) => { const v = form[k]; return v === undefined || v === null || String(v).trim() === '' ? null : Number(v); };
  const errors = []; const warnings = [];
  const name = String(form.name || '').trim().slice(0, 60);
  const population = num('population');
  if (!name) errors.push({ key: 'own.err.name' });
  if (!(population > 0)) errors.push({ key: 'own.err.population' });
  const systems = Object.keys(sysIdx).map((code) => ({ code, share: (num(`share_${code}`) || 0) / 100, emptied: Math.min(100, num(`emptied_${code}`) || 0) / 100 })).filter((s) => s.share > 0);
  const sludge = num('sludge_pct');
  const built = buildSfdTown({ sludge_factor: sludge === null ? 1 : Math.min(100, Math.max(0, sludge)) / 100, systems }, sysIdx);
  for (const p of built.problems) errors.push(p.key === 'share_sum' ? { key: 'own.err.share_sum', vars: { sum: (p.value * 100).toFixed(1) } } : { key: 'own.err.no_systems' });
  const wfdKeys = ['msw_t_day', 'collected_pct', 'plastic_generated_t', 'plastic_unmanaged_t', 'stage_uncollected_t', 'stage_collection_t', 'stage_sorting_t', 'stage_transport_t',
    'stage_disposal_t', 'fate_land_t', 'fate_water_t', 'fate_burnt_t', 'fate_drains_t', 'organic_pct'];
  let wfdTown = null;
  if (wfdKeys.some((k) => num(k) !== null)) {
    const e = Object.fromEntries(wfdKeys.map((k) => [k, num(k)]));
    e.collected_share = e.collected_pct === null ? null : Math.min(100, e.collected_pct) / 100;
    e.organic_share = e.organic_pct === null ? null : Math.min(100, e.organic_pct) / 100;
    const w = buildWfdTown(e);
    if (!w.wfdTown) errors.push({ key: 'own.err.wfd_missing' });
    else { wfdTown = w.wfdTown; for (const p of w.problems) warnings.push({ key: 'own.err.stage_sum', vars: { sum: Math.round(p.value), total: Math.round(p.expected) } }); }
  }
  if (errors.length) return { errors, warnings, own: null };
  const households = num('households');
  const town = { id: 'own', typed: true, name, district: null, population_sfd: population, population_wfd: population, households_stated: households > 0 ? households : null,
    sfd: { date: '', level: '', status: '', prepared_by: '' }, wfd: {}, flags: [] };
  return { errors, warnings, own: { town, sfdTown: built.sfdTown, wfdTown } };
}

let cache = null; // peer tables depend only on the data files

export function buildContext(d, state, t, today = '') {
  if (!cache || cache.d !== d) {
    const sysIdx = systemIndex(d.rules);
    cache = { d, sysIdx, peers: peerTable(d.towns.towns, d.sfd, sysIdx), wpeers: wfdPeers(d.towns.towns, d.wfd), bench: Object.fromEntries(d.benchmarks.items.map((b) => [b.id, b])) };
  }
  const { sysIdx, peers, wpeers, bench } = cache;
  const isOwn = state.townId === 'own' && state.own;
  const town = isOwn ? state.own.town : d.towns.towns.find((x) => String(x.id) === String(state.townId)) || d.towns.towns[0];
  const sfdTown = isOwn ? state.own.sfdTown : d.sfd.towns[String(town.id)];
  const wfdTown = isOwn ? state.own.wfdTown : d.wfd.towns[String(town.id)];
  const base = paramMap(d.params);
  const hh = Math.min(15, Math.max(1, Number(state.hh) || base.hh_size));
  const disc = Math.min(30, Math.max(0.5, Number(state.disc) || base.disc_rate * 100)) / 100;
  const costs = applyCostOverrides(d.costs, state.costOverrides);
  const settings = { gw: state.gw === 'high' ? 'high' : 'low', overrides: { cost_case: state.case, hh_basis: state.basis, hh_size: hh, disc_rate: disc } };
  const r = plan(town, sfdTown, d.rules, costs, d.params, settings);
  const me = isOwn ? ownPeer(town.name, sfdTown, sysIdx) : peers.find((p) => p.id === town.id);
  const wv = wfdTown ? wfdView(town.population_wfd, wfdTown) : null;
  const wme = isOwn ? (wv ? { id: 'own', name: town.name, collected: wv.collected_share, unmanaged: wv.plastic_unmanaged_share, water_kg: wv.water_kg_person ?? 0 } : null) : wpeers.find((p) => p.id === town.id);
  return { d, t, state, today, town, sfdTown, sysIdx, costs, r, peers, me, wpeers, wme, wv, bench, dec: decisions(r, sfdTown, wv, me), hh, disc };
}
