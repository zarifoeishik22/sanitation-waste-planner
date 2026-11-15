// "What if" for sanitation: the town's outcome after some households change system and some emptied sludge is treated.
// Pure functions, no DOM. Uses the same outcome model as sfd.js:
//   safe = pop x (1 - f x e) + pop x f x e x treated ;  emptied and untreated = pop x f x e x (1 - treated)

import { CASES } from './cost.js';
import { isContained, COMPONENTS } from './sfd.js';

const UNSAFE = ['s11e', 'w11c', 'f15', 'f11'];

/** Per-person outcome of a household after it moves to the result system. */
function resultPerPerson(option, source, sfdTown, sysIdx, gw) {
  const meta = sysIdx[option.result_system];
  if (!meta || !isContained(meta, gw)) return null;
  const row = sfdTown.systems.find((s) => s.code === option.result_system);
  if (row && row.pop_share > 0) return { safe: row.f8 / row.pop_share, f11: row.f11 / row.pop_share, basis: 'town_sfd' };
  if (meta.contained_gw_high) return { safe: 0, f11: 1, basis: 'sealed_needs_treatment' }; // a sealed tank fills and must be emptied
  if (source.group === 'septic' && meta.group === 'septic') {
    const fe = (source.sludge_factor ?? 1) * source.emptied_share; // same tank, same emptying habit
    return { safe: 1 - fe, f11: fe, basis: 'same_tank' };
  }
  return { safe: 1, f11: 0, basis: 'assumed_not_emptied' };
}

/**
 * r = result of plan(). uptake = share of households on each system without containment that take the cheapest listed option (0..1).
 * treat = share of emptied sludge that is delivered to treatment and treated (0..1).
 */
export function sanScenario(r, sfdTown, sysIdx, levers = {}) {
  const uptake = Math.min(1, Math.max(0, levers.uptake ?? 0));
  const treat = Math.min(1, Math.max(0, levers.treat ?? 0));
  const gw = r.settings.gw;
  const c = { ...r.outcome.components };
  const population = r.outcome.systems.reduce((a, s) => a + s.persons, 0) / (r.outcome.systems.reduce((a, s) => a + s.pop_share, 0) || 1);
  const byId = Object.fromEntries(r.options.map((o) => [o.id, o]));
  const cost = Object.fromEntries(CASES.map((k) => [k, { annual_total: 0, upfront_total: 0 }]));
  const bases = new Set();
  let movedShare = 0;
  let households = 0;
  for (const id of r.summary.options) {
    const o = byId[id];
    const s = r.outcome.systems.find((x) => x.code === o.system);
    const res = resultPerPerson(o, s, sfdTown, sysIdx, gw);
    if (!res || s.pop_share <= 0) continue;
    const m = uptake * s.pop_share;
    const frac = m / s.pop_share;
    c.safe -= frac * s.safe_share; c.f11 -= frac * s.f11; c.f15 -= frac * s.f15; c.w11c -= frac * s.w11c; c.s11e -= frac * s.s11e;
    c.safe += m * res.safe; c.f11 += m * res.f11;
    movedShare += m; households += uptake * o.households; bases.add(res.basis);
    for (const k of CASES) { cost[k].annual_total += uptake * o.cost[k].annual_total; cost[k].upfront_total += uptake * o.cost[k].upfront_total; }
  }
  const treatedShare = treat * c.f11;
  c.safe += treatedShare; c.f11 -= treatedShare;
  for (const k of COMPONENTS) if (Math.abs(c[k]) < 1e-12) c[k] = 0;
  const base = r.outcome.components;
  return {
    uptake, treat, components: c, safe: c.safe, unsafe: UNSAFE.reduce((a, k) => a + c[k], 0),
    safe_gain_share: c.safe - base.safe, safe_gain_persons: (c.safe - base.safe) * population,
    moved_share: movedShare, moved_persons: movedShare * population, moved_households: households,
    treated_share: treatedShare, treated_persons: treatedShare * population,
    containment_cost: uptake > 0 && r.summary.options.length ? cost : null,
    treatment_costed: r.chain.complete, bases: [...bases], has_containment_option: r.summary.options.length > 0, changed: uptake > 0 || treat > 0,
  };
}

/** How far each lever must go to reach a target safely-managed share. */
export function waysToReach(target, r, sfdTown, sysIdx) {
  const safe = (u, t) => sanScenario(r, sfdTown, sysIdx, { uptake: u, treat: t }).safe;
  const s0 = safe(0, 0);
  const solve = (f) => {
    if (f(1) < target - 1e-9) return null;
    if (s0 >= target) return 0;
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i += 1) { const mid = (lo + hi) / 2; if (f(mid) >= target) hi = mid; else lo = mid; }
    return hi;
  };
  return {
    target, today: s0, already: s0 >= target - 1e-9,
    treat_only: { level: solve((x) => safe(0, x)), max: safe(0, 1) },
    contain_only: { level: solve((x) => safe(x, 0)), max: safe(1, 0) },
    both: { level: solve((x) => safe(x, x)), max: safe(1, 1) },
  };
}
