// The page's views as HTML strings: landing (upload), check (what was read), and the workspace
// (verdict, the drain and its sandbox, the sizing bridge, the evidence). No DOM access, so every view is testable in Node.
// System references from the SFD matrix are never shown: every system has a plain name in the strings file.

import { esc, int, pct, people, qty } from './util.js';
import { drainScene, sceneScale } from './scene.js';
import { WFD_FIELDS, COUNTRIES } from './context.js';
import { rankOf } from '../engine/drain.js';

const has = (form, re) => Object.keys(form).some((k) => re.test(k) && String(form[k]).trim() !== '' && Number(form[k]) > 0);
export const formHasSfd = (form) => has(form, /^share_/);
export const formHasWfd = (form) => WFD_FIELDS.some((k) => String(form[k] ?? '').trim() !== '');

/* ---------- landing ---------- */

export function renderLanding(state, d, t) {
  const reading = state.reading.length
    ? `<ul class="reading" aria-live="polite">${state.reading.map((m) => `<li class="read-${m.kind}">${esc(t(m.key, m.vars))}</li>`).join('')}</ul>` : '';
  const towns = d.towns.towns.slice().sort((a, b) => a.name.localeCompare(b.name));
  const sample = state.showSample ? `<div class="sample">
      <label for="sample-town">${esc(t('land.sample_pick'))}</label>
      <select id="sample-town">${towns.map((x) => `<option value="${x.id}"${x.name === 'Ishwardi' ? ' selected' : ''}>${esc(x.name)}${x.district ? `, ${esc(x.district)}` : ''}</option>`).join('')}</select>
      <button type="button" class="btn" data-act="open-sample">${esc(t('land.sample_open'))}</button>
    </div>` : '';
  return `<section class="landing">
    <h1 class="display">${esc(t('land.h1'))}</h1>
    <p class="lede">${esc(t('land.lede'))}</p>
    <label class="drop" id="drop" for="files">
      <input type="file" id="files" class="visually-hidden" accept="application/pdf,.pdf,.xlsx" multiple data-act="files">
      <svg class="drop-mark" viewBox="0 0 64 64" aria-hidden="true"><path d="M14 8h22l10 10v32H14z"/><path d="M36 8v10h10"/><path d="M24 20h26l-0 36H24" class="sheet2"/><path d="M32 44V30m-6 6 6-6 6 6"/></svg>
      <span class="drop-title">${esc(t('land.drop'))}</span>
      <span class="drop-sub">${esc(t('land.drop_sub'))}</span>
    </label>
    ${reading}
    <p class="quiet">${esc(t('land.private'))}</p>
    <div class="alt">
      <button type="button" class="link" data-act="show-sample">${esc(t('land.sample'))}</button>
      <button type="button" class="link" data-act="manual">${esc(t('land.manual'))}</button>
      <button type="button" class="link" data-act="wb-blank">${esc(t('land.blank'))}</button>
    </div>
    ${sample}
  </section>`;
}

/* ---------- check ---------- */

const field = (form, key, label, cls = '') => `<label class="fld ${cls}"><span>${esc(label)}</span><input type="text" inputmode="decimal" autocomplete="off" data-own="${key}" value="${esc(form[key] ?? '')}"></label>`;

export function shareTotal(form, t) {
  const sum = Object.keys(form).filter((k) => k.startsWith('share_')).reduce((a, k) => a + (Number(form[k]) || 0), 0);
  const ok = sum >= 99 && sum <= 101;
  return `<p class="total ${ok ? 'total-ok' : 'total-bad'}">${esc(t(ok ? 'check.sum_ok' : 'check.sum_bad', { sum: sum.toFixed(1), gap: Math.abs(100 - sum).toFixed(1) }))}</p>`;
}

