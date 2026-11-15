// Cost arithmetic. Pure functions, no DOM: runs in the browser and in Node.
// Formulas are the ones in the Cost_BoQ sheet of the template workbook.

export const CASES = ['low', 'mid', 'high'];

/** Parameter list from params.json -> plain object, with optional overrides. */
export function paramMap(paramsJson, overrides = {}) {
  const p = {};
  for (const row of paramsJson.params) p[row.name] = row.value;
  return { ...p, ...overrides };
}

/** Capital recovery factor: annual payment per unit of capital over n years at rate r. */
export function crf(r, n) {
  const g = Math.pow(1 + r, n);
  return (r * g) / (g - 1);
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Cost of one unit of a cost item under one cost case.
 * Returns nulls where the workbook leaves the cell empty (missing price, lifespan or frequency).
 */
export function itemCost(item, p, kase) {
  if (!item || !num(item.cost_low) || !num(item.cost_high)) return { selected: null, annual: null, upfront: null };
  const base = kase === 'low' ? item.cost_low : kase === 'high' ? item.cost_high : (item.cost_low + item.cost_high) / 2;
  const selected = base * (num(item.year_of_cost) ? Math.pow(1 + p.infl_rate, p.price_base_year - item.year_of_cost) : 1);
  let annual = null;
  let upfront = 0;
  if (item.cost_type === 'One-off') {
    upfront = selected;
    if (num(item.lifespan_years)) annual = selected * (crf(p.disc_rate, item.lifespan_years) + (num(item.om_fraction) ? item.om_fraction : 0));
  } else if (item.cost_type === 'Per service') {
    if (num(item.uses_per_year)) annual = selected * item.uses_per_year;
  } else if (item.cost_type === 'Annual') {
    annual = selected;
  }
  return { selected, annual, upfront };
}

/**
 * Cost of an option per household: the sum of its lines (quantity x cost item).
 * complete = every line has a quantity and an annual cost. An incomplete option is never costed in part.
 */
export function optionCost(option, itemsById, p) {
  const missing = [];
  const statuses = new Set();
  const byCase = {};
  for (const kase of CASES) byCase[kase] = { annual_hh: 0, upfront_hh: 0, by_bearer: {} };
  for (const line of option.lines) {
    const item = itemsById[line.item];
    if (item) statuses.add(item.status);
    if (!item) { missing.push({ item: line.item, why: 'unknown item' }); continue; }
    if (!num(line.qty)) { missing.push({ item: line.item, why: 'quantity' }); continue; }
    for (const kase of CASES) {
      const c = itemCost(item, p, kase);
      if (c.annual === null) { if (kase === 'mid') missing.push({ item: line.item, why: 'cost' }); continue; }
      const t = byCase[kase];
      const bearer = item.bearer || 'Unassigned';
      t.annual_hh += line.qty * c.annual;
      t.upfront_hh += line.qty * c.upfront;
      t.by_bearer[bearer] = t.by_bearer[bearer] || { annual_hh: 0, upfront_hh: 0 };
      t.by_bearer[bearer].annual_hh += line.qty * c.annual;
      t.by_bearer[bearer].upfront_hh += line.qty * c.upfront;
    }
  }
  const complete = missing.length === 0;
  const status = statuses.has('TO FILL') ? 'TO FILL' : statuses.has('PLACEHOLDER') ? 'PLACEHOLDER' : statuses.has('USER') ? 'USER' : statuses.size ? 'REAL' : 'TO FILL';
  return { complete, missing, status, byCase: complete ? byCase : null };
}

/** Cost items with the user's own figures laid over the defaults. An edited item is marked USER, never PLACEHOLDER or REAL. */
export function applyCostOverrides(costs, overrides = {}) {
  const FIELDS = ['cost_low', 'cost_high', 'lifespan_years', 'uses_per_year'];
  const items = costs.items.map((it) => {
    const o = overrides[it.id];
    if (!o) return it;
    const next = { ...it };
    let touched = false;
    for (const f of FIELDS) {
      if (!(f in o)) continue;
      const v = o[f];
      if (v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)) { next[f] = v; touched = true; }
    }
    if (touched) { next.status = 'USER'; if (num(next.cost_low) && num(next.cost_high) && next.cost_high < next.cost_low) [next.cost_low, next.cost_high] = [next.cost_high, next.cost_low]; }
    return next;
  });
  return { ...costs, items };
}
