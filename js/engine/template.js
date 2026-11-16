// The planner workbook: what it asks for, in three tiers, and how a filled copy is read back.
// Tier 1 = what the SFD and WFD reports give (required). Tier 2 = operations the municipality knows. Tier 3 = governance and money.
// Every row carries a plain label and a key; the reader matches on the key first, then the label. Pure functions, no DOM.

export const TEMPLATE_VERSION = '0.4';

export const OPS = [
  { key: 'vehicles_existing', label: 'Emptying vehicles in service', unit: 'vehicles' },
  { key: 'fstp_existing_m3_day', label: 'Faecal sludge treatment capacity in use', unit: 'm³ a day' },
  { key: 'beds_existing_m2', label: 'Sludge drying beds in use', unit: 'm²' },
  { key: 'vans_existing', label: 'Waste collection vans or trucks in service', unit: 'vehicles' },
  { key: 'compost_existing_t_day', label: 'Composting capacity in use', unit: 'tonnes a day' },
  { key: 'low_income_pct', label: 'People living in low-income settlements', unit: '%' },
  { key: 'budget_year', label: 'Capital budget a year for sanitation and waste', unit: 'plan currency' },
  { key: 'currency', label: 'Currency of all money figures', unit: 'e.g. BDT', text: true },
  { key: 'start_year', label: 'First year of the plan', unit: 'year' },
  { key: 'plan_years', label: 'Years the plan covers', unit: 'years' },
];

export const GOV = [
  { key: 'san_plan', domain: 'sanitation', label: 'A sanitation or faecal sludge plan is adopted by the council' },
  { key: 'san_budget', domain: 'sanitation', label: 'The budget has its own line for sanitation' },
  { key: 'san_rules', domain: 'sanitation', label: 'Emptying and disposal rules are enforced (licences, a designated site)' },
  { key: 'san_service', domain: 'sanitation', label: 'A licensed emptying service runs at a published price' },
  { key: 'waste_fee', domain: 'waste', label: 'Households pay a waste collection fee' },
  { key: 'waste_segregation', domain: 'waste', label: 'Waste is separated at source (Solid Waste Management Rules 2021)' },
  { key: 'waste_informal', domain: 'waste', label: 'Informal collectors and recyclers are recognised and included' },
  { key: 'waste_site', domain: 'waste', label: 'A permitted disposal site is in use' },
];
export const GOV_SCALE = ['0 = not in place', '1 = started', '2 = partly in place', '3 = in place'];

export const LEVER_KEYS = ['uptake', 'treat', 'wcol', 'wctl', 'compost'];
const LEVER_LABEL = { uptake: 'Households moved to a system that contains (%)', treat: 'Emptied sludge treated (%)', wcol: 'Waste collected (%)', wctl: 'Disposal that is controlled (%)', compost: 'Compost organic waste (1 = yes)' };

/** The cost lines the sizing bridge can produce, with the unit each rate is per. */
export function costLines(rules) {
  const names = [...new Set(rules.options.map((o) => o.name))].filter((n) => !/emptying/i.test(n));
  return [
    ...names.map((n) => ({ id: `contain:${n}`, unit: 'household' })),
    { id: 'shared_treatment', unit: 'm3_day' }, { id: 'vehicles', unit: 'vehicle' }, { id: 'fstp', unit: 'm3_day' }, { id: 'beds', unit: 'm2' }, { id: 'land', unit: 'decimal' },
    { id: 'collection', unit: 'van' }, { id: 'bins', unit: 'household' }, { id: 'compost', unit: 't_day_capacity' },
  ];
}

const head = (labels) => labels.map((v) => ({ v, s: 'head' }));
const inp = (v) => ({ v: v === undefined || v === '' ? null : v, s: 'input' });
const note = (v) => ({ v, s: 'note' });
const numOrNull = (v) => { if (v === null || v === undefined || String(v).trim() === '') return null; const n = Number(String(v).replace(/,/g, '').replace(/%$/, '')); return Number.isFinite(n) ? n : null; };

/**
 * Sheets for the workbook. `v` holds current values (all optional): { form, ops, wards, gov, rates, ruleOverrides, scenarios, phase }.
 * t = strings function (plain system names, WFD labels, cost line names). sysIdx, rules, sizing = data files.
 */
