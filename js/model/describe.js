// Plain words for what the engines compute: what already works, where a plan helps most, and what each package builds,
// changes and costs. One place, so the screens, the Word file and the workbook say the same thing. Pure functions, no DOM.

import { int, pct, people, qty, money, moneyUnit, fix } from './format.js';

export const PACKAGE_TITLE = { collect: 'Collect the waste', treat: 'Treat the sludge that is already emptied', toilets: 'Safe toilets at home' };
export const PACKAGE_SHORT = { collect: 'Collect the waste', treat: 'Treat the sludge', toilets: 'Safe toilets at home' };
export const GROUP_TITLE = { collect: 'Collect the waste', land: 'Land for the plant', plant: 'Plant and tankers', toilets: 'Safe toilets at home' };
export const PAYER_NAME = { municipality: 'Municipality', partners: 'Partners', households: 'Households' };

const WORKS = {
  'Connect septic tank to soak pit': { build: (n) => `A soak pit behind the septic tanks of ${n} households`, cost: 'for a soak pit', short: (n) => `${n} soak pits` },
  'New septic tank with soak pit': { build: (n) => `A new tank with soak pit for ${n} homes`, cost: 'for a new tank and pit', short: (n) => `${n} new tanks with soak pits` },
  'Convert dug hole to VIP latrine': { build: (n) => `${n} dug holes made into ventilated pit latrines`, cost: 'to convert a dug hole', short: (n) => `${n} pit latrine conversions` },
  'Replace with sealed, fully lined tank': { build: (n) => `A sealed, lined tank for ${n} homes`, cost: 'for a sealed tank', short: (n) => `${n} sealed tanks` },
};
const SRC_TITLE = {
  septic_drain: 'Septic tanks with no soak pit drain into open drains',
  septic_water: 'Septic tanks discharge into ponds, canals and rivers',
  septic_ground: 'Septic tanks overflow onto open ground',
  direct_drain: 'Toilets discharge straight into open drains',
  direct_water: 'Toilets discharge straight into ponds, canals and rivers',
  direct_ground: 'Toilets discharge onto open ground',
};
const DEST = { drain: 'an open drain', water: 'a pond, canal or river', ground: 'open ground' };
export const RECEIVER = { safe: 'Safely managed', drain: 'Open drains', dumped: 'Emptied, not treated', ground: 'Open ground', water: 'Ponds, canals, rivers' };
export const FATE = { land: 'Land', water: 'Water', burnt: 'Burnt in the open', drains: 'Drains' };

/** What one sizing line builds, in words. short = for tables. */
export function lineWords(l, short = false) {
  const n = int(l.units.value);
  const covered = l.units.existing !== undefined && l.units.value === 0;
  const after = l.units.existing ? ` (beyond the ${qty(l.units.existing)} in service)` : '';
  if (l.kind === 'contain') { const w = WORKS[l.name]; return w ? (short ? w.short(n) : w.build(n)) : `${l.name}: ${n} households`; }
  if (l.kind === 'collection') return covered ? 'Collection vans: those in service cover it' : `${n} collection vans${after}`;
  if (l.kind === 'bins') return `${n} household bins`;
  if (l.kind === 'vehicles') return covered ? 'Vacuum tankers: those in service cover it' : `${n} vacuum tanker${l.units.value === 1 ? '' : 's'}${after}`;
  if (l.kind === 'fstp') return covered ? 'Sludge treatment: the capacity in use covers it' : `${short ? 'a' : 'Treatment plant,'} ${qty(l.units.value)} m³ a day${short ? ' treatment plant' : ''}${after}`;
  if (l.kind === 'land') return l.held ? `${n} decimals of land the municipality already holds` : `${n} decimals of land`;
  if (l.kind === 'shared_treatment') return `Shared treatment for toilet outlets, ${n} m³ a day`;
  return null; // drying beds are part of the plant
}

export const worksCostLabel = (name) => (WORKS[name] ? WORKS[name].cost : `for: ${name.toLowerCase()}`);

