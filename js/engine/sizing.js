// The sizing bridge: town flow deficit -> sizing rule -> units to build -> unit rates -> investment.
// Only interventions the town's own flows call for produce a line. Pure functions, no DOM.
// Money appears only where a rate comes from a reviewed cost item (status REAL) or from the user. Draft figures are hints, never totals.

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Sizing rules -> { id: value }, with the user's changes laid over the defaults. */
export function ruleValues(sizing, overrides = {}) {
  const out = {};
  for (const x of sizing.rules) {
    const o = overrides[x.id];
    out[x.id] = num(o) && o > 0 ? o : x.value;
  }
  return out;
}

/** Default rate for a line from the cost items it is built from. usable = every item is reviewed (REAL). */
export function defaultRate(itemIds, costsById) {
  const items = itemIds.map((id) => costsById[id]);
  if (!items.length || items.some((i) => !i || !num(i.cost_low) || !num(i.cost_high))) return { capex: null, opex: null, usable: false, hint: false };
  let capex = 0; let opex = 0;
  for (const i of items) {
    const mid = (i.cost_low + i.cost_high) / 2;
    if (i.cost_type === 'One-off') capex += mid; else opex += mid * (num(i.uses_per_year) ? i.uses_per_year : 1);
  }
  const usable = items.every((i) => i.status === 'REAL');
  return { capex, opex, usable, hint: !usable };
}

/** The levels a "full fix" is sized for. */
export function fullLevels(wv) {
  return { uptake: 1, treat: 1, collection: wv ? Math.max(wv.collected_share, 0.9) : null, controlled: wv ? 1 : null, compost: Boolean(wv && wv.organic_share) };
}

/**
 * r = plan() result; wv = wfdView() or null; levels = { uptake, treat, collection, controlled, compost }.
 * rules = ruleValues(); costs = cost items; optionsById = rules.options by id; rates = user's { lineId: { capex, opex } }.
 */
