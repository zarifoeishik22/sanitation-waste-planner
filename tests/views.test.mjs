// v0.2 engines: what-if for sanitation and solid waste, typed towns, the decision list, user cost edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../scripts/engine_dump.mjs';
import { plan } from '../js/engine/plan.js';
import { systemIndex, peerTable, COMPONENTS } from '../js/engine/sfd.js';
import { applyCostOverrides } from '../js/engine/cost.js';
import { sanScenario, waysToReach } from '../js/engine/scenario.js';
import { wfdView, wfdScenario, STAGES } from '../js/engine/wfd.js';
import { buildSfdTown, buildWfdTown } from '../js/engine/custom.js';
import { decisions } from '../js/engine/decisions.js';

const towns = load('towns.json'), sfd = load('sfd.json'), wfd = load('wfd.json'), rules = load('rules.json'), costs = load('costs.json'), params = load('params.json');
const idx = systemIndex(rules);
const peers = peerTable(towns.towns, sfd, idx);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);
const run = (t, s = {}) => plan(t, sfd.towns[String(t.id)], rules, costs, params, s);

test('sanitation what-if: no change reproduces the SFD; shares always sum to the same total', () => {
  for (const t of towns.towns) {
    for (const gw of ['low', 'high']) {
      const r = run(t, { gw });
      const s = sfd.towns[String(t.id)];
      const total = COMPONENTS.reduce((a, k) => a + r.outcome.components[k], 0);
      const zero = sanScenario(r, s, idx, { uptake: 0, treat: 0 });
      for (const k of COMPONENTS) near(zero.components[k], r.outcome.components[k], 1e-12, `${t.name} ${k}`);
      let last = zero.safe;
      for (const x of [0.25, 0.5, 1]) {
        const sc = sanScenario(r, s, idx, { uptake: x, treat: x });
        near(COMPONENTS.reduce((a, k) => a + sc.components[k], 0), total, 5e-6, `${t.name} ${gw} total at ${x}`);
        for (const k of COMPONENTS) assert.ok(sc.components[k] >= -1e-9, `${t.name} ${gw} ${k} negative at ${x}`);
        assert.ok(sc.safe >= last - 1e-12, `${t.name} ${gw}: safe share falls as levers rise`);
        last = sc.safe;
      }
      const full = sanScenario(r, s, idx, { uptake: 0, treat: 1 });
      near(full.components.f11, 0, 1e-12, `${t.name}: full treatment leaves no untreated sludge`);
      near(full.safe, r.outcome.components.safe + r.outcome.components.f11, 1e-12, `${t.name}: treated sludge counts as safe`);
    }
  }
});

test('sanitation what-if: Kaliakair by hand', () => {
  const t = towns.towns.find((x) => x.name === 'Kaliakair');
  const r = run(t, { gw: 'low' });
  const s = sfd.towns['1'];
  // every household on a septic tank to drain / water / ground connects to a soak pit; direct dischargers build a septic tank
  const sc = sanScenario(r, s, idx, { uptake: 1, treat: 0 });
  const moved = 0.0963 + 0.0296 + 0.0123 + 0.4148 + 0.0716 + 0.1111;
  near(sc.moved_share, moved, 1e-9, 'moved');
  const septic = 0.049219 / 0.0593; // safe share per person among today's septic tank + soak pit users in Kaliakair
  const pit = 0.03423 / 0.163;      // and among today's lined-pit users: the cheapest option for dug holes is a VIP latrine
  near(sc.safe, 0.113049 + (moved - 0.0123) * septic + 0.0123 * pit, 2e-6, 'safe after containment');
  near(sc.components.w11c + sc.components.s11e + sc.components.f15, 0, 1e-9, 'nothing left outside containment');
  const w = waysToReach(0.5, r, s, idx);
  near(w.treat_only.max, 0.113049 + 0.260852, 2e-6, 'treatment alone tops out at safe + emptied');
  assert.equal(w.treat_only.level, null);
  assert.ok(w.contain_only.level > 0 && w.contain_only.level < 1);
  near(sanScenario(r, s, idx, { uptake: w.contain_only.level, treat: 0 }).safe, 0.5, 1e-6, 'containment level reaches the target');
});

test('solid waste: stages and fates add up; what-if never raises unmanaged plastic above today', () => {
  for (const t of towns.towns) {
    const w = wfd.towns[String(t.id)];
    const v = wfdView(t.population_wfd, w);
    assert.equal(v.stages.length, STAGES.length);
    if (!v.flag) near(v.stage_sum, 1, 0.02, `${t.name} stage shares`);
    near(v.fates.reduce((a, f) => a + f.tonnes, 0), v.plastic_unmanaged_t, Math.max(1, 0.01 * v.plastic_unmanaged_t), `${t.name} fates`);
    const same = wfdScenario(v, {});
    near(same.unmanaged_after_t, v.plastic_unmanaged_t, 1e-6 * Math.max(1, v.plastic_unmanaged_t), `${t.name} no change`);
    assert.equal(same.changed, false);
    const full = wfdScenario(v, { collection: 1, controlled: 1 });
    assert.ok(full.unmanaged_after_t >= -1e-9 && full.unmanaged_after_t <= v.plastic_unmanaged_t + 1e-6, `${t.name} full levers`);
    near(full.parts_after.uncollected, 0, 1e-9, `${t.name}: full collection leaves nothing uncollected`);
  }
  assert.equal(towns.towns.filter((t) => wfdView(t.population_wfd, wfd.towns[String(t.id)]).flag).map((t) => t.name).join(), 'Sundarganj');
});

