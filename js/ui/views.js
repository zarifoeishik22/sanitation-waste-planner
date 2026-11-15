// The tabs. Each function takes the page context and returns an HTML string. No DOM access, so every tab is testable in Node.

import { COMPONENTS } from '../engine/sfd.js';
import { sanScenario, waysToReach } from '../engine/scenario.js';
import { wfdScenario, wfdView } from '../engine/wfd.js';
import * as R from './render.js';
import { waffle, flowbar, ribbons, hbars } from './charts.js';

const { esc, int, pct, round3, nf1 } = R;
const nf2 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
/** Tonnes and similar quantities: no false precision. */
export const qty = (v) => (v >= 100 ? int(Math.round(v)) : v >= 10 ? nf1.format(v) : nf2.format(v));
const UNSAFE = ['f11', 'f15', 'w11c', 's11e'];

export const TABS = ['overview', 'sanitation', 'waste', 'plan', 'costs', 'compare', 'own', 'sources'];

const section = (id, title, body, cls = '') => `<section class="block ${cls}" aria-labelledby="h-${id}"><h2 id="h-${id}">${title}</h2>${body}</section>`;
const faecesTonnes = (ctx, persons) => (persons * ctx.bench.faeces_g_cap_day.value) / 1e6;

export function banners(ctx) {
  const n = Object.keys(ctx.state.costOverrides).length;
  return '<div data-banners>' + R.banner(ctx.r, ctx.t) + (n ? `<p class="banner banner-user" role="note">${esc(ctx.t('banner.user_costs', { n }))}</p>` : '')
    + (ctx.town.typed ? `<p class="banner banner-user" role="note">${esc(ctx.t('banner.typed'))}</p>` : '') + '</div>';
}

/* ---------- decisions ---------- */

function decisionText(d, ctx) {
  const { t } = ctx;
  const v = { share: pct(d.share ?? 0, 0), persons: int(round3(d.persons ?? 0)) };
  if (d.id === 'contain') {
    Object.assign(v, { option: d.name, households: int(round3(d.households)), labels: d.labels.map((x) => x.charAt(0).toLowerCase() + x.slice(1)).join('; ') });
  }
  if (d.id === 'no_option' || d.id === 'no_option_gw') v.systems = d.systems.join(', ');
  if (d.id === 'collect') Object.assign(v, { collected: pct(d.collected, 0), tonnes: qty(d.tonnes_day) });
  if (d.id === 'dumpsite') Object.assign(v, { tonnes: qty(d.tonnes_year), controlled: d.controlled > 0 ? pct(d.controlled, 0) : t('dec.none_of') });
  if (d.id === 'organics') v.tonnes = qty(d.tonnes_day);
  const cost = d.cost === 'none' ? '' : d.id === 'treat' && d.cost === 'not_costed' ? t('dec.cost.treat_missing', { missing: d.missing.join(', ') }) : t(`dec.cost.${d.cost}`);
  const why = d.id === 'dumpsite' && d.share < 0.05 ? 'dec.dumpsite.why_low' : `dec.${d.id}.why`;
  return { title: t(`dec.${d.id}.title`, v), why: t(why, v), cost };
}

function decisionList(list, ctx) {
  if (!list.length) return `<p class="empty">${esc(ctx.t('dec.empty'))}</p>`;
  return `<ol class="decisions">${list.map((d, i) => {
    const x = decisionText(d, ctx);
    return `<li class="decision"><span class="dec-n num">${i + 1}</span><div><h3>${esc(x.title)}</h3><p>${esc(x.why)}</p>${x.cost ? `<p class="dec-cost">${esc(x.cost)}</p>` : ''}</div></li>`;
  }).join('')}</ol>`;
}

/* ---------- overview ---------- */

