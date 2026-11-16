// The workspace: a left menu grouped Town / Diagnose / Plan / Deliver, a top bar, and one screen at a time.
// HTML strings only, no DOM access, so every screen is testable in Node. SFD system references are never shown.

import { esc, int, pct, people, qty } from './util.js';
import { sankey, endBars, chainBars, waterfall, scatter, timeline, spendBars, meter } from './charts.js';
import { sourceBadges, basisLine, flagText, actionCard, sceneBlock, receiversBlock, readoutBlock, leversBlock, bridgeBlock, totalsBlock, rulesTable, evidenceSection } from './views.js';
import { GOV, OPS } from '../engine/template.js';
import { rankOf, median } from '../engine/drain.js';

export const ROUTES = [
  { group: 'town', items: [['import', 'M4 16v3h16v-3M12 4v11m-5-5 5 5 5-5'], ['data', 'M4 6c0-2 16-2 16 0v12c0 2-16 2-16 0zM4 6c0 2 16 2 16 0M4 12c0 2 16 2 16 0']] },
  { group: 'diagnose', items: [['overview', 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z'], ['sanitation', 'M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z'], ['waste', 'M5 7h14l-1 13H6zM9 7V4h6v3M3 7h18'], ['drains', 'M3 14c3-3 6 3 9 0s6 3 9 0M3 19c3-3 6 3 9 0s6 3 9 0M3 9h18'], ['compare', 'M5 19V9M12 19V5M19 19v-7']] },
  { group: 'plan', items: [['insights', 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z'], ['scenarios', 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4'], ['invest', 'M4 20h16M6 20V10M10 20V6M14 20v-8M18 20V8']] },
  { group: 'deliver', items: [['report', 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6']] },
];
export const ROUTE_IDS = ROUTES.flatMap((g) => g.items.map((i) => i[0]));

const icon = (d) => `<svg class="ri" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const cur = (ctx) => (ctx.currency ? `${ctx.currency} ` : '');
const money = (ctx, v) => `${cur(ctx)}${int(v)}`;

/* ---------- shell ---------- */

function rail(ctx) {
  const { t, state } = ctx;
  return `<nav class="rail" aria-label="${esc(t('nav.aria'))}">
    <a class="rail-brand" href="./">${esc(t('app.title'))}</a>
    ${ROUTES.map((g) => `<div class="rail-g"><p class="rail-h">${esc(t(`nav.g.${g.group}`))}</p>
      ${g.items.map(([id, d]) => `<a class="rail-i${state.route === id ? ' on' : ''}" href="#/${id}"${state.route === id ? ' aria-current="page"' : ''}>${icon(d)}<span>${esc(t(`nav.${id}`))}</span></a>`).join('')}</div>`).join('')}
    <p class="rail-foot">${esc(t('nav.private'))}</p>
  </nav>`;
}

function scenarioPicker(ctx) {
  const { t, state } = ctx;
  return `<label class="scen-pick"><span>${esc(t('top.scenario'))}</span><select data-act="scen-pick">
    ${state.scen.map((s, i) => `<option value="${i}"${i === state.active ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
    ${state.scen.length < 3 ? `<option value="new">${esc(t('top.scen_new'))}</option>` : ''}</select></label>`;
}

function topbar(ctx) {
  const { t, town, r } = ctx;
  const facts = [];
  if (town.district) facts.push(t('work.district', { d: town.district }));
  facts.push(t('work.population', { n: int(town.population_sfd) }));
  if (r) facts.push(t('work.households', { n: int(Math.round(r.households.households)) }));
  return `<header class="topbar">
    <div class="tb-id"><p class="tb-town">${esc(town.name)}</p><p class="tb-facts">${esc(facts.join(' '))}</p></div>
    <div class="tb-badges">${sourceBadges(ctx)}</div>
    <div class="tb-acts">${scenarioPicker(ctx)}
      <button type="button" class="btn btn-quiet btn-s" data-act="wb-export">${esc(t('top.workbook'))}</button>
      <a class="btn btn-quiet btn-s" href="#/report">${esc(t('top.report'))}</a></div>
  </header>`;
}

export function renderShell(ctx) {
  const { t, state } = ctx;
  const body = (SCREENS[state.route] || SCREENS.overview)(ctx);
  return `<div class="shell" data-route="${esc(state.route)}">${rail(ctx)}<div class="work">${topbar(ctx)}
    <div class="screen" id="screen" tabindex="-1">${body}<p class="draft">${esc(t('work.draft'))}</p></div></div></div>`;
}

const head = (ctx, id, extra = '') => `<header class="sh"><h1 class="sh-t">${esc(ctx.t(`nav.${id}`))}</h1><p class="sh-l">${esc(ctx.t(`lede.${id}`))}</p>${extra}</header>`;
const panel = (title, body, cls = '', note = '') => `<section class="panel ${cls}">${title ? `<h2 class="p-t">${esc(title)}</h2>` : ''}${body}${note ? `<p class="fine">${esc(note)}</p>` : ''}</section>`;

/* ---------- overview ---------- */

function kpis(ctx) {
  const { t, r, wv, ex0, pl0, me, paired, pairedOn, comp, d, country } = ctx;
  const nat = country && d.benchmarks.countries[country];
  const tiles = [];
  if (r) tiles.push({ k: t('kpi.safe'), v: pct(r.outcome.components.safe), n: nat ? t('kpi.safe_n', { nat: pct(nat.san_safe_national), year: nat.year }) : t('kpi.safe_def') });
  if (wv) {
    const rk = pairedOn && me && me.plastic_kg_person !== null ? rankOf(me.plastic_kg_person, paired.map((p) => p.plastic_kg_person)) : null;
    tiles.push({ k: t('kpi.plastic'), v: `${int(wv.plastic_unmanaged_t)} t`, n: rk === null ? t('kpi.plastic_def') : t('kpi.plastic_n', { share: pct(wv.plastic_unmanaged_share) }) });
  }
  if (ex0) tiles.push({ k: t('kpi.drains'), v: people(ex0.receivers.drain.persons), n: pl0 ? t('kpi.drains_n', { tonnes: qty(pl0.receivers.drain.tonnes) }) : t('kpi.drains_ex') });
  tiles.push({ k: t('kpi.data'), v: `${comp.tier1.have + comp.tier2.have + comp.tier3.have}/${comp.tier1.of + comp.tier2.of + comp.tier3.of}`, n: t('kpi.data_n') });
  return `<div class="kpis">${tiles.map((x) => `<div class="kpi"><p class="kpi-k">${esc(x.k)}</p><p class="kpi-v num">${esc(x.v)}</p><p class="kpi-n">${esc(x.n)}</p></div>`).join('')}</div>`;
}

function sanChainPanel(ctx) {
  const { t, chains: c } = ctx;
  return c.san ? panel(t('chain.san'), chainBars({ cls: 'san', aria: t('chain.san'), stages: [
    { label: t('chain.contained'), value: c.san.contained }, { label: t('chain.emptied'), value: c.san.emptied },
    { label: t('chain.treated'), value: c.san.treated }, { label: t('chain.safe'), value: c.san.safe }] }), 'p-chain', t('chain.san_note')) : '';
}

function wasteChainPanel(ctx) {
  const { t, chains: c } = ctx;
  return c.waste ? panel(t('chain.waste'), chainBars({ cls: 'waste', aria: t('chain.waste'), stages: [
    { label: t('chain.collected'), value: c.waste.collected }, { label: t('chain.recovered'), value: c.waste.recovered },
    { label: t('chain.controlled'), value: c.waste.controlled }, ...(c.waste.plastic_managed !== null ? [{ label: t('chain.plastic_managed'), value: c.waste.plastic_managed }] : [])] }), 'p-chain', t('chain.waste_note')) : '';
}

const chains = (ctx) => `<div class="two">${sanChainPanel(ctx)}${wasteChainPanel(ctx)}</div>`;

function overview(ctx) {
  const { t, town, verdict: v, flags: fl, insights: ins } = ctx;
  const s = v.sanitation; const w = v.waste;
  const line = s ? t(`fail.${s.key}`, { town: town.name }) : w ? t(`fail.waste_${w.stage}`, { town: town.name, uncollected: pct(w.uncollected_share), tonnes: qty(w.uncollected_t_day), stage_share: pct(w.stage_share) }) : '';
  const sub = [s ? t(s.key === 'mostly_safe' ? 'fail.sub_safe' : 'fail.sub', { persons: people(s.persons), share: pct(s.share), safe: pct(s.safe), unsafe: people(s.unsafe_persons) }) : '',
    s && w ? t(`fail.waste_${w.stage}`, { town: town.name, uncollected: pct(w.uncollected_share), tonnes: qty(w.uncollected_t_day), stage_share: pct(w.stage_share) }) : '',
    w ? t('fail.waste_sub', { unmanaged: int(w.unmanaged_t), share: pct(w.unmanaged_share), water: qty(w.water_t), drain: qty(w.drain_t) }) : ''].filter(Boolean);
  const top = fl.filter((f) => f.id !== 'town_note').slice(0, 3);
  return `${head(ctx, 'overview')}
    ${kpis(ctx)}
    <section class="panel verdict-panel"><h2 class="verdict-line">${esc(line)}</h2>${sub.map((x) => `<p class="verdict-sub">${esc(x)}</p>`).join('')}
      <div class="verdict-grid"><div><h3 class="minor">${esc(t('verdict.actions'))}</h3><ol class="actions">${v.actions.map((a) => actionCard(a, ctx)).join('')}</ol></div>
      <div><h3 class="minor">${esc(t('verdict.flags'))}</h3>${top.length ? `<ul class="flaglist">${top.map((f) => `<li class="flag flag-${f.level}">${esc(flagText(f, ctx))}</li>`).join('')}</ul>` : `<p class="flag-none">${esc(t('flag.none'))}</p>`}
      ${ins.length ? `<a class="link" href="#/insights">${esc(t('ov.insights', { n: ins.length }))}</a>` : ''}</div></div></section>
    ${chains(ctx)}`;
}

/* ---------- sanitation ---------- */

function govLights(ctx, domain) {
  const { t, state } = ctx;
  const items = GOV.filter((g) => g.domain === domain);
  const any = items.some((g) => typeof state.gov[g.key] === 'number');
  if (!any) return panel(t('gov.h'), `<p class="empty">${esc(t('gov.none'))}</p>`, 'p-gov');
  return panel(t('gov.h'), `<ul class="lights">${items.map((g) => { const v = state.gov[g.key]; const k = typeof v === 'number' ? v : null;
    return `<li class="light light-${k === null ? 'na' : k}"><span class="dot" aria-hidden="true"></span><span>${esc(g.label)}</span><span class="light-v">${esc(k === null ? t('gov.na') : t(`gov.s${k}`))}</span></li>`; }).join('')}</ul>`, 'p-gov', t('gov.note'));
}

const SAN_NODES = (t) => [
  ['g:septic', 0, 'n'], ['g:direct', 0, 'n'], ['g:pit', 0, 'n'], ['g:tank', 0, 'n'], ['g:flooded', 0, 'n'],
  ['c:yes', 1, 'c-yes'], ['c:no', 1, 'c-no'],
  ['f:safe', 2, 'safe'], ['f:dumped', 2, 'dumped'], ['f:drain', 2, 'drain'], ['f:water', 2, 'water'], ['f:ground', 2, 'ground'],
].map(([id, col, cls]) => ({ id, col, cls, label: t(`node.${id}`) }));

function sanitation(ctx) {
  const { t, r, sfdTown, flows } = ctx;
  if (!r) return `${head(ctx, 'sanitation')}${panel('', `<p class="empty">${esc(t('box.no_sfd'))}</p><a class="btn btn-quiet" href="#/import">${esc(t('nav.import'))}</a>`)}`;
  const sk = sankey({ nodes: SAN_NODES(t), links: flows.san.links, fmt: (v) => t('u.people_n', { n: people(v) }), aria: t('sk.san_aria') });
  const rows = r.outcome.systems.slice().sort((a, b) => b.pop_share - a.pop_share).map((s) => {
    const m = String(s.code).match(/C(\d+)$/);
    const dest = s.contained ? t('sys.contained') : s.flipped ? t('rcv.ground') : t(`rcv.${{ 6: 'drain', 7: 'water', 8: 'ground' }[m ? Number(m[1]) : 0] || 'ground'}`);
    return `<tr><th scope="row">${esc(t(`sys.${s.code}`))}</th><td class="num">${pct(s.pop_share, 1)}</td><td class="num">${s.group === 'direct' ? '' : pct(s.emptied_share || 0)}</td><td>${esc(dest)}</td><td class="num">${people(s.persons)}</td></tr>`;
  }).join('');
  return `${head(ctx, 'sanitation')}
    ${panel(t('sk.san_h'), sk, 'p-wide', t('sk.san_note'))}
    <div class="two">${sanChainPanel(ctx)}
    ${panel(t('sys.h'), `<div class="table-wrap"><table class="tbl"><thead><tr><th scope="col">${esc(t('sys.col_sys'))}</th><th scope="col" class="num">${esc(t('sys.col_share'))}</th><th scope="col" class="num">${esc(t('sys.col_emptied'))}</th><th scope="col">${esc(t('sys.col_ends'))}</th><th scope="col" class="num">${esc(t('sys.col_people'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`)}</div>
    ${govLights(ctx, 'sanitation')}`;
}

/* ---------- solid waste ---------- */

const WASTE_NODES = (t) => [
  ['p:gen', 0, 'n'], ['p:col', 1, 'c-yes'], ['p:uncol', 1, 'c-no'],
  ['p:managed', 2, 'safe'], ['s:uncollected', 2, 'stage'], ['s:chain', 2, 'stage'], ['s:sorting', 2, 'stage'], ['s:disposal', 2, 'stage'],
  ['p:escaped', 3, 'plastic'], ['x:drains', 4, 'drain'], ['x:water', 4, 'water'], ['x:land', 4, 'ground'], ['x:burnt', 4, 'burnt'],
].map(([id, col, cls]) => ({ id, col, cls, label: t(`node.${id}`) }));

function waste(ctx) {
  const { t, wv, flows } = ctx;
  if (!wv) return `${head(ctx, 'waste')}${panel('', `<p class="empty">${esc(t('box.no_wfd'))}</p><a class="btn btn-quiet" href="#/import">${esc(t('nav.import'))}</a>`)}`;
  const sk = sankey({ nodes: WASTE_NODES(t), links: flows.plastic.links, fmt: (v) => `${qty(v)} t`, aria: t('sk.waste_aria'), labelRight: 150 });
  const facts = [[t('wf.msw'), `${qty(wv.msw_t_day)} ${t('u.t_day')}`], [t('wf.kg'), wv.kg_cap_day === null ? '–' : `${wv.kg_cap_day.toFixed(2)} kg`], [t('wf.collected'), pct(wv.collected_share)],
    [t('wf.organic'), wv.organic_share === null ? t('wf.not_given') : pct(wv.organic_share)], [t('wf.plastic_gen'), `${int(wv.plastic_generated_t)} t`], [t('wf.plastic_esc'), `${int(wv.plastic_unmanaged_t)} t (${pct(wv.plastic_unmanaged_share)})`]];
  return `${head(ctx, 'waste')}
    ${panel(t('sk.waste_h'), sk, 'p-wide', flows.plastic.balanced ? t('sk.waste_note') : t('sk.waste_unbalanced'))}
    <div class="two">${wasteChainPanel(ctx)}
    ${panel(t('wf.h'), `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd></div>`).join('')}</dl>`)}</div>
    ${govLights(ctx, 'waste')}`;
}

/* ---------- drains ---------- */

function drains(ctx) {
  const { t, state } = ctx;
  return `${head(ctx, 'drains')}
    <section class="panel sandbox"><p class="fine">${esc(t('dr.scenario', { name: state.scen[state.active].name }))} <a class="link" href="#/scenarios">${esc(t('dr.change'))}</a></p>
      <figure class="scene-wrap" id="scene">${sceneBlock(ctx)}</figure>
      <div id="readout">${readoutBlock(ctx)}</div></section>
    <div class="receivers" id="receivers">${receiversBlock(ctx)}</div>
    <p class="fine">${esc(t('box.fine'))}</p>`;
}

/* ---------- compare ---------- */

function compare(ctx) {
  const { t, paired, pairedOn, town, isOwn, me, state, d } = ctx;
  if (!pairedOn) return `${head(ctx, 'compare')}${panel('', `<p class="empty">${esc(t('ev.no_peers'))}</p>`)}`;
  const pts = paired.filter((p) => p.plastic_kg_person !== null && p.safe !== null).map((p) => ({ id: p.id, name: p.name, x: 1 - p.safe, y: p.plastic_kg_person, me: !isOwn && p.id === town.id }));
  if (isOwn && me && me.safe !== null && me.plastic_kg_person !== null) pts.push({ id: 'own', name: town.name, x: 1 - me.safe, y: me.plastic_kg_person, me: true });
  const sc = scatter({ points: pts, xLabel: t('cmp.x'), yLabel: t('cmp.y'), xFmt: (v) => pct(v), yFmt: (v) => v.toFixed(1), aria: t('cmp.aria') });
  const measures = [['safe', t('cmp.m_safe'), (v) => pct(v), true], ['open_share', t('cmp.m_open'), (v) => pct(v), false], ['plastic_kg_person', t('cmp.m_plastic'), (v) => `${v.toFixed(2)} kg`, false], ['collected', t('cmp.m_collected'), (v) => pct(v), true]];
  const sortKey = measures.some((m) => m[0] === state.sort) ? state.sort : 'safe';
  const m = measures.find((x) => x[0] === sortKey);
  const rows = [...paired, ...(isOwn && me ? [{ id: 'own', name: town.name, ...me }] : [])].filter((p) => typeof p[sortKey] === 'number')
    .sort((a, b) => (m[3] ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));
  const district = Object.fromEntries(d.towns.towns.map((x) => [x.id, x.district]));
  const isMe = (p) => (isOwn ? p.id === 'own' : p.id === town.id);
  const table = `<div class="sort">${esc(t('cmp.sort'))} ${measures.map(([k, label]) => `<button type="button" class="chip${k === sortKey ? ' chip-on' : ''}" data-act="sort" data-sort="${k}" aria-pressed="${k === sortKey}">${esc(label)}</button>`).join('')}</div>
    <div class="table-wrap tall"><table class="tbl"><thead><tr><th scope="col">#</th><th scope="col">${esc(t('cmp.town'))}</th><th scope="col">${esc(t('cmp.district'))}</th>${measures.map(([, label]) => `<th scope="col" class="num">${esc(label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((p, i) => `<tr${isMe(p) ? ' class="me"' : ''}><td class="num">${i + 1}</td><th scope="row">${esc(p.name)}</th><td>${esc(district[p.id] || '')}</td>${measures.map(([k, , fmt]) => `<td class="num">${typeof p[k] === 'number' ? esc(fmt(p[k])) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const medS = median(paired.map((p) => p.safe));
  return `${head(ctx, 'compare')}
    ${panel(t('cmp.scatter_h'), sc, 'p-wide', t('cmp.scatter_note', { n: pts.length, med: pct(medS) }))}
    ${panel(t('cmp.table_h', { sort: m[1] }), table, '', t('cmp.no_map'))}`;
}

/* ---------- insights ---------- */

function insightText(i, ctx) {
  const { t } = ctx;
  const v = i.vars || {};
  if (i.kind === 'contradiction') return { title: t(`ins.contra_${i.flag.id}`), body: flagText(i.flag, ctx) };
  const vars = { share: v.share !== undefined ? pct(v.share) : '', persons: v.persons !== undefined ? people(v.persons) : '', tonnes: v.tonnes !== undefined ? qty(v.tonnes) : '',
    total: v.total !== undefined ? int(v.total) : '', value: v.value !== undefined ? (i.id === 'peer_plastic' ? `${v.value.toFixed(2)} kg` : pct(v.value)) : '',
    median: v.median !== undefined && v.median !== null ? (i.id === 'peer_plastic' ? `${v.median.toFixed(2)} kg` : pct(v.median)) : '', worse: v.worse ?? '', better: v.better ?? '', n: v.n ?? '',
    group: v.group ? t(`grp.${v.group}`) : '' };
  return { title: t(`${i.key}_t`, vars), body: t(`${i.key}_b`, vars) };
}

function insights(ctx) {
  const { t, insights: ins } = ctx;
  const card = (i) => {
    const x = insightText(i, ctx);
    const act = i.lever ? `<button type="button" class="btn btn-quiet btn-s" data-act="try" data-lever="${i.lever === 'both' ? 'both' : i.lever}">${esc(t('ins.try'))}</button>`
      : i.kind === 'missing' ? `<a class="btn btn-quiet btn-s" href="#/data">${esc(t('ins.fill'))}</a>` : i.kind === 'contradiction' ? `<a class="btn btn-quiet btn-s" href="#/data">${esc(t('ins.check'))}</a>` : '';
    return `<li class="ins ins-${i.kind}"><p class="ins-k">${esc(t(`ins.kind_${i.kind}`))} <span class="ins-d">${esc(t(`ins.dom_${i.domain}`))}</span></p>
      <h2 class="ins-t">${esc(x.title)}</h2><p class="ins-b">${esc(x.body)}</p><p class="ins-e">${esc(t(`ins.ev_${i.evidence}`, { town: ctx.town.name }))}</p>${act}</li>`;
  };
  return `${head(ctx, 'insights')}${ins.length ? `<ol class="ins-list">${ins.map(card).join('')}</ol>` : panel('', `<p class="empty">${esc(t('ins.none'))}</p>`)}`;
}

/* ---------- scenarios ---------- */

const EX_PARTS = (t, e) => [
  { cls: 'safe', label: t('rcv.safe'), value: e.safe }, { cls: 'drain', label: t('rcv.drain'), value: e.receivers.drain.share }, { cls: 'water', label: t('rcv.water'), value: e.receivers.water.share },
  { cls: 'ground', label: t('rcv.ground'), value: e.receivers.ground.share }, { cls: 'dumped', label: t('rcv.dumped'), value: e.receivers.dumped.share }];
const PL_PARTS = (t, p, removed) => [
  { cls: 'safe', label: t('rcv.removed'), value: removed }, { cls: 'drain', label: t('rcv.drain'), value: p.receivers.drain.tonnes }, { cls: 'water', label: t('rcv.water'), value: p.receivers.water.tonnes },
  { cls: 'ground', label: t('rcv.land'), value: p.receivers.ground.tonnes }, { cls: 'burnt', label: t('rcv.burnt'), value: p.receivers.burnt.tonnes }];

export function scenarioResults(ctx) {
  const { t, r, wv, ex0, ex1, pl0, pl1, contrib, state } = ctx;
  const name = state.scen[state.active].name;
  const out = [];
  if (ex0) out.push(panel(t('sc.ex_h'), endBars({ total: ex0.safe + ex0.unsafe, fmt: (v) => pct(v), aria: t('sc.ex_h'), rows: [{ label: t('sc.today'), parts: EX_PARTS(t, ex0) }, { label: name, parts: EX_PARTS(t, ex1) }] })));
  if (pl0) {
    const removed = Math.max(0, pl0.total_t - pl1.total_t);
    out.push(panel(t('sc.pl_h'), endBars({ total: pl0.fate_sum_t, fmt: (v) => `${qty(v)} t`, aria: t('sc.pl_h'), rows: [{ label: t('sc.today'), parts: PL_PARTS(t, pl0, 0) }, { label: name, parts: PL_PARTS(t, pl1, removed * (pl0.fate_sum_t / (pl0.total_t || 1))) }] }), '', t('sc.pl_note')));
  }
  const L = { uptake: t('lv.uptake'), treat: t('lv.treat'), collection: t('lv.collection'), controlled: t('lv.controlled') };
  const wf = [];
  if (r) wf.push(panel(t('sc.wf_safe'), waterfall({ start: contrib.base.safe, steps: contrib.steps.filter((s) => s.key === 'uptake' || s.key === 'treat').map((s) => ({ label: L[s.key], delta: s.d_safe })), startLabel: t('sc.today'), endLabel: name, fmt: (v) => pct(v), good: 'up', aria: t('sc.wf_safe') })));
  if (wv) wf.push(panel(t('sc.wf_plastic'), waterfall({ start: contrib.base.plastic, steps: contrib.steps.filter((s) => s.key === 'collection' || s.key === 'controlled').map((s) => ({ label: L[s.key], delta: s.d_plastic })), startLabel: t('sc.today'), endLabel: name, fmt: (v) => `${int(v)} t`, good: 'down', aria: t('sc.wf_plastic') })));
  return `<div id="scen-kpi">${readoutBlock(ctx)}</div>${out.join('')}<div class="two">${wf.join('')}</div>${compareTable(ctx)}`;
}

function compareTable(ctx, withNote = true) {
  const { t, scenarios, r, wv, ex0, pl0 } = ctx;
  const unit = (s, id) => { const l = s.sizing.lines.find((x) => x.id === id); return l ? qty(l.units.value) : '–'; };
  const rows = [
    r ? [t('sc.c_safe'), pct(r.outcome.components.safe), ...scenarios.map((s) => pct(s.safe))] : null,
    wv ? [t('sc.c_plastic'), int(wv.plastic_unmanaged_t), ...scenarios.map((s) => int(s.plastic))] : null,
    ex0 ? [t('sc.c_drain_ex'), people(ex0.receivers.drain.persons), ...scenarios.map((s) => people(s.drain_persons))] : null,
    pl0 ? [t('sc.c_drain_pl'), qty(pl0.receivers.drain.tonnes), ...scenarios.map((s) => qty(s.drain_tonnes))] : null,
    r ? [t('sc.c_households'), '–', ...scenarios.map((s) => int(s.sizing.lines.filter((l) => l.kind === 'contain').reduce((a, l) => a + l.units.value, 0)))] : null,
    r ? [t('sc.c_vehicles'), '–', ...scenarios.map((s) => unit(s, 'vehicles'))] : null,
    r ? [t('sc.c_fstp'), '–', ...scenarios.map((s) => unit(s, 'fstp'))] : null,
    wv ? [t('sc.c_vans'), '–', ...scenarios.map((s) => unit(s, 'collection'))] : null,
    [t('sc.c_capex'), '–', ...scenarios.map((s) => (s.sizing.totals.priced ? money(ctx, s.sizing.totals.capex) : t('sc.c_unpriced')))],
  ].filter(Boolean);
  return panel(t('sc.cmp_h'), `<div class="table-wrap"><table class="tbl"><thead><tr><th scope="col"></th><th scope="col" class="num">${esc(t('sc.today'))}</th>${scenarios.map((s) => `<th scope="col" class="num${s.i === ctx.state.active ? ' on' : ''}">${esc(s.name)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr><th scope="row">${esc(row[0])}</th>${row.slice(1).map((c) => `<td class="num">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`, '', withNote ? t('sc.cmp_note') : '');
}

function scenarios(ctx) {
  const { t, state } = ctx;
  const tabs = `<div class="scen-tabs" role="group" aria-label="${esc(t('top.scenario'))}">${state.scen.map((s, i) => `<button type="button" class="chip${i === state.active ? ' chip-on' : ''}" data-act="scen-go" data-i="${i}" aria-pressed="${i === state.active}">${esc(s.name)}</button>`).join('')}
    ${state.scen.length < 3 ? `<button type="button" class="chip chip-add" data-act="scen-add">${esc(t('sc.add'))}</button>` : ''}
    <label class="fld fld-name"><span>${esc(t('sc.name'))}</span><input type="text" maxlength="30" data-act="scen-name" value="${esc(state.scen[state.active].name)}"></label>
    ${state.scen.length > 1 ? `<button type="button" class="link" data-act="scen-del">${esc(t('sc.del'))}</button>` : ''}</div>`;
  return `${head(ctx, 'scenarios', tabs)}
    <div class="scen-grid"><form class="levers panel" id="levers" aria-label="${esc(t('lv.aria'))}">${leversBlock(ctx)}</form>
    <div id="scen-results">${scenarioResults(ctx)}</div></div>`;
}

/* ---------- investment ---------- */

export function phaseBlock(ctx) {
  const { t, phase, startYear, planYears, state, sizing } = ctx;
  if (!sizing.lines.length) return '';
  const label = (l) => (l.kind === 'contain' ? t(`opt.${l.name}`) : t(`line.${l.kind}`));
  const opts = (n, sel, from = 0) => Array.from({ length: n - from }, (_, i) => i + from).map((i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${i}</option>`).join('');
  const rows = phase.rows.map((p) => `<tr><th scope="row">${esc(label(p.line))}</th>
    <td><select data-phase="start" data-line="${esc(p.id)}" aria-label="${esc(t('ph.start_of', { line: label(p.line) }))}">${Array.from({ length: planYears }, (_, i) => `<option value="${i}"${i === p.start ? ' selected' : ''}>${startYear + i}</option>`).join('')}</select></td>
    <td><select data-phase="years" data-line="${esc(p.id)}" aria-label="${esc(t('ph.years_of', { line: label(p.line) }))}">${opts(planYears + 1, p.years, 1)}</select></td>
    <td class="num">${p.per_year === null ? `<span class="none">${esc(t('line.no_rate'))}</span>` : esc(money(ctx, p.per_year))}</td></tr>`).join('');
  const budget = typeof state.ops.budget_year === 'number' ? state.ops.budget_year : null;
  const anyPriced = phase.spend.some((v) => v > 0);
  return `${timeline({ rows: phase.rows.map((p) => ({ label: label(p.line), start: p.start, years: p.years, cls: p.line.domain })), startYear, years: planYears, aria: t('ph.aria') })}
    <div class="table-wrap"><table class="tbl tbl-phase"><thead><tr><th scope="col">${esc(t('ph.col_line'))}</th><th scope="col">${esc(t('ph.col_start'))}</th><th scope="col">${esc(t('ph.col_years'))}</th><th scope="col" class="num">${esc(t('ph.col_year'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${anyPriced ? `<h3 class="minor">${esc(t('ph.spend_h'))}</h3>${spendBars({ spend: phase.spend, startYear, budget, fmt: (v) => money(ctx, v), aria: t('ph.spend_h') })}` : `<p class="fine">${esc(t('ph.no_spend'))}</p>`}
    ${budget === null ? `<p class="fine">${esc(t('ph.no_budget'))}</p>` : ''}`;
}

function invest(ctx) {
  const { t, state, touched } = ctx;
  const name = state.scen[state.active].name;
  return `${head(ctx, 'invest')}
    <p class="basis-line">${esc(t(touched ? 'inv.for_scen' : 'inv.for_full', { name }))}</p>
    <section class="panel sizing" id="sizing">
      <label class="fld fld-cur"><span>${esc(t('size.currency'))}</span><input type="text" maxlength="6" autocomplete="off" data-act="currency" value="${esc(ctx.currency)}" placeholder="${esc(t('size.currency_ph'))}"></label>
      <div id="bridge">${bridgeBlock(ctx)}</div><div id="totals">${totalsBlock(ctx)}</div></section>
    ${panel(t('ph.h'), `<div id="phase">${phaseBlock(ctx)}</div>`, 'p-wide')}
    ${panel('', rulesTable(ctx))}`;
}

/* ---------- plan report ---------- */

function report(ctx) {
  const { t, town, r, wv, verdict: v, insights: ins, scenarios: sc, state, sizing, phase, startYear, planYears, chains: c, comp, today, ex0, pl0 } = ctx;
  const a = sc[state.active];
  const label = (l) => (l.kind === 'contain' ? t(`opt.${l.name}`) : t(`line.${l.kind}`));
  const s = v.sanitation;
  const sum = [s ? t(`fail.${s.key}`, { town: town.name }) : '', v.waste ? t('fail.waste_sub', { unmanaged: int(v.waste.unmanaged_t), share: pct(v.waste.unmanaged_share), water: qty(v.waste.water_t), drain: qty(v.waste.drain_t) }) : ''].filter(Boolean);
  const target = [
    r ? [t('rp.i_safe'), pct(r.outcome.components.safe), pct(a.safe), t('rp.src_sfd')] : null,
    ex0 ? [t('rp.i_drain'), people(ex0.receivers.drain.persons), people(a.drain_persons), t('rp.src_sfd')] : null,
    wv ? [t('rp.i_collected'), pct(wv.collected_share), pct(a.levers.collection), t('rp.src_wfd')] : null,
    wv ? [t('rp.i_controlled'), pct(c.waste.controlled), t('rp.rises'), t('rp.src_wfd')] : null,
    wv ? [t('rp.i_plastic'), int(wv.plastic_unmanaged_t), int(a.plastic), t('rp.src_wfd')] : null,
    pl0 ? [t('rp.i_drain_pl'), qty(pl0.receivers.drain.tonnes), qty(a.drain_tonnes), t('rp.src_wfd')] : null,
  ].filter(Boolean);
  const lines = phase.rows.map((p) => { const l = p.line; const rr = state.rates[l.id] || {};
    return `<tr><th scope="row">${esc(label(l))}</th><td class="num">${esc(`${qty(l.units.value)} ${t(`u.${l.units.unit}`)}`)}</td><td class="num">${l.capex_total === null ? '–' : esc(money(ctx, l.capex_total))}</td><td class="num">${l.opex_total ? esc(money(ctx, l.opex_total)) : '–'}</td><td>${startYear + p.start}–${startYear + p.start + p.years - 1}</td><td>${esc(rr.owner || t('rp.owner_tbc'))}</td></tr>`; }).join('');
  return `${head(ctx, 'report', `<div class="rp-acts"><button type="button" class="btn btn-s" data-act="pdf">${esc(t('rp.print'))}</button><button type="button" class="btn btn-quiet btn-s" data-act="wb-export">${esc(t('top.workbook'))}</button></div>`)}
  <article class="report">
    <header class="rp-head"><p class="rp-kicker">${esc(t('rp.kicker'))}</p><h2 class="rp-title">${esc(t('rp.title', { town: town.name }))}</h2>
      <p class="rp-meta">${esc(t('rp.meta', { name: a.name, from: startYear, to: startYear + planYears - 1, date: today }))}</p><p class="rp-meta">${esc(basisLine(ctx))}</p></header>
    <section><h3>${esc(t('rp.s1'))}</h3>${sum.map((x) => `<p>${esc(x)}</p>`).join('')}
      <p>${esc(a.any ? t('rp.s1_plan', { name: a.name, safe: a.safe === null ? '–' : pct(a.safe), plastic: a.plastic === null ? '–' : int(a.plastic) }) : t('rp.s1_noplan'))}</p>
      <p>${esc(sizing.totals.priced ? t('rp.s1_cost', { capex: money(ctx, sizing.totals.capex), priced: sizing.totals.priced, total: sizing.lines.filter((l) => !l.unsized).length }) : t('rp.s1_nocost'))}</p>
      ${sizing.totals.any_engineer && sizing.totals.capex > 0 ? `<p>${esc(t('rp.s1_range', { low: money(ctx, sizing.totals.capex_low), high: money(ctx, sizing.totals.capex_high), household: pct(sizing.lines.filter((l) => l.kind === 'contain').reduce((x, l) => x + (l.capex_total || 0), 0) / sizing.totals.capex) }))}</p>` : ''}</section>
    <section><h3>${esc(t('rp.s2'))}</h3><div class="two">${c.san ? chainBars({ cls: 'san', aria: t('chain.san'), stages: [{ label: t('chain.contained'), value: c.san.contained }, { label: t('chain.emptied'), value: c.san.emptied }, { label: t('chain.treated'), value: c.san.treated }, { label: t('chain.safe'), value: c.san.safe }] }) : ''}
      ${c.waste ? chainBars({ cls: 'waste', aria: t('chain.waste'), stages: [{ label: t('chain.collected'), value: c.waste.collected }, { label: t('chain.recovered'), value: c.waste.recovered }, { label: t('chain.controlled'), value: c.waste.controlled }] }) : ''}</div></section>
    <section><h3>${esc(t('rp.s3'))}</h3><ol class="rp-list">${ins.filter((i) => i.kind !== 'missing').slice(0, 5).map((i) => { const x = insightText(i, ctx); return `<li><strong>${esc(x.title)}</strong> ${esc(x.body)}</li>`; }).join('')}</ol></section>
    <section><h3>${esc(t('rp.s4'))}</h3>${compareTable(ctx, false)}</section>
    <section><h3>${esc(t('rp.s5'))}</h3>${a.any ? '' : `<p>${esc(t('rp.s5_full'))}</p>`}${lines ? `<div class="table-wrap"><table class="tbl"><thead><tr><th scope="col">${esc(t('rp.c_item'))}</th><th scope="col" class="num">${esc(t('rp.c_units'))}</th><th scope="col" class="num">${esc(t('rp.c_capex'))}</th><th scope="col" class="num">${esc(t('rp.c_opex'))}</th><th scope="col">${esc(t('rp.c_years'))}</th><th scope="col">${esc(t('rp.c_owner'))}</th></tr></thead><tbody>${lines}</tbody></table></div>` : `<p>${esc(t('rp.no_lines'))}</p>`}</section>
    <section><h3>${esc(t('rp.s6'))}</h3><div class="table-wrap"><table class="tbl"><thead><tr><th scope="col">${esc(t('rp.c_ind'))}</th><th scope="col" class="num">${esc(t('rp.c_base'))}</th><th scope="col" class="num">${esc(t('rp.c_target', { name: a.name }))}</th><th scope="col">${esc(t('rp.c_src'))}</th></tr></thead>
      <tbody>${target.map((x) => `<tr><th scope="row">${esc(x[0])}</th><td class="num">${esc(x[1])}</td><td class="num">${esc(x[2])}</td><td>${esc(x[3])}</td></tr>`).join('')}</tbody></table></div></section>
    <section><h3>${esc(t('rp.s7'))}</h3><p>${esc(t('rp.s7_tiers', { t1: `${comp.tier1.have}/${comp.tier1.of}`, t2: `${comp.tier2.have}/${comp.tier2.of}`, t3: `${comp.tier3.have}/${comp.tier3.of}` }))}</p>
      <ul class="rp-list">${['1', '2', '3', '4'].map((k) => `<li>${esc(t(`rp.limit_${k}`))}</li>`).join('')}</ul></section>
  </article>`;
}

/* ---------- data and sources ---------- */

function data(ctx) {
  const { t, comp, state } = ctx;
  const m = meter([{ label: t('tier.1'), have: comp.tier1.have, of: comp.tier1.of }, { label: t('tier.2'), have: comp.tier2.have, of: comp.tier2.of }, { label: t('tier.3'), have: comp.tier3.have, of: comp.tier3.of }]);
  const ops = OPS.filter((o) => state.ops[o.key] !== undefined).map((o) => `<div><dt>${esc(o.label)}</dt><dd class="num">${esc(String(state.ops[o.key]))} ${esc(o.unit === 'plan currency' ? '' : o.unit)}</dd></div>`).join('');
  const wards = state.wards.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th scope="col">${esc(t('wd.ward'))}</th><th scope="col" class="num">${esc(t('wd.pop'))}</th><th scope="col" class="num">${esc(t('wd.hh'))}</th><th scope="col" class="num">${esc(t('wd.li'))}</th></tr></thead>
    <tbody>${state.wards.map((w) => `<tr><th scope="row">${esc(w.ward)}</th><td class="num">${int(w.population)}</td><td class="num">${w.households === null ? '–' : int(w.households)}</td><td class="num">${w.low_income_pct === null ? '–' : `${w.low_income_pct}%`}</td></tr>`).join('')}</tbody></table></div>` : '';
  return `${head(ctx, 'data')}
    <div class="two">${panel(t('tier.h'), `${m}<ul class="tier-list"><li>${esc(t('tier.1_d'))}</li><li>${esc(t('tier.2_d'))}</li><li>${esc(t('tier.3_d'))}</li></ul>`)}
    ${panel(t('wb.h'), `<p>${esc(t('wb.lede'))}</p><div class="btn-row"><button type="button" class="btn btn-s" data-act="wb-export">${esc(t('wb.download'))}</button>
      <label class="btn btn-quiet btn-s">${esc(t('wb.upload'))}<input type="file" class="visually-hidden" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-act="files"></label></div>
      <p class="fine">${esc(t('wb.note'))}</p><div class="runfile"><button type="button" class="link" data-act="save-run">${esc(t('run.save'))}</button>
      <label class="link">${esc(t('run.load'))}<input type="file" class="visually-hidden" accept="application/json,.json" data-act="load-run"></label><span id="run-msg" class="fine">${esc(state.runMsg || '')}</span></div>`)}</div>
    ${ops || wards ? panel(t('ops.h'), `${ops ? `<dl class="facts">${ops}</dl>` : ''}${wards}`) : ''}
    ${unitCostsPanel(ctx)}
    ${evidenceSection(ctx)}`;
}

function unitCostsPanel(ctx) {
  const { t, d } = ctx;
  const uc = d.unit_costs;
  if (!uc) return '';
  const usedBy = {};
  for (const [lid, m] of Object.entries(uc.lines)) if (m.priced || m.included) for (const i of m.items) (usedBy[i] = usedBy[i] || []).push(lid.startsWith('contain:') ? t(`opt.${lid.slice(8)}`) : t(`line.${lid}`));
  const priced = uc.items.filter((i) => i.priced).length;
  const rows = uc.items.map((i) => {
    const use = usedBy[i.id] ? t('uc.used', { lines: [...new Set(usedBy[i.id])].join('; ') }) : !i.priced ? t('uc.blank') : uc.unused[i.id] || (uc.lines.compost && uc.lines.compost.items.includes(i.id) ? uc.lines.compost.note : '');
    return `<tr${usedBy[i.id] ? '' : ' class="dim"'}><td>${esc(i.id)}</td><th scope="row">${esc(i.item)}<span class="src">${esc([i.unit, i.spec].filter(Boolean).join('. '))}</span></th>
      <td class="num">${i.priced ? esc(int(i.typical)) : '–'}</td><td class="num">${esc(i.price_year || '–')}</td><td>${esc(use)}</td></tr>`;
  }).join('');
  return panel(t('uc.h'), `<p>${esc(t('uc.lede', { priced, rows: uc.items.length }))}</p><div class="table-wrap tall"><table class="tbl"><thead><tr><th scope="col">${esc(t('uc.col_id'))}</th><th scope="col">${esc(t('uc.col_item'))}</th><th scope="col" class="num">${esc(t('uc.col_typ'))}</th><th scope="col" class="num">${esc(t('uc.col_year'))}</th><th scope="col">${esc(t('uc.col_use'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`, 'p-wide');
}

/* ---------- import (inside the shell) ---------- */

function importScreen(ctx) {
  const { t, d } = ctx;
  const towns = d.towns.towns.slice().sort((a, b) => a.name.localeCompare(b.name));
  return `${head(ctx, 'import')}
    <label class="drop" id="drop" for="files"><input type="file" id="files" class="visually-hidden" accept="application/pdf,.pdf,.xlsx" multiple data-act="files">
      <span class="drop-title">${esc(t('land.drop'))}</span><span class="drop-sub">${esc(t('land.drop_sub'))}</span></label>
    <div class="two">${panel(t('imp.sample_h'), `<div class="sample"><label for="sample-town">${esc(t('land.sample_pick'))}</label>
      <select id="sample-town">${towns.map((x) => `<option value="${x.id}"${String(x.id) === String(ctx.town.id) ? ' selected' : ''}>${esc(x.name)}${x.district ? `, ${esc(x.district)}` : ''}</option>`).join('')}</select>
      <button type="button" class="btn btn-s" data-act="open-sample">${esc(t('land.sample_open'))}</button></div>`)}
    ${panel(t('imp.other_h'), `<div class="btn-row"><button type="button" class="btn btn-quiet btn-s" data-act="wb-blank">${esc(t('wb.blank'))}</button><button type="button" class="btn btn-quiet btn-s" data-act="manual">${esc(t('land.manual'))}</button></div>`)}</div>`;
}

const SCREENS = { overview, sanitation, waste, drains, compare, insights, scenarios, invest, report, data, import: importScreen };
