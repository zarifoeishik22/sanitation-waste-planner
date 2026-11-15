// Page wiring: load data, keep the page state, read dropped reports, run the engines, put the current view on the page.
import { systemIndex } from '../engine/sfd.js';
import { checkListing } from '../engine/pubindex.js';
import { makeT, esc } from './util.js';
import { buildContext, buildOwn, defaultState, reportBasis, WFD_FIELDS, COUNTRIES } from './context.js';
import { renderLanding, renderCheck, renderWork, shareTotal, sceneBlock, receiversBlock, readoutBlock, leversBlock, bridgeBlock, totalsBlock, lineTotals, verdictSection } from './views.js';

const $ = (sel) => document.querySelector(sel);
const FILES = ['towns', 'sfd', 'wfd', 'rules', 'costs', 'params', 'benchmarks', 'sizing', 'pubindex', 'strings.en'];
const MAX_PDF = 30 * 1024 * 1024;
const r2 = (v) => String(Math.round(v * 100) / 100);

async function loadAll() {
  const res = await Promise.all(FILES.map((n) => fetch(`data/${n}.json`).then((r) => { if (!r.ok) throw new Error(n); return r.json(); })));
  return Object.fromEntries(FILES.map((n, i) => [n.replace('.en', ''), res[i]]));
}