export function sizeBridge({ r, wv, levels, rules, costs, ruleOptions, rates = {}, existing = {} }) {
  const costsById = Object.fromEntries(costs.items.map((i) => [i.id, i]));
  const optById = Object.fromEntries(ruleOptions.map((o) => [o.id, o]));
  const lines = [];
  const add = (line0) => {
    // What the municipality already runs (workbook tier 2) is taken off the need; the line stays so the plan shows it is covered.
    const have = num(existing[line0.id]) ? existing[line0.id] : null;
    const line = have === null ? line0 : { ...line0, units: { ...line0.units, need: line0.units.value, existing: have, value: Math.max(0, Math.round((line0.units.value - have) * 10) / 10) } };
    const def = defaultRate(line.items, costsById);
    const user = rates[line.id] || {};
    const capex = num(user.capex) ? user.capex : def.usable ? def.capex : null;
    const opex = num(user.opex) ? user.opex : def.usable ? def.opex : null;
    const source = num(user.capex) || num(user.opex) ? 'user' : def.usable ? 'reviewed' : 'none';
    lines.push({ ...line, rate: { capex, opex, source, hint_capex: def.hint ? def.capex : null, hint_opex: def.hint ? def.opex : null },
      capex_total: capex === null || line.unsized ? null : capex * line.units.value,
      opex_total: opex === null || line.unsized ? null : opex * line.units.value });
  };
  const pph = r ? r.households.persons_per_household : null;
  const uptake = Math.min(1, Math.max(0, levels.uptake || 0));
  const treat = Math.min(1, Math.max(0, levels.treat || 0));

  if (r) {
  // 1. Households to move off systems that do not contain: one line per kind of work.
  const groups = new Map();
  for (const id of r.summary.options) {
    const o = r.options.find((x) => x.id === id);
    const s = r.outcome.systems.find((x) => x.code === o.system);
    const g = groups.get(o.name) || { name: o.name, households: 0, items: (optById[id]?.lines || []).map((l) => l.item) };
    g.households += o.households;
    groups.set(o.name, g);
  }
  if (uptake > 0) {
    for (const g of [...groups.values()].sort((a, b) => b.households - a.households)) {
      const hh = Math.round(g.households * uptake);
      if (hh < 1) continue;
      add({ id: `contain:${g.name}`, domain: 'sanitation', kind: 'contain', name: g.name,
        deficit: { value: Math.round(g.households), unit: 'households', level: uptake },
        rule: { key: 'one_per_household', ids: [] }, units: { value: hh, unit: 'households' }, rate_unit: 'household', items: g.items });
    }
  }
  // Systems with no listed option. Where groundwater is high this is every septic tank and direct discharge: size shared treatment by flow.
  const uncovered = r.outcome.systems.filter((s) => r.summary.systems_uncovered.includes(s.code));
  const uncPersons = uncovered.reduce((a, s) => a + s.persons, 0);
  if (uptake > 0 && uncPersons > 0.02 * (r.outcome.not_contained_persons || 1)) {
    const flow = (uncPersons * uptake * rules.wastewater_l_cap_day) / 1000;
    add({ id: 'shared_treatment', domain: 'sanitation', kind: 'shared_treatment', name: null,
      deficit: { value: Math.round(uncPersons), unit: 'people', level: uptake },
      rule: { key: 'flow', ids: ['wastewater_l_cap_day'] }, units: { value: Math.round(flow), unit: 'm3_day' }, rate_unit: 'm3_day', items: [] });
  }

  // 2. Transport and treatment for the sludge that is already emptied: households that empty today (the SFD's share emptied),
  //    plus households moved off direct discharge, at the emptying habit of the system they move to.
  let withStore = r.outcome.systems.filter((s) => s.group !== 'direct').reduce((a, s) => a + s.households * (s.emptied_share || 0), 0);
  for (const id of r.summary.options) {
    const o = r.options.find((x) => x.id === id);
    const s = r.outcome.systems.find((x) => x.code === o.system);
    const res = r.outcome.systems.find((x) => x.code === o.result_system);
    if (s.group === 'direct' && res) withStore += o.households * uptake * (res.emptied_share || 0);
  }
  if (treat > 0 && withStore >= 1) {
    const emptyings = (withStore / rules.empty_interval_years) * treat;
    const volume = emptyings * rules.volume_per_emptying_m3;
    const vehicles = Math.max(1, Math.ceil(emptyings / (rules.trips_per_vehicle_day * rules.working_days)));
    const perDay = volume / rules.working_days;
    const beds = (volume * rules.sludge_ts_kg_m3) / rules.drying_bed_loading;
    const common = { households: Math.round(withStore), emptyings: Math.round(emptyings), volume: Math.round(volume), level: treat };
    add({ id: 'vehicles', domain: 'sanitation', kind: 'vehicles', name: null, deficit: { value: Math.round(withStore), unit: 'households', ...common },
      rule: { key: 'vehicles', ids: ['empty_interval_years', 'trips_per_vehicle_day', 'working_days'] }, units: { value: vehicles, unit: 'vehicles' }, rate_unit: 'vehicle', items: ['C30'] });
    add({ id: 'fstp', domain: 'sanitation', kind: 'fstp', name: null, deficit: { value: Math.round(volume), unit: 'm3_year', ...common },
      rule: { key: 'fstp', ids: ['empty_interval_years', 'volume_per_emptying_m3', 'working_days'] }, units: { value: Math.round(perDay * 10) / 10, unit: 'm3_day' }, rate_unit: 'm3_day', items: ['C12'] });
    add({ id: 'beds', domain: 'sanitation', kind: 'beds', name: null, deficit: { value: Math.round(volume * rules.sludge_ts_kg_m3), unit: 'kg_ts_year', ...common },
      rule: { key: 'beds', ids: ['sludge_ts_kg_m3', 'drying_bed_loading'] }, units: { value: Math.round(beds), unit: 'm2' }, rate_unit: 'm2', items: ['C34'] });
  }
  }

  // 3. Solid waste.
  if (wv) {
    const c0 = wv.collected_share;
    const c1 = Math.min(1, Math.max(c0, levels.collection ?? c0));
    if (c1 > c0 + 1e-9) {
      const extra = wv.msw_t_day * (c1 - c0);
      add({ id: 'collection', domain: 'waste', kind: 'collection', name: null, deficit: { value: Math.round(extra * 10) / 10, unit: 't_day', from: c0, to: c1 },
        rule: { key: 'collection', ids: ['collection_vehicle_t_day'] }, units: { value: Math.max(1, Math.ceil(extra / rules.collection_vehicle_t_day)), unit: 'vans' }, rate_unit: 'van', items: ['S03'] });
    }
    if (levels.compost && num(wv.organic_share) && wv.organic_share > 0) {
      const atPlant = wv.msw_t_day * c1 * wv.organic_share * rules.organic_capture;
      const modules = Math.max(1, Math.ceil(atPlant / rules.compost_module_t_day));
      add({ id: 'compost', domain: 'waste', kind: 'compost', name: null,
        deficit: { value: Math.round(wv.msw_t_day * c1 * wv.organic_share * 10) / 10, unit: 't_day', organic: wv.organic_share, at_plant: Math.round(atPlant * 10) / 10 },
        rule: { key: 'compost', ids: ['organic_capture', 'compost_module_t_day', 'compost_yield'] },
        units: { value: Math.round(modules * rules.compost_module_t_day), unit: 't_day_capacity', modules, compost_t_day: Math.round(atPlant * rules.compost_yield * 10) / 10 },
        rate_unit: 't_day_capacity', items: ['S06'] });
    }
    const k0 = wv.controlled_share;
    const k1 = Math.min(1, Math.max(k0, levels.controlled ?? k0));
    if (k1 > k0 + 1e-9 && wv.disposed_t_year > 0) {
      add({ id: 'disposal', domain: 'waste', kind: 'disposal', name: null, deficit: { value: Math.round((wv.disposed_t_year / 365) * (k1 - k0) * 10) / 10, unit: 't_day' },
        rule: { key: 'none', ids: [] }, units: { value: Math.round((wv.disposed_t_year / 365) * (k1 - k0) * 10) / 10, unit: 't_day' }, rate_unit: 'site', items: ['S08'], unsized: true });
    }
  }

  const priced = lines.filter((l) => l.capex_total !== null || l.opex_total !== null);
  return {
    lines, levels: { uptake, treat, collection: levels.collection ?? null, controlled: levels.controlled ?? null, compost: Boolean(levels.compost) },
    persons_per_household: pph,
    totals: { capex: priced.reduce((a, l) => a + (l.capex_total || 0), 0), opex: priced.reduce((a, l) => a + (l.opex_total || 0), 0),
      priced: priced.length, unpriced: lines.length - priced.length, any_user: lines.some((l) => l.rate.source === 'user') },
  };
}
