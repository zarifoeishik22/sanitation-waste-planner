// The plan in plain terms: a short ordered list of decisions for one town, sanitation and solid waste together.
// Pure functions, no DOM. Each decision carries a key (the sentence lives in the strings file) and the numbers it needs.

const MIN = 0.02; // a loss under 2% of the town does not earn a decision

export function decisions(r, sfdTown, wv, peer) {
  const out = [];
  if (r) sanitationDecisions(r, peer, out);
  if (wv) wasteDecisions(wv, out);
  out.forEach((d, i) => { d.order = i + 1; });
  return out;
}

function sanitationDecisions(r, peer, out) {
  const c = r.outcome.components;
  const pop = r.outcome.systems.reduce((a, s) => a + s.persons, 0) / (r.outcome.systems.reduce((a, s) => a + s.pop_share, 0) || 1);
  const byId = Object.fromEntries(r.options.map((o) => [o.id, o]));

  if (c.f11 > MIN) {
    out.push({ id: 'treat', domain: 'sanitation', size: c.f11, share: c.f11, persons: c.f11 * pop,
      cost: r.chain.complete ? 'costed' : 'not_costed', missing: [...new Set(r.chain.missing.map((m) => m.component.toLowerCase()))] });
  }
  // Containment: one decision per option name, largest group of people first.
  const groups = new Map();
  for (const id of r.summary.options) {
    const o = byId[id];
    const g = groups.get(o.name) || { name: o.name, share: 0, persons: 0, households: 0, systems: [], labels: [] };
    const s = r.outcome.systems.find((x) => x.code === o.system);
    g.share += s.pop_share; g.persons += s.persons; g.households += o.households; g.systems.push(o.system); g.labels.push(s.label);
    groups.set(o.name, g);
  }
  for (const g of [...groups.values()].sort((a, b) => b.persons - a.persons)) {
    if (g.share > MIN) out.push({ id: 'contain', domain: 'sanitation', size: g.share, ...g, cost: r.placeholder_costs_in_use ? 'placeholder' : 'costed' });
  }
  const uncovered = r.outcome.systems.filter((s) => r.summary.systems_uncovered.includes(s.code));
  const uncShare = uncovered.reduce((a, s) => a + s.pop_share, 0);
  if (uncShare > MIN) {
    out.push({ id: r.settings.gw === 'high' ? 'no_option_gw' : 'no_option', domain: 'sanitation', size: uncShare, share: uncShare,
      persons: uncovered.reduce((a, s) => a + s.persons, 0), systems: uncovered.map((s) => s.code), cost: 'none' });
  }
  if (r.settings.gw === 'low' && peer && peer.flips_if_gw_high > 0.3) {
    out.push({ id: 'check_gw', domain: 'sanitation', size: 0.019, share: peer.flips_if_gw_high, persons: peer.flips_if_gw_high * pop, cost: 'none' });
  }
  out.sort((a, b) => b.size - a.size);
}

function wasteDecisions(wv, out) {
  {
    const st = Object.fromEntries(wv.stages.map((s) => [s.key, s]));
    if (wv.collected_share < 0.9 && st.uncollected.share > 0.3) {
      out.push({ id: 'collect', domain: 'waste', share: st.uncollected.share, collected: wv.collected_share, tonnes_day: wv.uncollected_t_day, cost: 'not_costed' });
    }
    if (wv.controlled_share < 0.5 && wv.disposed_t_year > 0) {
      out.push({ id: 'dumpsite', domain: 'waste', share: st.disposal.share, tonnes_year: wv.disposed_t_year, controlled: wv.controlled_share, cost: 'not_costed' });
    }
    if (wv.organic_share !== null && wv.organic_share >= 0.5) {
      out.push({ id: 'organics', domain: 'waste', share: wv.organic_share, tonnes_day: wv.organic_t_day, cost: 'not_costed' });
    }
    if (wv.water_t > 0 && st.uncollected.share <= 0.3 && st.collection.share + st.transport.share > 0.3) {
      out.push({ id: 'handling', domain: 'waste', share: st.collection.share + st.transport.share, cost: 'not_costed' });
    }
  }
}
