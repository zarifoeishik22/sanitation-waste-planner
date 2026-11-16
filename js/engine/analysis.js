// Planning analysis on top of the SFD and WFD engines: service chains, flow diagrams, the contribution of each action,
// how complete the town's data is, phasing by year, and the insights that lead to actions. Pure functions, no DOM.

import { sanScenario } from './scenario.js';
import { wfdScenario } from './wfd.js';
import { excretaLoad, plasticLoad, rankOf, median } from './drain.js';
import { OPS, GOV } from './template.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Sanitation service chain, as shares of the population: contained, emptied, treated, safely managed. */
export function sanChain(r, sfdTown) {
  if (!r) return null;
  const S = r.outcome.systems;
  const contained = S.filter((s) => s.contained).reduce((a, s) => a + s.pop_share, 0);
  const emptied = S.filter((s) => s.group !== 'direct').reduce((a, s) => a + s.pop_share * (s.sludge_factor ?? 1) * (s.emptied_share || 0), 0);
  const tr = sfdTown && sfdTown.treatment ? sfdTown.treatment.delivered_share * sfdTown.treatment.treated_share : 0;
  return { contained, emptied, treated: emptied * tr, safe: r.outcome.components.safe };
}

/** Solid waste chain, as shares of waste generated. "Controlled" approximates SDG 11.6.1 from the WFD figures. */
export function wasteChain(wv) {
  if (!wv) return null;
  const msw = wv.msw_t_year || 0;
  const rec = msw > 0 ? (wv.recovered_t_year || 0) / msw : 0;
  const ctl = msw > 0 ? ((wv.disposed_t_year || 0) * (wv.controlled_share || 0)) / msw : 0;
  return { collected: wv.collected_share, recovered: rec, controlled: Math.min(1, rec + ctl), plastic_managed: wv.plastic_generated_t > 0 ? 1 - wv.plastic_unmanaged_t / wv.plastic_generated_t : null };
}

/**
 * Excreta flow diagram data, people: system group -> contained or not -> where it ends up.
 * Built from the town's SFD flows: safe, emptied and untreated, discharged to a receiver.
 */
export function sanFlows(r) {
  if (!r) return null;
  const pop = r.outcome.systems.reduce((a, s) => a + s.persons, 0) / (r.outcome.systems.reduce((a, s) => a + s.pop_share, 0) || 1);
  const link = new Map();
  const add = (s, t, v) => { if (v <= 0) return; const k = `${s}>${t}`; link.set(k, (link.get(k) || 0) + v * pop); };
  for (const s of r.outcome.systems) {
    const g = `g:${s.flipped ? 'flooded' : s.group}`;
    const c = s.contained ? 'c:yes' : 'c:no';
    add(g, c, s.pop_share);
    add(c, 'f:safe', s.safe_share);
    add(c, 'f:dumped', s.f11);
    const out = s.w11c + s.f15 + s.s11e;
    const m = String(s.code).match(/C(\d+)$/);
    const dest = s.flipped ? 'ground' : ({ 6: 'drain', 7: 'water', 8: 'ground' }[m ? Number(m[1]) : 0] || 'ground');
    add(c, `f:${dest}`, out);
  }
  return { population: pop, links: [...link.entries()].map(([k, v]) => { const [s, t] = k.split('>'); return { s, t, v }; }) };
}

/**
 * Plastic flow diagram data, tonnes a year: generated -> collected or not -> managed or escaped at a stage -> where it ends up.
 * Stage shares that do not sum to one are rescaled (the town is flagged elsewhere).
 */
export function plasticFlows(wv) {
  if (!wv) return null;
  const U = wv.plastic_unmanaged_t;
  const norm = wv.stage_sum > 0 ? 1 / wv.stage_sum : 0;
  const st = (keys) => keys.reduce((a, k) => a + ((wv.stages.find((s) => s.key === k) || {}).share || 0), 0) * norm * U;
  const esc = { uncollected: st(['uncollected']), chain: st(['collection', 'informal_collection', 'transport']), sorting: st(['formal_sorting', 'informal_sorting']), disposal: st(['disposal']) };
  const G = wv.plastic_generated_t;
  const uncol = Math.max(wv.plastic_uncollected_t || 0, esc.uncollected);
  const col = Math.max(0, G - uncol);
  const links = [];
  const add = (s, t, v) => { if (v > 0.05) links.push({ s, t, v }); };
  add('p:gen', 'p:col', col);
  add('p:gen', 'p:uncol', uncol);
  add('p:uncol', 's:uncollected', esc.uncollected);
  add('p:uncol', 'p:managed', uncol - esc.uncollected);
  add('p:col', 's:chain', esc.chain);
  add('p:col', 's:sorting', esc.sorting);
  add('p:col', 's:disposal', esc.disposal);
  add('p:col', 'p:managed', col - esc.chain - esc.sorting - esc.disposal);
  for (const k of ['uncollected', 'chain', 'sorting', 'disposal']) add(`s:${k}`, 'p:escaped', esc[k]);
  const fates = Object.fromEntries(wv.fates.map((f) => [f.key, f.tonnes]));
  const fsum = Object.values(fates).reduce((a, b) => a + b, 0);
  for (const k of ['drains', 'water', 'land', 'burnt']) add('p:escaped', `x:${k}`, fsum > 0 ? (fates[k] / fsum) * U : 0);
  const balance = col - esc.chain - esc.sorting - esc.disposal;
  return { generated: G, unmanaged: U, links, balanced: balance >= -Math.max(1, 0.01 * G) };
}