export function templateSheets({ t, sysIdx, rules, sizing, v = {}, wfdFields, title = '' }) {
  const f = v.form || {};
  const ops = v.ops || {};
  const gov = v.gov || {};
  const rates = v.rates || {};
  const ro = v.ruleOverrides || {};
  const readme = [
    [{ v: `Sanitation and waste planner workbook v${TEMPLATE_VERSION}${title ? `: ${title}` : ''}`, s: 'head' }],
    [note('Fill the yellow cells. Leave a cell blank when you do not know the figure: the planner then uses its default and marks the result "assumed".')],
    [note('Tier 1 (required): sheets Town, SFD systems and WFD. These are the figures in the published SFD and WFD reports.')],
    [note('Tier 2 (optional): sheets Operations and Wards. Vehicles, plants and budgets the municipality already has. They turn "what to build" into "what is missing".')],
    [note('Tier 3 (optional): sheets Costs, Sizing rules and Governance. Local prices, local design figures and how the services are run. They turn sizing into a costed plan.')],
    [note('Scenarios: up to three named sets of actions, read back into the planner.')],
    [note('Do not rename sheets or change the grey "key" column. Percentages are whole numbers (45 means 45%). Tonnes are a year unless the row says a day.')],
    [note('The file stays on your computer. The planner reads it in the browser and does not upload it.')],
  ];
  const town = [head(['Field', 'Value', 'Unit', 'Tier', 'key']),
    ['Town or municipality', inp(f.name), '', 1, note('name')],
    ['Country', inp(f.country), '', 1, note('country')],
    ['District', inp(f.district), '', 2, note('district')],
    ['Population', inp(numOrNull(f.population)), 'people', 1, note('population')],
    ['Households', inp(numOrNull(f.households)), 'households', 2, note('households')],
    [t('check.sludge'), inp(numOrNull(f.sludge_pct)), '%', 1, note('sludge_pct')],
    ['Year of the SFD', inp(numOrNull(f.sfd_year)), 'year', 1, note('sfd_year')],
    ['SFD source (report title or link)', inp(f.sfd_source), '', 1, note('sfd_source')],
    ['WFD source (report title or link)', inp(f.wfd_source), '', 1, note('wfd_source')]];
  const sfd = [head(['Containment system', 'Share of people (%)', 'Share emptied (%)', 'key'])];
  for (const code of Object.keys(sysIdx)) {
    sfd.push([t(`sys.${code}`), inp(numOrNull(f[`share_${code}`])), sysIdx[code].group === 'direct' ? note('not emptied') : inp(numOrNull(f[`emptied_${code}`])), note(`sys:${t(`sys.${code}`)}`)]);
  }
  const wfdExtra = [{ k: 'recovered_t', label: 'Waste recovered (tonnes a year)' }, { k: 'disposed_t', label: 'Waste taken to a disposal site (tonnes a year)' }];
  const wfd = [head(['Figure', 'Value', 'key']), ...wfdFields.map((k) => [t(`w.${k}`), inp(numOrNull(f[k])), note(k)]), ...wfdExtra.map((x) => [x.label, inp(numOrNull(f[x.k])), note(x.k)])];
  const opsRows = [head(['Figure', 'Value', 'Unit', 'key']), ...OPS.map((o) => [o.label, inp(o.text ? ops[o.key] : numOrNull(ops[o.key])), o.unit, note(o.key)])];
  const wards = [head(['Ward', 'Population', 'Households', 'Low-income share (%)'])];
  for (const w of (v.wards && v.wards.length ? v.wards : Array.from({ length: 9 }, (_, i) => ({ ward: `Ward ${i + 1}` })))) {
    wards.push([inp(w.ward), inp(w.population ?? null), inp(w.households ?? null), inp(w.low_income_pct ?? null)]);
  }
  const costs = [head(['Item', 'Unit', 'Build cost per unit', 'Running cost per unit a year', 'Year of price', 'Source of price', 'Responsible', 'key', 'Planner default if blank'])];
  for (const c of costLines(rules)) {
    const r = rates[c.id] || {};
    const name = c.id.startsWith('contain:') ? t(`opt.${c.id.slice(8)}`) : t(`line.${c.id}`);
    const dflt = v.defaults && v.defaults[c.id];
    costs.push([name, t(`per.${c.unit}`), inp(r.capex ?? null), inp(r.opex ?? null), inp(r.year ?? null), inp(r.source ?? null), inp(r.owner ?? null), note(c.id), note(dflt || '')]);
  }
  const rulesRows = [head(['Sizing rule', 'Value', 'Unit', 'Planner default', 'Default is', 'key']),
    ...sizing.rules.map((x) => [x.label, inp(ro[x.id] ?? null), x.unit, x.value, x.status === 'CITED' ? 'cited' : 'assumption', note(x.id)])];
  const govRows = [head(['Statement', 'Score (0 to 3)', 'Area', 'key']), ...GOV.map((g) => [g.label, inp(numOrNull(gov[g.key])), g.domain, note(g.key)]),
    [], [note(`Scores: ${GOV_SCALE.join('; ')}. A self-assessment under CSDA and Wasteaware headings, not either method in full.`)]];
  const scen = [head(['Scenario', ...LEVER_KEYS.map((k) => LEVER_LABEL[k])])];
  const ss = v.scenarios && v.scenarios.length ? v.scenarios : [{ name: 'Scenario A' }];
  for (const s of ss.slice(0, 3)) scen.push([inp(s.name), ...LEVER_KEYS.map((k) => inp(k === 'compost' ? (s.compost ? 1 : null) : s[k] ?? null))]);
  return [
    { name: 'Read me', widths: [110], rows: readme },
    { name: 'Town', widths: [44, 30, 14, 6, 14], rows: town, freeze: true },
    { name: 'SFD systems', widths: [52, 20, 18, 40], rows: sfd, freeze: true },
    { name: 'WFD', widths: [46, 16, 22], rows: wfd, freeze: true },
    { name: 'Operations', widths: [50, 16, 16, 24], rows: opsRows, freeze: true },
    { name: 'Wards', widths: [20, 14, 14, 20], rows: wards, freeze: true },
    { name: 'Costs', widths: [44, 26, 18, 22, 12, 30, 20, 34, 60], rows: costs, freeze: true },
    { name: 'Sizing rules', widths: [60, 12, 30, 14, 12, 26], rows: rulesRows, freeze: true },
    { name: 'Governance', widths: [70, 14, 12, 18], rows: govRows, freeze: true },
    { name: 'Scenarios', widths: [20, 20, 18, 16, 20, 18], rows: scen, freeze: true },
  ];
}

