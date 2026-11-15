// The verdict: the town's main failure in one line for each system, and the three actions to take first.
// Pure functions, no DOM.

const MIN = 0.02;

export function verdict({ r, wv, excreta, plastic, dec }) {
  const out = { sanitation: null, waste: null, actions: [] };

  // Main sanitation failure: the largest single route by which excreta leaves safe management.
  if (r && excreta) {
  const routes = excreta.sources.map((s) => ({ key: s.key, share: s.today_share, persons: s.today_persons }));
  routes.push({ key: 'dumped', share: r.outcome.components.f11, persons: r.outcome.components.f11 * excreta.population });
  routes.sort((a, b) => b.share - a.share);
  if (routes[0] && routes[0].share > MIN) out.sanitation = { ...routes[0], safe: r.outcome.components.safe, unsafe_persons: (1 - r.outcome.components.safe) * excreta.population };
  else out.sanitation = { key: 'mostly_safe', share: r.outcome.components.safe, persons: r.outcome.components.safe * excreta.population, safe: r.outcome.components.safe, unsafe_persons: (1 - r.outcome.components.safe) * excreta.population };

  }

  if (wv && plastic) {
    out.waste = { stage: wv.biggest_stage.key, stage_share: wv.biggest_stage.share, uncollected_share: 1 - wv.collected_share, uncollected_t_day: wv.uncollected_t_day,
      unmanaged_t: wv.plastic_unmanaged_t, unmanaged_share: wv.plastic_unmanaged_share, water_t: plastic.receivers.water.tonnes, drain_t: plastic.receivers.drain.tonnes };
  }

  // Three actions: the largest sanitation decision, the largest waste decision, then the next largest of either.
  const usable = dec.filter((d) => d.id !== 'check_gw' && d.id !== 'no_option');
  const san = usable.filter((d) => d.domain === 'sanitation');
  const waste = usable.filter((d) => d.domain === 'waste');
  const pick = [];
  if (san[0]) pick.push(san[0]);
  if (waste[0]) pick.push(waste[0]);
  for (const d of [san[1], waste[1], san[2], waste[2]]) if (d && pick.length < 3) pick.push(d);
  out.actions = pick.map((d, i) => ({ ...d, order: i + 1, lever: LEVER[d.id] || null }));
  return out;
}

/** Which sandbox control an action switches on. */
export const LEVER = { treat: 'treat', contain: 'uptake', no_option_gw: 'uptake', collect: 'collection', dumpsite: 'controlled', organics: 'compost', handling: 'collection' };
