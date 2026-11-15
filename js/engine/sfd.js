// Reading an SFD system matrix: who is on what, what contains, where the excreta ends up.
// Pure functions, no DOM.

export const COMPONENTS = ['safe', 's11e', 'w11c', 'f15', 'f11'];

/** Households in the town: stated in the SFD report when available and wanted, else population / hh_size. */
export function households(town, p) {
  if (p.hh_basis === 'stated' && typeof town.households_stated === 'number') {
    return { households: town.households_stated, basis: 'stated', persons_per_household: town.population_sfd / town.households_stated };
  }
  return { households: town.population_sfd / p.hh_size, basis: 'hh_size', persons_per_household: p.hh_size };
}

export function systemIndex(rules) {
  const idx = {};
  for (const s of rules.systems) idx[s.code] = s;
  return idx;
}

export function isContained(meta, gw) {
  if (!meta) return false;
  return gw === 'high' ? meta.contained_gw_high : meta.contained_gw_low;
}

/**
 * The tool's own outcome model for one contained system, as a share of population:
 *   safe = pop x (1 - f x e) + pop x f x e x delivered x treated
 * f = sludge factor (1 where the SFD applies none), e = share emptied.
 * Reproduces the published "contained, not emptied" value of every contained system in the 50 SFDs.
 */
export function modelSafeShare(sys, treatment) {
  const f = sys.sludge_factor ?? 1;
  const emptied = sys.pop_share * f * sys.emptied_share;
  return sys.pop_share - emptied + emptied * treatment.delivered_share * treatment.treated_share;
}

/**
 * Outcome of the town under a groundwater setting.
 * gw = 'low' returns the published SFD. gw = 'high' is the tool's reading of the SFD rules, not a re-run of the SFD:
 * systems that stop containing lose their safe share to "not contained, not emptied".
 */
export function outcome(town, sfdTown, sysIdx, hh, gw) {
  const comp = { safe: 0, s11e: 0, w11c: 0, f15: 0, f11: 0 };
  let notContained = 0;
  const systems = sfdTown.systems.map((s) => {
    const meta = sysIdx[s.code];
    const contained = isContained(meta, gw);
    const flipped = gw === 'high' && meta && meta.contained_gw_low && !contained;
    const safe = contained ? s.f8 : 0;
    const f15 = s.f15 + (flipped ? s.f8 : 0);
    comp.safe += safe; comp.s11e += s.s11e; comp.w11c += s.w11c; comp.f15 += f15; comp.f11 += s.f11;
    if (!contained) notContained += s.pop_share;
    return {
      code: s.code, label: meta ? meta.label : s.code, group: meta ? meta.group : null,
      pop_share: s.pop_share, persons: s.pop_share * town.population_sfd, households: s.pop_share * hh.households,
      contained, flipped, emptied_share: s.emptied_share, sludge_factor: s.sludge_factor,
      safe_share: safe, f11: s.f11, f15, w11c: s.w11c, s11e: s.s11e,
    };
  });
  const unsafe = ['f11', 'f15', 'w11c', 's11e'];
  let binding = unsafe[0];
  for (const k of unsafe) if (comp[k] > comp[binding]) binding = k;
  return {
    systems, components: comp, binding: { key: binding, share: comp[binding] },
    not_contained_share: notContained, not_contained_persons: notContained * town.population_sfd,
    not_contained_households: notContained * hh.households, pop_sum: sfdTown.flows.pop_sum,
  };
}

/** Indicators for the peer view: one row per built-in town, at the SFD's own (low) groundwater setting. */
export function peerTable(towns, sfd, sysIdx) {
  return towns.map((t) => {
    const s = sfd.towns[String(t.id)];
    let nc = 0;
    let open = 0;
    for (const x of s.systems) {
      const m = sysIdx[x.code];
      if (!m.contained_gw_low) nc += x.pop_share;
      if (m.contained_gw_low && !m.contained_gw_high) open += x.pop_share;
    }
    return { id: t.id, name: t.name, not_contained: nc, safe: s.flows.safe, f11: s.flows.f11, flips_if_gw_high: open };
  });
}
