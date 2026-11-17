// The plan as three stand-alone packages, each with one result and a payer for every line:
//   collect  = raise waste collection (vans by the municipality, bins by households)
//   treat    = treat the sludge that is already emptied (tankers, plant, land: a project to finance with partners)
//   toilets  = household works that make toilets contain (paid by households unless the town says otherwise)
// Costs are never added into one figure for the town: they are kept by payer and by year. Pure functions, no DOM.

import { sanScenario } from '../engine/scenario.js';
import { wfdScenario } from '../engine/wfd.js';
import { sizeBridge } from '../engine/sizing.js';
import { phasing } from '../engine/analysis.js';

export const PACKAGE_IDS = ['collect', 'treat', 'toilets'];
export const PAYERS = ['municipality', 'partners', 'households'];
export const COLLECTION_TARGET = 0.9;

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Timeline rows. `def` = [first year (0 = the plan's first year), years to build]; null years = the whole plan. */
export const GROUPS = [
  { id: 'collect', pkg: 'collect', kinds: ['collection', 'bins'], def: [0, 2] },
  { id: 'land', pkg: 'treat', kinds: ['land'], def: [0, 1] },
  { id: 'plant', pkg: 'treat', kinds: ['fstp', 'beds', 'vehicles'], def: [1, 3] },
  { id: 'toilets', pkg: 'toilets', kinds: ['contain', 'shared_treatment'], def: [0, null] },
];
const GROUP_OF = Object.fromEntries(GROUPS.flatMap((g) => g.kinds.map((k) => [k, g])));

/** Who pays for a line. Household works follow the town's answer; everything shared is a project to finance with partners. */
export function payerOf(line, answers = {}) {
  if (line.kind === 'collection') return 'municipality';
  if (line.kind === 'bins') return 'households';
  if (line.kind === 'contain') return answers.pays === 'municipality' ? 'municipality' : 'households';
  return 'partners';
}

/** The engine levels for a set of packages. */
export function levelsFor(on, wv) {
  const c0 = wv ? wv.collected_share : null;
  return { uptake: on.toilets ? 1 : 0, treat: on.treat ? 1 : 0, collection: wv ? (on.collect ? Math.max(c0, COLLECTION_TARGET) : c0) : null, controlled: wv ? wv.controlled_share : null, compost: false };
}

function tag(lines, answers) {
  return lines.filter((l) => GROUP_OF[l.kind]).map((l) => {
    const g = GROUP_OF[l.kind];
    const held = l.kind === 'land' && answers.land === 'yes';
    return { ...l, pkg: g.pkg, group: g.id, payer: payerOf(l, answers), held, capex_total: held ? 0 : l.capex_total, capex_range: held ? null : l.capex_range };
  });
}

const sumBy = (lines, key) => {
  const out = { municipality: 0, partners: 0, households: 0 };
  for (const l of lines) if (num(l[key])) out[l.payer] += l[key];
  return out;
};

/**
 * ctx = buildContext() result for the town with no levers set. on = { collect, treat, toilets }.
 * answers = step 3 ({ pays, land, ... }). phase = { groupId: { start, years } }. budget = money a year, or null.
 */
export function buildPlan({ ctx, on, answers = {}, phase = {}, budget = null }) {
  const { r, sfdTown, sysIdx, wv, sizeArgs } = ctx;
  const population = r ? ctx.town.population_sfd : ctx.town.population_wfd;
  const n = Math.max(1, ctx.planYears);
  const size = (lv) => tag(sizeBridge({ ...sizeArgs, levels: lv }).lines, answers);
  const outcome = (lv) => ({ safe: r ? sanScenario(r, sfdTown, sysIdx, lv).safe : null, plastic: wv ? wfdScenario(wv, lv).unmanaged_after_t : null, collected: wv ? lv.collection : null });
  const base = outcome(levelsFor({}, wv));
  const levels = levelsFor(on, wv);
  const linesOn = size(levels);
  const end = outcome(levels);

  const packages = PACKAGE_IDS.map((id) => {
    const aloneLv = levelsFor({ [id]: true }, wv);
    const alone = { lines: size(aloneLv).filter((l) => l.pkg === id), result: outcome(aloneLv) };
    const lines = on[id] ? linesOn.filter((l) => l.pkg === id) : alone.lines;
    const needsSfd = id !== 'collect';
    const reason = needsSfd && !r ? 'no_sfd' : !needsSfd && !wv ? 'no_wfd' : alone.lines.length ? null : 'in_place';
    const capex = sumBy(lines, 'capex_total');
    const aloneCapex = sumBy(alone.lines, 'capex_total');
    // The treatment plant grows when household works are also on, because more tanks then get emptied.
    const grows = id === 'treat' && Boolean(on.treat) && Boolean(on.toilets) && Math.abs((capex.partners + capex.municipality) - (aloneCapex.partners + aloneCapex.municipality)) > 1;
    return { id, on: Boolean(on[id]) && !reason, available: !reason, reason, lines, alone, capex, alone_capex: aloneCapex, grows,
      opex_public: lines.filter((l) => l.payer !== 'households').reduce((a, l) => a + (l.opex_total || 0), 0),
      unpriced: lines.filter((l) => l.capex_total === null).map((l) => l.id) };
  });
  // Results that depend on the other package: household works alone, and together with treatment.
  const both = r ? outcome(levelsFor({ treat: true, toilets: true }, wv)) : null;
  const treatAlone = packages[1].alone.result;

  const active = linesOn.filter((l) => packages.find((p) => p.id === l.pkg).on);
  const capex = sumBy(active, 'capex_total');
  const running = active.filter((l) => l.payer !== 'households').reduce((a, l) => a + (l.opex_total || 0), 0);

  // When: group phases (the town's choices over the defaults) laid onto each line.
  const landToBuy = active.some((l) => l.kind === 'land' && !l.held);
  const groups = GROUPS.map((g) => {
    const lines = active.filter((l) => l.group === g.id && !(l.kind === 'land' && l.held));
    if (!lines.length) return null;
    const def = g.id === 'plant' && !landToBuy ? [0, g.def[1]] : g.def;
    const c = phase[g.id] || {};
    const start = Math.min(n - 1, Math.max(0, num(c.start) ? c.start : def[0]));
    const years = Math.min(n - start, Math.max(1, num(c.years) ? c.years : def[1] === null ? n : def[1]));
    return { id: g.id, pkg: g.pkg, lines, start, years, capex: sumBy(lines, 'capex_total') };
  }).filter(Boolean);
  const chosen = {};
  for (const g of groups) for (const l of g.lines) chosen[l.id] = { start: g.start, years: g.years };
  const ph = phasing(active.filter((l) => chosen[l.id]), n, chosen);
  const years = Array.from({ length: n }, (_, y) => {
    const row = { year: ctx.startYear + y, municipality: 0, partners: 0, households: 0, running: 0 };
    for (const x of ph.rows) {
      if (x.per_year !== null && y >= x.start && y < x.start + x.years) row[x.line.payer] += x.per_year;
      // Running cost follows what has been built by the start of the year.
      if (x.line.payer !== 'households' && x.line.opex_total) row.running += x.line.opex_total * Math.min(1, Math.max(0, (y - x.start) / x.years));
    }
    row.public = row.municipality + row.partners;
    row.municipal_need = row.municipality + row.running;
    row.fits = num(budget) ? row.municipal_need <= budget + 1 : null;
    row.gap = num(budget) ? Math.max(0, row.municipal_need - budget) : null;
    return row;
  });

  const contain = active.filter((l) => l.kind === 'contain' && num(l.rate.capex));
  const bins = active.find((l) => l.kind === 'bins' && num(l.rate.capex));
  const publicCapex = capex.municipality + capex.partners;
  return {
    population, plan_years: n, start_year: ctx.startYear, end_year: ctx.startYear + n - 1, currency: ctx.currency || 'BDT',
    levels, base, end, both, treat_alone: treatAlone, packages, lines: active, groups, years,
    money: {
      ...capex, public: publicCapex, running,
      per_resident_year: population > 0 ? publicCapex / population / n : null,
      household_each: contain.length ? { low: Math.min(...contain.map((l) => l.rate.capex)), high: Math.max(...contain.map((l) => l.rate.capex)) } : null,
      bin_each: bins ? bins.rate.capex : null,
    },
    budget: num(budget) ? { value: budget, fits: years.every((y) => y.fits), over: years.filter((y) => !y.fits).map((y) => y.year), running_after: running } : null,
    unpriced: active.filter((l) => l.capex_total === null).map((l) => l.id),
  };
}

/**
 * Stretch the municipality's own building so each year's need (build + running) stays within the budget where the plan's length allows.
 * Returns group phases to merge into the plan, or null when nothing needs to move.
 */
export function fitToBudget(plan, budget) {
  if (!num(budget) || budget <= 0) return null;
  const out = {};
  for (const g of plan.groups) {
    const mine = g.capex.municipality;
    if (!(mine > 0)) continue;
    // Running cost of everything public, once built, is the floor the budget must also carry.
    const room = Math.max(0, budget - plan.money.running);
    const need = room > 0 ? Math.ceil(mine / room) : plan.plan_years;
    const years = Math.min(plan.plan_years - g.start, Math.max(g.years, need));
    if (years !== g.years) out[g.id] = { start: g.start, years };
  }
  return Object.keys(out).length ? out : null;
}