test('typed town: the SFD Lite rules rebuild every built-in town from shares, emptying and sludge factor', () => {
  for (const t of towns.towns) {
    const s = sfd.towns[String(t.id)];
    const factor = s.systems.find((x) => x.sludge_factor !== null)?.sludge_factor ?? 1;
    const { sfdTown, problems } = buildSfdTown({ sludge_factor: factor, systems: s.systems.map((x) => ({ code: x.code, share: x.pop_share, emptied: x.emptied_share })) }, idx);
    assert.deepEqual(problems, [], t.name);
    for (const x of s.systems) {
      const y = sfdTown.systems.find((z) => z.code === x.code);
      for (const k of ['f8', 'f11', 'f15', 'w11c', 's11e']) near(y[k], x[k], 2e-5, `${t.name} ${x.code} ${k}`);
    }
  }
  assert.equal(buildSfdTown({ systems: [{ code: 'T1A2C5', share: 0.9, emptied: 0.2 }] }, idx).problems[0].key, 'share_sum');
});

test('typed town: WFD report values, with the Kaliakair portal sum check', () => {
  const e = { msw_t_day: 58, collected_share: 0.53, plastic_generated_t: 2374, plastic_unmanaged_t: 1158, stage_uncollected_t: 675, stage_collection_t: 107,
    stage_sorting_t: 0, stage_transport_t: 4, stage_disposal_t: 372, fate_water_t: 174, fate_burnt_t: 405, fate_drains_t: 23, fate_land_t: 557 };
  const ok = buildWfdTown(e);
  assert.deepEqual(ok.problems, []);
  const v = wfdView(277423, ok.wfdTown);
  near(v.stage_sum, 1, 1e-9); near(v.plastic_unmanaged_share, 1158 / 2374, 1e-9); assert.equal(v.biggest_stage.key, 'uncollected');
  assert.equal(buildWfdTown({ ...e, stage_disposal_t: 300 }).problems[0].key, 'stage_sum');
  assert.equal(buildWfdTown({ msw_t_day: 58 }).wfdTown, null);
});

test('decisions: treatment leads where emptied sludge is the largest loss; every decision has what it needs', () => {
  let treatFirst = 0;
  for (const t of towns.towns) {
    for (const gw of ['low', 'high']) {
      const r = run(t, { gw });
      const d = decisions(r, sfd.towns[String(t.id)], wfdView(t.population_wfd, wfd.towns[String(t.id)]), peers.find((p) => p.id === t.id));
      assert.ok(d.length >= 2 && d.length <= 9, `${t.name} ${gw}: ${d.length} decisions`);
      assert.ok(d.some((x) => x.domain === 'waste'), `${t.name}: no solid-waste decision`);
      if (gw === 'low' && r.outcome.binding.key === 'f11' && d[0].id === 'treat') treatFirst += 1;
      if (gw === 'high') assert.ok(!d.some((x) => x.id === 'contain'), `${t.name}: containment decision under high groundwater`);
    }
  }
  assert.ok(treatFirst >= 40, `treatment first in ${treatFirst} towns`);
});

test('user cost edits: an edited item is marked USER and can complete an option; bad values are ignored', () => {
  const t = towns.towns.find((x) => x.name === 'Kaliakair');
  const edited = applyCostOverrides(costs, { C24: { cost_low: 60000, cost_high: 40000, lifespan_years: 20 }, C03: { cost_low: -5 }, ZZZ: { cost_low: 1 } });
  const c24 = edited.items.find((i) => i.id === 'C24');
  assert.deepEqual([c24.cost_low, c24.cost_high, c24.status], [40000, 60000, 'USER']);
  assert.equal(edited.items.find((i) => i.id === 'C03').status, 'PLACEHOLDER');
  assert.equal(costs.items.find((i) => i.id === 'C24').cost_low, null, 'defaults untouched');
  const before = plan(t, sfd.towns['1'], rules, costs, params, { gw: 'high' });
  const after = plan(t, sfd.towns['1'], rules, edited, params, { gw: 'high' });
  assert.equal(before.ranked.length, 0);
  assert.ok(after.ranked.length > 0, 'the sealed tank becomes an ordered option once it has a cost');
  assert.equal(after.user_costs_in_use, true);
});
