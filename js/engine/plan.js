// From an SFD matrix to a costed, ordered list of options. Pure functions, no DOM.
//
// Ranking rules (accepted 15 Nov 2026):
//  1. Containment options are ranked by annual cost per person moved from "not contained" to "contained".
//  2. Emptying is never ranked alone. It belongs to the chain package (emptying + transport + treatment),
//     which is costed only when every required item has a cost and a sizing rule.
//  3. An option with a missing cost or quantity is listed, never costed in part and never ranked.

import { CASES, itemCost, optionCost, paramMap } from './cost.js';
import { households, isContained, outcome, systemIndex } from './sfd.js';

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
// Options with the same cost per person (to a millionth of a taka) are ordered by id, not by floating-point noise.
const sortKey = (v) => Math.round(v * 1e6);

/** Share of people on the result system who count as safely managed, taken from the town's own SFD. */
function resultSafeFraction(code, sfdTown, sysIdx, gw) {
  const meta = sysIdx[code];
  if (!meta || !isContained(meta, gw)) return { fraction: 0, basis: 'not_contained' };
  const row = sfdTown.systems.find((s) => s.code === code);
  if (row && row.pop_share > 0) return { fraction: row.f8 / row.pop_share, basis: 'town_sfd' };
  if (meta.contained_gw_high) {
    // A sealed tank fills and must be emptied: safe only as far as the sludge is delivered and treated.
    return { fraction: sfdTown.treatment.delivered_share * sfdTown.treatment.treated_share, basis: 'sealed_needs_treatment' };
  }
  return { fraction: null, basis: 'no_reference' };
}

