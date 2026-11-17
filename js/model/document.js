// The plan document: a council-ready draft built from the town's figures, the packages that are on and the answers given.
// One model, three outputs: the screen, the Word file and the printed page. Pure functions, no DOM.

import { int, pct, people, money, inUnit, moneyUnit } from './format.js';
import { PACKAGE_SHORT, PAYER_NAME, lineWords, worksCostLabel } from './describe.js';

const blank = (v) => v === null || v === undefined || String(v).trim() === '';

/** What the plan still assumes because step 3 left it blank. */
export function assumedList(w, plan, ctx) {
  const a = w.answers; const out = [];
  if (blank(a.budget)) out.push('No yearly budget entered, so the plan is not yet fitted to it');
  if (blank(a.start_year)) out.push(`First year ${plan.start_year}: the planner's default`);
  const have = [['tankers', 'tankers'], ['vans', 'waste vans'], ['fstp', 'sludge treatment']].filter(([k]) => blank(a[k])).map(([, n]) => n);
  if (have.length) out.push(`No ${have.join(', ').replace(/, ([^,]*)$/, ' or $1')} counted as already in service`);
  if (ctx.r && (blank(a.land) || a.land === 'unsure')) out.push('Land for the plant: to be bought');
  if (ctx.r && blank(a.gw)) out.push('No flooding or high groundwater');
  if (a.gw === 'some') out.push('Some wards flood or have high groundwater: the plan does not yet treat those wards differently');
  if (ctx.wv && blank(a.site)) out.push('Where collected waste goes: not stated');
  const assumed = ctx.d.sizing.rules.filter((x) => x.status !== 'CITED' && !(x.id in (w.ruleOverrides || {}))).length;
  if (assumed) out.push(`${assumed} sizing rules are planner assumptions (workbook, sheet Sizing rules)`);
  return out;
}

/** What someone must confirm before the plan goes to council. */
export function confirmList(w, plan, ctx, portal) {
  const out = [];
  const eng = (kind) => plan.lines.some((l) => l.kind === kind && l.rate.source === 'engineer');
  if (eng('fstp')) out.push(`The design capacity of the treatment plant that was priced (the plan assumes ${ctx.rules.fstp_ref_m3_day} m³ a day)`);
  if (eng('vehicles')) out.push('Whether the tanker price includes the truck');
  if (plan.lines.some((l) => l.kind === 'contain' && /soak pit/i.test(l.name) && l.rate.source === 'engineer')) out.push('The size of the soak pit that was priced');
  if (plan.packages[2].on && w.answers.pays !== 'municipality') out.push("The municipality's programme cost for household works (by-law, trained masons, a loan or subsidy scheme): [COST NOT YET SET]");
  if (w.answers.pays === 'subsidy') out.push('The share of household works the subsidy covers: [TO BE SET]');
  if (plan.lines.some((l) => l.kind === 'shared_treatment')) out.push('The design of shared treatment where groundwater is high: the figure here is sized from flow only');
  if (portal && ctx.wv) out.push(`Plastic escaping a year: the WFD portal gives ${int(portal.plastic_unmanaged_t)} t and the project dataset ${int(ctx.d.wfd.towns[String(ctx.town.id)].outputs.plastic_unmanaged_t)} t. This plan uses ${int(ctx.wv.plastic_unmanaged_t)} t`);
  if (w.answers.site === 'dump' || w.answers.site === 'none') out.push('A controlled disposal site is not priced in this plan: the unit cost sheet has no price for it');
  if (plan.unpriced.length) out.push(`${plan.unpriced.length} item${plan.unpriced.length === 1 ? ' has' : 's have'} no price yet and ${plan.unpriced.length === 1 ? 'is' : 'are'} left out of the cost tables`);
  out.push('Who is responsible for each package: [TO BE ASSIGNED]');
  return out;
}

const payerWords = (p, w) => {
  const set = [...new Set(p.lines.map((l) => l.payer))];
  if (p.id === 'collect') return set.includes('households') ? 'Municipality: vans. Households: bins.' : 'Municipality';
  if (p.id === 'treat') return 'A project financed with partners; the municipality runs it';
  if (set.includes('partners')) return 'A project financed with partners';
  return w.answers.pays === 'municipality' ? 'Municipality' : w.answers.pays === 'subsidy' ? 'Households, with a subsidy' : 'Households';
};

