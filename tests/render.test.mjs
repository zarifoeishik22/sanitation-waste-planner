// Every tab for every built-in town: draft banner present, placeholders marked, nothing broken, no inline styles (CSP).
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../scripts/engine_dump.mjs';
import { makeT, renderFacts } from '../js/ui/render.js';
import { buildContext, buildOwn, defaultState } from '../js/ui/context.js';
import { TABS, renderTab, renderPrint } from '../js/ui/views.js';
import { systemIndex } from '../js/engine/sfd.js';

const d = { towns: load('towns.json'), sfd: load('sfd.json'), wfd: load('wfd.json'), rules: load('rules.json'), costs: load('costs.json'), params: load('params.json'),
  benchmarks: load('benchmarks.json'), strings: load('strings.en.json') };
const t = makeT(d.strings);
const BROKEN = /NaN|undefined|Infinity|\{\w+\}|>null<|\[object/;

function page(state, tt = t) {
  const ctx = buildContext(d, state, tt, '2026-11-15');
  return { ctx, html: renderTab(ctx) + renderFacts(ctx.r, ctx.town, tt) };
}

test('every tab renders for every town in both groundwater settings', () => {
  for (const town of d.towns.towns) {
    for (const gw of ['low', 'high']) {
      for (const tab of TABS) {
        const { ctx, html } = page({ ...defaultState(d), townId: String(town.id), gw, tab, uptake: 60, treat: 40, target: '50', wctl: 30 });
        const where = `${town.name} ${gw} ${tab}`;
        assert.ok(html.includes(d.strings['banner.draft']), `${where}: draft banner`);
        assert.ok(!/\sstyle=/.test(html), `${where}: no inline styles`);
        assert.ok(!BROKEN.test(html), `${where}: broken value ${(html.match(BROKEN) || [])[0]}`);
        // every taka figure with a range wears the placeholder mark
        const money = html.match(/<span class="val[^"]*">/g) || [];
        const totals = html.match(/<span class="num[^"]*">(?:BDT|Containment, paid)/g) || [];
        for (const m of [...money, ...totals]) assert.ok(m.includes(' ph'), `${where}: unmarked placeholder figure ${m}`);
        if (tab === 'sanitation') {
          assert.ok(html.includes(d.strings['sum.municipal_none']) || ctx.r.ranked.length === 0, `${where}: municipal cost never shown as 0`);
          assert.ok(html.includes(d.strings['chain.status_incomplete']), `${where}: treatment shown as not costed`);
          if (gw === 'low') assert.ok(money.length > 0, `${where}: ranked costs shown`);
        }
      }
      const ctx = buildContext(d, { ...defaultState(d), townId: String(town.id), gw, uptake: 50, treat: 50 }, t, '2026-11-15');
      const print = renderPrint(ctx);
      assert.ok(!BROKEN.test(print) && !/\sstyle=/.test(print), `${town.name} ${gw}: print sheet`);
      assert.ok(!/BDT|taka/i.test(print.replace(d.strings['print.banner'], '')), `${town.name} ${gw}: no taka figure on the PDF while costs are placeholders`);
    }
  }
});

test('every string key used by the views exists', () => {
  const missing = new Set();
  const probe = (key, vars) => { if (!(key in d.strings)) missing.add(key); return t(key, vars); };
  const own = buildOwn({ name: 'Testpur', population: '50000', sludge_pct: '70', share_T1A2C6: '40', emptied_T1A2C6: '30', share_T1A5C10: '50', emptied_T1A5C10: '60', share_T1A1C6: '10' }, systemIndex(d.rules)).own;
  const states = [];
  for (const tab of TABS) {
    for (const gw of ['low', 'high']) {
      states.push({ ...defaultState(d), townId: '1', tab, gw, basis: 'hh_size', uptake: 50, treat: 50, target: '90', wcol: 90, wctl: 50, costOverrides: { C24: { cost_low: 1, cost_high: 2, lifespan_years: 10 } } });
      states.push({ ...defaultState(d), townId: '1', tab, gw, target: '5' });
      states.push({ ...defaultState(d), townId: 'own', own, tab, gw, ownMsgs: [{ kind: 'warn', key: 'up.sfd_short', vars: { sum: '95.8%', gap: '4.2%' } }] });
    }
  }
  for (const s of states) { const ctx = buildContext(d, s, probe, '2026-11-15'); renderTab(ctx); renderPrint(ctx); renderFacts(ctx.r, ctx.town, probe); }
  for (const k of TABS) probe(`tab.${k}`);
  assert.deepEqual([...missing], []);
});

test('a typed town renders on every tab, with and without solid-waste figures', () => {
  const idx = systemIndex(d.rules);
  const form = { name: 'Testpur <b>', population: '50000', households: '11000', sludge_pct: '68', share_T1A2C6: '40', emptied_T1A2C6: '30', share_T1A5C10: '50', emptied_T1A5C10: '60', share_T1A1C6: '10' };
  const withWaste = { ...form, msw_t_day: '20', collected_pct: '30', plastic_generated_t: '700', plastic_unmanaged_t: '400', stage_uncollected_t: '350', stage_collection_t: '30', stage_sorting_t: '0', stage_transport_t: '5', stage_disposal_t: '15', fate_water_t: '60', fate_land_t: '300', fate_burnt_t: '30', fate_drains_t: '10', organic_pct: '78' };
  for (const f of [form, withWaste]) {
    const res = buildOwn(f, idx);
    assert.deepEqual(res.errors, []);
    for (const tab of TABS) {
      const { html } = page({ ...defaultState(d), townId: 'own', own: res.own, ownForm: f, tab, uptake: 30, treat: 30 });
      assert.ok(!BROKEN.test(html), `typed town ${tab}: broken value ${(html.match(BROKEN) || [])[0]}`);
      assert.ok(!html.includes('<b>'), `typed town ${tab}: the name is escaped`);
      assert.ok(html.includes(d.strings['banner.typed']), `typed town ${tab}: marked as typed`);
    }
  }
  assert.equal(buildOwn({ name: 'X', population: '10', share_T1A2C5: '80' }, idx).errors[0].key, 'own.err.share_sum');
  assert.equal(buildOwn({ ...form, msw_t_day: '20' }, idx).errors[0].key, 'own.err.wfd_missing');
});
