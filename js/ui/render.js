// Turns an engine result into HTML strings. No DOM access, so it can be tested in Node.
// Widths and positions are emitted as data-* attributes and applied by app.js through the CSSOM,
// because the page's Content-Security-Policy forbids inline style attributes.

import { COMPONENTS } from '../engine/sfd.js';

const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const int = (v) => nf0.format(v);
export const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const round3 = (v) => (v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v / 10) * 10); // people and households are estimates: no false precision

export function makeT(strings) {
  return (key, vars = {}) => {
    const s = strings[key];
    if (s === undefined) return key;
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? `{${k}}` : String(vars[k])));
  };
}

/** A taka figure with its low-to-high range, always marked while costs are placeholders. */
function money(cost, field, ph) {
  const v = (k) => int(cost[k][field]);
  if (cost.mid[field] === 0 && cost.high[field] === 0) return '<span class="num">0</span>';
  return `<span class="num"><span class="val${ph ? ' ph' : ''}">${v('mid')}</span> <span class="range">(${v('low')} to ${v('high')})</span></span>`;
}

function banner(r, t) {
  return `<p class="banner" role="note">${esc(t(r.placeholder_in_use ? 'banner.draft' : 'banner.real'))}</p>`;
}

function outcomeSection(r, town, t) {
  const c = r.outcome.components;
  const total = COMPONENTS.reduce((a, k) => a + c[k], 0) || 1;
  const segs = COMPONENTS.filter((k) => c[k] > 0).map((k) => {
    const share = c[k] / total;
    const label = share >= 0.07 ? `<span class="seg-label">${pct(c[k], 0)}</span>` : '';
    return `<div class="seg seg-${k}" data-grow="${share.toFixed(5)}" tabindex="0" data-tip="${esc(t(`comp.${k}`))}: ${pct(c[k])}">${label}</div>`;
  }).join('');
  const legend = COMPONENTS.map((k) => `<li class="${k === r.outcome.binding.key ? 'is-binding' : ''}"><span class="swatch seg-${k}"></span>
    <span class="legend-name">${esc(t(`comp.${k}`))}</span><span class="legend-val num">${pct(c[k])}</span></li>`).join('');
  const high = r.settings.gw === 'high';
  return `<section class="block" aria-labelledby="h-outcome">
    <h2 id="h-outcome">${esc(t('sec.outcome', { town: town.name }))}</h2>
    <p class="lead">${esc(t(high ? 'outcome.lead_high' : 'outcome.lead_low', { safe: pct(c.safe) }))}</p>
    <div class="flowbar" role="img" aria-label="${esc(COMPONENTS.map((k) => `${t(`comp.short.${k}`)} ${pct(c[k])}`).join(', '))}">${segs}</div>
    <ul class="legend">${legend}</ul>
    <p class="source">${esc(t(high ? 'outcome.source_high' : 'outcome.source_low', { date: town.sfd.date, by: town.sfd.prepared_by }))}</p>
  </section>`;
}

function bindingSection(r, t) {
  const c = r.outcome.components;
  const key = r.outcome.binding.key;
  const chain = key === 'f11';
  const missing = [...new Set(r.chain.missing.map((m) => m.component.toLowerCase()))].join(', ');
  const cost = chain ? t('binding.cost_chain', { missing })
    : r.ranked.length ? t('binding.cost_contain_ph') : t('binding.cost_contain_none');
  const second = ['f11', 'f15', 'w11c', 's11e'].filter((k) => k !== key).sort((a, b) => c[b] - c[a])[0];
  return `<section class="block binding" aria-labelledby="h-binding">
    <h2 id="h-binding">${esc(t('sec.binding'))}</h2>
    <p class="binding-main"><span class="swatch seg-${key}"></span>${esc(t(`binding.${key}`, { share: pct(c[key]) }))}</p>
    <ul class="plain">
      <li>${esc(t(chain ? 'binding.fix_chain' : 'binding.fix_contain'))}</li>
      <li class="${chain || !r.ranked.length ? 'warn' : ''}">${esc(cost)}</li>
      <li>${esc(t('binding.also', { label: t(`comp.${second}`).toLowerCase(), share: pct(c[second]) }))}</li>
    </ul>
  </section>`;
}

