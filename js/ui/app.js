// Page wiring: load data, keep the page state, run the engine, put the active tab on the page.
import { paramMap } from '../engine/cost.js';
import { makeT, renderFacts, esc } from './render.js';
import { buildContext, buildOwn, defaultState, reportBasis } from './context.js';
import { TABS, WFD_FIELDS, renderTab, renderPrint, whatIfSanOut, waysOut, whatIfWasteOut, costTag, ownTotal, banners } from './views.js';

const $ = (sel) => document.querySelector(sel);
const FILES = ['towns', 'sfd', 'wfd', 'rules', 'costs', 'params', 'benchmarks', 'strings.en'];
const COST_FIELDS = ['cost_low', 'cost_high', 'lifespan_years', 'uses_per_year'];
const MAX_PDF = 30 * 1024 * 1024;

async function loadAll() {
  const res = await Promise.all(FILES.map((n) => fetch(`data/${n}.json`).then((r) => { if (!r.ok) throw new Error(n); return r.json(); })));
  return Object.fromEntries(FILES.map((n, i) => [n.replace('.en', ''), res[i]]));
}

function readHash() {
  const out = {};
  for (const [k, v] of new URLSearchParams(location.hash.slice(1))) out[k] = v;
  return out;
}

/** Sizes that depend on data arrive as data-* attributes; the CSP forbids inline styles, so set them through the CSSOM. */
function applySizes(root) {
  root.querySelectorAll('[data-grow]').forEach((el) => { el.style.flexGrow = el.dataset.grow; });
  root.querySelectorAll('[data-w]').forEach((el) => { el.style.width = `${el.dataset.w}%`; });
  root.querySelectorAll('[data-top]').forEach((el) => { el.style.top = `${el.dataset.top}%`; });
}