/**
 * The part each action plays: apply the levers one at a time, in order, and record the change.
 * Returns steps for excreta safely managed (share) and plastic escaping (tonnes a year).
 */
export function contributions({ r, sfdTown, sysIdx, wv, levers }) {
  const order = ['uptake', 'treat', 'collection', 'controlled'];
  const cur = { uptake: 0, treat: 0, collection: wv ? wv.collected_share : null, controlled: wv ? wv.controlled_share : null };
  const val = () => ({
    safe: r ? sanScenario(r, sfdTown, sysIdx, cur).safe : null,
    plastic: wv ? wfdScenario(wv, cur).unmanaged_after_t : null,
  });
  let prev = val();
  const base = prev;
  const steps = [];
  for (const k of order) {
    if (levers[k] === undefined || levers[k] === null) continue;
    if ((k === 'uptake' || k === 'treat') && !r) continue;
    if ((k === 'collection' || k === 'controlled') && !wv) continue;
    cur[k] = levers[k];
    const now = val();
    steps.push({ key: k, d_safe: r ? now.safe - prev.safe : 0, d_plastic: wv ? now.plastic - prev.plastic : 0 });
    prev = now;
  }
  return { base, end: prev, steps };
}

/** How much of each tier the town has filled. */
export function completeness({ r, wv, ops = {}, wards = [], gov = {}, rates = {}, lines = [] }) {
  const opsKeys = OPS.filter((o) => !o.text).map((o) => o.key);
  const opsFilled = opsKeys.filter((k) => num(ops[k])).length;
  const sized = lines.filter((l) => !l.unsized);
  const priced = sized.filter((l) => l.rate.source !== 'none').length;
  const govFilled = GOV.filter((g) => num(gov[g.key])).length;
  return {
    tier1: { have: (r ? 1 : 0) + (wv ? 1 : 0), of: 2, missing: [...(r ? [] : ['sfd']), ...(wv ? [] : ['wfd'])] },
    tier2: { have: opsFilled + (wards.length ? 1 : 0), of: opsKeys.length + 1 },
    tier3: { have: priced + govFilled, of: sized.length + GOV.length, priced, lines: sized.length, gov: govFilled },
  };
}

const PHASE = { land: [0, 1], bins: [0, 2], vehicles: [0, 2], collection: [0, 2], fstp: [1, 3], beds: [1, 3], compost: [1, 3], shared_treatment: [2, 3], disposal: [1, 3] };

/** When each line is built: { lineId: { start (years from plan start), years } }, user choices over the defaults. Spend per year. */
export function phasing(lines, planYears, chosen = {}) {
  const n = Math.max(1, planYears);
  const rows = lines.map((l) => {
    const def = l.kind === 'contain' ? [0, n] : PHASE[l.kind] || [0, n];
    const c = chosen[l.id] || {};
    const start = Math.min(n - 1, Math.max(0, num(c.start) ? c.start : def[0]));
    const years = Math.min(n - start, Math.max(1, num(c.years) ? c.years : def[1]));
    return { id: l.id, line: l, start, years, per_year: l.capex_total === null ? null : l.capex_total / years };
  });
  const spend = Array.from({ length: n }, (_, y) => rows.reduce((a, x) => a + (x.per_year !== null && y >= x.start && y < x.start + x.years ? x.per_year : 0), 0));
  return { rows, spend, years: n };
}

/**
 * Insights: finding, evidence, action. Each names the lever that tests it.
 * kinds: loss (biggest leak), hotspot (both systems load the same drains), peer (among the 50), contradiction, missing.
 */