function overview(ctx) {
  const { r, town, t, wv } = ctx;
  const c = r.outcome.components;
  const unsafe = UNSAFE.reduce((a, k) => a + c[k], 0);
  const persons = unsafe * town.population_sfd;
  const n10 = Math.round(unsafe * 10);
  const headline = unsafe >= 0.95 ? t('hero.san_all', { town: town.name }) : unsafe < 0.05 ? t('hero.san_none', { town: town.name }) : t('hero.san', { n: n10, town: town.name });
  const legend = COMPONENTS.map((k) => `<li><span class="swatch seg-${k}"></span><span class="legend-name">${esc(t(`comp.short.${k}`))}</span><span class="legend-val num">${pct(c[k], 0)}</span></li>`).join('');
  const san = `<article class="hero">
    <p class="hero-kicker">${esc(t('hero.kicker_san'))}</p>
    <h2 class="hero-say">${esc(headline)}</h2>
    <div class="hero-fig">${waffle(c, t)}<ul class="legend legend-tight">${legend}</ul></div>
    <p>${esc(t('hero.san_load', { share: pct(unsafe, 0), persons: int(round3(persons)), tonnes: qty(faecesTonnes(ctx, persons)) }))}</p>
    <p class="source">${esc(t('hero.bench', { value: pct(ctx.bench.san_safe.value, 0), year: ctx.bench.san_safe.year, town: town.name, safe: pct(c.safe, 0) }))}</p>
    <p><button type="button" class="linkbtn" data-goto="sanitation">${esc(t('hero.more_san'))}</button></p>
  </article>`;
  let waste;
  if (wv) {
    const fates = wv.fates.slice().sort((a, b) => b.tonnes - a.tonnes).map((f) => ({ label: t(`fate.${f.key}`), value: f.tonnes, text: `${qty(f.tonnes)} t`, note: pct(f.share, 0), strong: f.key === 'water', cls: f.key === 'water' ? 'fill-water' : '' }));
    waste = `<article class="hero">
      <p class="hero-kicker">${esc(t('hero.kicker_waste'))}</p>
      <h2 class="hero-say">${esc(wv.water_kg_day >= 1 ? t('hero.waste', { kg: qty(wv.water_kg_day), town: town.name }) : t('hero.waste_small', { town: town.name, tonnes: qty(wv.plastic_unmanaged_t) }))}</h2>
      <div class="hero-fig hero-fig-bars"><p class="fig-title">${esc(t('hero.waste_fig', { tonnes: qty(wv.plastic_unmanaged_t) }))}</p>${hbars(fates)}</div>
      <p>${esc(t('hero.waste_load', { tonnes: qty(wv.plastic_unmanaged_t), share: pct(wv.plastic_unmanaged_share, 0), collected: pct(wv.collected_share, 0), day: qty(wv.uncollected_t_day) }))}</p>
      <p><button type="button" class="linkbtn" data-goto="waste">${esc(t('hero.more_waste'))}</button></p>
    </article>`;
  } else {
    waste = `<article class="hero hero-empty"><p class="hero-kicker">${esc(t('hero.kicker_waste'))}</p><p>${esc(t('hero.waste_missing'))}</p>
      <p><button type="button" class="linkbtn" data-goto="own">${esc(t('tab.own'))}</button></p></article>`;
  }
  const san2 = ctx.dec.filter((d) => d.domain === 'sanitation').slice(0, 2);
  const w1 = ctx.dec.filter((d) => d.domain === 'waste').slice(0, 1);
  const first = section('first', esc(t('sec.first')), `${decisionList([...san2, ...w1], ctx)}
    <p class="actions"><button type="button" class="btn" data-goto="plan">${esc(t('first.more'))}</button></p>`);
  return `${banners(ctx)}<div class="heroes">${san}${waste}</div>${first}`;
}

/* ---------- sanitation ---------- */

function consequences(ctx) {
  const { r, t, town, bench } = ctx;
  const c = r.outcome.components;
  const key = r.outcome.binding.key;
  const persons = c[key] * town.population_sfd;
  const b = bench.wash_death_rate;
  return `<div class="conseq">
    <h3>${esc(t('conseq.title'))}</h3>
    <dl>
      <div><dt>${esc(t('conseq.load_h'))}</dt><dd>${esc(t('conseq.load', { persons: int(round3(persons)), tonnes: qty(faecesTonnes(ctx, persons)) }))} <span class="scope">${esc(t('scope.town'))}</span></dd></div>
      <div><dt>${esc(t('conseq.health_h'))}</dt><dd>${esc(t('conseq.health', { rate: qty(b.value), year: b.year }))} <span class="scope scope-far">${esc(t('scope.national'))}</span></dd></div>
      <div><dt>${esc(t('conseq.return_h'))}</dt><dd>${esc(t('conseq.return', { bcr: qty(bench.bcr_sanitation.value) }))} <span class="scope scope-far">${esc(t('scope.global'))}</span></dd></div>
      <div><dt>${esc(t('conseq.reuse_h'))}</dt><dd>${esc(t('conseq.reuse'))} <span class="scope scope-none">${esc(t('scope.none'))}</span></dd></div>
    </dl>
  </div>`;
}

function sanitation(ctx) {
  const { r, town, t } = ctx;
  const c = r.outcome.components;
  const high = r.settings.gw === 'high';
  const legend = COMPONENTS.map((k) => `<li class="${k === r.outcome.binding.key ? 'is-binding' : ''}"><span class="swatch seg-${k}"></span>
    <span class="legend-name">${esc(t(`comp.${k}`))}</span><span class="legend-val num">${pct(c[k])}</span></li>`).join('');
  const flow = section('outcome', esc(t('sec.outcome', { town: town.name })), `
    <p class="lead">${esc(t(high ? 'outcome.lead_high' : 'outcome.lead_low', { safe: pct(c.safe) }))}</p>
    ${ribbons(r.outcome.systems, t)}
    <ul class="legend">${legend}</ul>
    <p class="source">${esc(t(high ? 'outcome.source_high' : town.typed ? 'outcome.source_typed' : 'outcome.source_low', { date: town.sfd.date, by: town.sfd.prepared_by }))}</p>`);
  const binding = R.bindingSection(r, t).replace('</section>', `${consequences(ctx)}</section>`);
  return [banners(ctx), flow, binding, R.gapSection(r, t), R.rankedSection(r, t), R.chainSection(r, t), R.otherSection(r, t)].join('\n');
}

/* ---------- solid waste ---------- */

const SWM_STAGES = [['collection', ['S01', 'S02', 'S03', 'S11', 'S10']], ['transport', ['S04', 'S05']], ['recovery', ['S06', 'S07']], ['disposal', ['S08']], ['leakage', ['S09']]];