function sfdCard(state, sysIdx, t) {
  const f = state.ownForm;
  const codes = Object.keys(sysIdx);
  const present = codes.filter((c) => Number(f[`share_${c}`]) > 0);
  if (!present.length && !state.manual) {
    return `<article class="card card-empty"><h2>${esc(t('check.sfd_h'))}</h2><p>${esc(t('check.sfd_none'))}</p>
      <label class="btn btn-quiet">${esc(t('check.add_sfd'))}<input type="file" class="visually-hidden" accept="application/pdf,.pdf" data-act="files"></label>
      <button type="button" class="link" data-act="manual">${esc(t('land.manual'))}</button></article>`;
  }
  const absent = codes.filter((c) => !present.includes(c));
  const rows = present.map((c) => `<tr><th scope="row">${esc(t(`sys.${c}`))}</th><td class="num">${esc(f[`share_${c}`])}%</td>
      <td class="num">${sysIdx[c].group === 'direct' ? '' : (String(f[`emptied_${c}`] ?? '').trim() === '' ? `<span class="miss">${esc(t('check.blank'))}</span>` : `${esc(f[`emptied_${c}`])}%`)}</td></tr>`).join('');
  const blank = present.filter((c) => sysIdx[c].group !== 'direct' && String(f[`emptied_${c}`] ?? '').trim() === '');
  const needSludge = present.some((c) => sysIdx[c].group === 'septic') && String(f.sludge_pct ?? '').trim() === '';
  const sum = present.reduce((a, c) => a + Number(f[`share_${c}`]), 0);
  const gap = sum < 99 || sum > 101;
  const asks = [];
  if (gap || state.manual) asks.push(`<div class="ask"><p>${esc(t(state.manual && !present.length ? 'check.ask_manual' : 'check.ask_gap'))}</p>
      <div class="ask-grid">${absent.map((c) => field(f, `share_${c}`, t(`sys.${c}`), 'fld-pct')).join('')}</div></div>`);
  if (blank.length) asks.push(`<div class="ask"><p>${esc(t('check.ask_emptied'))}</p>
      <div class="ask-grid">${blank.map((c) => field(f, `emptied_${c}`, t(`sys.${c}`), 'fld-pct')).join('')}</div></div>`);
  if (needSludge) asks.push(`<div class="ask"><p>${esc(t('check.ask_sludge'))}</p><div class="ask-grid">${field(f, 'sludge_pct', t('check.sludge'), 'fld-pct')}</div></div>`);
  const edit = present.length ? `<details class="fix"><summary>${esc(t('check.fix'))}</summary><div class="ask-grid">
      ${present.map((c) => field(f, `share_${c}`, t('check.share_of', { name: t(`sys.${c}`) }), 'fld-pct') + (sysIdx[c].group === 'direct' || blank.includes(c) ? '' : field(f, `emptied_${c}`, t('check.emptied_of', { name: t(`sys.${c}`) }), 'fld-pct'))).join('')}
      ${needSludge ? '' : field(f, 'sludge_pct', t('check.sludge'), 'fld-pct')}</div></details>` : '';
  return `<article class="card"><h2>${esc(t('check.sfd_h'))}</h2>
    ${present.length ? `<table class="read"><thead><tr><th scope="col">${esc(t('check.col_sys'))}</th><th scope="col" class="num">${esc(t('check.col_share'))}</th><th scope="col" class="num">${esc(t('check.col_emptied'))}</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
    <div id="share-total">${shareTotal(f, t)}</div>
    ${asks.join('')}${edit}</article>`;
}

function wfdCard(state, t) {
  const f = state.ownForm;
  const present = WFD_FIELDS.filter((k) => String(f[k] ?? '').trim() !== '');
  if (!present.length && !state.manual) {
    return `<article class="card card-empty"><h2>${esc(t('check.wfd_h'))}</h2><p>${esc(t('check.wfd_none'))}</p>
      <label class="btn btn-quiet">${esc(t('check.add_wfd'))}<input type="file" class="visually-hidden" accept="application/pdf,.pdf" data-act="files"></label></article>`;
  }
  const absent = WFD_FIELDS.filter((k) => !present.includes(k));
  const rows = present.map((k) => `<tr><th scope="row">${esc(t(`w.${k}`))}</th><td class="num">${esc(f[k])}</td></tr>`).join('');
  const ask = absent.length ? `<div class="ask"><p>${esc(t(present.length ? 'check.ask_wfd' : 'check.ask_wfd_manual'))}</p><div class="ask-grid">${absent.map((k) => field(f, k, t(`w.${k}`))).join('')}</div></div>` : '';
  const edit = present.length ? `<details class="fix"><summary>${esc(t('check.fix'))}</summary><div class="ask-grid">${present.map((k) => field(f, k, t(`w.${k}`))).join('')}</div></details>` : '';
  return `<article class="card"><h2>${esc(t('check.wfd_h'))}</h2>
    ${present.length ? `<table class="read"><tbody>${rows}</tbody></table><p class="fine">${esc(t('check.wfd_units'))}</p>` : ''}${ask}${edit}</article>`;
}

export function renderCheck(state, sysIdx, t) {
  const f = state.ownForm;
  const msgs = state.msgs.length ? `<ul class="msgs">${state.msgs.map((m) => `<li class="msg-${m.kind}">${esc(t(m.key, m.vars))}</li>`).join('')}</ul>` : '';
  return `<section class="check">
    <h1 class="display display-sm">${esc(t('check.h1'))}</h1>
    <p class="lede">${esc(t('check.lede'))}</p>
    <div class="town-fields">
      ${field(f, 'name', t('check.name'), 'fld-wide')}${field(f, 'population', t('check.population'))}${field(f, 'households', t('check.households'))}
      <label class="fld"><span>${esc(t('check.country'))}</span><select data-act="country"><option value="">${esc(t('check.country_pick'))}</option>
        ${COUNTRIES.map((c) => `<option${state.country === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}<option value="other"${state.country === 'other' ? ' selected' : ''}>${esc(t('check.country_other'))}</option></select></label>
    </div>
    <div class="check-grid">${sfdCard(state, sysIdx, t)}${wfdCard(state, t)}</div>
    <div id="check-msgs">${msgs}</div>
    <div class="check-foot">
      <button type="button" class="btn btn-main" data-act="analyse">${esc(t('check.go'))}</button>
      <button type="button" class="link" data-act="restart">${esc(t('check.restart'))}</button>
    </div>
  </section>`;
}

/* ---------- workspace ---------- */

function badge(kind, text) {
  const icon = { ok: 'M5 12l5 5 9-10', warn: 'M12 7v6m0 4v.5', plain: 'M7 12h10' }[kind];
  return `<span class="badge badge-${kind}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg>${esc(text)}</span>`;
}

export function sourceBadges(ctx) {
  const { t, listing, isOwn, meta, r, wv } = ctx;
  const out = [];
  if (r) {
    if (listing.status === 'listed') out.push(badge('ok', t('badge.sfd_listed', { year: listing.entry.year || t('badge.no_year') })));
    else if (listing.status === 'not_listed') out.push(badge('warn', t('badge.sfd_not_listed')));
    else out.push(badge('plain', t('badge.sfd_not_checked')));
    if (isOwn && meta.basis && meta.basis.sfd !== 'uploaded') out.push(badge('warn', t(`badge.basis_${meta.basis.sfd}`, { what: 'SFD' })));
  }
  if (wv) {
    if (!isOwn) out.push(badge('plain', t('badge.wfd_dataset')));
    else if (meta.wfd_portal && meta.basis && meta.basis.wfd === 'uploaded') out.push(badge('ok', t('badge.wfd_portal', { v: meta.wfd_version || '?' })));
    else out.push(badge('warn', t(`badge.basis_${meta.basis ? meta.basis.wfd : 'typed'}`, { what: 'WFD' })));
  }
  return out.join('');
}

/** One line saying what the figures rest on: shown under the town name and printed on the PDF. */
export function basisLine(ctx) {
  const { t, town, isOwn, meta, r, wv } = ctx;
  if (!isOwn) return t('basis.published', { date: town.sfd.date, by: town.sfd.prepared_by });
  const b = meta.basis || { sfd: r ? 'typed' : 'none', wfd: wv ? 'typed' : 'none' };
  if (b.sfd === 'uploaded' && b.wfd === 'uploaded') return t('basis.uploaded_both');
  return t('basis.mixed', { sfd: t(`basis.b.${b.sfd}`), wfd: t(`basis.b.${b.wfd}`) });
}

export function flagText(f, ctx) {
  const { t } = ctx;
  const v = f.vars;
  const m = {
    compound: () => ({ persons: people(v.persons), tonnes: qty(v.tonnes), both: v.both, n: v.n }),
    safe_mismatch: () => ({ stated: pct(v.stated), rebuilt: pct(v.rebuilt) }),
    shares_filled: () => ({ sum: v.sum === null ? '' : pct(v.sum, 1) }),
    gw_dependence: () => ({ share: pct(v.share), persons: people(v.persons) }),
    household_size: () => ({ pph: v.pph.toFixed(1) }),
    sfd_old: () => ({ years: v.years, date: v.date }),
    wfd_balance: () => ({ sum: pct(v.sum) }),
    population_gap: () => ({ sfd: int(v.sfd), wfd: int(v.wfd) }),
    generation_low: () => ({ kg: v.kg.toFixed(2), median: v.median.toFixed(2), n: v.n }),
    generation_high: () => ({ kg: v.kg.toFixed(2), median: v.median.toFixed(2), n: v.n }),
    portal_differs: () => ({ ours: int(v.ours), portal: int(v.portal) }),
    dumpsite_low: () => ({ share: pct(v.share) }),
    town_note: () => ({ text: v.text }),
  }[f.id];
  const key = f.id === 'shares_filled' && v.sum === null ? 'flag.shares_edited' : `flag.${f.id}`;
  return t(key, m ? m() : {});
}

export function actionCard(a, ctx) {
  const { t, full } = ctx;
  const line = (id) => full.lines.find((l) => l.id === id);
  let title; let why; let takes;
  if (a.id === 'treat') {
    title = t('act.treat'); why = t('act.treat_why', { persons: people(a.persons), share: pct(a.share) });
    const [v, f, b] = [line('vehicles'), line('fstp'), line('beds')];
    takes = v ? t('act.treat_takes', { vehicles: int(v.units.value), m3: qty(f.units.value), m2: int(b.units.value) }) : '';
  } else if (a.id === 'contain') {
    title = t(`opt.${a.name}`); why = t('act.contain_why', { households: people(a.households), persons: people(a.persons) });
    takes = t('act.contain_takes', { households: people(a.households) });
  } else if (a.id === 'no_option_gw') {
    title = t('act.shared'); why = t('act.shared_why', { persons: people(a.persons) });
    const l = line('shared_treatment'); takes = l ? t('act.shared_takes', { flow: int(l.units.value) }) : '';
  } else if (a.id === 'collect') {
    title = t('act.collect'); why = t('act.collect_why', { share: pct(1 - a.collected), tonnes: qty(a.tonnes_day) });
    const l = line('collection'); takes = l ? t('act.collect_takes', { vans: int(l.units.value), to: pct(l.deficit.to) }) : '';
  } else if (a.id === 'dumpsite') {
    title = t('act.dumpsite'); why = t('act.dumpsite_why', { tonnes: int(a.tonnes_year) }); takes = t('act.unsized');
  } else if (a.id === 'organics') {
    title = t('act.organics'); why = t('act.organics_why', { share: pct(a.share), tonnes: qty(a.tonnes_day) });
    const l = line('compost'); takes = l ? t('act.organics_takes', { capacity: int(l.units.value), compost: qty(l.units.compost_t_day) }) : '';
  } else {
    title = t('act.handling'); why = t('act.handling_why', { share: pct(a.share) }); takes = t('act.unsized');
  }
  return `<li class="action action-${a.domain}"><h3>${esc(title)}</h3><p>${esc(why)}</p>${takes ? `<p class="takes">${esc(takes)}</p>` : ''}
    ${a.lever ? `<button type="button" class="link" data-act="try" data-lever="${a.lever}">${esc(t('act.try'))}</button>` : ''}</li>`;
}

export function verdictSection(ctx) {
  const { t, town, verdict: v, flags: fl } = ctx;
  const s = v.sanitation;
  const san = s ? `<h2 class="verdict-line">${esc(t(`fail.${s.key}`, { town: town.name }))}</h2>
    <p class="verdict-sub">${esc(t(s.key === 'mostly_safe' ? 'fail.sub_safe' : 'fail.sub', { persons: people(s.persons), share: pct(s.share), safe: pct(s.safe), unsafe: people(s.unsafe_persons) }))}</p>` : '';
  const w = v.waste;
  const waste = w ? `<${s ? 'p' : 'h2'} class="${s ? 'verdict-waste' : 'verdict-line'}">${esc(t(`fail.waste_${w.stage}`, { town: town.name, uncollected: pct(w.uncollected_share), tonnes: qty(w.uncollected_t_day), stage_share: pct(w.stage_share) }))}</${s ? 'p' : 'h2'}>
    <p class="verdict-sub">${esc(t('fail.waste_sub', { unmanaged: int(w.unmanaged_t), share: pct(w.unmanaged_share), water: qty(w.water_t), drain: qty(w.drain_t) }))}</p>` : '';
  const top = fl.filter((f) => f.id !== 'town_note').slice(0, 3);
  const flagsHtml = top.length
    ? `<ul class="flaglist">${top.map((f) => `<li class="flag flag-${f.level}">${esc(flagText(f, ctx))}</li>`).join('')}</ul>`
    : `<p class="flag-none">${esc(t('flag.none'))}</p>`;
  const more = fl.length > top.length ? `<a class="link" href="#evidence">${esc(t('flag.more', { n: fl.length }))}</a>` : '';
  return `<section class="verdict" id="verdict" aria-labelledby="verdict-h">
    <div class="verdict-head" id="verdict-h">${san}${waste}</div>
    <div class="verdict-grid">
      <div class="first"><h3 class="minor">${esc(t('verdict.actions'))}</h3><ol class="actions">${v.actions.map((a) => actionCard(a, ctx)).join('')}</ol></div>
      <div class="checks"><h3 class="minor">${esc(t('verdict.flags'))}</h3>${flagsHtml}${more}</div>
    </div>
  </section>`;
}

/* ----- the drain and its sandbox ----- */

export function sceneBlock(ctx) {
  const { t, ex0, ex1, pl0, pl1 } = ctx;
  const sc = sceneScale(ex0, pl0);
  const labels = `<span class="lab lab-drain">${esc(t('rcv.drain'))}</span><span class="lab lab-water">${esc(t('rcv.water'))}</span><span class="lab lab-ground">${esc(t('rcv.ground'))}</span>
    ${ex0 ? `<span class="lab lab-dumped">${esc(t('rcv.dumped'))}</span>` : ''}${pl0 ? `<span class="lab lab-burnt">${esc(t('rcv.burnt'))}</span>` : ''}`;
  const key = [ex0 ? `<span class="key"><svg viewBox="0 0 12 12" aria-hidden="true"><circle class="dot" cx="6" cy="6" r="4.2"/></svg>${esc(t('scene.key_dot', { n: int(sc.perDot) }))}</span>` : '',
    pl0 ? `<span class="key"><svg viewBox="0 0 14 12" aria-hidden="true"><rect class="fleck" x="2" y="3.5" width="10" height="5" rx="1"/></svg>${esc(t('scene.key_fleck', { n: qty(sc.perFleck) }))}</span>` : '',
    `<span class="key key-note">${esc(t('scene.schematic'))}</span>`].join('');
  return `<div class="scene-box">${drainScene({ ex0, ex1, pl0, pl1, label: esc(t('scene.aria')) })}${labels}</div><div class="scene-key">${key}</div>`;
}

export function receiversBlock(ctx) {
  const { t, ex0, ex1, pl0, pl1, touched } = ctx;
  const row = (cls, now, was, fmt, unitKey) => {
    const changed = touched && Math.abs(now - was) > 1e-9;
    return `<p class="load load-${cls}"><span class="load-n num">${fmt(now)}</span> <span class="load-u">${esc(t(unitKey))}</span>${changed ? `<span class="load-was">${esc(t('rcv.was', { n: fmt(was) }))}</span>` : ''}</p>`;
  };
  const card = (k, exKey, plKey) => {
    const e = ex0 && exKey ? row('ex', ex1.receivers[exKey].persons, ex0.receivers[exKey].persons, people, 'rcv.u_people') : '';
    const p = pl0 && plKey ? row('pl', pl1.receivers[plKey].tonnes, pl0.receivers[plKey].tonnes, qty, 'rcv.u_tonnes') : '';
    return `<div class="rcv rcv-${k}"><h3>${esc(t(`rcv.${k}`))}</h3>${e}${p}<p class="rcv-note">${esc(t(`rcv.${k}_note`))}</p></div>`;
  };
  return card('drain', 'drain', 'drain') + card('water', 'water', 'water') + card('ground', 'ground', 'ground')
    + `<div class="rcv rcv-unseen"><h3>${esc(t('rcv.unseen'))}</h3>
      ${ex0 ? row('ex', ex1.receivers.dumped.persons, ex0.receivers.dumped.persons, people, 'rcv.u_dumped') : ''}
      ${pl0 ? row('pl', pl1.receivers.burnt.tonnes, pl0.receivers.burnt.tonnes, qty, 'rcv.u_burnt') : ''}
      <p class="rcv-note">${esc(t('rcv.unseen_note'))}</p></div>`;
}

export function readoutBlock(ctx) {
  const { t, r, sc, wv, ws, touched, recovered } = ctx;
  const items = [];
  if (r) {
    const now = sc.safe; const was = r.outcome.components.safe;
    items.push(`<div class="ro"><dt>${esc(t('ro.safe'))}</dt><dd><span class="num big">${pct(now)}</span>${touched && Math.abs(now - was) > 1e-9 ? `<span class="ro-was">${esc(t('rcv.was', { n: pct(was) }))}</span>` : ''}</dd></div>`);
  }
  if (wv) {
    items.push(`<div class="ro"><dt>${esc(t('ro.plastic'))}</dt><dd><span class="num big">${int(ws.unmanaged_after_t)}</span> ${esc(t('ro.t_year'))}${touched && ws.changed ? `<span class="ro-was">${esc(t('rcv.was', { n: int(ws.unmanaged_before_t) }))}</span>` : ''}</dd></div>`);
  }
  const rec = [];
  if (touched && recovered.compost_t_day !== null) rec.push(t('ro.compost', { n: qty(recovered.compost_t_day) }));
  if (touched && recovered.sludge_solids_t_year !== null && ctx.levers.treat > 0) rec.push(t('ro.solids', { n: int(recovered.sludge_solids_t_year) }));
  if (rec.length) items.push(`<div class="ro ro-wide"><dt>${esc(t('ro.recovered'))}</dt><dd>${esc(rec.join(' '))}</dd></div>`);
  return `<dl class="readout">${items.join('')}</dl>`;
}

function slider(id, label, value, min, hint, t) {
  return `<label class="lever" for="lv-${id}"><span class="lever-l">${esc(label)}</span><output class="num" id="out-${id}" for="lv-${id}">${value}%</output>
    <input type="range" id="lv-${id}" data-lever="${id}" min="${min}" max="100" step="1" value="${value}">${hint ? `<span class="lever-h">${esc(hint)}</span>` : ''}</label>`;
}

export function leversBlock(ctx) {
  const { t, r, wv, state } = ctx;
  const out = [`<div class="presets"><button type="button" class="chip" data-act="preset" data-preset="today">${esc(t('lv.today'))}</button><button type="button" class="chip" data-act="preset" data-preset="full">${esc(t('lv.full'))}</button></div>`];
  if (r) {
    out.push(slider('uptake', t('lv.uptake'), state.uptake, 0, r.summary.options.length ? '' : t('lv.uptake_none'), t));
    out.push(slider('treat', t('lv.treat'), state.treat, 0, '', t));
  }
  if (wv) {
    const c0 = Math.round(wv.collected_share * 100);
    out.push(slider('wcol', t('lv.collection'), state.wcol === null ? c0 : Math.max(c0, state.wcol), c0, t('lv.collection_h', { now: `${c0}%` }), t));
    out.push(slider('wctl', t('lv.controlled'), state.wctl, 0, '', t));
    if (wv.organic_share) out.push(`<label class="toggle"><input type="checkbox" data-lever="compost"${state.compost ? ' checked' : ''}> <span>${esc(t('lv.compost', { share: pct(wv.organic_share) }))}</span></label>`);
  }
  if (r) out.push(`<label class="toggle toggle-test"><input type="checkbox" data-lever="gw"${state.gw === 'high' ? ' checked' : ''}> <span>${esc(t('lv.gw'))}</span></label>`);
  return out.join('');
}

export function sandboxSection(ctx) {
  const { t, r, wv } = ctx;
  const one = !r ? `<p class="one-report">${esc(t('box.no_sfd'))}</p>` : !wv ? `<p class="one-report">${esc(t('box.no_wfd'))}</p>` : '';
  return `<section class="sandbox" id="sandbox" aria-labelledby="box-h">
    <h2 id="box-h">${esc(t('box.h'))}</h2>
    <p class="section-lede">${esc(t('box.lede'))}</p>${one}
    <div class="box-grid">
      <figure class="scene-wrap" id="scene">${sceneBlock(ctx)}</figure>
      <form class="levers" id="levers" aria-label="${esc(t('lv.aria'))}">${leversBlock(ctx)}<div id="readout">${readoutBlock(ctx)}</div></form>
    </div>
    <div class="receivers" id="receivers">${receiversBlock(ctx)}</div>
    <p class="fine">${esc(t('box.fine'))}</p>
  </section>`;
}

/* ----- the sizing bridge ----- */

const UNIT = { households: 'u.households', people: 'u.people', vehicles: 'u.vehicles', m3_day: 'u.m3_day', m3_year: 'u.m3_year', kg_ts_year: 'u.kg_ts_year', m2: 'u.m2', vans: 'u.vans', t_day: 'u.t_day', t_day_capacity: 'u.t_day_capacity', decimals: 'u.decimals' };

function lineText(l, ctx) {
  const { t, rules, d } = ctx;
  const u = (k) => t(UNIT[k]);
  const dv = l.deficit;
  const title = l.kind === 'contain' ? t(`opt.${l.name}`) : t(`line.${l.kind}`);
  let deficit; let rule; let units = `${int(l.units.value)} ${u(l.units.unit)}`;
  const lvl = (x) => (x < 1 ? t('line.level', { level: pct(x) }) : '');
  if (l.kind === 'contain') { deficit = t('line.contain_def', { n: int(dv.value) }) + lvl(dv.level); rule = t('rule.one_per_household'); units = t('line.contain_units', { n: int(l.units.value) }); }
  else if (l.kind === 'shared_treatment') { deficit = t('line.shared_def', { n: people(dv.value) }) + lvl(dv.level); rule = t('rule.flow', { l: rules.wastewater_l_cap_day }); }
  else if (l.kind === 'vehicles') { deficit = t('line.vehicles_def', { n: int(dv.households) }) + lvl(dv.level); rule = t('rule.vehicles', { years: rules.empty_interval_years, n: int(dv.emptyings), trips: rules.trips_per_vehicle_day, days: rules.working_days }); }
  else if (l.kind === 'fstp') { deficit = t('line.fstp_def', { n: int(dv.emptyings) }); rule = t('rule.fstp', { vol: rules.volume_per_emptying_m3, total: int(dv.volume), days: rules.working_days }); units = `${qty(l.units.value)} ${u('m3_day')}`; }
  else if (l.kind === 'beds') { deficit = t('line.beds_def', { n: int(dv.volume) }); rule = t('rule.beds', { ts: rules.sludge_ts_kg_m3, solids: int(dv.value), load: rules.drying_bed_loading }); }
  else if (l.kind === 'collection') { deficit = t('line.collection_def', { n: qty(dv.value), from: pct(dv.from), to: pct(dv.to) }); rule = t('rule.collection', { t: rules.collection_vehicle_t_day }); }
  else if (l.kind === 'compost') { deficit = t('line.compost_def', { n: qty(dv.value), share: pct(dv.organic) }); rule = t('rule.compost', { capture: pct(rules.organic_capture), at: qty(dv.at_plant), mod: rules.compost_module_t_day, yield: rules.compost_yield });
    units = t('line.compost_units', { modules: l.units.modules, cap: int(l.units.value), compost: qty(l.units.compost_t_day) }); }
  else if (l.kind === 'land') { deficit = t('line.land_def', { n: qty(dv.value) }); rule = t('rule.land', { per: rules.land_decimals_per_m3_day }); units = `${int(l.units.value)} ${u('decimals')}`; }
  else if (l.kind === 'bins') { deficit = t('line.bins_def', { n: int(dv.value), from: pct(dv.from), to: pct(dv.to) }); rule = t('rule.bins'); units = `${int(l.units.value)} ${u('households')}`; }
  else { deficit = t('line.disposal_def', { n: qty(dv.value) }); rule = t('rule.none'); units = t('line.unsized'); }
  if (l.units.existing !== undefined) units = t(l.units.value > 0 ? 'line.after_existing' : 'line.covered', { units, need: qty(l.units.need), have: qty(l.units.existing) });
  const statuses = l.rule.ids.map((id) => d.sizing.rules.find((x) => x.id === id).status);
  const tag = l.kind === 'land' ? 'cited' : l.kind === 'contain' || l.kind === 'bins' || !statuses.length ? (l.kind === 'disposal' ? null : 'assumption') : statuses.every((s) => s === 'CITED') ? 'cited' : statuses.some((s) => s === 'CITED') ? 'mixed' : 'assumption';
  return { title, deficit, rule, units, tag };
}

export function lineTotals(l, ctx) {
  const { t, state } = ctx;
  if (l.unsized) return `<span class="none">${esc(t('line.unsized'))}</span>`;
  if (l.capex_total === null && l.opex_total === null) return `<span class="none">${esc(t('line.no_rate'))}</span>`;
  const cur = ctx.currency ? `${ctx.currency} ` : '';
  const range = l.capex_range && l.capex_range.high > l.capex_range.low ? `<span class="per-year">${esc(`${cur}${int(l.capex_range.low)} to ${int(l.capex_range.high)}`)}</span>` : '';
  return `${l.capex_total !== null ? `<span class="num big">${esc(cur)}${int(l.capex_total)}</span>` : ''}${range}${l.opex_total !== null && l.opex_total > 0 ? `<span class="per-year">${esc(t('line.per_year', { n: `${cur}${int(l.opex_total)}` }))}</span>` : ''}
    <span class="tag tag-${l.rate.source}">${esc(t(`rate.${l.rate.source}`))}</span>`;
}

function bridgeLine(l, ctx) {
  const { t, state } = ctx;
  const x = lineText(l, ctx);
  const user = state.rates[l.id] || {};
  const eng = l.rate.source === 'engineer' || l.rate.source === 'included' || (l.rate.source === 'user' && l.rate.low !== null);
  const hint = (v, k) => (eng && l.rate.source !== 'user' ? ` placeholder="${esc(t('rate.eng_hint', { n: int(l.rate[k] || 0) }))}"` : v !== null && v > 0 ? ` placeholder="${esc(t('rate.hint', { n: int(v) }))}"` : '');
  const val = (k) => (user[k] !== undefined && user[k] !== null ? user[k] : l.rate.source === 'reviewed' && l.rate[k] !== null ? l.rate[k] : '');
  const rates = l.unsized ? `<span class="none">${esc(t('line.unsized'))}</span>` : `
      <label class="rate"><span>${esc(t('rate.capex', { unit: t(`per.${l.rate_unit}`) }))}</span><input type="text" inputmode="decimal" autocomplete="off" data-rate="capex" data-line="${esc(l.id)}" value="${esc(val('capex'))}"${hint(l.rate.hint_capex, 'capex')}></label>
      <label class="rate"><span>${esc(t('rate.opex', { unit: t(`per.${l.rate_unit}`) }))}</span><input type="text" inputmode="decimal" autocomplete="off" data-rate="opex" data-line="${esc(l.id)}" value="${esc(val('opex'))}"${hint(l.rate.hint_opex, 'opex')}></label>
      ${l.rate.note ? `<p class="rate-note">${esc(l.rate.low !== null && l.rate.low !== undefined && !(l.rate.source === 'included')
    ? t('rate.eng_note', { items: l.rate.eng_items.join(' + '), years: l.rate.price_years.join(', ') || t('rate.no_year'), low: int(l.rate.low), high: int(l.rate.high), typ: int(l.rate.source === 'user' ? (l.rate.low + l.rate.high) / 2 : l.rate.capex), unit: t(`per.${l.rate_unit}`), note: l.rate.note })
    : t('rate.eng_blank', { note: l.rate.note }))}</p>` : ''}`;
  return `<article class="line line-${l.domain}"><h3>${esc(x.title)}</h3>
    <ol class="bridge">
      <li><span class="k">${esc(t('br.deficit'))}</span><span class="v">${esc(x.deficit)}</span></li>
      <li><span class="k">${esc(t('br.rule'))}${x.tag ? ` <span class="tag tag-${x.tag}">${esc(t(`tag.${x.tag}`))}</span>` : ''}</span><span class="v">${esc(x.rule)}</span></li>
      <li><span class="k">${esc(t('br.units'))}</span><span class="v strong">${esc(x.units)}</span></li>
      <li><span class="k">${esc(t('br.rates'))}</span><span class="v rates">${rates}</span></li>
      <li><span class="k">${esc(t('br.total'))}</span><span class="v" data-total="${esc(l.id)}">${lineTotals(l, ctx)}</span></li>
    </ol></article>`;
}

export function totalsBlock(ctx) {
  const { t, sizing, state } = ctx;
  const tt = sizing.totals;
  if (!sizing.lines.length) return '';
  if (!tt.priced) return `<p class="totals totals-none">${esc(t('tot.none'))}</p>`;
  const cur = ctx.currency ? `${ctx.currency} ` : '';
  const hh = sizing.lines.filter((l) => l.kind === 'contain').reduce((a, l) => a + (l.capex_total || 0), 0);
  return `<p class="totals"><span class="tot-k">${esc(t('tot.capex'))}</span> <span class="num big">${esc(cur)}${int(tt.capex)}</span>
    ${tt.opex > 0 ? `<span class="tot-k">${esc(t('tot.opex'))}</span> <span class="num big">${esc(cur)}${int(tt.opex)}</span>` : ''}
    <span class="tot-note">${esc(t(tt.unpriced ? 'tot.partial' : 'tot.all', { priced: tt.priced, total: tt.priced + tt.unpriced }))}</span>
    ${tt.any_engineer && tt.capex_high > tt.capex_low ? `<span class="tot-note">${esc(t('tot.range', { low: `${cur}${int(tt.capex_low)}`, high: `${cur}${int(tt.capex_high)}` }))}</span>` : ''}
    ${hh > 0 && tt.capex > 0 ? `<span class="tot-note">${esc(t('tot.household', { n: `${cur}${int(hh)}`, share: pct(hh / tt.capex) }))}</span>` : ''}</p>`;
}

export function bridgeBlock(ctx) {
  const { t, sizing, touched } = ctx;
  if (!sizing.lines.length) return `<p class="empty">${esc(t('size.none'))}</p>`;
  const san = sizing.lines.filter((l) => l.domain === 'sanitation');
  const waste = sizing.lines.filter((l) => l.domain === 'waste');
  return `<p class="basis-line">${esc(t(touched ? 'size.for_plan' : 'size.for_full'))}</p>
    ${san.length ? `<h3 class="minor">${esc(t('size.san'))}</h3>${san.map((l) => bridgeLine(l, ctx)).join('')}` : ''}
    ${waste.length ? `<h3 class="minor">${esc(t('size.waste'))}</h3>${waste.map((l) => bridgeLine(l, ctx)).join('')}` : ''}`;
}

export function rulesTable(ctx) {
  const { t, d, state } = ctx;
  const rows = d.sizing.rules.map((x) => `<tr><th scope="row">${esc(x.label)}<span class="src">${x.url ? `<a href="${esc(x.url)}" rel="noopener noreferrer" target="_blank">${esc(x.source)}</a>` : esc(x.source)}${x.caveat ? ` ${esc(x.caveat)}` : ''}</span></th>
      <td><input type="text" inputmode="decimal" autocomplete="off" class="rule-in" data-rule="${x.id}" value="${esc(state.ruleOverrides[x.id] ?? x.value)}" aria-label="${esc(x.label)}"> <span class="unit">${esc(x.unit)}</span></td>
      <td><span class="tag tag-${x.status === 'CITED' ? 'cited' : 'assumption'}">${esc(t(`tag.${x.status === 'CITED' ? 'cited' : 'assumption'}`))}</span><span class="range">${esc(t('rules.range', { low: x.low, high: x.high }))}</span></td></tr>`).join('');
  return `<details class="rules"><summary>${esc(t('rules.h'))}</summary><p class="fine">${esc(t('rules.lede'))}</p>
    <div class="table-wrap"><table class="rules-table"><thead><tr><th scope="col">${esc(t('rules.col_rule'))}</th><th scope="col">${esc(t('rules.col_value'))}</th><th scope="col">${esc(t('rules.col_status'))}</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

export function sizingSection(ctx) {
  const { t, state } = ctx;
  return `<section class="sizing" id="sizing" aria-labelledby="size-h">
    <h2 id="size-h">${esc(t('size.h'))}</h2>
    <p class="section-lede">${esc(t('size.lede'))}</p>
    <label class="fld fld-cur"><span>${esc(t('size.currency'))}</span><input type="text" maxlength="6" autocomplete="off" data-act="currency" value="${esc(ctx.currency)}" placeholder="${esc(t('size.currency_ph'))}"></label>
    <div id="bridge">${bridgeBlock(ctx)}</div>
    <div id="totals">${totalsBlock(ctx)}</div>
    ${rulesTable(ctx)}
    <div class="runfile">
      <button type="button" class="btn btn-quiet" data-act="save-run">${esc(t('run.save'))}</button>
      <label class="btn btn-quiet">${esc(t('run.load'))}<input type="file" class="visually-hidden" accept="application/json,.json" data-act="load-run"></label>
      <span id="run-msg" class="fine">${esc(state.runMsg || '')}</span>
    </div>
  </section>`;
}

/* ----- evidence ----- */

export function strip(label, value, values, fmt, t, lowIsGood) {
  if (value === null || value === undefined) return '';
  const xs = values.filter((v) => typeof v === 'number');
  const max = Math.max(...xs, value) || 1;
  const x = (v) => (10 + (v / max) * 280).toFixed(1);
  const rank = rankOf(value, xs);
  const worse = lowIsGood ? Math.round(rank * xs.length) : Math.round((1 - rank) * xs.length);
  return `<div class="strip"><p class="strip-l">${esc(label)} <strong class="num">${esc(fmt(value))}</strong></p>
    <svg viewBox="0 0 300 26" class="strip-svg" role="img" aria-label="${esc(t('ev.strip_aria', { label, value: fmt(value) }))}"><path class="axis" d="M10 18h280"/>${xs.map((v) => `<circle class="peer" cx="${x(v)}" cy="18" r="3"/>`).join('')}<path class="me" d="M${x(value)} 4v20"/></svg>
    <p class="strip-n">${esc(t('ev.rank', { worse: Math.max(0, Math.min(xs.length, worse)), n: xs.length }))}</p></div>`;
}

export function evidenceSection(ctx) {
  const { t, town, isOwn, meta, r, wv, listing, flags: fl, paired, pairedOn, me, bench, d, country, portal } = ctx;
  const src = [];
  if (r) {
    src.push(`<li><strong>${esc(t('ev.sfd'))}</strong> ${esc(isOwn ? t('ev.sfd_own', { date: meta.sfd_date || t('ev.no_date') }) : t('ev.sfd_built', { date: town.sfd.date, by: town.sfd.prepared_by }))}
      ${esc(t(`ev.listing_${listing.status}`, { name: listing.entry ? listing.entry.name : town.name, year: listing.entry && listing.entry.year ? listing.entry.year : t('badge.no_year'), date: d.pubindex.retrieved }))}
      ${listing.file ? esc(t('ev.file', { id: listing.file.id, date: listing.file.date || '' })) : ''} <a href="${esc(d.pubindex.url)}" rel="noopener noreferrer" target="_blank">${esc(t('ev.susana'))}</a></li>`);
  }
  if (wv) {
    src.push(`<li><strong>${esc(t('ev.wfd'))}</strong> ${esc(isOwn ? t(meta.wfd_portal ? 'ev.wfd_portal' : 'ev.wfd_typed', { v: meta.wfd_version || '?', model: meta.wfd_model || '?' }) : t('ev.wfd_dataset'))}
      ${portal ? esc(t('ev.wfd_portal_fig', { ours: int(wv.plastic_unmanaged_t), portal: int(portal.plastic_unmanaged_t), date: portal.retrieved })) : ''}</li>`);
  }
  const nat = country && d.benchmarks.countries[country];
  const jmp = `<li><strong>${esc(t('ev.jmp'))}</strong> ${esc(r && nat ? t('ev.jmp_line', { town: town.name, safe: pct(r.outcome.components.safe), country, nat: pct(nat.san_safe_national), year: nat.year }) : t('ev.jmp_none', { country: country && country !== 'other' ? country : t('ev.this_country') }))}
      ${esc(t('ev.jmp_def'))} ${esc(t('ev.jmp_urban', { v: pct(bench.jmp_urban_global.value), year: bench.jmp_urban_global.year }))}</li>
    <li><strong>${esc(t('ev.glaas'))}</strong> ${esc(t('ev.glaas_line'))}</li>`;
  const strips = pairedOn && me ? [
    r ? strip(t('ev.s_safe'), me.safe, paired.map((p) => p.safe), (v) => pct(v), t, true) : '',
    r ? strip(t('ev.s_open'), me.open_share, paired.map((p) => p.open_share), (v) => pct(v), t, false) : '',
    wv ? strip(t('ev.s_plastic'), me.plastic_kg_person, paired.map((p) => p.plastic_kg_person), (v) => `${v.toFixed(2)} kg`, t, false) : '',
  ].join('') : `<p class="fine">${esc(t('ev.no_peers'))}</p>`;
  return `<section class="evidence" id="evidence" aria-labelledby="ev-h">
    <h2 id="ev-h">${esc(t('ev.h'))}</h2>
    <details open><summary>${esc(t('ev.sources_h'))}</summary><ul class="ev-list">${src.join('')}${jmp}</ul></details>
    <details${fl.length ? ' open' : ''}><summary>${esc(t('ev.flags_h', { n: fl.length }))}</summary>
      ${fl.length ? `<ul class="flaglist">${fl.map((f) => `<li class="flag flag-${f.level}">${esc(flagText(f, ctx))}</li>`).join('')}</ul>` : `<p class="fine">${esc(t('flag.none'))}</p>`}
      <p class="fine">${esc(t('ev.flags_note'))}</p></details>
    <details><summary>${esc(t('ev.peers_h'))}</summary><div class="strips">${strips}</div><p class="fine">${esc(t('ev.peers_note'))}</p></details>
    <details><summary>${esc(t('ev.limits_h'))}</summary><ul class="ev-list">${['1', '2', '3', '4', '5', '6'].map((k) => `<li>${esc(t(`ev.limit_${k}`))}</li>`).join('')}</ul></details>
  </section>`;
}

export function renderWork(ctx) {
  const { t, town, r, wv } = ctx;
  const facts = [t('work.population', { n: int(town.population_sfd) })];
  if (r) facts.push(t('work.households', { n: int(Math.round(r.households.households)) }));
  if (town.district) facts.unshift(t('work.district', { d: town.district }));
  return `<header class="townbar">
      <div class="townbar-id"><h1 class="town">${esc(town.name)}</h1><p class="town-facts">${esc(facts.join(' '))}</p></div>
      <div class="townbar-acts"><button type="button" class="btn btn-quiet" data-act="pdf">${esc(t('work.pdf'))}</button><button type="button" class="btn btn-quiet" data-act="restart">${esc(t('work.another'))}</button></div>
      <div class="badges">${sourceBadges(ctx)}</div>
      <p class="basis">${esc(basisLine(ctx))} <span class="print-only">${esc(t('work.printed', { date: ctx.today }))}</span></p>
    </header>
    ${verdictSection(ctx)}
    <p class="draft">${esc(t('work.draft'))}</p>
    ${sandboxSection(ctx)}${sizingSection(ctx)}${evidenceSection(ctx)}`;
}
