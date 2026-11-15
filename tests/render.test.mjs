// The page for every built-in town: draft banner present, placeholders marked, nothing broken, no inline styles (CSP).
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../scripts/engine_dump.mjs';
import { plan } from '../js/engine/plan.js';
import { peerTable, systemIndex } from '../js/engine/sfd.js';
import { makeT, renderFacts, renderSheet } from '../js/ui/render.js';

const towns = load('towns.json'), sfd = load('sfd.json'), rules = load('rules.json'), costs = load('costs.json'), params = load('params.json');
const strings = load('strings.en.json');
const t = makeT(strings);
const peers = peerTable(towns.towns, sfd, systemIndex(rules));

test('every town renders in both groundwater settings', () => {
  for (const town of towns.towns) {
    for (const gw of ['low', 'high']) {
      const r = plan(town, sfd.towns[String(town.id)], rules, costs, params, { gw });
      const html = renderSheet(r, town, peers, t) + renderFacts(r, town, t);
      const where = `${town.name} ${gw}`;
      assert.ok(html.includes(strings['banner.draft']), `${where}: draft banner`);
      assert.ok(!/\sstyle=/.test(html), `${where}: no inline styles`);
      assert.ok(!/NaN|undefined|Infinity|\{\w+\}|>null</.test(html), `${where}: no broken values`);
      assert.ok(html.includes(strings['sum.municipal_none']) || r.ranked.length === 0, `${where}: municipal cost never shown as 0`);
      assert.ok(html.includes(strings['chain.status_incomplete']), `${where}: treatment shown as not costed`);
      // every taka figure with a range wears the placeholder mark
      const money = html.match(/<span class="val[^"]*">/g) || [];
      const totals = html.match(/<span class="num[^"]*">BDT /g) || [];
      for (const m of [...money, ...totals]) assert.ok(m.includes(' ph'), `${where}: unmarked placeholder figure ${m}`);
      if (gw === 'low') assert.ok(money.length > 0, `${where}: ranked costs shown`);
    }
  }
});

test('every string key used by the renderer exists', () => {
  const town = towns.towns[0];
  for (const gw of ['low', 'high']) {
    const r = plan(town, sfd.towns['1'], rules, costs, params, { gw, overrides: { hh_basis: 'hh_size' } });
    const missing = new Set();
    const probe = (key, vars) => { if (!(key in strings)) missing.add(key); return makeT(strings)(key, vars); };
    renderSheet(r, town, peers, probe); renderFacts(r, town, probe);
    assert.deepEqual([...missing], []);
  }
});