function tile(label, value, sub) {
  return `<div class="tile"><p class="tile-label">${esc(label)}</p><p class="tile-value num">${esc(value)}</p>${sub ? `<p class="tile-sub">${esc(sub)}</p>` : ''}</div>`;
}

function waste(ctx) {
  const { t, town, wv, d } = ctx;
  if (!wv) return `${banners(ctx)}${section('waste', esc(t('sec.waste', { town: town.name })), `<p class="empty">${esc(t('hero.waste_missing'))}</p>
    <p class="actions"><button type="button" class="btn" data-goto="own">${esc(t('tab.own'))}</button></p>`)}`;
  const tiles = `<div class="tiles">
    ${tile(t('tile.msw'), `${qty(wv.msw_t_day)} t`, wv.kg_cap_day ? t('tile.msw_sub', { kg: nf2.format(wv.kg_cap_day) }) : t('tile.per_day'))}
    ${tile(t('tile.collected'), pct(wv.collected_share, 0), t('tile.collected_sub', { tonnes: qty(wv.uncollected_t_day) }))}
    ${tile(t('tile.plastic'), `${qty(wv.plastic_generated_t)} t`, t('tile.per_year'))}
    ${tile(t('tile.unmanaged'), `${qty(wv.plastic_unmanaged_t)} t`, t('tile.unmanaged_sub', { share: pct(wv.plastic_unmanaged_share, 0) }))}
    ${tile(t('tile.water'), `${qty(wv.water_t)} t`, wv.water_kg_person !== null ? t('tile.water_sub', { kg: nf2.format(wv.water_kg_person) }) : t('tile.per_year'))}
  </div>`;
  const stageRows = wv.stages.filter((s) => s.tonnes > 0).sort((a, b) => b.tonnes - a.tonnes)
    .map((s) => ({ label: t(`stage.${s.key}`), value: s.tonnes, text: `${qty(s.tonnes)} t`, note: pct(s.share, 0), strong: s.key === wv.biggest_stage.key }));
  const fateRows = wv.fates.slice().sort((a, b) => b.tonnes - a.tonnes)
    .map((f) => ({ label: t(`fate.${f.key}`), value: f.tonnes, text: `${qty(f.tonnes)} t`, note: pct(f.share, 0), strong: f.key === 'water', cls: f.key === 'water' ? 'fill-water' : '' }));
  const flag = wv.flag ? `<p class="warn">${esc(t('waste.flag', { sum: pct(wv.stage_sum, 0) }))}</p>` : '';
  const stages = stageRows.length ? section('stages', esc(t('sec.stages')), `<p class="lead">${esc(t('stages.lead', { stage: t(`stage.${wv.biggest_stage.key}`).toLowerCase(), share: pct(wv.biggest_stage.share, 0) }))}</p>${hbars(stageRows)}${flag}`) : '';
  const fates = fateRows.some((f) => f.value > 0) ? section('fates', esc(t('sec.fates')), `<p class="lead">${esc(t('fates.lead', { kg: qty(wv.water_kg_day) }))}</p>${hbars(fateRows)}`) : '';
  let bin = '';
  if (wv.organic_share !== null) {
    bin = section('bin', esc(t('sec.bin')), `<p class="lead">${esc(t('bin.lead', { organic: pct(wv.organic_share, 0), tonnes: qty(wv.organic_t_day) }))}</p>`);
  }
  const items = Object.fromEntries(d.costs.items.map((i) => [i.id, i]));
  const rows = SWM_STAGES.map(([stage, ids]) => `<tr><th scope="row">${esc(t(`swm.${stage}`))}</th>
    <td data-label="${esc(t('swm.options'))}">${ids.filter((id) => items[id]).map((id) => esc(items[id].item)).join('; ')}</td>
    <td data-label="${esc(t('swm.cost'))}"><span class="tag tag-no">${esc(t('chain.no_cost'))}</span></td></tr>`).join('');
  const options = section('swm', esc(t('sec.swm')), `<p class="lead">${esc(t('swm.lead'))}</p>
    <div class="table-wrap"><table class="grid stack"><thead><tr><th scope="col">${esc(t('swm.stage'))}</th><th scope="col">${esc(t('swm.options'))}</th><th scope="col">${esc(t('swm.cost'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  const src = town.typed ? t('waste.source_typed') : t('waste.source', { model: d.wfd.model_version, note: d.wfd.note });
  // A typed or uploaded town with the same name as one of the 50: show the report beside the study's own result.
  let versus = '';
  const twin = town.typed ? d.towns.towns.find((x) => x.name.toLowerCase() === town.name.toLowerCase()) : null;
  if (twin) {
    const m = wfdView(twin.population_wfd, d.wfd.towns[String(twin.id)]);
    const st = (v, k) => v.stages.find((x) => x.key === k).tonnes;
    const ft = (v, k) => v.fates.find((x) => x.key === k).tonnes;
    const lines = [['plastic', wv.plastic_generated_t, m.plastic_generated_t, 't'], ['collected', wv.collected_share, m.collected_share, '%'], ['unmanaged', wv.plastic_unmanaged_t, m.plastic_unmanaged_t, 't'],
      ['unmanaged_share', wv.plastic_unmanaged_share, m.plastic_unmanaged_share, '%'], ['uncollected', st(wv, 'uncollected'), st(m, 'uncollected'), 't'], ['disposal', st(wv, 'disposal'), st(m, 'disposal'), 't'],
      ['burnt', ft(wv, 'burnt'), ft(m, 'burnt'), 't'], ['water', ft(wv, 'water'), ft(m, 'water'), 't']];
    const show = (v, u) => (u === '%' ? pct(v, 0) : qty(v));
    const body = lines.map(([k, a, b, u]) => { const big = Math.abs(a - b) > 0.05 * Math.max(Math.abs(a), Math.abs(b), 1e-9) + (u === '%' ? 0.01 : 2);
      return `<tr><th scope="row">${esc(t(`vs.${k}`))}</th><td class="num" data-label="${esc(t('vs.yours'))}">${show(a, u)}</td><td class="num" data-label="${esc(t('vs.study'))}">${show(b, u)}</td>
        <td data-label="${esc(t('vs.differs'))}">${big ? `<span class="tag tag-flip">${esc(t('vs.differs_yes'))}</span>` : ''}</td></tr>`; }).join('');
    versus = section('versus', esc(t('sec.versus', { town: twin.name })), `<p class="lead">${esc(t('vs.lead'))}</p>
      <div class="table-wrap"><table class="grid stack"><thead><tr><th scope="col">${esc(t('vs.figure'))}</th><th scope="col" class="num">${esc(t('vs.yours'))}</th><th scope="col" class="num">${esc(t('vs.study'))}</th><th scope="col">${esc(t('vs.differs'))}</th></tr></thead><tbody>${body}</tbody></table></div>
      <p class="source">${esc(t('vs.note'))}</p>`);
  }
  const head = section('waste', esc(t('sec.waste', { town: town.name })), `${tiles}<p class="source">${esc(src)}</p>`);
  return [banners(ctx), head, versus, stages, fates, bin, options].join('\n');
}

/* ---------- plan and what-if ---------- */

export function whatIfSanOut(ctx) {
  const { r, t, sfdTown, sysIdx, state } = ctx;
  const sc = sanScenario(r, sfdTown, sysIdx, { uptake: state.uptake / 100, treat: state.treat / 100 });
  const base = r.outcome.components;
  const bars = `<div class="ba"><p class="ba-label">${esc(t('wi.today'))}</p>${flowbar(base, t, 'flowbar-sm')}
    <p class="ba-label">${esc(t('wi.after'))}</p>${flowbar(sc.components, t, 'flowbar-sm')}</div>`;
  if (!sc.changed) return `${bars}<p class="muted">${esc(t('wi.san.nochange'))}</p>`;
  const lines = [];
  lines.push(`<p class="wi-head">${esc(t('wi.san.head', { before: pct(base.safe, 0), after: pct(sc.safe, 0) }))}</p>`);
  lines.push(`<p>${esc(t('wi.san.people', { persons: int(round3(sc.safe_gain_persons)) }))}</p>`);
  if (state.uptake > 0 && !sc.has_containment_option) lines.push(`<p class="warn">${esc(t('wi.san.no_option'))}</p>`);
  if (sc.moved_households > 0) lines.push(`<p>${esc(t('wi.san.moved', { households: int(round3(sc.moved_households)) }))}</p>`);
  if (sc.treated_persons > 0) lines.push(`<p>${esc(t('wi.san.treated', { persons: int(round3(sc.treated_persons)) }))}</p>`);
  if (sc.containment_cost) {
    const m = (k, f) => nf1.format(sc.containment_cost[k][f] / 1e6);
    const cls = r.placeholder_costs_in_use ? ' ph' : '';
    lines.push(`<p class="cost-line"><span class="num${cls}">${esc(t('wi.san.cost_contain', { mid: m('mid', 'upfront_total'), low: m('low', 'upfront_total'), high: m('high', 'upfront_total'), amid: m('mid', 'annual_total') }))}</span>
      ${r.placeholder_costs_in_use ? `<span class="tag tag-ph">${esc(t('ph'))}</span>` : ''}</p>`);
  }
  if (state.treat > 0) lines.push(`<p class="warn">${esc(t(sc.treatment_costed ? 'wi.san.cost_treat' : 'wi.san.cost_treat_none'))}</p>`);
  lines.push(`<p class="source">${esc(t('wi.san.basis'))}</p>`);
  return bars + lines.join('');
}

export function waysOut(ctx) {
  const { r, t, sfdTown, sysIdx, state } = ctx;
  const target = Number(state.target);
  if (!(target > 0 && target <= 100)) return '';
  const w = waysToReach(target / 100, r, sfdTown, sysIdx);
  if (w.already) return `<p class="empty">${esc(t('ways.already', { target: `${target}%`, today: pct(w.today, 0) }))}</p>`;
  const cell = (x, key) => (x.level === null ? `<span class="warn">${esc(t('ways.cannot', { max: pct(x.max, 0) }))}</span>` : esc(t(key, { level: pct(x.level, 0) })));
  const row = (label, x, key) => `<tr><th scope="row">${esc(t(label))}</th><td data-label="${esc(t('ways.needs'))}">${cell(x, key)}</td><td class="num" data-label="${esc(t('ways.max'))}">${pct(x.max, 0)}</td></tr>`;
  return `<div class="table-wrap"><table class="grid stack"><thead><tr><th scope="col">${esc(t('ways.route'))}</th><th scope="col">${esc(t('ways.needs'))}</th><th scope="col" class="num">${esc(t('ways.max'))}</th></tr></thead>
    <tbody>${row('ways.treat', w.treat_only, 'ways.treat_level')}${row('ways.contain', w.contain_only, 'ways.contain_level')}${row('ways.both', w.both, 'ways.both_level')}</tbody></table></div>`;
}

export function whatIfWasteOut(ctx) {
  const { t, wv, state } = ctx;
  if (!wv) return '';
  const col = state.wcol === null ? wv.collected_share : state.wcol / 100;
  const sc = wfdScenario(wv, { collection: col, controlled: state.wctl / 100 });
  const rows = (p) => [{ label: t('wi.waste.part_unc'), value: p.uncollected, text: `${qty(p.uncollected)} t` }, { label: t('wi.waste.part_chain'), value: p.chain, text: `${qty(p.chain)} t` },
    { label: t('wi.waste.part_disp'), value: p.disposal, text: `${qty(p.disposal)} t` }];
  // both charts share one scale so before and after can be compared by eye
  const max = Math.max(...Object.values(sc.parts_before), ...Object.values(sc.parts_after), 1e-9);
  const charts = `<div class="ba"><p class="ba-label">${esc(t('wi.today'))}</p>${hbars(rows(sc.parts_before), 'hbars-sm', max)}
    <p class="ba-label">${esc(t('wi.after'))}</p>${hbars(rows(sc.parts_after), 'hbars-sm', max)}</div>`;
  if (!sc.changed) return `${charts}<p class="muted">${esc(t('wi.san.nochange'))}</p>`;
  return `${charts}
    <p class="wi-head">${esc(t('wi.waste.head', { before: qty(sc.unmanaged_before_t), after: qty(sc.unmanaged_after_t) }))}</p>
    <p>${esc(t('wi.waste.cut', { cut: qty(sc.cut_t), share: pct(sc.cut_share, 0) }))}</p>
    <p>${esc(t('wi.waste.unc', { before: qty(wv.uncollected_t_day), after: qty(sc.uncollected_t_day_after) }))}</p>
    <p class="warn">${esc(t('wi.waste.cost'))}</p>
    <p class="source">${esc(t('wi.waste.basis'))}</p>`;
}

function slider(name, label, value, min, t) {
  return `<label class="slider"><span class="slider-label">${esc(label)}</span>
    <input type="range" name="${name}" data-lever="${name}" min="${min}" max="100" step="1" value="${value}">
    <output class="num" data-for="${name}">${value}%</output></label>`;
}

function plan(ctx) {
  const { t, town, state, wv } = ctx;
  const sanList = ctx.dec.filter((d) => d.domain === 'sanitation');
  const wasteList = ctx.dec.filter((d) => d.domain === 'waste');
  const list = section('plan', esc(t('sec.plan', { town: town.name })), `<p class="lead">${esc(t('plan.lead'))}</p>
    <h3 class="group-h">${esc(t('plan.san'))}</h3>${decisionList(sanList, ctx)}
    <h3 class="group-h">${esc(t('plan.waste'))}</h3>${wv ? decisionList(wasteList, ctx) : `<p class="empty">${esc(t('hero.waste_missing'))}</p>`}`);
  const wiSan = section('wi-san', esc(t('sec.wi_san')), `<p class="lead">${esc(t('wi.san.lead'))}</p>
    <div class="whatif"><form class="levers" data-form="levers">
      ${slider('uptake', t('wi.san.uptake'), state.uptake, 0, t)}
      ${slider('treat', t('wi.san.treat'), state.treat, 0, t)}
      <label class="field field-target"><span>${esc(t('wi.san.target'))}</span><input type="number" name="target" data-lever="target" min="1" max="100" step="1" inputmode="numeric" value="${esc(state.target)}"></label>
    </form><div class="wi-out" id="wi-san-out" aria-live="polite">${whatIfSanOut(ctx)}</div></div>
    <div id="ways-out" aria-live="polite">${waysOut(ctx)}</div>`);
  let wiWaste = '';
  if (wv) {
    const c0 = Math.round(wv.collected_share * 100);
    wiWaste = section('wi-waste', esc(t('sec.wi_waste')), `<p class="lead">${esc(t('wi.waste.lead'))}</p>
      <div class="whatif"><form class="levers" data-form="levers">
        ${slider('wcol', t('wi.waste.col'), state.wcol === null ? c0 : Math.max(c0, state.wcol), c0, t)}
        ${slider('wctl', t('wi.waste.ctl'), state.wctl, 0, t)}
      </form><div class="wi-out" id="wi-waste-out" aria-live="polite">${whatIfWasteOut(ctx)}</div></div>`);
  }
  return [banners(ctx), list, wiSan, wiWaste].join('\n');
}

/* ---------- costs ---------- */

export function costTag(item, edited, t) {
  if (edited) return `<span class="tag tag-user cost-tag">${esc(t('cost.yours'))}</span>`;
  if (item.status === 'TO FILL') return `<span class="tag tag-no cost-tag">${esc(t('cost.none'))}</span>`;
  if (item.status === 'PLACEHOLDER') return `<span class="tag tag-ph cost-tag">${esc(t('ph'))}</span>`;
  return `<span class="tag tag-yes cost-tag">${esc(t('cost.sourced'))}</span>`;
}

function costs(ctx) {
  const { t, d, state } = ctx;
  const eff = Object.fromEntries(ctx.costs.items.map((i) => [i.id, i]));
  const cats = [...new Set(d.costs.items.map((i) => i.category))];
  const input = (it, f, label) => {
    const v = eff[it.id][f];
    return `<td data-label="${esc(label)}"><input class="cost-in num" type="number" min="0" step="any" inputmode="decimal" aria-label="${esc(`${it.item}: ${label}`)}" data-cost="${it.id}" data-field="${f}" value="${v === null || v === undefined ? '' : v}"></td>`;
  };
  const body = cats.map((cat) => `<tr class="cat"><th colspan="7" scope="colgroup">${esc(cat)}</th></tr>${d.costs.items.filter((i) => i.category === cat).map((it) => `<tr data-row="${it.id}">
      <th scope="row"><span class="code">${it.id}</span> ${esc(it.item)}<span class="sub">${esc(it.unit)}${it.bearer ? `, ${esc(t('cost.paid_by', { who: it.bearer.toLowerCase() }))}` : ''}</span></th>
      ${input(it, 'cost_low', t('cost.low'))}${input(it, 'cost_high', t('cost.high'))}
      ${it.cost_type === 'Per service' ? `<td data-label="${esc(t('cost.life'))}"></td>${input(it, 'uses_per_year', t('cost.uses'))}` : `${input(it, 'lifespan_years', t('cost.life'))}<td data-label="${esc(t('cost.uses'))}"></td>`}
      <td data-label="${esc(t('cost.status'))}">${costTag(it, Boolean(state.costOverrides[it.id]), t)}</td></tr>`).join('')}`).join('');
  return `${banners(ctx)}${section('costs', esc(t('sec.costs')), `<p class="lead">${esc(t('costs.lead'))}</p>
    <p class="actions"><button type="button" class="btn" data-act="save-run">${esc(t('costs.save'))}</button>
      <label class="btn btn-file">${esc(t('costs.load'))}<input type="file" accept="application/json,.json" data-act="load-run" hidden></label>
      <button type="button" class="btn btn-quiet" data-act="reset-costs">${esc(t('costs.reset'))}</button></p>
    <p id="cost-msg" class="muted" aria-live="polite">${esc(state.costMsg || '')}</p>
    <div class="table-wrap"><table class="grid stack costs"><thead><tr><th scope="col">${esc(t('cost.item'))}</th><th scope="col">${esc(t('cost.low'))}</th><th scope="col">${esc(t('cost.high'))}</th>
      <th scope="col">${esc(t('cost.life'))}</th><th scope="col">${esc(t('cost.uses'))}</th><th scope="col">${esc(t('cost.status'))}</th></tr></thead><tbody>${body}</tbody></table></div>
    <p class="source">${esc(t('costs.note'))}</p>`)}`;
}

/* ---------- compare ---------- */

function compare(ctx) {
  const { t, town, peers, me, wpeers, wme, d } = ctx;
  const kg = (v) => `${nf2.format(v)} kg`;
  const san = section('peers', esc(t('sec.peers', { town: town.name })), `<p class="lead">${esc(t('peers.lead'))}</p>
    <div class="strips">${R.peersStrips(R.PEER_KEYS, peers, me, t)}${wme ? R.peersStrips(['collected', 'unmanaged'], wpeers, wme, t) + R.peersStrips(['water_kg'], wpeers, wme, t, kg) : ''}</div>`);
  const w = Object.fromEntries(wpeers.map((p) => [p.id, p]));
  const sfd = d.sfd.towns;
  const rows = peers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
    const f = sfd[String(p.id)].flows;
    const loss = UNSAFE.reduce((a, k) => (f[k] > f[a] ? k : a), 'f11');
    const x = w[p.id];
    return `<tr class="${p.id === town.id ? 'is-me' : ''}"><th scope="row"><button type="button" class="linkbtn" data-town="${p.id}">${esc(p.name)}</button></th>
      <td class="num" data-label="${esc(t('cmp.safe'))}">${pct(p.safe, 0)}</td>
      <td data-label="${esc(t('cmp.loss'))}"><span class="swatch seg-${loss}"></span> ${esc(t(`comp.short.${loss}`))} <span class="range">${pct(f[loss], 0)}</span></td>
      <td class="num" data-label="${esc(t('cmp.collected'))}">${pct(x.collected, 0)}</td>
      <td class="num" data-label="${esc(t('cmp.unmanaged'))}">${pct(x.unmanaged, 0)}</td>
      <td class="num" data-label="${esc(t('cmp.water'))}">${nf2.format(x.water_kg)}</td></tr>`;
  }).join('');
  const table = section('all', esc(t('sec.all')), `<p class="lead">${esc(t('all.lead'))}</p>
    <div class="table-wrap"><table class="grid stack"><thead><tr><th scope="col">${esc(t('cmp.town'))}</th><th scope="col" class="num">${esc(t('cmp.safe'))}</th><th scope="col">${esc(t('cmp.loss'))}</th>
      <th scope="col" class="num">${esc(t('cmp.collected'))}</th><th scope="col" class="num">${esc(t('cmp.unmanaged'))}</th><th scope="col" class="num">${esc(t('cmp.water'))}</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  return [banners(ctx), san, table].join('\n');
}

/* ---------- your town ---------- */

export const WFD_FIELDS = ['msw_t_day', 'collected_pct', 'plastic_generated_t', 'plastic_unmanaged_t', 'stage_uncollected_t', 'stage_collection_t', 'stage_sorting_t', 'stage_transport_t',
  'stage_disposal_t', 'fate_land_t', 'fate_water_t', 'fate_burnt_t', 'fate_drains_t', 'organic_pct'];

export function ownTotal(form, t) {
  const sum = Object.keys(form).filter((k) => k.startsWith('share_')).reduce((a, k) => a + (Number(form[k]) || 0), 0);
  const ok = sum >= 99 && sum <= 101;
  return `<span class="${ok ? 'ok' : 'warn'}">${esc(t(ok ? 'own.total_ok' : sum < 99 ? 'own.total_short' : 'own.total_over', { sum: nf1.format(sum), gap: nf1.format(Math.abs(100 - sum)) }))}</span>`;
}

function own(ctx) {
  const { t, d, state } = ctx;
  const f = state.ownForm;
  const val = (k) => esc(f[k] ?? '');
  const field = (k, label, attrs = '') => `<label class="field"><span>${esc(label)}</span><input type="${k === 'name' ? 'text' : 'number'}" name="${k}" data-own="${k}" value="${val(k)}" ${k === 'name' ? 'maxlength="60" autocomplete="off"' : 'min="0" step="any" inputmode="decimal"'} ${attrs}></label>`;
  const msgs = state.ownMsgs.length ? `<ul class="msgs">${state.ownMsgs.map((m) => `<li class="msg-${m.kind}">${esc(t(m.key, m.vars))}</li>`).join('')}</ul>` : '';
  const sysRows = d.rules.systems.filter((s) => s.code !== 'T1A3C10' || f.share_T1A3C10).map((s) => `<tr><th scope="row"><span class="code">${s.code}</span> ${esc(s.label)}</th>
    <td data-label="${esc(t('own.share'))}"><input class="cost-in num" type="number" min="0" max="100" step="any" inputmode="decimal" data-own="share_${s.code}" aria-label="${esc(`${s.label}: ${t('own.share')}`)}" value="${val(`share_${s.code}`)}"></td>
    <td data-label="${esc(t('own.emptied'))}">${s.group === 'direct' ? '' : `<input class="cost-in num" type="number" min="0" max="100" step="any" inputmode="decimal" data-own="emptied_${s.code}" aria-label="${esc(`${s.label}: ${t('own.emptied')}`)}" value="${val(`emptied_${s.code}`)}">`}</td></tr>`).join('');
  const upload = section('upload', esc(t('sec.upload')), `<p class="lead">${esc(t('upload.lead'))}</p>
    <div class="uploads">
      <label class="upload"><span class="upload-h">${esc(t('upload.sfd'))}</span><span class="sub">${esc(t('upload.sfd_sub'))}</span><input type="file" accept="application/pdf,.pdf" data-act="read-sfd"></label>
      <label class="upload"><span class="upload-h">${esc(t('upload.wfd'))}</span><span class="sub">${esc(t('upload.wfd_sub'))}</span><input type="file" accept="application/pdf,.pdf" data-act="read-wfd"></label>
    </div>
    <div id="own-msgs" aria-live="polite">${msgs}</div>`);
  const san = section('own-san', esc(t('sec.own_san')), `<p class="lead">${esc(t('own.lead'))}</p>
    <form data-form="own" class="ownform">
    <div class="fields">${field('name', t('own.name'))}${field('population', t('own.population'))}${field('households', t('own.households'))}${field('sludge_pct', t('own.sludge'), 'max="100"')}</div>
    <div class="table-wrap"><table class="grid stack"><thead><tr><th scope="col">${esc(t('gap.system'))}</th><th scope="col">${esc(t('own.share'))}</th><th scope="col">${esc(t('own.emptied'))}</th></tr></thead><tbody>${sysRows}</tbody></table></div>
    <p class="own-total" id="own-total" aria-live="polite">${ownTotal(f, t)}</p>
    <h3 class="group-h">${esc(t('own.waste_h'))}</h3><p class="lead">${esc(t('own.waste_lead'))}</p>
    <div class="fields">${WFD_FIELDS.map((k) => field(k, t(`own.w.${k}`))).join('')}</div>
    <p class="actions"><button type="button" class="btn" data-act="use-own">${esc(t('own.use'))}</button> <button type="button" class="btn btn-quiet" data-act="clear-own">${esc(t('own.clear'))}</button></p>
    </form>
    <p class="source">${esc(t('own.privacy'))}</p>`);
  return [banners(ctx), upload, san].join('\n');
}

/* ---------- sources ---------- */

function sources(ctx) {
  const { t, town, r, me, d, bench } = ctx;
  const c = r.outcome.components;
  const fmt = (b) => (b.value === null ? t('bench.missing') : b.unit === 'share' ? pct(b.value, 0) : b.unit === 'USD million' ? `US$ ${qty(b.value)} million` : qty(b.value));
  const rows = d.benchmarks.items.map((b) => `<tr><th scope="row">${esc(t(`bench.${b.id}`))}</th>
    <td class="num" data-label="${esc(t('bench.value'))}">${b.value === null ? `<span class="warn">${esc(fmt(b))}</span>` : esc(fmt(b))}</td>
    <td data-label="${esc(t('bench.scope'))}">${esc(b.scope)}${b.year ? `, ${b.year}` : ''}</td>
    <td data-label="${esc(t('bench.source'))}"><a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">${esc(b.source)}</a></td></tr>`).join('');
  const national = section('bench', esc(t('sec.bench')), `<p class="lead">${esc(t('bench.lead', { town: town.name, safe: pct(c.safe, 0), value: pct(bench.san_safe.value, 0), year: bench.san_safe.year }))}</p>
    <div class="table-wrap"><table class="grid stack"><thead><tr><th scope="col">${esc(t('bench.what'))}</th><th scope="col" class="num">${esc(t('bench.value'))}</th><th scope="col">${esc(t('bench.scope'))}</th><th scope="col">${esc(t('bench.source'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="source">${esc(t('bench.retrieved', { date: d.benchmarks.retrieved }))}</p>`);
  const links = section('links', esc(t('sec.links')), `<ul class="links">${d.benchmarks.links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(t(`link.${l.id}`))}</a><span class="sub">${esc(t(`link.${l.id}_sub`))}</span></li>`).join('')}</ul>`);
  const method = section('method', esc(t('sec.method')), `<ul class="plain">${['rank', 'chain', 'whatif', 'waste', 'costs', 'pdf'].map((k) => `<li>${esc(t(`method.${k}`))}</li>`).join('')}</ul>`);
  return [banners(ctx), national, links, R.notesSection(r, town, me, t), method].join('\n');
}

/* ---------- print sheet ---------- */

export function renderPrint(ctx) {
  const { t, town, r, wv, state } = ctx;
  const c = r.outcome.components;
  const unsafe = UNSAFE.reduce((a, k) => a + c[k], 0);
  const persons = unsafe * town.population_sfd;
  const legend = COMPONENTS.map((k) => `<li><span class="swatch seg-${k}"></span><span class="legend-name">${esc(t(`comp.${k}`))}</span><span class="legend-val num">${pct(c[k])}</span></li>`).join('');
  const dec = ctx.dec.map((d) => { const x = decisionText(d, ctx); const cost = d.cost === 'placeholder' || d.cost === 'costed' ? t(`dec.cost.${d.cost}_print`) : x.cost;
    return `<li><strong>${esc(x.title)}.</strong> ${esc(x.why)} ${esc(cost)}</li>`; }).join('');
  const sc = sanScenario(r, ctx.sfdTown, ctx.sysIdx, { uptake: state.uptake / 100, treat: state.treat / 100 });
  const what = sc.changed ? `<h2>${esc(t('print.whatif'))}</h2><p>${esc(t('print.whatif_line', { uptake: `${state.uptake}%`, treat: `${state.treat}%`, before: pct(c.safe, 0), after: pct(sc.safe, 0), persons: int(round3(sc.safe_gain_persons)) }))}</p>` : '';
  const wasteLine = wv ? `<h2>${esc(t('print.waste'))}</h2><p>${esc(t('print.waste_line', { msw: qty(wv.msw_t_day), collected: pct(wv.collected_share, 0), unmanaged: qty(wv.plastic_unmanaged_t), share: pct(wv.plastic_unmanaged_share, 0),
    water: qty(wv.water_t), stage: t(`stage.${wv.biggest_stage.key}`).toLowerCase(), stage_share: pct(wv.biggest_stage.share, 0) }))}</p>` : '';
  return `<header><p class="print-app">${esc(t('app.title'))}</p><h1>${esc(town.name)}${town.district ? `, ${esc(town.district)}` : ''}</h1>
      <p>${esc(t('print.facts', { population: int(town.population_sfd), households: int(Math.round(r.households.households)), gw: t(r.settings.gw === 'high' ? 'set.gw_high' : 'print.gw_low') }))}</p></header>
    <p class="banner">${esc(t('print.banner'))}</p>
    <h2>${esc(t('print.san'))}</h2>
    <div class="print-fig">${waffle(c, t)}<div><p>${esc(t('hero.san_load', { share: pct(unsafe, 0), persons: int(round3(persons)), tonnes: qty(faecesTonnes(ctx, persons)) }))}</p><ul class="legend legend-tight">${legend}</ul></div></div>
    ${wasteLine}
    <h2>${esc(t('print.plan'))}</h2><ol class="print-dec">${dec}</ol>
    ${what}
    <footer><p>${esc(town.typed ? t('print.source_typed') : t('print.source', { date: town.sfd.date, by: town.sfd.prepared_by }))}</p><p>${esc(t('print.foot', { date: ctx.today, rules: ctx.d.rules.data_version }))}</p></footer>`;
}

const VIEW = { overview, sanitation, waste, plan, costs, compare, own, sources };

export function renderTab(ctx) {
  return (VIEW[ctx.state.tab] || overview)(ctx);
}
