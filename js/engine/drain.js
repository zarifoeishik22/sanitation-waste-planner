// Where the town's excreta and escaped plastic end up: open drains, water bodies, open ground.
// This is the one place the SFD and the WFD describe the same physical thing. Pure functions, no DOM.

const OUTLET = { 6: 'drain', 7: 'water', 8: 'ground' };

/** The receiver a system discharges to, read from the outlet part of its SFD system reference. */
export function outletOf(code) {
  const m = String(code).match(/C(\d+)$/);
  return (m && OUTLET[Number(m[1])]) || null;
}

/**
 * Excreta by receiver, as shares of the population and as people.
 * r = result of plan(). sc = result of sanScenario() or null for today.
 * "dumped" = sludge emptied and not treated: the SFD does not record where it is tipped.
 */
export function excretaLoad(r, sc = null) {
  const uptake = sc ? sc.uptake : 0;
  const pop = r.outcome.systems.reduce((a, s) => a + s.persons, 0) / (r.outcome.systems.reduce((a, s) => a + s.pop_share, 0) || 1);
  const byId = Object.fromEntries(r.options.map((o) => [o.id, o]));
  const fixable = new Set(r.summary.options.map((id) => byId[id].system));
  const share = { drain: 0, water: 0, ground: 0 };
  const sources = new Map();
  for (const s of r.outcome.systems) {
    if (s.contained) continue;
    const dest = s.flipped ? 'ground' : outletOf(s.code) || 'ground';
    const keep = fixable.has(s.code) ? 1 - uptake : 1;
    const v = (s.w11c + s.f15 + s.s11e) * keep;
    share[dest] += v;
    const key = `${s.flipped ? 'flooded' : s.group}_${dest}`;
    const e = sources.get(key) || { key, group: s.group, dest, share: 0, today_share: 0, households_today: 0, fixable: false };
    e.share += v; e.today_share += s.w11c + s.f15 + s.s11e; e.households_today += s.households; e.fixable = e.fixable || fixable.has(s.code);
    sources.set(key, e);
  }
  const c = sc ? sc.components : r.outcome.components;
  const out = { population: pop, safe: c.safe, receivers: {}, sources: [] };
  for (const k of ['drain', 'water', 'ground']) out.receivers[k] = { share: share[k], persons: share[k] * pop };
  out.receivers.dumped = { share: c.f11, persons: c.f11 * pop };
  out.sources = [...sources.values()].map((e) => ({ ...e, persons: e.share * pop, today_persons: e.today_share * pop })).sort((a, b) => b.today_share - a.today_share);
  out.unsafe = share.drain + share.water + share.ground + c.f11;
  return out;
}

/**
 * Escaped plastic by receiver, tonnes a year. ws = result of wfdScenario() or null for today.
 * The scenario scales every receiver by the same factor: the WFD tool is not re-run, so the split between receivers is today's.
 */
export function plasticLoad(wv, ws = null) {
  if (!wv) return null;
  const f = Object.fromEntries(wv.fates.map((x) => [x.key, x.tonnes]));
  const sum = f.land + f.water + f.burnt + f.drains;
  const k = ws && ws.unmanaged_before_t > 0 ? ws.unmanaged_after_t / ws.unmanaged_before_t : 1;
  const per = wv.population > 0 ? 1000 / wv.population : 0;
  return {
    total_t: (ws ? ws.unmanaged_after_t : wv.plastic_unmanaged_t), fate_sum_t: sum * k, factor: k,
    receivers: { drain: { tonnes: f.drains * k }, water: { tonnes: f.water * k }, ground: { tonnes: f.land * k }, burnt: { tonnes: f.burnt * k } },
    kg_person_drain_water: (f.drains + f.water) * k * per,
  };
}

/** One row per built-in town, for ranking a town against the paired set. */
export function pairedRow(r, wv) {
  const e = excretaLoad(r);
  const p = plasticLoad(wv);
  return { safe: e.safe, drain_share: e.receivers.drain.share, open_share: e.receivers.drain.share + e.receivers.water.share,
    plastic_kg_person: p ? p.kg_person_drain_water : null, kg_cap_day: wv ? wv.kg_cap_day : null,
    collected: wv ? wv.collected_share : null, unmanaged_share: wv ? wv.plastic_unmanaged_share : null };
}

/** Share of values at or below v (0..1), ignoring blanks. */
export function rankOf(v, values) {
  const xs = values.filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (!xs.length || typeof v !== 'number') return null;
  return xs.filter((x) => x <= v + 1e-12).length / xs.length;
}
export const median = (values) => {
  const xs = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!xs.length) return null;
  return xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
};