/** Rows of a key/value sheet -> Map(key -> row). The key is in the last non-empty cell of the template's key column. */
function byKey(rows, keyCol) {
  const m = new Map();
  for (const row of rows.slice(1)) {
    const k = row[keyCol];
    if (typeof k === 'string' && k.trim()) m.set(k.trim(), row);
  }
  return m;
}

/**
 * A filled workbook ({ sheetName: rows }) -> what the planner keeps.
 * Returns { form, ops, wards, gov, rates, ruleOverrides, scenarios, tiers, problems }.
 */
export function readTemplate(book, { t, sysIdx, rules, sizing, wfdFields }) {
  const problems = [];
  const sheet = (n) => book[n] || null;
  const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const form = {};
  const tiers = { 1: [], 2: [], 3: [] };
  const townS = sheet('Town');
  if (!townS) problems.push({ key: 'wb.no_town' });
  else {
    const m = byKey(townS, 4);
    for (const k of ['name', 'country', 'district', 'sfd_source', 'wfd_source']) if (m.has(k) && str(m.get(k)[1])) form[k] = str(m.get(k)[1]).slice(0, 120);
    for (const k of ['population', 'households', 'sludge_pct', 'sfd_year']) if (m.has(k)) { const n = numOrNull(m.get(k)[1]); if (n !== null && n >= 0) form[k] = String(n); }
  }
  const sfdS = sheet('SFD systems');
  if (sfdS) {
    const byName = Object.fromEntries(Object.keys(sysIdx).map((c) => [t(`sys.${c}`).toLowerCase(), c]));
    for (const row of sfdS.slice(1)) {
      const key = str(row[3]).replace(/^sys:/, '').toLowerCase() || str(row[0]).toLowerCase();
      const code = byName[key] || byName[str(row[0]).toLowerCase()];
      if (!code) continue;
      const share = numOrNull(row[1]);
      const emptied = numOrNull(row[2]);
      if (share !== null && share > 0) form[`share_${code}`] = String(Math.min(100, share));
      if (emptied !== null && emptied >= 0 && sysIdx[code].group !== 'direct') form[`emptied_${code}`] = String(Math.min(100, emptied));
    }
  }
  const wfdS = sheet('WFD');
  if (wfdS) {
    const m = byKey(wfdS, 2);
    for (const k of [...wfdFields, 'recovered_t', 'disposed_t']) if (m.has(k)) { const n = numOrNull(m.get(k)[1]); if (n !== null && n >= 0) form[k] = String(n); }
  }
  const ops = {};
  const opsS = sheet('Operations');
  if (opsS) {
    const m = byKey(opsS, 3);
    for (const o of OPS) {
      if (!m.has(o.key)) continue;
      const raw = m.get(o.key)[1];
      if (o.text) { if (str(raw)) ops[o.key] = str(raw).slice(0, 6); } else { const n = numOrNull(raw); if (n !== null && n >= 0) ops[o.key] = n; }
    }
    if (ops.start_year !== undefined && (ops.start_year < 2000 || ops.start_year > 2100)) { problems.push({ key: 'wb.bad_year' }); delete ops.start_year; }
    if (ops.plan_years !== undefined) ops.plan_years = Math.min(15, Math.max(1, Math.round(ops.plan_years)));
  }
  const wards = [];
  for (const row of (sheet('Wards') || []).slice(1)) {
    const pop = numOrNull(row[1]);
    if (!str(row[0]) || pop === null) continue;
    wards.push({ ward: str(row[0]).slice(0, 40), population: pop, households: numOrNull(row[2]), low_income_pct: numOrNull(row[3]) });
  }
  const rates = {};
  const known = new Set(costLines(rules).map((c) => c.id));
  for (const row of (sheet('Costs') || []).slice(1)) {
    const id = str(row[7]);
    if (!known.has(id)) continue;
    const r = {};
    const capex = numOrNull(row[2]); const opex = numOrNull(row[3]); const year = numOrNull(row[4]);
    if (capex !== null && capex >= 0) r.capex = capex;
    if (opex !== null && opex >= 0) r.opex = opex;
    if (year !== null) r.year = year;
    if (str(row[5])) r.source = str(row[5]).slice(0, 120);
    if (str(row[6])) r.owner = str(row[6]).slice(0, 60);
    if (Object.keys(r).length) rates[id] = r;
  }
  const ruleOverrides = {};
  const ruleIds = new Set(sizing.rules.map((x) => x.id));
  for (const row of (sheet('Sizing rules') || []).slice(1)) {
    const id = str(row[5]); const n = numOrNull(row[1]);
    if (ruleIds.has(id) && n !== null && n > 0) ruleOverrides[id] = n;
  }
  const gov = {};
  const govS = sheet('Governance');
  if (govS) {
    const m = byKey(govS, 3);
    for (const g of GOV) if (m.has(g.key)) { const n = numOrNull(m.get(g.key)[1]); if (n !== null && n >= 0 && n <= 3) gov[g.key] = Math.round(n); }
  }
  const scenarios = [];
  for (const row of (sheet('Scenarios') || []).slice(1)) {
    const name = str(row[0]);
    if (!name) continue;
    const s = { name: name.slice(0, 30) };
    LEVER_KEYS.forEach((k, i) => { const n = numOrNull(row[i + 1]); if (k === 'compost') s.compost = n === 1; else if (n !== null) s[k] = Math.min(100, Math.max(0, n)); });
    scenarios.push(s);
    if (scenarios.length === 3) break;
  }
  if (Object.keys(form).some((k) => k.startsWith('share_'))) tiers[1].push('sfd');
  if (wfdFields.some((k) => form[k] !== undefined)) tiers[1].push('wfd');
  if (Object.keys(ops).length) tiers[2].push('ops');
  if (wards.length) tiers[2].push('wards');
  if (Object.keys(rates).length) tiers[3].push('costs');
  if (Object.keys(ruleOverrides).length) tiers[3].push('rules');
  if (Object.keys(gov).length) tiers[3].push('gov');
  return { form, ops, wards, gov, rates, ruleOverrides, scenarios, tiers, problems };
}
