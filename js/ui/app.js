// Page wiring: load data, keep the page state, read dropped reports and workbooks, route between screens, run the engines.
import { systemIndex } from '../engine/sfd.js';
import { checkListing } from '../engine/pubindex.js';
import { templateSheets, readTemplate, LEVER_KEYS } from '../engine/template.js';
import { makeT, esc } from './util.js';
import { buildContext, buildOwn, defaultState, reportBasis, newScenario, WFD_FIELDS, COUNTRIES } from './context.js';
import { renderLanding, renderCheck, shareTotal, bridgeBlock, totalsBlock, lineTotals, leversBlock } from './views.js';
import { renderShell, ROUTE_IDS, scenarioResults, phaseBlock } from './screens.js';

const $ = (sel) => document.querySelector(sel);
const FILES = ['towns', 'sfd', 'wfd', 'rules', 'costs', 'params', 'benchmarks', 'sizing', 'pubindex', 'unit_costs', 'strings.en'];
const MAX_FILE = 30 * 1024 * 1024;
const r2 = (v) => String(Math.round(v * 100) / 100);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'town';

async function loadAll() {
  const res = await Promise.all(FILES.map((n) => fetch(`data/${n}.json`).then((r) => { if (!r.ok) throw new Error(n); return r.json(); })));
  return Object.fromEntries(FILES.map((n, i) => [n.replace('.en', ''), res[i]]));
}

