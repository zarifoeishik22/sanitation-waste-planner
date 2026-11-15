// Dump the JS engine's results for every built-in town, groundwater setting, household basis and cost case.
// Used by tests/reference.test.mjs to compare with scripts/reference_engine.py, and by run_all_towns.mjs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { plan } from '../js/engine/plan.js';
import { CASES } from '../js/engine/cost.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const load = (name) => JSON.parse(readFileSync(join(root, 'data', name), 'utf8'));

export function dumpAll() {
  const towns = load('towns.json'), sfd = load('sfd.json'), rules = load('rules.json'), costs = load('costs.json'), params = load('params.json');
  const out = {};
  for (const t of towns.towns) {
    for (const gw of ['low', 'high']) {
      for (const basis of ['stated', 'hh_size']) {
        const run = (kase) => plan(t, sfd.towns[String(t.id)], rules, costs, params, { gw, overrides: { hh_basis: basis, cost_case: kase } });
        const r = run('mid');
        const options = {};
        for (const o of r.options) {
          options[o.id] = { status: o.status, households: o.households, persons: o.persons, moved: o.moved_to_contained, safe_gain: o.safe_gain, complete: o.complete,
            cost: o.cost ? Object.fromEntries(CASES.map((k) => [k, [o.cost[k].annual_hh, o.cost[k].upfront_hh, o.cost[k].annual_total, o.cost[k].upfront_total,
              o.cost[k].per_person_contained, o.cost[k].per_person_safe]])) : null };
        }
        out[`${t.id}|${gw}|${basis}`] = {
          households: r.households.households, not_contained_share: r.outcome.not_contained_share, comp: r.outcome.components, binding: r.outcome.binding.key,
          ranked: Object.fromEntries(CASES.map((k) => [k, run(k).ranked])), options,
          summary: { persons_covered: r.summary.persons_covered, persons_uncovered: r.summary.persons_uncovered, safe_gain: r.summary.safe_gain,
            cost: Object.fromEntries(CASES.map((k) => [k, [r.summary.cost[k].annual_total, r.summary.cost[k].upfront_total,
              r.summary.cost[k].by_bearer.Household?.annual_total ?? 0, r.summary.cost[k].by_bearer.Household?.upfront_total ?? 0]])) },
          chain: { complete: r.chain.complete, untreated_persons: r.chain.untreated_persons },
        };
      }
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(JSON.stringify(dumpAll()));