function start(d) {
  const t = makeT(d.strings);
  const sysIdx = systemIndex(d.rules);
  const app = $('#app');
  const today = new Date().toISOString().slice(0, 10);
  let state = defaultState();
  let ctx = null;

  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('#foot').innerHTML = `<p>${esc(t('land.private'))}</p><p>Draft v0.3. Rules v${esc(d.rules.data_version)}, sizing rules v${esc(d.sizing.data_version)}, SuSanA list copied ${esc(d.pubindex.retrieved)}. Code: MIT licence. <a href="https://github.com/zarifoeishik22/sanitation-waste-planner" rel="noopener noreferrer">Source</a></p>`;

  const named = d.towns.towns.find((x) => x.name.toLowerCase() === new URLSearchParams(location.hash.slice(1)).get('town')?.toLowerCase());
  if (named) { state.townId = String(named.id); state.view = 'work'; }

  function compute() { ctx = buildContext(d, state, t, today); }

  function render(focusTop = false) {
    if (state.view === 'work') { compute(); app.innerHTML = renderWork(ctx); document.title = `${ctx.town.name}: ${t('app.title')}`; }
    else if (state.view === 'check') { app.innerHTML = renderCheck(state, sysIdx, t); document.title = t('app.title'); }
    else { app.innerHTML = renderLanding(state, d, t); document.title = t('app.title'); }
    document.body.dataset.view = state.view;
    const hash = state.view === 'work' && state.townId !== 'own' ? `#town=${encodeURIComponent(ctx.town.name)}` : ' ';
    history.replaceState(null, '', hash === ' ' ? location.pathname + location.search : hash);
    if (focusTop) { window.scrollTo({ top: 0, behavior: 'instant' }); app.focus({ preventScroll: true }); }
  }

  /** After a lever moves: redraw what depends on it and leave the controls alone, so a drag is not interrupted. */
  function refresh({ levers = false, verdict = false } = {}) {
    compute();
    $('#scene').innerHTML = sceneBlock(ctx);
    $('#receivers').innerHTML = receiversBlock(ctx);
    if (levers) { const box = $('#levers'); box.innerHTML = `${leversBlock(ctx)}<div id="readout">${readoutBlock(ctx)}</div>`; } else $('#readout').innerHTML = readoutBlock(ctx);
    $('#bridge').innerHTML = bridgeBlock(ctx);
    $('#totals').innerHTML = totalsBlock(ctx);
    if (verdict) $('#verdict').outerHTML = verdictSection(ctx);
  }

  /* ----- reading reports ----- */
  async function readPdf(file) {
    const pdfjs = await import('../../vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, verbosity: 0 }).promise;
    const { pdfToPages } = await import('../parsers/pdf-text.js');
    return pdfToPages(doc);
  }

  function fillSfd(p, fileName, pages) {
    const f = state.ownForm;
    for (const k of Object.keys(f)) if (k.startsWith('share_') || k.startsWith('emptied_')) delete f[k];
    if (p.town) f.name = p.town;
    if (p.population) f.population = String(p.population);
    f.households = p.households ? String(p.households) : '';
    f.sludge_pct = p.sludge_factor === null ? '' : r2(p.sludge_factor * 100);
    for (const s of p.systems) {
      if (!sysIdx[s.code]) continue;
      f[`share_${s.code}`] = r2(s.share * 100);
      if (s.emptied !== null) f[`emptied_${s.code}`] = r2(s.emptied * 100);
    }
    state.upSnap.sfd = Object.fromEntries(Object.entries(f).filter(([k]) => /^(share_|emptied_)/.test(k) || ['population', 'households', 'sludge_pct'].includes(k)));
    state.upMeta.sfd = { file: fileName, stated_safe: p.stated_safe, share_sum: p.share_sum, date: p.date };
    if (!state.country) { const head = pages.slice(0, 2).join(' '); state.country = COUNTRIES.find((c) => head.includes(c)) || ''; }
    const listing = checkListing(p.town || '', state.country || null, d.pubindex, fileName);
    return [{ kind: 'ok', key: 'read.sfd', vars: { town: p.town || '?', n: p.systems.length, sum: `${r2(p.share_sum * 100)}%` } },
      { kind: listing.status === 'listed' ? 'ok' : 'note', key: `read.${listing.status}`, vars: { year: listing.entry && listing.entry.year ? listing.entry.year : t('badge.no_year') } }];
  }

  function fillWfd(p) {
    const f = state.ownForm;
    const map = { msw_t_day: p.msw_t_day, collected_pct: p.collected_share === null ? null : p.collected_share * 100, plastic_generated_t: p.plastic_generated_t, plastic_unmanaged_t: p.plastic_unmanaged_t,
      stage_uncollected_t: p.stage_uncollected_t, stage_collection_t: p.stage_collection_t, stage_sorting_t: p.stage_sorting_t, stage_transport_t: p.stage_transport_t, stage_disposal_t: p.stage_disposal_t,
      fate_land_t: p.fate_land_t, fate_water_t: p.fate_water_t, fate_burnt_t: p.fate_burnt_t, fate_drains_t: p.fate_drains_t, organic_pct: p.organic_share === null ? null : p.organic_share * 100 };
    for (const k of WFD_FIELDS) f[k] = map[k] === null || map[k] === undefined ? '' : r2(map[k]);
    if (!f.name && p.town) f.name = p.town;
    if (!f.population && p.population) f.population = String(p.population);
    state.upSnap.wfd = Object.fromEntries(WFD_FIELDS.map((k) => [k, f[k]]));
    state.upMeta.wfd = { portal: true, version: p.model_version, model: p.burning_model };
    return [{ kind: 'ok', key: 'read.wfd', vars: { town: p.town || '?', tonnes: p.plastic_unmanaged_t.toLocaleString('en-GB') } }];
  }

  async function handleFiles(list) {
    const files = [...list].slice(0, 4);
    if (!files.length) return;
    state.reading = files.map((f) => ({ kind: 'busy', key: 'read.start', vars: { name: f.name } }));
    state.view = state.view === 'check' ? 'check' : 'landing';
    if (state.view === 'landing') render();
    const out = [];
    let good = 0;
    for (const file of files) {
      const name = file.name;
      if (file.size > MAX_PDF) { out.push({ kind: 'err', key: 'read.too_big', vars: { name } }); continue; }
      let pages;
      try { pages = await readPdf(file); } catch (err) { console.error(err); out.push({ kind: 'err', key: 'read.failed', vars: { name } }); continue; }
      if (!pages.join('').trim()) { out.push({ kind: 'err', key: 'read.scanned', vars: { name } }); continue; }
      const { parseSfdReport } = await import('../parsers/sfd-report.js');
      const s = parseSfdReport(pages);
      if (s.is_sfd_report && s.systems.length) { out.push(...fillSfd(s, name, pages)); good += 1; continue; }
      const { parseWfdPortal } = await import('../parsers/wfd-portal.js');
      const w = parseWfdPortal(pages);
      if (w.is_wfd_portal && w.plastic_unmanaged_t !== null) { out.push(...fillWfd(w)); good += 1; continue; }
      out.push({ kind: 'err', key: 'read.unknown', vars: { name } });
    }
    state.reading = out;
    if (good) { state.view = 'check'; state.msgs = out.filter((m) => m.kind !== 'busy').map((m) => ({ ...m, kind: m.kind === 'note' ? 'warn' : m.kind })); render(true); } else render();
  }

  function analyse() {
    const res = buildOwn(state.ownForm, sysIdx);
    if (!res.own) { state.msgs = res.errors.map((e) => ({ kind: 'err', ...e })); $('#check-msgs').innerHTML = `<ul class="msgs">${state.msgs.map((m) => `<li class="msg-${m.kind}">${esc(t(m.key, m.vars))}</li>`).join('')}</ul>`; $('#check-msgs').scrollIntoView({ block: 'center' }); return; }
    const basis = reportBasis(state.ownForm, state.upSnap, { sfd: Boolean(res.own.sfdTown), wfd: Boolean(res.own.wfdTown) });
    const us = state.upMeta.sfd || {}; const uw = state.upMeta.wfd || {};
    res.own.town.meta = { basis, sfd_basis: basis.sfd, sfd_file: us.file || null, sfd_date: us.date || null,
      stated_safe: basis.sfd === 'typed' ? null : us.stated_safe ?? null, share_sum: basis.sfd === 'typed' ? null : us.share_sum ?? null,
      wfd_portal: Boolean(uw.portal), wfd_version: uw.version || null, wfd_model: uw.model || null };
    if (us.date) res.own.town.sfd.date = us.date;
    state.own = res.own; state.townId = 'own'; state.msgs = [];
    Object.assign(state, { gw: 'low', uptake: 0, treat: 0, wcol: null, wctl: 0, compost: false, view: 'work' });
    render(true);
  }

  function preset(kind) {
    const c0 = ctx.wv ? Math.round(ctx.wv.collected_share * 100) : null;
    if (kind === 'full') Object.assign(state, { uptake: ctx.r ? 100 : 0, treat: ctx.r ? 100 : 0, wcol: c0 === null ? null : Math.max(c0, 90), wctl: ctx.wv ? 100 : 0, compost: Boolean(ctx.wv && ctx.wv.organic_share) });
    else Object.assign(state, { uptake: 0, treat: 0, wcol: null, wctl: 0, compost: false });
    refresh({ levers: true });
  }

  function tryLever(k) {
    const c0 = ctx.wv ? Math.round(ctx.wv.collected_share * 100) : 0;
    if (k === 'uptake') state.uptake = 100; else if (k === 'treat') state.treat = 100; else if (k === 'collection') state.wcol = Math.max(c0, 90);
    else if (k === 'controlled') state.wctl = 100; else if (k === 'compost') state.compost = true;
    refresh({ levers: true });
    $('#sandbox').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  /* ----- run file ----- */
  function saveRun() {
    const run = { tool: 'sanitation-waste-planner', version: '0.3', exported: new Date().toISOString(), town: ctx.town.name,
      levers: { gw: state.gw, uptake: state.uptake, treat: state.treat, wcol: state.wcol, wctl: state.wctl, compost: state.compost },
      rates: state.rates, rule_overrides: state.ruleOverrides, currency: state.currency,
      own_form: state.own ? state.ownForm : null, up_snap: state.own ? state.upSnap : null, up_meta: state.own ? state.upMeta : null, country: state.country };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(run, null, 1)], { type: 'application/json' }));
    a.download = `planner-run-${ctx.town.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  async function loadRun(file) {
    try {
      const run = JSON.parse(await file.text());
      if (!run || run.tool !== 'sanitation-waste-planner' || typeof run.rates !== 'object') throw new Error('not a run file');
      const rates = {};
      for (const [id, o] of Object.entries(run.rates || {})) {
        if (!/^[\w: ,.-]{1,80}$/.test(id) || !o || typeof o !== 'object') continue;
        const c = {}; for (const k of ['capex', 'opex']) { const v = numOrNull(o[k]); if (v !== null) c[k] = v; }
        if (Object.keys(c).length) rates[id] = c;
      }
      state.rates = rates;
      const known = new Set(d.sizing.rules.map((x) => x.id));
      state.ruleOverrides = Object.fromEntries(Object.entries(run.rule_overrides || {}).filter(([k, v]) => known.has(k) && numOrNull(v) > 0));
      state.currency = typeof run.currency === 'string' ? run.currency.slice(0, 6) : '';
      const lv = run.levers || {};
      const p100 = (v) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
      Object.assign(state, { uptake: p100(lv.uptake), treat: p100(lv.treat), wctl: p100(lv.wctl), wcol: lv.wcol === null || lv.wcol === undefined ? null : p100(lv.wcol), compost: Boolean(lv.compost), gw: lv.gw === 'high' ? 'high' : 'low' });
      state.runMsg = t('run.loaded');
    } catch (err) { state.runMsg = t('run.bad'); }
    render();
    $('#sizing').scrollIntoView({ block: 'start' });
  }

  /* ----- events ----- */
  app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.act === 'files' && el.files.length) handleFiles(el.files);
    else if (el.dataset.act === 'country') state.country = el.value;
    else if (el.dataset.act === 'load-run' && el.files[0]) loadRun(el.files[0]);
  });
  app.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.own) {
      state.ownForm[el.dataset.own] = el.value;
      if (el.dataset.own.startsWith('share_') && $('#share-total')) $('#share-total').innerHTML = shareTotal(state.ownForm, t);
    } else if (el.dataset.lever) {
      const k = el.dataset.lever;
      if (k === 'compost') state.compost = el.checked;
      else if (k === 'gw') { state.gw = el.checked ? 'high' : 'low'; refresh({ levers: true, verdict: true }); return; }
      else { state[k] = Number(el.value); const o = $(`#out-${k}`); if (o) o.textContent = `${el.value}%`; }
      refresh();
    } else if (el.dataset.rate) {
      const v = el.value.trim() === '' ? null : Number(el.value.replace(/,/g, ''));
      const cur = state.rates[el.dataset.line] || {};
      if (v === null || !Number.isFinite(v) || v < 0) delete cur[el.dataset.rate]; else cur[el.dataset.rate] = v;
      if (Object.keys(cur).length) state.rates[el.dataset.line] = cur; else delete state.rates[el.dataset.line];
      compute();
      const line = ctx.sizing.lines.find((l) => l.id === el.dataset.line);
      const cell = [...app.querySelectorAll('[data-total]')].find((x) => x.dataset.total === el.dataset.line);
      if (line && cell) cell.innerHTML = lineTotals(line, ctx);
      $('#totals').innerHTML = totalsBlock(ctx);
    } else if (el.dataset.rule) {
      const v = Number(el.value);
      if (Number.isFinite(v) && v > 0) state.ruleOverrides[el.dataset.rule] = v; else delete state.ruleOverrides[el.dataset.rule];
      refresh({ verdict: true });
    } else if (el.dataset.act === 'currency') {
      state.currency = el.value.trim().slice(0, 6);
      compute(); $('#bridge').innerHTML = bridgeBlock(ctx); $('#totals').innerHTML = totalsBlock(ctx);
    }
  });
  app.addEventListener('click', (e) => {
    const el = e.target.closest('button[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'show-sample') { state.showSample = true; render(); $('#sample-town').focus(); }
    else if (act === 'open-sample') { state.townId = $('#sample-town').value; state.view = 'work'; render(true); }
    else if (act === 'manual') { state.manual = true; state.view = 'check'; render(true); }
    else if (act === 'analyse') analyse();
    else if (act === 'restart') { state = defaultState(); render(true); }
    else if (act === 'pdf') window.print();
    else if (act === 'preset') preset(el.dataset.preset);
    else if (act === 'try') tryLever(el.dataset.lever);
    else if (act === 'save-run') saveRun();
  });
  for (const type of ['dragenter', 'dragover']) app.addEventListener(type, (e) => { const z = e.target.closest?.('.drop'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  app.addEventListener('dragleave', (e) => { const z = e.target.closest?.('.drop'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('over'); });
  app.addEventListener('drop', (e) => { const z = e.target.closest?.('.drop'); if (!z) return; e.preventDefault(); z.classList.remove('over'); if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  render();
}

loadAll().then(start).catch((err) => {
  $('#app').innerHTML = '<p class="draft">The page could not load its data files. Reload to try again; if you opened the file from disk, serve the folder over HTTP instead.</p>';
  console.error(err);
});

// Offline use: keep a copy of the page's own files. Network first, so a new version always wins when online.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
