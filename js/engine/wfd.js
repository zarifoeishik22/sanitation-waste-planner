// Reading a Waste Flow Diagram result: how much waste, how much is collected, where plastic escapes.
// Pure functions, no DOM. Works on the built-in towns and on values typed from a WFD report.

export const STAGES = ['uncollected', 'collection', 'informal_collection', 'formal_sorting', 'informal_sorting', 'transport', 'disposal'];
export const FATES = ['land', 'water', 'burnt', 'drains'];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** One town's solid-waste picture, in real units. */
export function wfdView(population, w) {
  const o = w.outputs;
  const unmanaged = o.plastic_unmanaged_t;
  const stageSum = STAGES.reduce((a, k) => a + (o[`stage_${k}_share`] || 0), 0);
  const stages = STAGES.map((k) => ({ key: k, share: o[`stage_${k}_share`] || 0, tonnes: (o[`stage_${k}_share`] || 0) * unmanaged }));
  const fateSum = FATES.reduce((a, k) => a + (o[`fate_${k}_t`] || 0), 0);
  const fates = FATES.map((k) => ({ key: k, tonnes: o[`fate_${k}_t`] || 0, share: fateSum > 0 ? (o[`fate_${k}_t`] || 0) / fateSum : 0 }));
  const biggest = stages.reduce((a, s) => (s.share > a.share ? s : a), stages[0]);
  const organic = num(w.inputs?.['3.6']);
  const plasticShare = num(w.inputs?.['3.2']);
  return {
    population,
    msw_t_year: o.msw_generated_t, msw_t_day: o.msw_generated_t / 365,
    kg_cap_day: population > 0 ? (o.msw_generated_t * 1000) / 365 / population : null,
    collected_share: o.msw_collected_share, uncollected_t_day: o.msw_uncollected_t / 365,
    disposed_t_year: o.msw_disposed_t, recovered_t_year: o.msw_recovered_t,
    plastic_generated_t: o.plastic_generated_t, plastic_collected_t: o.plastic_collected_t, plastic_uncollected_t: o.plastic_uncollected_t,
    plastic_unmanaged_t: unmanaged, plastic_unmanaged_share: o.plastic_unmanaged_share,
    stages, stage_sum: stageSum, biggest_stage: biggest, fates,
    water_t: o.fate_water_t || 0, water_kg_day: ((o.fate_water_t || 0) * 1000) / 365,
    water_kg_person: num(o.water_kg_per_person) ?? (population > 0 ? ((o.fate_water_t || 0) * 1000) / population : null),
    organic_share: organic, organic_t_day: organic === null ? null : (organic * o.msw_generated_t) / 365, plastic_share: plasticShare,
    controlled_share: num(w.inputs?.['9.3']) ?? 0,
    flag: Boolean(w.mass_balance_flag) || Math.abs(stageSum - 1) > 0.02,
  };
}

/**
 * "What if" for solid waste. A proportional reading of the published WFD result, not a re-run of the GIZ tool:
 *  - raising collection from c0 to c1 removes the same fraction r = (c1 - c0) / (1 - c0) of uncollected plastic;
 *  - the newly collected plastic leaks along the service chain at today's average rate;
 *  - controlled disposal removes that share of today's disposal-site leakage.
 * It does not re-estimate where the plastic ends up (land, water, burning).
 */
export function wfdScenario(v, levers = {}) {
  const c0 = v.collected_share;
  const c1 = Math.min(1, Math.max(c0, levers.collection ?? c0));
  const k0 = v.controlled_share;
  const k1 = Math.min(1, Math.max(k0, levers.controlled ?? k0));
  const r = c0 < 1 ? (c1 - c0) / (1 - c0) : 0;
  const kk = k0 < 1 ? (k1 - k0) / (1 - k0) : 0;
  const norm = v.stage_sum > 0 ? 1 / v.stage_sum : 0; // towns whose stage shares do not sum to 100% are rescaled and flagged
  const U = v.plastic_unmanaged_t;
  const part = (key) => (v.stages.find((s) => s.key === key).share) * norm * U;
  const uUnc = part('uncollected');
  const uDisp = part('disposal');
  const uChain = U - uUnc - uDisp;
  const through = v.plastic_collected_t > 0 ? 1 + (r * v.plastic_uncollected_t) / v.plastic_collected_t : 1;
  const after = uUnc * (1 - r) + (uChain + uDisp * (1 - kk)) * through;
  return {
    collection: c1, controlled: k1, changed: c1 > c0 + 1e-9 || k1 > k0 + 1e-9,
    unmanaged_before_t: U, unmanaged_after_t: after, cut_t: U - after, cut_share: U > 0 ? (U - after) / U : 0,
    unmanaged_share_after: v.plastic_generated_t > 0 ? after / v.plastic_generated_t : 0,
    uncollected_t_day_after: v.msw_t_day * (1 - c1),
    parts_after: { uncollected: uUnc * (1 - r), chain: uChain * through, disposal: uDisp * (1 - kk) * through },
    parts_before: { uncollected: uUnc, chain: uChain, disposal: uDisp },
  };
}

/** Indicators for the comparison view. */
export function wfdPeers(towns, wfd) {
  return towns.map((t) => {
    const o = wfd.towns[String(t.id)].outputs;
    return { id: t.id, name: t.name, collected: o.msw_collected_share, unmanaged: o.plastic_unmanaged_share, water_kg: o.water_kg_per_person };
  });
}