function download(bytes, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function start(d) {
  const t = makeT(d.strings);
  const sysIdx = systemIndex(d.rules);
  const app = $('#app');
  const today = new Date().toISOString().slice(0, 10);
  let state = defaultState();
  let ctx = null;

  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('#foot').innerHTML = `<p>${esc(t('land.private'))}</p><p>Draft v0.4. Rules v${esc(d.rules.data_version)}, sizing rules v${esc(d.sizing.data_version)}, SuSanA list copied ${esc(d.pubindex.retrieved)}. Code: MIT licence. <a href="https://github.com/zarifoeishik22/sanitation-waste-planner" rel="noopener noreferrer">Source</a></p>`;

  /* ----- routing: #/route, optionally ?town=Name for a surveyed town ----- */
  function readHash() {
    const h = location.hash.slice(1);
    const m = h.match(/^\/([a-z]+)(?:\?(.*))?$/);
    const params = new URLSearchParams(m ? m[2] || '' : h);
    const name = params.get('town');
    const named = name ? d.towns.towns.find((x) => x.name.toLowerCase() === name.toLowerCase()) : null;
    if (named && String(named.id) !== String(state.townId)) { resetTown(); state.townId = String(named.id); state.view = 'work'; }
    if (m && ROUTE_IDS.includes(m[1])) state.route = m[1];
  }
  function writeHash() {
    if (state.view !== 'work') { history.replaceState(null, '', location.pathname + location.search); return; }
    const q = state.townId !== 'own' && ctx ? `?town=${encodeURIComponent(ctx.town.name)}` : '';
    history.replaceState(null, '', `#/${state.route}${q}`);
  }

  function compute() { ctx = buildContext(d, state, t, today); }

  function render(focusTop = false) {
    if (state.view === 'work') {
      compute();
      app.innerHTML = renderShell(ctx);
      document.title = `${t(`nav.${state.route}`)}: ${ctx.town.name}. ${t('app.title')}`;
    } else if (state.view === 'check') { app.innerHTML = renderCheck(state, sysIdx, t); document.title = t('app.title'); }
    else { app.innerHTML = renderLanding(state, d, t); document.title = t('app.title'); }
    document.body.dataset.view = state.view;
    writeHash();
    if (focusTop) { window.scrollTo({ top: 0, behavior: 'instant' }); (document.getElementById('screen') || app).focus({ preventScroll: true }); }
  }

  function go(route) { state.route = route; render(true); }

  /* ----- scenarios: the active one's levers live in state; the list keeps every scenario ----- */
  function saveActive() { const s = state.scen[state.active]; for (const k of LEVER_KEYS) s[k] = state[k]; }
  function loadActive(i) {
    saveActive();
    state.active = Math.max(0, Math.min(state.scen.length - 1, i));
    const s = state.scen[state.active];
    for (const k of LEVER_KEYS) state[k] = s[k] ?? (k === 'wcol' ? null : k === 'compost' ? false : 0);
  }
  function addScenario() {
    if (state.scen.length >= 3) return;
    saveActive();
    state.scen.push(newScenario(`Scenario ${'ABC'[state.scen.length]}`));
    loadActive(state.scen.length - 1);
  }
  function resetTown() {
    Object.assign(state, { gw: 'low', uptake: 0, treat: 0, wcol: null, wctl: 0, compost: false, ops: {}, wards: [], gov: {}, phase: {}, scen: [newScenario('Scenario A')], active: 0 });
  }

  /** After a control moves on the Scenarios or Investment screen: redraw what depends on it, leave the control alone. */
  function refresh({ levers = false } = {}) {
    saveActive();
    compute();
    const res = $('#scen-results'); if (res) res.innerHTML = scenarioResults(ctx);
    if (levers && $('#levers')) $('#levers').innerHTML = leversBlock(ctx);
    if ($('#bridge')) { $('#bridge').innerHTML = bridgeBlock(ctx); $('#totals').innerHTML = totalsBlock(ctx); }
    if ($('#phase')) $('#phase').innerHTML = phaseBlock(ctx);
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
    if (!state.country) { const h = pages.slice(0, 2).join(' '); state.country = COUNTRIES.find((c) => h.includes(c)) || ''; }
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

  /** A filled planner workbook: every tier it carries goes into the page state; the figures then pass the check screen. */
  async function readBook(file) {
    const { readWorkbook } = await import('../xlsx/workbook.js');
    const book = await readWorkbook(new Uint8Array(await file.arrayBuffer()));
    const res = readTemplate(book, { t, sysIdx, rules: d.rules, sizing: d.sizing, wfdFields: WFD_FIELDS });
    if (!res.tiers[1].length && !res.form.name) return [{ kind: 'err', key: 'read.wb_bad', vars: { name: file.name } }];
    state.ownForm = { ...res.form };
    if (res.form.country) state.country = COUNTRIES.includes(res.form.country) ? res.form.country : 'other';
    const snap = (keys) => Object.fromEntries(Object.entries(res.form).filter(([k]) => keys(k)));
    state.upSnap = { sfd: snap((k) => /^(share_|emptied_)/.test(k) || ['population', 'households', 'sludge_pct'].includes(k)), wfd: snap((k) => WFD_FIELDS.includes(k)) };
    state.upMeta = { wb: true, sfd: { file: null, date: res.form.sfd_year ? `${res.form.sfd_year}` : null }, wfd: {} };
    state.pending = { ops: res.ops, wards: res.wards, gov: res.gov, scen: res.scenarios };
    state.rates = { ...state.rates, ...Object.fromEntries(Object.entries(res.rates).map(([k, v]) => [k, { ...(state.rates[k] || {}), ...v }])) };
    state.ruleOverrides = { ...state.ruleOverrides, ...res.ruleOverrides };
    if (res.ops.currency) state.currency = res.ops.currency;
    const tiers = [res.tiers[1].length ? t('read.wb_tiers') : '', res.tiers[2].length ? t('read.wb_t2') : '', res.tiers[3].length ? t('read.wb_t3') : ''].filter(Boolean).join(', ');
    return [{ kind: 'ok', key: 'read.wb', vars: { town: res.form.name || '?', tiers } }, ...res.problems.map((p) => ({ kind: 'note', key: p.key }))];
  }

  async function handleFiles(list) {
    const files = [...list].slice(0, 4);
    if (!files.length) return;
    if (state.view === 'work') { state.view = 'landing'; state.ownForm = {}; state.upSnap = {}; state.upMeta = {}; state.manual = false; }
    state.reading = files.map((f) => ({ kind: 'busy', key: 'read.start', vars: { name: f.name } }));
    if (state.view === 'landing') render();
    const out = [];
    let good = 0;
    for (const file of files) {
      const name = file.name;
      if (file.size > MAX_FILE) { out.push({ kind: 'err', key: 'read.too_big', vars: { name } }); continue; }
      if (/\.xlsx$/i.test(name)) {
        try { const m = await readBook(file); out.push(...m); if (m[0].kind === 'ok') good += 1; } catch (err) { console.error(err); out.push({ kind: 'err', key: 'read.wb_bad', vars: { name } }); }
        continue;
      }
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
    const res = buildOwn({ ...state.ownForm, country: state.country }, sysIdx);
    if (!res.own) { state.msgs = res.errors.map((e) => ({ kind: 'err', ...e })); $('#check-msgs').innerHTML = `<ul class="msgs">${state.msgs.map((m) => `<li class="msg-${m.kind}">${esc(t(m.key, m.vars))}</li>`).join('')}</ul>`; $('#check-msgs').scrollIntoView({ block: 'center' }); return; }
    const basis = reportBasis(state.ownForm, state.upSnap, { sfd: Boolean(res.own.sfdTown), wfd: Boolean(res.own.wfdTown) });
    if (state.upMeta.wb) for (const k of ['sfd', 'wfd']) if (basis[k] === 'uploaded') basis[k] = 'workbook';
    const us = state.upMeta.sfd || {}; const uw = state.upMeta.wfd || {};
    res.own.town.meta = { basis, sfd_basis: basis.sfd, sfd_file: us.file || null, sfd_date: us.date || null,
      stated_safe: basis.sfd === 'uploaded' ? us.stated_safe ?? null : null, share_sum: basis.sfd === 'uploaded' ? us.share_sum ?? null : null,
      wfd_portal: Boolean(uw.portal), wfd_version: uw.version || null, wfd_model: uw.model || null };
    if (us.date) res.own.town.sfd.date = us.date;
    resetTown();
    const p = state.pending;
    if (p) { Object.assign(state, { ops: p.ops, wards: p.wards, gov: p.gov }); if (p.scen.length) { state.scen = p.scen.map((s) => ({ ...newScenario(s.name), ...s })); state.active = 0; loadActive(0); } state.pending = null; }
    state.own = res.own; state.townId = 'own'; state.msgs = []; state.view = 'work'; state.route = 'overview';
    render(true);
  }

  function tryLever(k) {
    const c0 = ctx.wv ? Math.round(ctx.wv.collected_share * 100) : 0;
    const set = (lv) => { if (lv === 'uptake') state.uptake = 100; else if (lv === 'treat') state.treat = 100; else if (lv === 'collection') state.wcol = Math.max(c0, 90); else if (lv === 'controlled') state.wctl = 100; else if (lv === 'compost') state.compost = true; };
    if (k === 'both') { set('uptake'); set('collection'); } else set(k);
    saveActive();
    go('scenarios');
  }

  function preset(kind) {
    const c0 = ctx.wv ? Math.round(ctx.wv.collected_share * 100) : null;
    if (kind === 'full') Object.assign(state, { uptake: ctx.r ? 100 : 0, treat: ctx.r ? 100 : 0, wcol: c0 === null ? null : Math.max(c0, 90), wctl: ctx.wv ? 100 : 0, compost: Boolean(ctx.wv && ctx.wv.organic_share) });
    else Object.assign(state, { uptake: 0, treat: 0, wcol: null, wctl: 0, compost: false });
    refresh({ levers: true });
  }

  /* ----- workbook out ----- */
  function currentForm() {
    if (ctx.isOwn) return { ...state.ownForm, country: state.country, district: ctx.town.district || '' };
    const f = { name: ctx.town.name, country: 'Bangladesh', district: ctx.town.district || '', population: String(ctx.town.population_sfd), households: ctx.town.households_stated ? String(ctx.town.households_stated) : '',
      sfd_year: ctx.town.sfd.date ? ctx.town.sfd.date.slice(0, 4) : '', sfd_source: `SFD Lite, ${ctx.town.sfd.prepared_by || ''}`.trim(), wfd_source: 'SFD-WFD 50-town dataset' };
    if (ctx.sfdTown) {
      for (const s of ctx.sfdTown.systems) { f[`share_${s.code}`] = r2(s.pop_share * 100); if (sysIdx[s.code].group !== 'direct') f[`emptied_${s.code}`] = r2((s.emptied_share || 0) * 100); }
      const sep = ctx.sfdTown.systems.find((s) => s.sludge_factor !== null && s.sludge_factor !== undefined);
      f.sludge_pct = sep ? r2(sep.sludge_factor * 100) : '';
    }
    const wv = ctx.wv;
    if (wv) {
      const U = wv.plastic_unmanaged_t; const sh = (keys) => keys.reduce((a, k) => a + ((wv.stages.find((s) => s.key === k) || {}).share || 0), 0) * U;
      const fate = Object.fromEntries(wv.fates.map((x) => [x.key, x.tonnes]));
      Object.assign(f, { msw_t_day: r2(wv.msw_t_day), collected_pct: r2(wv.collected_share * 100), plastic_generated_t: r2(wv.plastic_generated_t), plastic_unmanaged_t: r2(U),
        stage_uncollected_t: r2(sh(['uncollected'])), stage_collection_t: r2(sh(['collection', 'informal_collection'])), stage_sorting_t: r2(sh(['formal_sorting', 'informal_sorting'])),
        stage_transport_t: r2(sh(['transport'])), stage_disposal_t: r2(sh(['disposal'])), fate_land_t: r2(fate.land), fate_water_t: r2(fate.water), fate_burnt_t: r2(fate.burnt), fate_drains_t: r2(fate.drains),
        organic_pct: wv.organic_share === null ? '' : r2(wv.organic_share * 100), recovered_t: r2(wv.recovered_t_year || 0), disposed_t: r2(wv.disposed_t_year || 0) });
    }
    return f;
  }
  async function exportBook(blank = false) {
    const { writeWorkbook } = await import('../xlsx/workbook.js');
    if (!blank) saveActive();
    const defaults = {};
    if (!blank) for (const l of [...ctx.full.lines, ...ctx.sizing.lines]) {
      if (l.rate.source === 'engineer' || (l.rate.source === 'user' && l.rate.low !== null)) defaults[l.id] = `Engineer's sheet (${l.rate.eng_items.join(' + ')}): ${Math.round(l.rate.low)} to ${Math.round(l.rate.high)} ${t(`per.${l.rate_unit}`)} for this town`;
      else if (l.rate.source === 'included') defaults[l.id] = 'Included in the treatment plant price';
    }
    const v = blank ? {} : { defaults, form: currentForm(), ops: { ...state.ops, currency: state.currency || state.ops.currency }, wards: state.wards, gov: state.gov, rates: state.rates, ruleOverrides: state.ruleOverrides, scenarios: state.scen };
    const sheets = templateSheets({ t, sysIdx, rules: d.rules, sizing: d.sizing, v, wfdFields: WFD_FIELDS, title: blank ? '' : ctx.town.name });
    download(writeWorkbook(sheets), blank ? 'planner-workbook-blank.xlsx' : `planner-workbook-${slug(ctx.town.name)}-${today}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  /* ----- run file (JSON): every choice on the page ----- */
  function saveRun() {
    saveActive();
    const run = { tool: 'sanitation-waste-planner', version: '0.4', exported: new Date().toISOString(), town: ctx.town.name,
      scen: state.scen, active: state.active, gw: state.gw, rates: state.rates, rule_overrides: state.ruleOverrides, currency: state.currency, ops: state.ops, wards: state.wards, gov: state.gov, phase: state.phase };
    download(JSON.stringify(run, null, 1), `planner-run-${slug(ctx.town.name)}-${today}.json`, 'application/json');
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
        if (typeof o.owner === 'string') c.owner = o.owner.slice(0, 60);
        if (Object.keys(c).length) rates[id] = c;
      }
      state.rates = rates;
      const known = new Set(d.sizing.rules.map((x) => x.id));
      state.ruleOverrides = Object.fromEntries(Object.entries(run.rule_overrides || {}).filter(([k, v]) => known.has(k) && numOrNull(v) > 0));
      state.currency = typeof run.currency === 'string' ? run.currency.slice(0, 6) : '';
      const p100 = (v) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
      const scen = Array.isArray(run.scen) ? run.scen.slice(0, 3).map((s, i) => ({ name: String(s.name || `Scenario ${'ABC'[i]}`).slice(0, 30), uptake: p100(s.uptake), treat: p100(s.treat), wctl: p100(s.wctl), wcol: s.wcol === null || s.wcol === undefined ? null : p100(s.wcol), compost: Boolean(s.compost) })) : [];
      if (scen.length) { state.scen = scen; state.active = 0; for (const k of LEVER_KEYS) state[k] = scen[0][k]; }
      state.gw = run.gw === 'high' ? 'high' : 'low';
      const clean = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([k, v]) => /^[a-z_]{1,40}$/.test(k) && (numOrNull(v) !== null || (k === 'currency' && typeof v === 'string'))).map(([k, v]) => [k, k === 'currency' ? String(v).slice(0, 6) : v]));
      state.ops = clean(run.ops); state.gov = clean(run.gov);
      state.wards = Array.isArray(run.wards) ? run.wards.slice(0, 200).filter((w) => w && typeof w.ward === 'string' && numOrNull(w.population) !== null).map((w) => ({ ward: w.ward.slice(0, 40), population: w.population, households: numOrNull(w.households), low_income_pct: numOrNull(w.low_income_pct) })) : [];
      state.phase = Object.fromEntries(Object.entries(run.phase && typeof run.phase === 'object' ? run.phase : {}).filter(([k, v]) => /^[\w: ,.-]{1,80}$/.test(k) && v && typeof v === 'object').map(([k, v]) => [k, { start: numOrNull(v.start), years: numOrNull(v.years) }]));
      state.runMsg = t('run.loaded');
    } catch (err) { state.runMsg = t('run.bad'); }
    render();
  }

  /* ----- events ----- */
  app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.act === 'files' && el.files.length) handleFiles(el.files);
    else if (el.dataset.act === 'country') state.country = el.value;
    else if (el.dataset.act === 'load-run' && el.files[0]) loadRun(el.files[0]);
    else if (el.dataset.act === 'scen-pick') { if (el.value === 'new') addScenario(); else loadActive(Number(el.value)); render(); }
    else if (el.dataset.phase) {
      const p = state.phase[el.dataset.line] || {};
      p[el.dataset.phase] = Number(el.value);
      state.phase[el.dataset.line] = p;
      compute(); $('#phase').innerHTML = phaseBlock(ctx);
    }
  });
  app.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.own) {
      state.ownForm[el.dataset.own] = el.value;
      if (el.dataset.own.startsWith('share_') && $('#share-total')) $('#share-total').innerHTML = shareTotal(state.ownForm, t);
    } else if (el.dataset.lever) {
      const k = el.dataset.lever;
      if (k === 'compost') state.compost = el.checked;
      else if (k === 'gw') { state.gw = el.checked ? 'high' : 'low'; refresh({ levers: true }); return; }
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
      if ($('#phase')) $('#phase').innerHTML = phaseBlock(ctx);
    } else if (el.dataset.rule) {
      const v = Number(el.value);
      if (Number.isFinite(v) && v > 0) state.ruleOverrides[el.dataset.rule] = v; else delete state.ruleOverrides[el.dataset.rule];
      refresh();
    } else if (el.dataset.act === 'currency') {
      state.currency = el.value.trim().slice(0, 6);
      refresh();
    } else if (el.dataset.act === 'scen-name') {
      state.scen[state.active].name = el.value.trim().slice(0, 30) || `Scenario ${'ABC'[state.active]}`;
      const tab = app.querySelector(`[data-act="scen-go"][data-i="${state.active}"]`); if (tab) tab.textContent = state.scen[state.active].name;
      const opt = app.querySelector(`[data-act="scen-pick"] option[value="${state.active}"]`); if (opt) opt.textContent = state.scen[state.active].name;
      refresh();
    }
  });
  app.addEventListener('click', (e) => {
    const el = e.target.closest('button[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'show-sample') { state.showSample = true; render(); $('#sample-town').focus(); }
    else if (act === 'open-sample') { const id = $('#sample-town').value; if (id !== String(state.townId)) resetTown(); state.townId = id; state.view = 'work'; state.route = 'overview'; render(true); }
    else if (act === 'manual') { state.manual = true; state.view = 'check'; render(true); }
    else if (act === 'analyse') analyse();
    else if (act === 'restart') { state = defaultState(); render(true); }
    else if (act === 'pdf') window.print();
    else if (act === 'preset') preset(el.dataset.preset);
    else if (act === 'try') tryLever(el.dataset.lever);
    else if (act === 'save-run') saveRun();
    else if (act === 'wb-export') exportBook(false);
    else if (act === 'wb-blank') exportBook(true);
    else if (act === 'sort') { state.sort = el.dataset.sort; render(); }
    else if (act === 'scen-go') { loadActive(Number(el.dataset.i)); render(); }
    else if (act === 'scen-add') { addScenario(); render(); }
    else if (act === 'scen-del' && state.scen.length > 1) { state.scen.splice(state.active, 1); state.active = 0; const s = state.scen[0]; for (const k of LEVER_KEYS) state[k] = s[k]; render(); }
  });
  for (const type of ['dragenter', 'dragover']) app.addEventListener(type, (e) => { const z = e.target.closest?.('.drop'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  app.addEventListener('dragleave', (e) => { const z = e.target.closest?.('.drop'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('over'); });
  app.addEventListener('drop', (e) => { const z = e.target.closest?.('.drop'); if (!z) return; e.preventDefault(); z.classList.remove('over'); if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  window.addEventListener('hashchange', () => {
    const before = `${state.route}|${state.townId}`;
    readHash();
    if (`${state.route}|${state.townId}` !== before && state.view === 'work') render(true);
  });

  readHash();
  render();
}

loadAll().then(start).catch((err) => {
  $('#app').innerHTML = '<p class="draft">The page could not load its data files. Reload to try again; if you opened the file from disk, serve the folder over HTTP instead.</p>';
  console.error(err);
});

// Offline use: keep a copy of the page's own files. Network first, so a new version always wins when online.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