function start(d) {
  const t = makeT(d.strings);
  const base = paramMap(d.params);
  const state = defaultState(d);
  const form = $('#settings');
  const select = $('#town');
  const sheet = $('#sheet');
  const tabs = $('#tabs');
  const today = new Date().toISOString().slice(0, 10);
  let ctx;

  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  tabs.innerHTML = TABS.map((k) => `<button type="button" role="tab" id="tab-${k}" data-tab="${k}" aria-controls="sheet">${esc(t(`tab.${k}`))}</button>`).join('');
  if (window.matchMedia('(min-width: 901px)').matches) $('#settings-wrap').open = true;

  function fillSelect() {
    const sorted = d.towns.towns.slice().sort((a, b) => a.name.localeCompare(b.name));
    select.innerHTML = (state.own ? `<option value="own">${esc(t('town.own', { name: state.own.town.name }))}</option>` : '')
      + sorted.map((x) => `<option value="${x.id}">${esc(x.name)}${x.district ? `, ${esc(x.district)}` : ''}</option>`).join('');
    select.value = state.townId;
  }

  // initial state: URL hash, then the workbook defaults
  const h = readHash();
  const named = d.towns.towns.find((x) => x.name.toLowerCase() === String(h.town || '').toLowerCase());
  if (named) state.townId = String(named.id);
  if (TABS.includes(h.tab)) state.tab = h.tab;
  if (h.gw === 'high') state.gw = 'high';
  if (['low', 'mid', 'high'].includes(h.case)) state.case = h.case;
  if (h.basis === 'hh_size' || h.basis === 'stated') state.basis = h.basis;
  if (Number(h.hh) > 0) state.hh = Number(h.hh);
  if (Number(h.disc) > 0) state.disc = Number(h.disc);
  const pc = (v) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
  state.uptake = pc(h.u); state.treat = pc(h.tr); state.wctl = pc(h.wk);
  if (h.wc !== undefined && h.wc !== '') state.wcol = pc(h.wc);
  if (Number(h.tg) > 0 && Number(h.tg) <= 100) state.target = String(Number(h.tg));
  form.gw.value = state.gw; form.case.value = state.case; form.basis.value = state.basis; form.hh.value = state.hh; form.disc.value = state.disc;
  fillSelect();

  function writeHash() {
    const q = new URLSearchParams({ town: ctx.town.typed ? 'own' : ctx.town.name, tab: state.tab, gw: state.gw, case: state.case, basis: state.basis, hh: String(ctx.hh), disc: String(+(ctx.disc * 100).toFixed(2)) });
    if (state.uptake) q.set('u', state.uptake);
    if (state.treat) q.set('tr', state.treat);
    if (state.target) q.set('tg', state.target);
    if (state.wcol !== null) q.set('wc', state.wcol);
    if (state.wctl) q.set('wk', state.wctl);
    history.replaceState(null, '', `#${q}`);
  }

  function drawPrint() { $('#printsheet').innerHTML = renderPrint(ctx); applySizes($('#printsheet')); }

  function draw() {
    state.gw = form.gw.value; state.case = form.case.value; state.basis = form.basis.value; state.hh = form.hh.value; state.disc = form.disc.value;
    ctx = buildContext(d, state, t, today);
    $('#facts').innerHTML = renderFacts(ctx.r, ctx.town, t);
    sheet.innerHTML = renderTab(ctx);
    applySizes(sheet);
    tabs.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === state.tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    sheet.setAttribute('aria-labelledby', `tab-${state.tab}`);
    drawPrint();
    document.title = `${ctx.town.name}: ${t('app.title')} (draft)`;
    writeHash();
  }

  function go(tab) { state.tab = tab; draw(); $('.tabbar').scrollIntoView({ block: 'start' }); }

  function setTown(id) {
    state.townId = String(id); state.wcol = null; // the collection lever starts at the new town's own level
    select.value = state.townId;
    draw();
  }

  /* ----- what-if levers ----- */
  function lever(el) {
    const name = el.dataset.lever;
    if (name === 'target') state.target = el.value;
    else { state[name] = Number(el.value); const out = sheet.querySelector(`output[data-for="${name}"]`); if (out) out.textContent = `${el.value}%`; }
    ctx = buildContext(d, state, t, today);
    const put = (id, html) => { const box = $(id); if (box) { box.innerHTML = html; applySizes(box); } };
    if (name === 'wcol' || name === 'wctl') put('#wi-waste-out', whatIfWasteOut(ctx));
    else { put('#wi-san-out', whatIfSanOut(ctx)); put('#ways-out', waysOut(ctx)); }
    drawPrint(); writeHash();
  }

  /* ----- costs ----- */
  function refreshBanners() { const b = sheet.querySelector('[data-banners]'); if (b) b.outerHTML = banners(ctx); }

  function costEdit(el) {
    const id = el.dataset.cost; const field = el.dataset.field;
    const item = d.costs.items.find((i) => i.id === id);
    const v = el.value.trim() === '' ? null : Number(el.value);
    if (v !== null && !(Number.isFinite(v) && v >= 0)) { el.value = ''; return; }
    const o = { ...(state.costOverrides[id] || {}) };
    if (v === item[field] || (v === null && item[field] === null)) delete o[field]; else o[field] = v;
    if (Object.keys(o).length) state.costOverrides[id] = o; else delete state.costOverrides[id];
    ctx = buildContext(d, state, t, today);
    const tag = sheet.querySelector(`tr[data-row="${id}"] .cost-tag`);
    if (tag) tag.outerHTML = costTag(item, Boolean(state.costOverrides[id]), t);
    refreshBanners(); drawPrint();
  }

  function saveRun() {
    const run = { tool: 'sanitation-waste-planner', version: '0.2', exported: new Date().toISOString(),
      data_versions: { rules: d.rules.data_version, costs: d.costs.data_version, towns: d.sfd.data_version, benchmarks: d.benchmarks.data_version },
      town: ctx.town.name, settings: { gw: state.gw, case: state.case, basis: state.basis, hh: ctx.hh, disc: +(ctx.disc * 100).toFixed(2) },
      what_if: { uptake: state.uptake, treat: state.treat, target: state.target, collection: state.wcol, controlled: state.wctl },
      cost_overrides: state.costOverrides, own_form: state.own ? state.ownForm : null, up_snap: state.own ? state.upSnap : null };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(run, null, 1)], { type: 'application/json' }));
    a.download = `planner-run-${ctx.town.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /** A saved snapshot of what the PDFs filled in, kept only if it has the expected shape. */
  function cleanSnap(x) {
    const out = {};
    for (const kind of ['sfd', 'wfd']) {
      const o = x && typeof x === 'object' ? x[kind] : null;
      if (o && typeof o === 'object') out[kind] = Object.fromEntries(Object.entries(o).filter(([k, v]) => /^[a-z_0-9A-Z]{1,40}$/.test(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 60)]));
    }
    return out;
  }

  async function loadRun(file) {
    try {
      const run = JSON.parse(await file.text());
      if (!run || run.tool !== 'sanitation-waste-planner' || typeof run.cost_overrides !== 'object') throw new Error('not a run file');
      const known = new Set(d.costs.items.map((i) => i.id));
      const clean = {};
      for (const [id, o] of Object.entries(run.cost_overrides || {})) {
        if (!known.has(id) || !o || typeof o !== 'object') continue;
        const c = {};
        for (const f of COST_FIELDS) if (f in o && (o[f] === null || (typeof o[f] === 'number' && Number.isFinite(o[f]) && o[f] >= 0))) c[f] = o[f];
        if (Object.keys(c).length) clean[id] = c;
      }
      state.costOverrides = clean;
      if (run.own_form && typeof run.own_form === 'object') {
        state.ownForm = Object.fromEntries(Object.entries(run.own_form).filter(([k, v]) => /^[a-z_0-9A-Z]{1,40}$/.test(k) && ['string', 'number'].includes(typeof v)).map(([k, v]) => [k, String(v).slice(0, 60)]));
        state.upSnap = cleanSnap(run.up_snap);
      }
      state.costMsg = t('costs.loaded', { n: Object.keys(clean).length });
    } catch (err) {
      state.costMsg = t('costs.bad_file');
    }
    draw();
  }

  /* ----- your town ----- */
  async function readPdf(file) {
    const pdfjs = await import('../../vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, verbosity: 0 }).promise;
    const { pdfToPages } = await import('../parsers/pdf-text.js');
    return pdfToPages(doc);
  }

  const r2 = (v) => String(Math.round(v * 100) / 100);

  async function upload(kind, file) {
    const say = (list) => { state.ownMsgs = state.ownMsgs.filter((m) => m.src && m.src !== kind).concat(list.map((m) => ({ ...m, src: kind }))); draw(); };
    if (file.size > MAX_PDF) return say([{ kind: 'err', key: 'up.too_big' }]);
    const box = $('#own-msgs'); if (box) box.innerHTML = `<ul class="msgs"><li>${esc(t('up.reading', { name: file.name }))}</li></ul>`;
    let pages;
    try { pages = await readPdf(file); } catch (err) { console.error(err); return say([{ kind: 'err', key: 'up.failed' }]); }
    const f = state.ownForm; const msgs = [];
    if (kind === 'sfd') {
      const { parseSfdReport } = await import('../parsers/sfd-report.js');
      const p = parseSfdReport(pages);
      if (!p.is_sfd_report || !p.systems.length) return say([{ kind: 'err', key: 'up.not_sfd' }]);
      for (const k of Object.keys(f)) if (k.startsWith('share_') || k.startsWith('emptied_')) delete f[k];
      state.upSnap.sfd = null;
      if (p.town) f.name = p.town;
      if (p.population) f.population = String(p.population);
      f.households = p.households ? String(p.households) : '';
      f.sludge_pct = p.sludge_factor === null ? '' : r2(p.sludge_factor * 100);
      const blank = [];
      for (const s of p.systems) {
        f[`share_${s.code}`] = r2(s.share * 100);
        if (s.emptied !== null) f[`emptied_${s.code}`] = r2(s.emptied * 100);
        else if (ctx.sysIdx[s.code] && ctx.sysIdx[s.code].group !== 'direct') blank.push(s.code);
      }
      state.upSnap.sfd = Object.fromEntries(Object.entries(f).filter(([k]) => /^(share_|emptied_)/.test(k) || ['population', 'households', 'sludge_pct'].includes(k)));
      msgs.push({ kind: 'ok', key: 'up.sfd_read', vars: { town: p.town || '?', n: p.systems.length, population: p.population ? p.population.toLocaleString('en-GB') : '?' } });
      if (p.share_sum < 0.99 || p.share_sum > 1.01) msgs.push({ kind: 'warn', key: 'up.sfd_short', vars: { sum: `${r2(p.share_sum * 100)}%`, gap: `${r2(Math.abs(1 - p.share_sum) * 100)}%` } });
      if (p.conflicts.length) msgs.push({ kind: 'warn', key: 'up.sfd_conflict', vars: { codes: p.conflicts.map((c) => c.code).join(', ') } });
      if (blank.length) msgs.push({ kind: 'warn', key: 'up.sfd_no_emptied', vars: { codes: blank.join(', ') } });
      if (p.sludge_factor === null) msgs.push({ kind: 'warn', key: 'up.sfd_no_factor' });
      if (p.stated_safe !== null) msgs.push({ kind: 'ok', key: 'up.sfd_safe', vars: { safe: `${r2(p.stated_safe * 100)}%` } });
    } else {
      const { parseWfdPortal } = await import('../parsers/wfd-portal.js');
      const p = parseWfdPortal(pages);
      if (!p.is_wfd_portal || p.plastic_unmanaged_t === null) return say([{ kind: 'err', key: 'up.not_wfd' }]);
      const map = { msw_t_day: p.msw_t_day, collected_pct: p.collected_share === null ? null : p.collected_share * 100, plastic_generated_t: p.plastic_generated_t, plastic_unmanaged_t: p.plastic_unmanaged_t,
        stage_uncollected_t: p.stage_uncollected_t, stage_collection_t: p.stage_collection_t, stage_sorting_t: p.stage_sorting_t, stage_transport_t: p.stage_transport_t, stage_disposal_t: p.stage_disposal_t,
        fate_land_t: p.fate_land_t, fate_water_t: p.fate_water_t, fate_burnt_t: p.fate_burnt_t, fate_drains_t: p.fate_drains_t, organic_pct: p.organic_share === null ? null : p.organic_share * 100 };
      const missing = [];
      for (const k of WFD_FIELDS) { if (map[k] === null || map[k] === undefined) { f[k] = ''; missing.push(t(`own.w.${k}`)); } else f[k] = r2(map[k]); }
      if (!f.name && p.town) f.name = p.town;
      if (!f.population && p.population) f.population = String(p.population);
      const version = p.model_version ? t('up.wfd_version', { v: p.model_version, model: p.burning_model || '?' }) : '';
      state.upSnap.wfd = Object.fromEntries(WFD_FIELDS.map((k) => [k, f[k]]));
      msgs.push({ kind: 'ok', key: 'up.wfd_read', vars: { town: p.town || '?', tonnes: p.plastic_unmanaged_t.toLocaleString('en-GB'), version } });
      if (p.checks.stage_ok === true) msgs.push({ kind: 'ok', key: 'up.wfd_check_ok', vars: { sum: p.checks.stage_sum.toLocaleString('en-GB') } });
      if (p.checks.stage_ok === false) msgs.push({ kind: 'warn', key: 'up.wfd_check_bad', vars: { sum: p.checks.stage_sum, total: p.plastic_unmanaged_t } });
      if (missing.length) msgs.push({ kind: 'warn', key: 'up.wfd_missing', vars: { fields: missing.join('; ') } });
    }
    return say(msgs);
  }

  function useOwn() {
    const res = buildOwn(state.ownForm, ctx.sysIdx);
    if (!res.own) { state.ownMsgs = res.errors.map((e) => ({ kind: 'err', ...e })); draw(); $('#own-msgs').scrollIntoView({ block: 'center' }); return; }
    res.own.town.basis = reportBasis(state.ownForm, state.upSnap, Boolean(res.own.wfdTown));
    state.own = res.own; state.ownMsgs = res.warnings.map((e) => ({ kind: 'warn', ...e }));
    state.townId = 'own'; state.wcol = null; state.tab = 'overview';
    fillSelect(); draw(); $('.tabbar').scrollIntoView({ block: 'start' });
  }

  /* ----- events ----- */
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); });
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = (TABS.indexOf(state.tab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    go(TABS[i]); tabs.querySelector(`[data-tab="${TABS[i]}"]`).focus();
  });
  $('#pdf').addEventListener('click', () => window.print());
  select.addEventListener('change', () => setTown(select.value));
  form.addEventListener('input', draw);
  form.addEventListener('submit', (e) => e.preventDefault());
  sheet.addEventListener('submit', (e) => e.preventDefault());
  sheet.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.lever) lever(el);
    else if (el.dataset.own) { state.ownForm[el.dataset.own] = el.value; if (el.dataset.own.startsWith('share_')) $('#own-total').innerHTML = ownTotal(state.ownForm, t); }
  });
  sheet.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.cost) costEdit(el);
    else if (el.dataset.act === 'load-run' && el.files[0]) loadRun(el.files[0]);
    else if (el.dataset.act === 'read-sfd' && el.files[0]) upload('sfd', el.files[0]);
    else if (el.dataset.act === 'read-wfd' && el.files[0]) upload('wfd', el.files[0]);
  });
  sheet.addEventListener('click', (e) => {
    const el = e.target.closest('[data-goto],[data-town],button[data-act]');
    if (!el) return;
    if (el.dataset.goto) go(el.dataset.goto);
    else if (el.dataset.town) { setTown(el.dataset.town); go('overview'); }
    else if (el.dataset.act === 'save-run') saveRun();
    else if (el.dataset.act === 'reset-costs') { state.costOverrides = {}; state.costMsg = t('costs.reset_done'); draw(); }
    else if (el.dataset.act === 'use-own') useOwn();
    else if (el.dataset.act === 'clear-own') { state.ownForm = {}; state.upSnap = {}; state.ownMsgs = []; draw(); }
  });

  $('#foot').innerHTML = `<p>${esc(t('foot.privacy'))}</p><p>${esc(t('foot.versions', { rules: d.rules.data_version, data: d.sfd.data_version, source: d.sfd.source }))}</p><p>${esc(t('foot.licence'))}</p>`;
  draw();
}

// One tooltip for every mark that carries data-tip (bar segments, ribbons, dots).
function tooltips() {
  const tip = $('#tip');
  const show = (el) => {
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const b = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, b.left + b.width / 2 - w / 2))}px`;
    tip.style.top = `${Math.max(8, b.top - tip.offsetHeight - 8)}px`;
  };
  const hide = () => { tip.hidden = true; };
  const target = (e) => (e.target instanceof Element ? e.target.closest('[data-tip]') : null);
  document.addEventListener('pointerover', (e) => { const el = target(e); if (el) show(el); else hide(); });
  document.addEventListener('focusin', (e) => { const el = target(e); if (el) show(el); else hide(); });
  document.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, { passive: true });
}

loadAll().then((d) => { start(d); tooltips(); }).catch((err) => {
  $('#sheet').innerHTML = '<p class="banner">The data files could not be loaded. Reload the page; if you opened the file directly from disk, serve the folder over HTTP instead.</p>';
  console.error(err);
});

// Offline use: keep a copy of the page's own files. Network first, so a new version always wins when online.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