function gapSection(r, t) {
  const o = r.outcome;
  const rows = o.systems.slice().sort((a, b) => b.pop_share - a.pop_share).map((s) => {
    const status = s.contained ? ['yes', t('gap.yes')] : s.flipped ? ['flip', t('gap.flipped')] : ['no', t('gap.no')];
    return `<tr><th scope="row"><span class="code">${esc(s.code)}</span> ${esc(s.label)}</th>
      <td class="num" data-label="${esc(t('gap.share'))}">${pct(s.pop_share)}</td>
      <td class="num" data-label="${esc(t('gap.persons'))}">${int(round3(s.persons))}</td>
      <td class="num" data-label="${esc(t('gap.households'))}">${int(round3(s.households))}</td>
      <td class="num" data-label="${esc(t('gap.emptied'))}">${s.group === 'direct' ? '' : pct(s.emptied_share, 0)}</td>
      <td data-label="${esc(t('gap.status'))}"><span class="tag tag-${status[0]}">${esc(status[1])}</span></td></tr>`;
  }).join('');
  return `<section class="block" aria-labelledby="h-gap">
    <h2 id="h-gap">${esc(t('sec.gap'))}</h2>
    <p class="lead">${esc(t('gap.lead', { persons: int(round3(o.not_contained_persons)), households: int(round3(o.not_contained_households)) }))}</p>
    <div class="table-wrap"><table class="grid stack">
      <thead><tr><th scope="col">${esc(t('gap.system'))}</th><th scope="col" class="num">${esc(t('gap.share'))}</th><th scope="col" class="num">${esc(t('gap.persons'))}</th>
        <th scope="col" class="num">${esc(t('gap.households'))}</th><th scope="col" class="num">${esc(t('gap.emptied'))}</th><th scope="col">${esc(t('gap.status'))}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
  </section>`;
}

function bearers(cost) {
  return Object.keys(cost.mid.by_bearer).join(', ');
}

function rankedSection(r, t) {
  const byId = Object.fromEntries(r.options.map((o) => [o.id, o]));
  const ph = r.placeholder_in_use;
  let body;
  if (!r.ranked.length) {
    body = `<p class="empty">${esc(t(r.settings.gw === 'high' ? 'ranked.none_high' : 'ranked.none'))}</p>`;
  } else {
    const firstFor = {};
    const rows = r.ranked.map((id) => {
      const o = byId[id];
      const alt = firstFor[o.system];
      firstFor[o.system] = firstFor[o.system] || o.rank;
      const safe = o.safe_gain > 0 ? `${int(round3(o.safe_gain))} <span class="range">(${pct(o.safe_gain / o.moved_to_contained, 0)})</span>` : esc(t('ranked.safe_none'));
      return `<tr>
        <td class="num rank" data-label="${esc(t('col.rank'))}">${o.rank}</td>
        <th scope="row">${esc(o.name)}
          <span class="sub">${esc(t('col.for'))}: <span class="code">${esc(o.system)}</span> ${esc(o.system_label)}</span>
          <span class="sub">${esc(t('col.conditions'))}: ${esc(o.applies_when)}</span>${alt ? `<span class="sub">${esc(t('ranked.alt', { other: alt }))}</span>` : ''}</th>
        <td class="num" data-label="${esc(t('col.households'))}">${int(round3(o.households))}</td>
        <td class="num" data-label="${esc(t('col.upfront_hh'))}">${money(o.cost, 'upfront_hh', ph)}</td>
        <td class="num" data-label="${esc(t('col.annual_hh'))}">${money(o.cost, 'annual_hh', ph)}</td>
        <td data-label="${esc(t('col.bearer'))}">${esc(bearers(o.cost))}</td>
        <td class="num strong" data-label="${esc(t('col.cpp'))}">${money(o.cost, 'per_person_contained', ph)}</td>
        <td class="num" data-label="${esc(t('col.safe'))}">${safe}</td></tr>`;
    }).join('');
    const s = r.summary;
    const m = (field, who) => {
      const f = (k) => nf1.format((who ? (s.cost[k].by_bearer[who]?.[field] ?? 0) : s.cost[k][field]) / 1e6);
      return `<span class="num${ph ? ' ph' : ''}">${esc(t('sum.million', { mid: f('mid'), low: f('low'), high: f('high') }))}</span>`;
    };
    const uncovered = s.systems_uncovered.length
      ? `<p class="warn">${esc(t('sum.uncovered', { persons: int(round3(s.persons_uncovered)), systems: s.systems_uncovered.join(', ') }))}</p>` : '';
    body = `<div class="table-wrap"><table class="grid stack options">
        <thead><tr><th scope="col" class="num">${esc(t('col.rank'))}</th><th scope="col">${esc(t('col.option'))}</th>
          <th scope="col" class="num">${esc(t('col.households'))}</th><th scope="col" class="num">${esc(t('col.upfront_hh'))}</th>
          <th scope="col" class="num">${esc(t('col.annual_hh'))}</th><th scope="col">${esc(t('col.bearer'))}</th>
          <th scope="col" class="num">${esc(t('col.cpp'))}</th><th scope="col" class="num">${esc(t('col.safe'))}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="summary">
        <h3>${esc(t('sum.title'))}</h3>
        <p>${esc(t('sum.covered', { persons: int(round3(s.persons_covered)), households: int(round3(s.households_covered)), safe: int(round3(s.safe_gain)) }))}</p>
        <dl class="totals">
          <div><dt>${esc(t('sum.upfront'))}</dt><dd>${m('upfront_total', 'Household')}</dd></div>
          <div><dt>${esc(t('sum.annual'))}</dt><dd>${m('annual_total', 'Household')}</dd></div>
          <div><dt>${esc(t('sum.municipal'))}</dt><dd>${s.municipal_estimated ? m('annual_total', 'Municipality') : `<span class="warn">${esc(t('sum.municipal_none'))}</span>`}</dd></div>
        </dl>${uncovered}
      </div>`;
  }
  return `<section class="block" aria-labelledby="h-ranked">
    <h2 id="h-ranked">${esc(t('sec.ranked'))}${ph ? ` <span class="tag tag-ph">${esc(t('ph'))}</span>` : ''}</h2>
    <p class="lead">${esc(t('ranked.lead'))}</p>${body}
  </section>`;
}