export function plan(town, sfdTown, rules, costs, paramsJson, settings = {}) {
  const gw = settings.gw === 'high' ? 'high' : 'low';
  const p = paramMap(paramsJson, settings.overrides);
  const sysIdx = systemIndex(rules);
  const items = byId(costs.items);
  const hh = households(town, p);
  const out = outcome(town, sfdTown, sysIdx, hh, gw);
  const treatment = sfdTown.treatment;
  const hasTreatment = treatment.delivered_share * treatment.treated_share > 0;
  const sysRow = Object.fromEntries(out.systems.map((s) => [s.code, s]));

  const options = [];
  for (const o of rules.options) {
    const s = sysRow[o.system];
    if (!s) continue; // nobody in this town is on that system
    const cost = optionCost(o, items, p);
    const gwOk = !(o.requires.includes('gw_low') && gw !== 'low') && !(o.requires.includes('gw_high') && gw !== 'high');
    const needsTreatment = o.requires.includes('treatment') && !hasTreatment;
    const e = { id: o.id, name: o.name, system: o.system, system_label: s.label, stage: o.stage, result_system: o.result_system,
      applies_when: o.applies_when, requires: o.requires, households: s.households, persons: s.persons,
      complete: cost.complete, missing: cost.missing, cost_status: cost.status, cost: null,
      moved_to_contained: 0, safe_gain: null, safe_basis: null, status: null, metric: null };

    if (o.stage === 'containment' && o.result_system) {
      const res = sysIdx[o.result_system];
      const resContained = isContained(res, gw);
      e.moved_to_contained = !s.contained && resContained ? s.persons : 0;
      const sf = resultSafeFraction(o.result_system, sfdTown, sysIdx, gw);
      e.safe_basis = sf.basis;
      e.safe_gain = sf.fraction === null ? null : s.persons * sf.fraction - s.safe_share * town.population_sfd;
    }
    if (cost.complete) {
      e.cost = {};
      for (const k of CASES) {
        const c = cost.byCase[k];
        const annual = c.annual_hh * s.households;
        e.cost[k] = { annual_hh: c.annual_hh, upfront_hh: c.upfront_hh, annual_total: annual, upfront_total: c.upfront_hh * s.households,
          by_bearer: c.by_bearer,
          per_person_contained: e.moved_to_contained > 0 ? annual / e.moved_to_contained : null,
          per_person_safe: e.safe_gain > 0 ? annual / e.safe_gain : null };
      }
    }
    e.status = !gwOk ? 'not_applicable_gw'
      : o.stage === 'emptying' ? (needsTreatment ? 'needs_treatment' : 'chain')
      : !cost.complete ? 'incomplete'
      : o.stage !== 'containment' || !o.result_system ? 'no_effect_model'
      : e.moved_to_contained > 0 ? 'ranked' : 'no_gain';
    if (e.status === 'ranked') e.metric = e.cost[p.cost_case].per_person_contained;
    options.push(e);
  }

  const ranked = options.filter((o) => o.status === 'ranked').sort((a, b) => sortKey(a.metric) - sortKey(b.metric) || a.id.localeCompare(b.id));
  ranked.forEach((o, i) => { o.rank = i + 1; });

  // If every not-contained household took the cheapest ranked option for its system.
  const cheapest = {};
  for (const o of ranked) if (!cheapest[o.system]) cheapest[o.system] = o;
  const uncovered = out.systems.filter((s) => !s.contained && !cheapest[s.code]);
  const summary = { options: Object.values(cheapest).map((o) => o.id), persons_covered: 0, households_covered: 0, safe_gain: 0,
    persons_uncovered: uncovered.reduce((a, s) => a + s.persons, 0), systems_uncovered: uncovered.map((s) => s.code), cost: {}, municipal_estimated: false };
  for (const k of CASES) summary.cost[k] = { annual_total: 0, upfront_total: 0, by_bearer: {} };
  for (const o of Object.values(cheapest)) {
    summary.persons_covered += o.moved_to_contained;
    summary.households_covered += o.households;
    summary.safe_gain += o.safe_gain || 0;
    for (const k of CASES) {
      const c = o.cost[k];
      summary.cost[k].annual_total += c.annual_total;
      summary.cost[k].upfront_total += c.upfront_total;
      for (const [bearer, v] of Object.entries(c.by_bearer)) {
        const t = (summary.cost[k].by_bearer[bearer] = summary.cost[k].by_bearer[bearer] || { annual_total: 0, upfront_total: 0 });
        t.annual_total += v.annual_hh * o.households;
        t.upfront_total += v.upfront_hh * o.households;
        if (bearer === 'Municipality') summary.municipal_estimated = true;
      }
    }
  }

  // Chain package: emptying + transport + treatment.
  const components = rules.chain_package.map((c) => {
    const item = items[c.item];
    const cost = {};
    for (const k of CASES) cost[k] = itemCost(item, p, k);
    const costed = cost.mid.annual !== null;
    const sized = typeof c.qty === 'number';
    return { ...c, item_name: item ? item.item : c.item, item_status: item ? item.status : 'TO FILL', bearer: item ? item.bearer : null, costed, sized, cost };
  });
  const missing = components.filter((c) => c.required && !(c.costed && c.sized)).map((c) => ({ item: c.item, component: c.component, why: !c.costed ? 'cost' : 'sizing' }));
  const emptying = options.filter((o) => o.stage === 'emptying');
  const chain = {
    complete: missing.length === 0, missing, components, has_treatment: hasTreatment,
    untreated_share: out.components.f11, untreated_persons: out.components.f11 * town.population_sfd,
    emptying_options: emptying.map((o) => o.id),
    households_emptying: emptying.filter((o) => o.complete).reduce((a, o) => a + o.households, 0),
  };

  const usedStatuses = new Set(options.filter((o) => o.complete).map((o) => o.cost_status));
  const notes = [];
  notes.push('sfd_draft');
  if (!chain.complete) notes.push('treatment_not_costed');
  if (!summary.municipal_estimated) notes.push('municipal_not_estimated');
  if (summary.systems_uncovered.length) notes.push('systems_without_option');
  if (hh.basis === 'hh_size') notes.push('households_assumed');
  if (gw === 'low') notes.push('gw_assumed_low'); else notes.push('gw_high_reading');
  if (ranked.some((o) => o.safe_basis === 'town_sfd')) notes.push('safe_gain_assumption');
  notes.push('conditions_unchecked');
  notes.push('draft_rules');

  return {
    settings: { gw, params: p }, households: hh, outcome: out, options, ranked: ranked.map((o) => o.id), summary, chain,
    placeholder_in_use: usedStatuses.has('PLACEHOLDER') || paramsJson.params.some((r) => r.status === 'PLACEHOLDER'),
    placeholder_costs_in_use: usedStatuses.has('PLACEHOLDER'), user_costs_in_use: usedStatuses.has('USER'),
    notes,
  };
}
