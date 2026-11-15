// One line per built-in town: the table behind the 50-town demonstration.
// Usage: node scripts/run_all_towns.mjs [low|high] > towns.tsv   (stdout only; nothing is written to the repository)
import { load } from './engine_dump.mjs';
import { plan } from '../js/engine/plan.js';

const gw = process.argv[2] === 'high' ? 'high' : 'low';
const towns = load('towns.json'), sfd = load('sfd.json'), rules = load('rules.json'), costs = load('costs.json'), params = load('params.json');
const cols = ['town', 'population', 'households', 'household_basis', 'safe', 'not_contained', 'largest_loss', 'largest_loss_share', 'options_ranked',
  'persons_newly_contained', 'persons_without_option', 'upfront_mid_bdt_m', 'upfront_low_bdt_m', 'upfront_high_bdt_m', 'annual_mid_bdt_m', 'costs'];
console.log(cols.join('\t'));
for (const t of towns.towns) {
  const r = plan(t, sfd.towns[String(t.id)], rules, costs, params, { gw });
  const m = (k, f) => (r.summary.cost[k][f] / 1e6).toFixed(2);
  console.log([t.name, t.population_sfd, Math.round(r.households.households), r.households.basis, r.outcome.components.safe.toFixed(4), r.outcome.not_contained_share.toFixed(4),
    r.outcome.binding.key, r.outcome.binding.share.toFixed(4), r.ranked.length, Math.round(r.summary.persons_covered), Math.round(r.summary.persons_uncovered),
    m('mid', 'upfront_total'), m('low', 'upfront_total'), m('high', 'upfront_total'), m('mid', 'annual_total'), r.placeholder_in_use ? 'PLACEHOLDER' : 'REAL'].join('\t'));
}