/** Up to three things that already work, and the gaps that hold most of the gain. Each gap names its package. */
export function findings(ctx, plan) {
  const { r, wv, ex0, chains, town } = ctx;
  const pop = r ? town.population_sfd : town.population_wfd;
  const working = [];
  const gaps = [];
  const pk = Object.fromEntries(plan.packages.map((p) => [p.id, p]));
  if (wv && wv.collected_share >= 0.2) working.push({ id: 'collected', value: pct(wv.collected_share), label: "of the town's waste is collected", note: 'A collection service exists. The plan extends it.' });
  if (r && chains.san) {
    const c = chains.san;
    if (c.emptied >= 0.05) working.push({ id: 'emptied', value: `${people(c.emptied * pop)} people`, label: 'have tanks and pits that get emptied',
      note: c.treated < 0.005 ? 'Emptying already happens. Treatment is the missing step.' : `${pct(c.treated / c.emptied)} of that sludge reaches treatment.` });
  }
  if (wv && chains.waste && chains.waste.plastic_managed >= 0.3) working.push({ id: 'plastic', value: pct(chains.waste.plastic_managed), label: 'of plastic waste is already managed',
    note: `${int(wv.plastic_generated_t - wv.plastic_unmanaged_t)} of ${int(wv.plastic_generated_t)} tonnes a year.` });
  if (r && working.length < 3 && chains.san.contained >= 0.1) working.push({ id: 'contained', value: pct(chains.san.contained), label: 'of people use a toilet that contains', note: 'Containment is in place for these homes. The plan extends it to the rest.' });
  if (r && working.length < 3 && r.outcome.components.safe >= 0.1) working.push({ id: 'safe', value: pct(r.outcome.components.safe), label: 'of people have safely managed sanitation', note: `${people(r.outcome.components.safe * pop)} people today.` });
  if (wv && working.length < 3 && wv.recovered_t_year > 0) working.push({ id: 'recovered', value: `${int(wv.recovered_t_year)} t`, label: 'of waste is recovered a year', note: 'Recycling and recovery already take place.' });

  if (r && ex0 && pk.toilets.available) {
    const top = [...ex0.sources].filter((s) => s.dest !== 'dumped').sort((a, b) => b.share - a.share)[0];
    if (top && top.share > 0.01) {
      const septic = top.group === 'septic';
      const title = SRC_TITLE[top.key] || 'Most toilets do not contain what they receive';
      const what = SRC_TITLE[top.key]
        ? `${people(top.persons)} people, ${pct(top.share)} of the town, use ${septic ? 'tanks whose outflow runs to' : 'toilets with no tank or pit, emptying to'} ${DEST[top.dest] || 'the open'}. ${septic ? 'A soak pit behind each tank contains it.' : 'A septic tank with a soak pit contains it.'}`
        : `${people(r.outcome.not_contained_persons)} people use a toilet that does not contain. The package sets out the works that fix it.`;
      gaps.push({ id: 'toilets', pkg: 'toilets', source: 'Sanitation, from the SFD', title, text: what });
    }
  }
  if (r && chains.san && pk.treat.available) {
    const lost = chains.san.emptied - chains.san.treated;
    if (lost > 0.01) gaps.push({ id: 'treat', pkg: 'treat', source: 'Sanitation, from the SFD', title: 'Emptied sludge has nowhere safe to go',
      text: `The sludge of ${people(lost * pop)} people is emptied and then dumped, because ${chains.san.treated < 0.005 ? 'none' : 'too little'} of it reaches treatment. One plant makes that whole chain safe.` });
  }
  if (wv && pk.collect.available) {
    const cut = wv.plastic_unmanaged_t - pk.collect.alone.result.plastic;
    const un = 1 - wv.collected_share;
    const title = un >= 0.9 ? 'Almost none of the waste is collected' : un >= 0.6 ? 'Most of the waste is not collected' : un >= 0.42 ? 'Nearly half the waste is not collected' : `${pct(un)} of the waste is not collected`;
    gaps.push({ id: 'collect', pkg: 'collect', source: 'Solid waste, from the WFD', title,
      text: `${int(wv.plastic_unmanaged_t)} tonnes of plastic a year escape to land and water. Taking collection from ${pct(wv.collected_share)} to ${pct(pk.collect.alone.result.collected)} keeps ${int(cut)} tonnes of that out.` });
  }
  const excreta = r && ex0 ? [{ key: 'safe', share: ex0.safe }, ...['drain', 'dumped', 'ground', 'water'].map((k) => ({ key: k, share: ex0.receivers[k].share }))].filter((x) => x.share > 0.0005) : null;
  const plastic = wv ? wv.fates.map((f) => ({ key: f.key, tonnes: f.tonnes })).filter((x) => x.tonnes > 0.05).sort((a, b) => b.tonnes - a.tonnes) : null;
  return { working: working.slice(0, 3), gaps, excreta, plastic, plastic_total: wv ? wv.plastic_unmanaged_t : null };
}