function chainSection(r, t) {
  const ch = r.chain;
  const byId = Object.fromEntries(r.options.map((o) => [o.id, o]));
  const emptying = ch.emptying_options.map((id) => byId[id]).find((o) => o.complete);
  const rows = ch.components.map((c) => {
    const state = c.costed ? (c.sized ? t('chain.has_cost_sized') : t('chain.has_cost')) : t('chain.no_cost');
    return `<tr><th scope="row">${esc(c.component)} <span class="sub">${esc(t(c.required ? 'chain.required' : 'chain.optional'))}</span></th>
      <td data-label="${esc(t('chain.stage'))}">${esc(c.stage)}</td>
      <td data-label="${esc(t('chain.item'))}"><span class="code">${esc(c.item)}</span> ${esc(c.bearer || '')}</td>
      <td data-label="${esc(t('chain.state'))}"><span class="tag ${c.costed && c.sized ? 'tag-ph' : 'tag-no'}">${esc(state)}</span></td></tr>`;
  }).join('');
  const cost = emptying ? `<p>${esc(t('chain.emptying_cost', { mid: int(emptying.cost.mid.annual_hh), low: int(emptying.cost.low.annual_hh), high: int(emptying.cost.high.annual_hh) }))}
     <span class="tag tag-ph">${esc(t('ph'))}</span></p>` : '';
  return `<section class="block" aria-labelledby="h-chain">
    <h2 id="h-chain">${esc(t('sec.chain'))} <span class="tag ${ch.complete ? 'tag-yes' : 'tag-no'}">${esc(t(ch.complete ? 'chain.status_complete' : 'chain.status_incomplete'))}</span></h2>
    <p class="lead">${esc(t('chain.lead'))}</p>
    <p>${esc(t('chain.untreated', { persons: int(round3(ch.untreated_persons)), share: pct(ch.untreated_share) }))}</p>${cost}
    <div class="table-wrap"><table class="grid stack">
      <thead><tr><th scope="col">${esc(t('chain.component'))}</th><th scope="col">${esc(t('chain.stage'))}</th><th scope="col">${esc(t('chain.item'))}</th><th scope="col">${esc(t('chain.state'))}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
  </section>`;
}

function otherSection(r, t) {
  const rest = r.options.filter((o) => o.status !== 'ranked' && o.status !== 'needs_treatment');
  if (!rest.length) return '';
  // one line per option name and reason, listing the systems it covers
  const groups = new Map();
  for (const o of rest) {
    const what = o.status === 'incomplete' ? [...new Set(o.missing.map((m) => t(`why.${m.why}`)))].join(', ') : '';
    const items = o.status === 'incomplete' ? [...new Set(o.missing.map((m) => m.item))].join(', ') : '';
    const why = t(`why.${o.status}`, { what, items });
    const key = `${o.name}|${why}`;
    if (!groups.has(key)) groups.set(key, { name: o.name, why, systems: [], households: 0 });
    const g = groups.get(key);
    g.systems.push(o.system); g.households += o.households;
  }
  const rows = [...groups.values()].map((g) => `<tr><th scope="row">${esc(g.name)}</th>
    <td data-label="${esc(t('col.for'))}"><span class="code">${esc(g.systems.join(', '))}</span></td>
    <td class="num" data-label="${esc(t('col.households'))}">${int(round3(g.households))}</td>
    <td data-label="${esc(t('other.why'))}">${esc(g.why)}</td></tr>`).join('');
  return `<section class="block" aria-labelledby="h-other">
    <h2 id="h-other">${esc(t('sec.other'))}</h2>
    <p class="lead">${esc(t('other.lead'))}</p>
    <div class="table-wrap"><table class="grid stack">
      <thead><tr><th scope="col">${esc(t('col.option'))}</th><th scope="col">${esc(t('col.for'))}</th><th scope="col" class="num">${esc(t('col.households'))}</th><th scope="col">${esc(t('other.why'))}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
  </section>`;
}

