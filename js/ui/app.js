// Page wiring: load data, read the settings, run the engine, put the result on the page.
import { plan } from '../engine/plan.js';
import { paramMap } from '../engine/cost.js';
import { peerTable, systemIndex } from '../engine/sfd.js';
import { makeT, renderFacts, renderSheet, esc } from './render.js';

const DEFAULT_TOWN = 'Ishwardi'; // a typical town; Kaliakair is the extreme of the 50
const $ = (sel) => document.querySelector(sel);

async function loadAll() {
  const names = ['towns', 'sfd', 'rules', 'costs', 'params', 'strings.en'];
  const res = await Promise.all(names.map((n) => fetch(`data/${n}.json`).then((r) => { if (!r.ok) throw new Error(n); return r.json(); })));
  return Object.fromEntries(names.map((n, i) => [n.replace('.en', ''), res[i]]));
}

function readHash() {
  const out = {};
  for (const [k, v] of new URLSearchParams(location.hash.slice(1))) out[k] = v;
  return out;
}

function start(d) {
  const t = makeT(d.strings);
  const base = paramMap(d.params);
  const peers = peerTable(d.towns.towns, d.sfd, systemIndex(d.rules));
  const form = $('#settings');
  const select = $('#town');

  if (window.matchMedia('(min-width: 901px)').matches || location.hash.length > 1) $('#settings-wrap').open = true;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  const sorted = d.towns.towns.slice().sort((a, b) => a.name.localeCompare(b.name));
  select.innerHTML = sorted.map((x) => `<option value="${x.id}">${esc(x.name)}${x.district ? `, ${esc(x.district)}` : ''}</option>`).join('');

  // initial state: URL hash, then defaults from the workbook parameters
  const h = readHash();
  const first = d.towns.towns.find((x) => x.name.toLowerCase() === (h.town || DEFAULT_TOWN).toLowerCase()) || d.towns.towns.find((x) => x.name === DEFAULT_TOWN);
  select.value = String(first.id);
  form.gw.value = h.gw === 'high' ? 'high' : 'low';
  form.case.value = ['low', 'mid', 'high'].includes(h.case) ? h.case : base.cost_case;
  form.basis.value = h.basis === 'hh_size' ? 'hh_size' : base.hh_basis;
  form.hh.value = Number(h.hh) > 0 ? h.hh : base.hh_size;
  form.disc.value = Number(h.disc) > 0 ? h.disc : +(base.disc_rate * 100).toFixed(2);

  function draw() {
    const town = d.towns.towns.find((x) => String(x.id) === select.value);
    const hhSize = Math.min(15, Math.max(1, Number(form.hh.value) || base.hh_size));
    const disc = Math.min(30, Math.max(0.5, Number(form.disc.value) || base.disc_rate * 100)) / 100;
    const settings = { gw: form.gw.value, overrides: { cost_case: form.case.value, hh_basis: form.basis.value, hh_size: hhSize, disc_rate: disc } };
    const r = plan(town, d.sfd.towns[String(town.id)], d.rules, d.costs, d.params, settings);
    $('#facts').innerHTML = renderFacts(r, town, t);
    $('#sheet').innerHTML = renderSheet(r, town, peers, t);
    $('#sheet').querySelectorAll('[data-grow]').forEach((el) => { el.style.flexGrow = el.dataset.grow; });
    document.title = `${town.name}: ${t('app.title')} (draft)`;
    const q = new URLSearchParams({ town: town.name, gw: settings.gw, case: form.case.value, basis: form.basis.value, hh: String(hhSize), disc: String(+(disc * 100).toFixed(2)) });
    history.replaceState(null, '', `#${q}`);
  }

  $('#foot').innerHTML = `<p>${esc(t('foot.privacy'))}</p><p>${esc(t('foot.versions', { rules: d.rules.data_version, data: d.sfd.data_version, source: d.sfd.source }))}</p><p>${esc(t('foot.licence'))}</p>`;
  select.addEventListener('change', draw);
  form.addEventListener('input', draw);
  form.addEventListener('submit', (e) => e.preventDefault());
  draw();
}

// One tooltip for every mark that carries data-tip (bar segments, peer dots).
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
