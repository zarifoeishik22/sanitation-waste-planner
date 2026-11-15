// Plausibility flags: contradictions inside the reports, the town's place among the 50 paired towns, and where the two reports meet.
// A flag says "check this", never "this is wrong". A town that differs from a national average is not flagged for that alone.
// Pure functions, no DOM. Each flag carries a key (the sentence lives in the strings file) and the numbers it needs.

import { rankOf, median } from './drain.js';

const W = { check: 2, note: 1 };

export function flags({ town, r, wv, excreta, plastic, paired, meta = {}, portal = null, today = '' }) {
  const out = [];
  const add = (id, level, weight, vars = {}) => out.push({ id, level, weight, vars });
  // --- inside the SFD ---
  if (r) {
  const c = r.outcome.components;
  if (typeof meta.stated_safe === 'number' && Math.abs(meta.stated_safe - c.safe) > 0.02 && r.settings.gw === 'low') {
    add('safe_mismatch', 'check', 9, { stated: meta.stated_safe, rebuilt: c.safe });
  }
  if (meta.sfd_basis === 'edited' || (typeof meta.share_sum === 'number' && Math.abs(meta.share_sum - 1) > 0.01)) {
    add('shares_filled', 'check', 8, { sum: meta.share_sum ?? null });
  }
  let flips = 0;
  for (const s of r.outcome.systems) if (s.contained && r.settings.gw === 'low' && s.group !== 'direct' && s.code !== 'T1A3C10') flips += s.safe_share;
  if (r.settings.gw === 'low' && flips >= 0.3) add('gw_dependence', 'check', 7, { share: flips, persons: flips * excreta.population });
  const pph = r.households.persons_per_household;
  if (r.households.basis === 'stated' && (pph < 3 || pph > 7)) add('household_size', 'check', 6, { pph });
  if (town.sfd && town.sfd.date && today) {
    const age = (Date.parse(today) - Date.parse(town.sfd.date)) / (365.25 * 864e5);
    if (age > 5) add('sfd_old', 'note', 3, { years: Math.floor(age), date: town.sfd.date });
  }
  }

  // --- inside the WFD ---
  if (wv) {
    if (wv.flag) add('wfd_balance', 'check', 7, { sum: wv.stage_sum });
    if (r && town.population_wfd && town.population_sfd && Math.abs(town.population_wfd - town.population_sfd) / town.population_sfd > 0.1) {
      add('population_gap', 'check', 6, { sfd: town.population_sfd, wfd: town.population_wfd });
    }
    if (paired && paired.length && typeof wv.kg_cap_day === 'number') {
      const rank = rankOf(wv.kg_cap_day, paired.map((p) => p.kg_cap_day));
      if (rank !== null && (rank <= 0.1 || rank >= 0.9)) add(rank <= 0.1 ? 'generation_low' : 'generation_high', 'check', 5, { kg: wv.kg_cap_day, median: median(paired.map((p) => p.kg_cap_day)), n: paired.length });
    }
    if (portal && Math.abs(portal.plastic_unmanaged_t - wv.plastic_unmanaged_t) > Math.max(2, 0.02 * portal.plastic_unmanaged_t)) {
      add('portal_differs', 'check', 8, { ours: wv.plastic_unmanaged_t, portal: portal.plastic_unmanaged_t });
    }
    const disp = wv.stages.find((s) => s.key === 'disposal');
    if (wv.controlled_share < 0.5 && wv.disposed_t_year > 0 && disp && disp.share < 0.05) add('dumpsite_low', 'note', 2, { share: disp.share });
  }

  // --- where the two reports meet ---
  if (r && excreta && wv && plastic && paired && paired.length) {
    const mOpen = median(paired.map((p) => p.open_share));
    const mPl = median(paired.map((p) => p.plastic_kg_person));
    const open = excreta.receivers.drain.share + excreta.receivers.water.share;
    if (mOpen !== null && mPl !== null && open > mOpen && plastic.kg_person_drain_water > mPl) {
      const both = paired.filter((p) => p.open_share > mOpen && p.plastic_kg_person > mPl).length;
      add('compound', 'check', 10, { persons: (excreta.receivers.drain.share + excreta.receivers.water.share) * excreta.population,
        tonnes: plastic.receivers.drain.tonnes + plastic.receivers.water.tonnes, both, n: paired.length });
    }
  }
  for (const text of town.flags || []) add('town_note', 'note', 1, { text });
  return out.sort((a, b) => W[b.level] - W[a.level] || b.weight - a.weight);
}