export function planDocument({ ctx, plan, find, w, district, portal, today }) {
  const cur = plan.currency; const unit = moneyUnit(cur);
  const town = ctx.town; const b = plan.base; const e = plan.end;
  const on = plan.packages.filter((p) => p.on);
  const src = [];
  if (ctx.r) src.push(ctx.isOwn ? `the SFD ${town.meta && town.meta.sfd_basis === 'workbook' ? 'figures in the planner workbook' : 'report supplied'}${town.sfd.date ? ` (${String(town.sfd.date).slice(0, 4)})` : ''}`
    : `the published SFD${ctx.listing && ctx.listing.status === 'listed' ? ` (SuSanA${ctx.listing.entry.year ? `, ${ctx.listing.entry.year}` : ''})` : town.sfd.date ? ` (${town.sfd.date.slice(0, 4)})` : ''}`);
  if (ctx.wv) src.push(ctx.isOwn ? 'the WFD figures supplied' : w.plastic === 'portal' && portal ? 'the WFD (project dataset; plastic escaping from the GIZ portal)' : 'the WFD (project dataset)');
  const d8 = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  // 1. Where the town stands
  const hh = ctx.r ? ctx.r.households.households : null;
  const s1 = [];
  let p1 = `${town.name} has ${int(plan.population)} people${hh ? ` in ${int(hh)} households` : ''}.`;
  if (ctx.r) p1 += ` Today ${pct(b.safe)} of them have safely managed sanitation`;
  if (ctx.wv) p1 += `${ctx.r ? ', and' : ' Today'} ${pct(b.collected)} of the town's ${int(ctx.wv.msw_t_day)} tonnes of daily waste is collected`;
  p1 += '.';
  if (find.working.length) p1 += ` ${find.working.length === 1 ? 'One strength stands' : 'Strengths stand'} out: ${find.working.map((x) => `${x.value} ${x.label}`).join('; ')}.`;
  s1.push({ p: p1 });
  if (find.gaps.length) s1.push({ p: `${find.gaps.length === 1 ? 'One gap holds' : `${['Two', 'Three'][find.gaps.length - 2] || find.gaps.length} gaps hold`} most of the gain: ${find.gaps.map((g) => g.title.charAt(0).toLowerCase() + g.title.slice(1)).join('; ')}.` });
  if (w.answers.site) s1.push({ p: `Collected waste goes to ${{ dump: 'an open dump', controlled: 'a controlled site', none: 'no fixed site' }[w.answers.site]}.` });

  // 2. The plan
  const resultOf = (p) => {
    if (p.id === 'collect') return `Collection ${pct(b.collected)} to ${pct(p.alone.result.collected)}. ${int(b.plastic - p.alone.result.plastic)} t of plastic a year kept out.`;
    if (p.id === 'treat') return `Safely managed ${pct(b.safe)} to ${pct(p.alone.result.safe)}`;
    const withTreat = plan.packages[1].on;
    return withTreat ? `Safely managed ${pct(plan.treat_alone.safe)} to ${pct(plan.both.safe)}` : `Safely managed ${pct(b.safe)} to ${pct(p.alone.result.safe)}`;
  };
  const planTable = { head: ['Package', 'Who pays', 'What gets built', `Result by ${plan.end_year}`],
    rows: on.map((p) => [PACKAGE_SHORT[p.id], payerWords(p, w), p.lines.map((l) => lineWords(l, true)).filter(Boolean).join('; '), resultOf(p)]) };

  // 3. Cost by payer and year
  const yr = plan.years;
  const row = (label, key) => [label, ...yr.map((y) => inUnit(y[key], cur)), inUnit(yr.reduce((a, y) => a + y[key], 0), cur)];
  const costRows = [];
  if (plan.money.municipality > 0) costRows.push(row('Municipality', 'municipality'));
  if (plan.money.partners > 0) costRows.push(row('Partners', 'partners'));
  costRows.push(row('Public money', 'public'));
  const costTable = { head: [unit.label, ...yr.map((y) => String(y.year)), 'Total'], rows: costRows, numeric: true };
  const m = plan.money; const cost = [];
  let pc = `Once built, the municipality's running cost is ${money(m.running, cur)} a year.`;
  const hhBits = [];
  if (m.bin_each !== null) hhBits.push(`about ${money(m.bin_each, cur)} for a bin`);
  if (m.household_each) hhBits.push(m.household_each.low === m.household_each.high ? `${money(m.household_each.low, cur)} once for toilet work` : `${money(m.household_each.low, cur)} to ${money(m.household_each.high, cur).replace(`${cur} `, '')} once for toilet work, depending on what the home has today`);
  if (hhBits.length && w.answers.pays !== 'municipality') pc += ` Households pay for their own works: ${hhBits.join(', and ')}.`;
  cost.push({ p: pc });
  if (m.per_resident_year !== null && m.public > 0) cost.push({ p: `Municipal and partner money to build it all comes to ${money(m.public, cur)}: ${money(m.per_resident_year, cur)} per resident a year over ${plan.plan_years} years.` });
  if (plan.budget) cost.push({ p: plan.budget.fits ? `The municipality's own share, build and running, stays within its budget of ${money(plan.budget.value, cur)} a year in every year of the plan.`
    : `The municipality's own share, build and running, is above its budget of ${money(plan.budget.value, cur)} a year in ${plan.budget.over.join(', ')}. Those years need a later start, a longer build or partner support.` });
  const each = plan.lines.filter((l) => l.kind === 'contain' && l.rate.capex !== null);
  if (each.length) cost.push({ list: each.map((l) => `${money(l.rate.capex, cur)} ${worksCostLabel(l.name)} (${int(l.units.value)} households)`) });

  // 4. Targets
  const targets = [];
  if (ctx.r && e.safe !== b.safe) targets.push({ label: 'Safely managed sanitation', value: `${pct(b.safe)} to ${pct(e.safe)}` });
  if (ctx.wv && e.collected !== b.collected) targets.push({ label: 'Waste collected', value: `${pct(b.collected)} to ${pct(e.collected)}` });
  if (ctx.wv && Math.round(e.plastic) !== Math.round(b.plastic)) targets.push({ label: 'Plastic escaping a year', value: `${int(b.plastic)} t to ${int(e.plastic)} t` });

  // 5. Who does what
  const lead = { collect: 'Municipality, conservancy section: [TO BE ASSIGNED]', treat: 'Municipality with DPHE or a development partner: [TO BE ASSIGNED]', toilets: 'Households, with the municipality setting the rules: [TO BE ASSIGNED]' };
  const when = (p) => { const gs = plan.groups.filter((g) => g.pkg === p.id); if (!gs.length) return ''; const s = Math.min(...gs.map((g) => g.start)); const en = Math.max(...gs.map((g) => g.start + g.years)); return `${plan.start_year + s} to ${plan.start_year + en - 1}`; };
  const whoTable = { head: ['Package', 'Lead', 'Pays to build', 'Runs it afterwards', 'When'],
    rows: on.map((p) => [PACKAGE_SHORT[p.id], lead[p.id], [...new Set(p.lines.map((l) => PAYER_NAME[l.payer]))].join(' and '), p.id === 'toilets' ? 'Households' : 'Municipality', when(p)]) };

  // 6. Data, sources and assumptions
  const assumed = assumedList(w, plan, ctx);
  const confirm = confirmList(w, plan, ctx, portal);
  const priced = plan.lines.filter((l) => l.rate.source === 'engineer');
  const s6 = [{ p: `This plan is built from ${src.join(' and ')}. Quantities come from the planner's sizing rules. ${priced.length ? `Prices are the project engineer's unit costs for Bangladesh${ctx.d.unit_costs && ctx.d.unit_costs.received ? ` (${ctx.d.unit_costs.received})` : ''}.` : ''} Each package is sized on its own figures; the three are not added into one total because they have different payers.` }];
  for (const key of ['plant', 'disposal']) if (w.sites && w.sites[key]) s6.push({ p: `${key === 'plant' ? 'Treatment plant' : 'Disposal'} site marked on the map: ${w.sites[key][1].toFixed(4)}° N, ${w.sites[key][0].toFixed(4)}° E.` });
  if (assumed.length) { s6.push({ h3: 'Still assumed' }); s6.push({ list: assumed }); }
  s6.push({ h3: 'Confirm before council' }); s6.push({ list: confirm });
  const notes = (town.flags || []).filter(Boolean);
  if (notes.length) { s6.push({ h3: 'Notes on the data' }); s6.push({ list: notes }); }

  return {
    kicker: 'Draft for council review', title: /municipality|paurashava|pourashava|city|town/i.test(town.name) ? town.name : `${town.name} Municipality`,
    subtitle: `Sanitation and waste management plan, ${plan.start_year} to ${plan.end_year}`,
    basis: `Built from ${src.join(' and ')}. Prepared ${d8}.${district ? ` ${district} district.` : ''}`,
    sections: [
      { h: '1. Where the town stands', blocks: s1 },
      { h: '2. The plan', blocks: on.length ? [{ table: planTable }] : [{ p: 'No package is switched on yet.' }] },
      { h: '3. Cost to build, by payer and year', blocks: on.length ? [{ table: costTable }, ...cost] : [{ p: 'No package is switched on yet.' }] },
      { h: `4. Targets for ${plan.end_year}`, blocks: targets.length ? [{ targets }] : [{ p: 'No target changes until a package is switched on.' }] },
      { h: '5. Who does what', blocks: on.length ? [{ table: whoTable }] : [{ p: 'No package is switched on yet.' }] },
      { h: '6. Data, sources and assumptions', blocks: s6 },
    ],
    assumed, confirm,
  };
}