export function insights({ r, wv, ex0, pl0, paired, me, flags = [], comp, sizing, isOwn }) {
  const out = [];
  if (r && ex0) {
    const rc = ex0.receivers;
    const top = ['drain', 'water', 'ground', 'dumped'].map((k) => ({ k, share: rc[k].share, persons: rc[k].persons })).sort((a, b) => b.share - a.share)[0];
    if (top.share > 0.01) {
      const src = ex0.sources.find((s) => s.dest === top.k);
      out.push({ id: `loss_san_${top.k}`, kind: 'loss', domain: 'sanitation', key: `ins.loss_san_${top.k}`, vars: { share: top.share, persons: top.persons, group: src ? src.group : null },
        evidence: 'sfd', lever: top.k === 'dumped' ? 'treat' : 'uptake', weight: top.share });
    }
  }
  if (wv) {
    const b = wv.biggest_stage;
    if (b && b.share > 0.05) {
      const lever = b.key === 'uncollected' ? 'collection' : b.key === 'disposal' ? 'controlled' : null;
      out.push({ id: `loss_waste_${b.key}`, kind: 'loss', domain: 'waste', key: `ins.loss_waste_${b.key === 'uncollected' || b.key === 'disposal' ? b.key : 'chain'}`,
        vars: { share: b.share, tonnes: b.tonnes, total: wv.plastic_unmanaged_t }, evidence: 'wfd', lever, weight: b.share * 0.9 });
    }
  }
  // Only a hotspot when both loads matter: at least 5% of the town's excreta, and 1% or 10 tonnes a year of its escaping plastic, reach the drains.
  // In the 50 WFDs no town sends more than about 2% of escaping plastic to drains, so this is deliberately a low bar on plastic.
  if (ex0 && pl0 && ex0.receivers.drain.share >= 0.05 && pl0.total_t > 0 && (pl0.receivers.drain.tonnes / pl0.total_t >= 0.01 || pl0.receivers.drain.tonnes >= 10)) {
    out.push({ id: 'hotspot_drain', kind: 'hotspot', domain: 'both', key: 'ins.hotspot', vars: { persons: ex0.receivers.drain.persons, tonnes: pl0.receivers.drain.tonnes },
      evidence: 'both', lever: 'both', weight: 0.35 + Math.min(0.5, ex0.receivers.drain.share) });
  }
  if (paired && me) {
    const n = paired.length;
    if (r && num(me.safe)) {
      const rank = rankOf(me.safe, paired.map((p) => p.safe));
      const med = median(paired.map((p) => p.safe));
      if (rank !== null && rank <= 0.25) out.push({ id: 'peer_safe', kind: 'peer', domain: 'sanitation', key: 'ins.peer_safe', vars: { value: me.safe, median: med, worse: Math.round(rank * n), n }, evidence: 'peers', lever: 'uptake', weight: 0.5 });
    }
    if (wv && num(me.plastic_kg_person)) {
      const xs = paired.map((p) => p.plastic_kg_person);
      const rank = rankOf(me.plastic_kg_person, xs);
      if (rank !== null && rank >= 0.75) out.push({ id: 'peer_plastic', kind: 'peer', domain: 'waste', key: 'ins.peer_plastic', vars: { value: me.plastic_kg_person, median: median(xs), better: Math.round(rank * n), n }, evidence: 'peers', lever: 'collection', weight: 0.45 });
    }
  }
  for (const f of flags.filter((x) => ['safe_mismatch', 'shares_filled', 'wfd_balance', 'population_gap', 'portal_differs'].includes(x.id))) {
    out.push({ id: `contra_${f.id}`, kind: 'contradiction', domain: f.id.startsWith('wfd') || f.id === 'portal_differs' ? 'waste' : 'sanitation', key: 'ins.contradiction', flag: f, evidence: 'flag', lever: null, weight: 0.3 });
  }
  if (comp) {
    if (comp.tier3.lines && !comp.tier3.priced) out.push({ id: 'missing_costs', kind: 'missing', domain: 'both', key: 'ins.missing_costs', vars: { n: comp.tier3.lines }, evidence: 'workbook', lever: null, weight: 0.2 });
    if (comp.tier2.have === 0) out.push({ id: 'missing_ops', kind: 'missing', domain: 'both', key: 'ins.missing_ops', vars: {}, evidence: 'workbook', lever: null, weight: 0.15 });
    if (comp.tier3.gov === 0) out.push({ id: 'missing_gov', kind: 'missing', domain: 'both', key: 'ins.missing_gov', vars: {}, evidence: 'workbook', lever: null, weight: 0.1 });
    if (comp.tier1.missing.length) out.push({ id: `missing_${comp.tier1.missing[0]}`, kind: 'missing', domain: comp.tier1.missing[0] === 'sfd' ? 'sanitation' : 'waste', key: `ins.missing_${comp.tier1.missing[0]}`, vars: {}, evidence: 'workbook', lever: null, weight: 0.6 });
  }
  return out.sort((a, b) => b.weight - a.weight);
}