/** One package in words: who pays, what gets built, what changes, what it costs. */
export function packageWords(p, plan, answers = {}) {
  const cur = plan.currency;
  const b = plan.base;
  const builds = p.lines.map((l) => ({ id: l.id, text: lineWords(l), payer: l.payer })).filter((x) => x.text);
  const changes = [];
  const cost = { headline: null, detail: [], each: [] };
  if (p.id === 'collect') {
    const res = p.alone.result;
    if (p.available) {
      changes.push({ strong: `Collection from ${pct(b.collected)} to ${pct(res.collected)}` });
      changes.push({ strong: `${int(b.plastic - res.plastic)} t of plastic a year kept out` });
    }
    const vans = p.lines.find((l) => l.kind === 'collection');
    const bins = p.lines.find((l) => l.kind === 'bins');
    if (vans && vans.capex_total !== null) { cost.headline = money(vans.capex_total, cur); cost.detail.push(`for the vans, then ${money(vans.opex_total || 0, cur)} a year to run.`); }
    if (bins && bins.rate.capex !== null) cost.detail.push(`Each household buys its bin: about ${money(bins.rate.capex, cur)}.`);
    return { title: PACKAGE_TITLE.collect, badge: bins ? 'Vans by the municipality, bins by households' : 'Paid by the municipality', tone: 'ink', builds, changes, cost };
  }
  if (p.id === 'treat') {
    const res = p.alone.result;
    if (p.available) {
      changes.push({ strong: `Safely managed from ${pct(b.safe)} to ${pct(res.safe)}` });
      changes.push({ strong: `${people((res.safe - b.safe) * plan.population)} people reached` });
    }
    const total = p.capex.partners + p.capex.municipality;
    const part = (kind, word) => { const l = p.lines.find((x) => x.kind === kind); return l && l.capex_total ? `${word} ${fix(l.capex_total / moneyUnit(cur).factor, 1)}` : null; };
    if (!p.unpriced.length || total > 0) cost.headline = money(total, cur);
    const parts = [part('fstp', 'Plant'), part('land', 'land'), part('vehicles', 'tankers')].filter(Boolean);
    if (parts.length) cost.detail.push(`${parts.join(', ')} ${moneyUnit(cur).word}. The municipality then runs it for ${money(p.opex_public, cur)} a year.`);
    if (p.lines.some((l) => l.held)) cost.detail.push('No land cost: the municipality holds the land.');
    return { title: PACKAGE_TITLE.treat, badge: 'A project to finance with partners', tone: 'blue', builds, changes, cost };
  }
  const alone = p.alone.result;
  const shared = p.lines.some((l) => l.kind === 'shared_treatment');
  if (p.available) {
    if (plan.both && plan.treat_alone) {
      changes.push({ strong: `Safely managed from ${pct(plan.treat_alone.safe)} to ${pct(plan.both.safe)}` });
      changes.push({ text: `together with the treatment package. On its own: ${pct(b.safe)} to ${pct(alone.safe)}.` });
    } else changes.push({ strong: `Safely managed from ${pct(b.safe)} to ${pct(alone.safe)}` });
  }
  for (const l of p.lines.filter((x) => x.kind === 'contain' && x.rate.capex !== null)) cost.each.push({ amount: money(l.rate.capex, cur), label: worksCostLabel(l.name), upkeep: l.rate.opex ? money(l.rate.opex, cur) : null });
  const st = p.lines.find((l) => l.kind === 'shared_treatment');
  if (st && st.capex_total !== null) { cost.headline = money(st.capex_total, cur); cost.detail.push('An order-of-size figure from the flow, at the price per m³ a day. The design is still to be decided.'); }
  const payer = answers.pays;
  const badge = shared ? 'A project to finance with partners' : payer === 'municipality' ? 'Paid by the municipality' : payer === 'subsidy' ? 'Paid by households, with a subsidy' : 'Paid by households';
  return { title: PACKAGE_TITLE.toilets, badge, tone: 'slate', builds, changes, cost, households: p.lines.filter((l) => l.kind === 'contain').reduce((a, l) => a + l.units.value, 0),
    works_total: p.capex.households + (payer === 'municipality' ? p.capex.municipality : 0) };
}
