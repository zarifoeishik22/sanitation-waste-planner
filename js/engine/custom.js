// A town typed in by the user: build the same structures the built-in towns have.
// Pure functions, no DOM. Nothing here leaves the browser.

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** SFD flows of one system from its share, emptied share and sludge factor, by the SFD Lite rules the 50 towns follow. */
export function systemFlows(meta, popShare, emptiedShare, sludgeFactor) {
  const P = popShare;
  const e = clamp01(emptiedShare || 0);
  const z = { f8: 0, f11: 0, f15: 0, w11c: 0, s11e: 0 };
  if (meta.group === 'direct') return { ...z, w11c: P };
  if (meta.group === 'septic') {
    const f = sludgeFactor ?? 1;
    if (meta.contained_gw_low) return { ...z, f8: P * (1 - f * e), f11: P * f * e };
    // Outlet to an open drain: the supernatant is counted as effluent (S11e). Outlet to water or ground: it stays with the sludge.
    if (meta.code === 'T1A2C6') return { ...z, f11: P * f * e, f15: P * f * (1 - e), s11e: P * (1 - f) };
    return { ...z, f11: P * f * e, f15: P * (1 - f * e) };
  }
  if (meta.contained_gw_low) return { ...z, f8: P * (1 - e), f11: P * e };
  return { ...z, f11: P * e, f15: P * (1 - e) };
}

/**
 * entry.systems = [{ code, share, emptied }] as fractions; entry.sludge_factor applies to septic tanks (1 = none stated).
 * Returns { sfdTown, problems }. No treatment is assumed, as in all 50 surveyed towns.
 */
export function buildSfdTown(entry, sysIdx) {
  const problems = [];
  const systems = [];
  let sum = 0;
  for (const row of entry.systems) {
    const meta = sysIdx[row.code];
    if (!meta || !(row.share > 0)) continue;
    const f = meta.group === 'septic' ? clamp01(entry.sludge_factor ?? 1) : null;
    const flows = systemFlows(meta, row.share, row.emptied, f);
    systems.push({ code: row.code, pop_share: row.share, emptied_share: meta.group === 'direct' ? 0 : clamp01(row.emptied || 0), sludge_factor: f, ...flows });
    sum += row.share;
  }
  if (!systems.length) problems.push({ key: 'no_systems' });
  else if (sum < 0.99 || sum > 1.01) problems.push({ key: 'share_sum', value: sum });
  const tot = (k) => systems.reduce((a, s) => a + s[k], 0);
  const flows = { pop_sum: sum, safe: tot('f8'), f8: tot('f8'), f11: tot('f11'), f15: tot('f15'), w11c: tot('w11c'), s11e: tot('s11e') };
  flows.unsafe = flows.f11 + flows.f15 + flows.w11c + flows.s11e;
  return { sfdTown: { systems, flows, treatment: { delivered_share: 0, treated_share: 0 } }, problems };
}

/** WFD values typed from a WFD report -> the structure wfdView() reads. Tonnes a year unless stated. */
export function buildWfdTown(e) {
  const problems = [];
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  const need = ['msw_t_day', 'collected_share', 'plastic_generated_t', 'plastic_unmanaged_t'];
  if (need.some((k) => n(e[k]) === null)) return { wfdTown: null, problems: [{ key: 'wfd_missing' }] };
  const U = e.plastic_unmanaged_t;
  const st = { uncollected: n(e.stage_uncollected_t) ?? 0, collection: n(e.stage_collection_t) ?? 0, formal_sorting: n(e.stage_sorting_t) ?? 0,
    transport: n(e.stage_transport_t) ?? 0, disposal: n(e.stage_disposal_t) ?? 0 };
  const stSum = Object.values(st).reduce((a, b) => a + b, 0);
  if (stSum > 0 && Math.abs(stSum - U) > Math.max(1, 0.01 * U)) problems.push({ key: 'stage_sum', value: stSum, expected: U });
  const msw = e.msw_t_day * 365;
  const c = Math.min(1, e.collected_share);
  const share = (v) => (U > 0 ? v / U : 0);
  const outputs = {
    plastic_generated_t: e.plastic_generated_t, msw_generated_t: msw, msw_collected_share: c, msw_collected_t: msw * c, msw_uncollected_t: msw * (1 - c),
    plastic_uncollected_t: st.uncollected, plastic_collected_t: Math.max(0, e.plastic_generated_t - st.uncollected),
    msw_recovered_t: n(e.recovered_t) ?? 0, msw_disposed_t: n(e.disposed_t) ?? 0, plastic_controlled_t: 0,
    plastic_unmanaged_t: U, plastic_unmanaged_share: e.plastic_generated_t > 0 ? U / e.plastic_generated_t : 0,
    stage_uncollected_share: share(st.uncollected), stage_collection_share: share(st.collection), stage_informal_collection_share: 0,
    stage_formal_sorting_share: share(st.formal_sorting), stage_informal_sorting_share: 0, stage_transport_share: share(st.transport), stage_disposal_share: share(st.disposal),
    fate_land_t: n(e.fate_land_t) ?? 0, fate_burnt_t: n(e.fate_burnt_t) ?? 0, fate_drains_t: n(e.fate_drains_t) ?? 0, fate_water_t: n(e.fate_water_t) ?? 0,
    water_kg_per_person: null,
  };
  return { wfdTown: { outputs, inputs: { '3.6': n(e.organic_share), '9.3': 0 }, mass_balance_flag: false, stages_given: stSum > 0 }, problems };
}
