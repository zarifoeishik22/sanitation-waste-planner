// Acceptance checks 1, 3, 4 and 6 of the build brief.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../scripts/engine_dump.mjs';
import { plan } from '../js/engine/plan.js';
import { modelSafeShare, systemIndex, peerTable } from '../js/engine/sfd.js';
import { crf } from '../js/engine/cost.js';

const towns = load('towns.json'), sfd = load('sfd.json'), wfd = load('wfd.json'), rules = load('rules.json'), costs = load('costs.json'), params = load('params.json');
const town = (name) => towns.towns.find((t) => t.name === name);
const run = (name, settings) => { const t = town(name); return plan(t, sfd.towns[String(t.id)], rules, costs, params, settings); };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);

test('check 1: Kaliakair reproduces the template test at hh_size 5', () => {
  const r = run('Kaliakair', { gw: 'low', overrides: { hh_basis: 'hh_size' } });
  near(r.households.households, 55484.6, 1e-6, 'households');
  near(r.outcome.not_contained_share, 0.7357, 1e-9, 'not contained');
  const o1 = r.options.find((o) => o.id === 'O01');
  near(o1.cost.mid.annual_hh, 6013.7, 0.05, 'O01 annual per household');
  assert.equal(o1.cost.mid.upfront_hh, 55000);
  assert.equal(Math.round(o1.households), 5343);
  near(o1.cost.mid.upfront_total / 1e6, 293.9, 0.05, 'O01 total upfront, BDT million');
});

test('check 1: stated households override hh_size', () => {
  const r = run('Kaliakair', { gw: 'low' });
  assert.equal(r.households.households, 68163);
  assert.equal(r.households.basis, 'stated');
  assert.equal(run('Ishwardi', { gw: 'low' }).households.basis, 'hh_size');
});

test('capital recovery factor', () => near(crf(0.08, 15), 0.116829545, 1e-8));

test('check 3: per-system values sum to the published safe share in all 50 towns', () => {
  assert.equal(towns.towns.length, 50);
  for (const t of towns.towns) {
    const s = sfd.towns[String(t.id)];
    const sum = s.systems.reduce((a, x) => a + x.f8, 0);
    near(sum, s.flows.safe, 0.001, `${t.name} safe share`);
    near(s.systems.reduce((a, x) => a + x.pop_share, 0), 1, 0.01, `${t.name} population shares`);
    assert.equal(s.treatment.delivered_share, 0);
  }
});

test('check 3: the outcome model reproduces every contained system of the 50 SFDs', () => {
  const idx = systemIndex(rules);
  let n = 0;
  for (const t of towns.towns) {
    const s = sfd.towns[String(t.id)];
    for (const x of s.systems) {
      if (!idx[x.code].contained_gw_low) { assert.equal(x.f8, 0, `${t.name} ${x.code}`); continue; }
      near(modelSafeShare(x, s.treatment), x.f8, 2e-5, `${t.name} ${x.code}`);
      n += 1;
    }
  }
  assert.ok(n > 150);
});

test('check 3: built-in WFD fates sum to unmanaged plastic (Sundarganj is the flagged exception)', () => {
  const off = [];
  for (const t of towns.towns) {
    const w = wfd.towns[String(t.id)];
    const o = w.outputs;
    const fates = o.fate_land_t + o.fate_burnt_t + o.fate_drains_t + o.fate_water_t;
    if (Math.abs(fates - o.plastic_unmanaged_t) > 0.005 * Math.max(o.plastic_unmanaged_t, 1)) off.push(t.name);
    if (off.includes(t.name)) assert.ok(w.mass_balance_flag, `${t.name} must carry the mass-balance flag`);
  }
  assert.deepEqual(off, ['Sundarganj']);
});

test('check 4: Ishwardi is a typical town; Kaliakair is the extreme', () => {
  const peers = peerTable(towns.towns, sfd, systemIndex(rules)).sort((a, b) => a.not_contained - b.not_contained);
  assert.equal(peers.at(-1).name, 'Kaliakair');
  const median = (peers[24].not_contained + peers[25].not_contained) / 2;
  const r = run('Ishwardi', { gw: 'low' });
  near(r.outcome.not_contained_share, 0.248, 0.0005);
  assert.ok(Math.abs(r.outcome.not_contained_share - median) < 0.03);
  assert.equal(r.outcome.binding.key, 'f11');
  assert.ok(r.ranked.length > 0);
});

test('check 6: ranking rules hold in every town and both groundwater settings', () => {
  for (const t of towns.towns) {
    for (const gw of ['low', 'high']) {
      const r = plan(t, sfd.towns[String(t.id)], rules, costs, params, { gw });
      const byId = Object.fromEntries(r.options.map((o) => [o.id, o]));
      for (const id of r.ranked) {
        const o = byId[id];
        assert.equal(o.stage, 'containment', `${t.name} ${id}: only containment options are ranked`);
        assert.ok(o.moved_to_contained > 0, `${t.name} ${id}: ranked on a metric it moves`);
        assert.ok(o.complete && o.cost.mid.per_person_contained > 0);
      }
      for (const o of r.options) {
        if (o.stage === 'emptying') assert.equal(o.status, 'needs_treatment', `${t.name} ${o.id}: emptying is never ranked alone`);
        if (!o.complete) assert.equal(o.cost, null, `${t.name} ${o.id}: incomplete options are not costed in part`);
      }
      assert.equal(r.chain.complete, false);
      assert.ok(r.notes.includes('treatment_not_costed'));
      assert.equal(r.summary.municipal_estimated, false);
      assert.ok(r.notes.includes('municipal_not_estimated'));
      assert.equal(r.placeholder_in_use, true);
      if (gw === 'high') { assert.equal(r.outcome.components.safe, 0); assert.equal(r.ranked.length, 0); }
    }
  }
});

test('components sum to the population share covered by the SFD', () => {
  for (const t of towns.towns) {
    for (const gw of ['low', 'high']) {
      const c = plan(t, sfd.towns[String(t.id)], rules, costs, params, { gw }).outcome.components;
      near(c.safe + c.f11 + c.f15 + c.w11c + c.s11e, sfd.towns[String(t.id)].flows.pop_sum, 1e-4, t.name);
    }
  }
});