const PEER_KEYS = ['not_contained', 'safe', 'f11', 'flips_if_gw_high'];

function peersSection(peers, town, t) {
  const strips = PEER_KEYS.map((key) => {
    const vals = peers.map((p) => p[key]).sort((a, b) => a - b);
    const max = Math.max(0.1, Math.ceil(vals.at(-1) * 10) / 10);
    const median = (vals[24] + vals[25]) / 2;
    const me = peers.find((p) => p.id === town.id);
    const below = peers.filter((p) => p.id !== town.id && p[key] < me[key]).length;
    const x = (v) => (10 + (v / max) * 580).toFixed(1);
    const dots = peers.filter((p) => p.id !== town.id).map((p) => `<circle class="dot" cx="${x(p[key])}" cy="18" r="4.5" tabindex="0" data-tip="${esc(p.name)}: ${pct(p[key])}"></circle>`).join('');
    return `<div class="strip">
      <p class="strip-title">${esc(t(`peer.${key}`))}</p>
      <p class="strip-value">${esc(t('peers.rank', { value: pct(me[key]), below }))}</p>
      <svg viewBox="0 0 600 36" role="img" aria-label="${esc(t(`peer.${key}`))}: ${pct(me[key])}">
        <line class="axis" x1="10" y1="18" x2="590" y2="18"></line>
        <line class="median" x1="${x(median)}" y1="4" x2="${x(median)}" y2="32"></line>
        ${dots}
        <circle class="dot-me" cx="${x(me[key])}" cy="18" r="7" tabindex="0" data-tip="${esc(me.name)}: ${pct(me[key])}"></circle>
      </svg>
      <p class="strip-scale"><span>0%</span><span>${esc(t('peers.median', { value: pct(median) }))}</span><span>${pct(max, 0)}</span></p>
    </div>`;
  }).join('');
  return `<section class="block" aria-labelledby="h-peers">
    <h2 id="h-peers">${esc(t('sec.peers', { town: town.name }))}</h2>
    <p class="lead">${esc(t('peers.lead'))}</p>
    <div class="strips">${strips}</div>
  </section>`;
}

function notesSection(r, town, peers, t) {
  const me = peers.find((p) => p.id === town.id);
  const vars = {
    level: town.sfd.level, status: town.sfd.status.toLowerCase(), size: r.settings.params.hh_size,
    share: pct(me.flips_if_gw_high, 0), persons: int(round3(r.summary.persons_uncovered)), systems: r.summary.systems_uncovered.join(', '),
  };
  const items = r.notes.map((n) => `<li>${esc(t(`note.${n}`, vars))}</li>`).join('');
  return `<section class="block notes" aria-labelledby="h-notes"><h2 id="h-notes">${esc(t('sec.notes'))}</h2><ul>${items}</ul></section>`;
}

/** The whole right-hand sheet for one town. */
export function renderSheet(r, town, peers, t) {
  return [banner(r, t), outcomeSection(r, town, t), bindingSection(r, t), gapSection(r, t), rankedSection(r, t), chainSection(r, t),
    otherSection(r, t), peersSection(peers, town, t), notesSection(r, town, peers, t)].join('\n');
}

/** The town facts shown in the left rail. */
export function renderFacts(r, town, t) {
  const hh = r.households;
  const flags = town.flags.length ? `<div class="flags"><p class="rail-label">${esc(t('rail.flags'))}</p><ul>${town.flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : '';
  return `<dl class="facts">
    <div><dt>${esc(t('rail.district'))}</dt><dd>${town.district ? esc(town.district) : `<span class="muted">${esc(t('rail.district_missing'))}</span>`}</dd></div>
    <div><dt>${esc(t('rail.population'))}</dt><dd class="num">${int(town.population_sfd)}</dd></div>
    <div><dt>${esc(t('rail.households'))}</dt><dd><span class="num">${int(Math.round(hh.households))}</span>
      <span class="sub">${esc(hh.basis === 'stated' ? t('rail.households_stated') : t('rail.households_assumed', { size: r.settings.params.hh_size }))}</span></dd></div>
    <div><dt>${esc(t('rail.sfd'))}</dt><dd>${esc(t('rail.sfd_value', { level: town.sfd.level, status: town.sfd.status.toLowerCase(), date: town.sfd.date }))}</dd></div>
    <div><dt>${esc(t('rail.prepared_by'))}</dt><dd>${esc(town.sfd.prepared_by)}</dd></div>
  </dl>${flags}`;
}
