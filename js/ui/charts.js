// Charts as HTML and SVG strings. No DOM access. Sizes that depend on data are emitted as data-* attributes
// (data-grow, data-w, data-top) and applied by app.js through the CSSOM: the page's CSP forbids inline styles.

import { COMPONENTS } from '../engine/sfd.js';
import { esc, pct } from './render.js';

/** 100 squares, one per percent of the town, coloured by where the excreta ends up. */
export function waffle(components, t) {
  const total = COMPONENTS.reduce((a, k) => a + components[k], 0) || 1;
  const exact = COMPONENTS.map((k) => (components[k] / total) * 100);
  const counts = exact.map(Math.floor);
  let left = 100 - counts.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => [v - counts[i], i]).sort((a, b) => b[0] - a[0]);
  for (let j = 0; left > 0; j += 1, left -= 1) counts[order[j % order.length][1]] += 1;
  const cells = [];
  COMPONENTS.forEach((k, i) => { for (let n = 0; n < counts[i]; n += 1) cells.push(k); });
  const squares = cells.map((k, i) => `<rect class="fill-${k}" x="${(i % 10) * 12}" y="${Math.floor(i / 10) * 12}" width="10" height="10" rx="1.5"></rect>`).join('');
  const label = COMPONENTS.map((k) => `${t(`comp.short.${k}`)} ${pct(components[k], 0)}`).join(', ');
  return `<svg class="waffle" viewBox="0 0 118 118" role="img" aria-label="${esc(t('chart.waffle_label'))}: ${esc(label)}">${squares}</svg>`;
}

/** One stacked bar of the five outcome components. */
export function flowbar(components, t, cls = '') {
  const total = COMPONENTS.reduce((a, k) => a + components[k], 0) || 1;
  const segs = COMPONENTS.filter((k) => components[k] > 0.0005).map((k) => {
    const share = components[k] / total;
    const label = share >= 0.07 ? `<span class="seg-label">${pct(components[k], 0)}</span>` : '';
    return `<div class="seg seg-${k}" data-grow="${share.toFixed(5)}" tabindex="0" data-tip="${esc(t(`comp.${k}`))}: ${pct(components[k])}">${label}</div>`;
  }).join('');
  return `<div class="flowbar ${cls}" role="img" aria-label="${esc(COMPONENTS.map((k) => `${t(`comp.short.${k}`)} ${pct(components[k])}`).join(', '))}">${segs}</div>`;
}

const GROUPS = ['direct', 'septic', 'tank', 'pit'];
const GAP = 2.5;

function spread(nodes, minGap) { // keep labels from sitting on top of each other
  let prev = 5 - minGap; // keep clear of the column heading
  for (const n of nodes) { n.label = Math.max(n.mid, prev + minGap); prev = n.label; }
  let next = 97 + minGap;
  for (let i = nodes.length - 1; i >= 0; i -= 1) { nodes[i].label = Math.min(nodes[i].label, next - minGap); next = nodes[i].label; }
}

/** Where it goes: toilet and tank types on the left, outcomes on the right, a ribbon for every flow between them. */
export function ribbons(systems, t) {
  const left = GROUPS.map((g) => {
    const rows = systems.filter((s) => s.group === g);
    const flows = { safe: 0, s11e: 0, w11c: 0, f15: 0, f11: 0 };
    for (const s of rows) { flows.safe += s.safe_share; flows.s11e += s.s11e; flows.w11c += s.w11c; flows.f15 += s.f15; flows.f11 += s.f11; }
    return { key: g, flows, value: COMPONENTS.reduce((a, k) => a + flows[k], 0) };
  }).filter((n) => n.value > 0);
  const right = COMPONENTS.map((k) => ({ key: k, value: left.reduce((a, n) => a + n.flows[k], 0) })).filter((n) => n.value > 0);
  const total = left.reduce((a, n) => a + n.value, 0) || 1;
  const place = (nodes) => {
    const scale = (100 - GAP * (nodes.length - 1)) / total;
    let y = 0;
    for (const n of nodes) { n.y = y; n.h = n.value * scale; n.mid = y + n.h / 2; n.used = 0; n.scale = scale; y += n.h + GAP; }
  };
  place(left); place(right);
  spread(left, 14); spread(right, 14);
  const paths = [];
  for (const l of left) {
    for (const r of right) {
      const v = l.flows[r.key];
      if (!(v > 0)) continue;
      const a0 = l.y + l.used; const a1 = a0 + v * l.scale; l.used += v * l.scale;
      const b0 = r.y + r.used; const b1 = b0 + v * r.scale; r.used += v * r.scale;
      const f = (n) => n.toFixed(2);
      paths.push(`<path class="rib fill-${r.key}" d="M4,${f(a0)} C50,${f(a0)} 50,${f(b0)} 96,${f(b0)} L96,${f(b1)} C50,${f(b1)} 50,${f(a1)} 4,${f(a1)} Z" tabindex="0" data-tip="${esc(t(`group.${l.key}`))} → ${esc(t(`comp.short.${r.key}`).toLowerCase())}: ${pct(v)}"></path>`);
    }
  }
  const lrect = left.map((n) => `<rect class="node" x="0" y="${n.y.toFixed(2)}" width="4" height="${Math.max(0.4, n.h).toFixed(2)}"></rect>`).join('');
  const rrect = right.map((n) => `<rect class="fill-${n.key}" x="96" y="${n.y.toFixed(2)}" width="4" height="${Math.max(0.4, n.h).toFixed(2)}"></rect>`).join('');
  const llab = left.map((n) => `<p class="rib-label" data-top="${n.label.toFixed(1)}"><span class="rib-name">${esc(t(`group.${n.key}`))}</span><span class="num">${pct(n.value, 0)}</span></p>`).join('');
  const rlab = right.map((n) => `<p class="rib-label" data-top="${n.label.toFixed(1)}"><span class="rib-name"><span class="swatch seg-${n.key}"></span>${esc(t(`comp.short.${n.key}`))}</span><span class="num">${pct(n.value, 0)}</span></p>`).join('');
  const aria = right.map((n) => `${t(`comp.short.${n.key}`)} ${pct(n.value)}`).join(', ');
  return `<div class="ribbons">
    <div class="rib-col rib-left"><p class="rib-head">${esc(t('chart.rib_from'))}</p>${llab}</div>
    <div class="rib-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(t('chart.rib_label'))}: ${esc(aria)}">${paths.join('')}${lrect}${rrect}</svg></div>
    <div class="rib-col rib-right"><p class="rib-head">${esc(t('chart.rib_to'))}</p>${rlab}</div>
  </div>`;
}

/** Horizontal bars: one row per item, bar length relative to the largest. rows = [{ label, value, text, note, strong }] */
export function hbars(rows, cls = '', scaleMax = null) {
  const max = scaleMax || Math.max(...rows.map((r) => r.value), 0) || 1;
  return `<div class="hbars ${cls}">${rows.map((r) => `<div class="hbar-row${r.strong ? ' is-strong' : ''}">
    <span class="hbar-label">${esc(r.label)}</span>
    <span class="hbar-track"><span class="hbar-fill${r.cls ? ` ${r.cls}` : ''}" data-w="${((r.value / max) * 100).toFixed(2)}"${r.tip ? ` tabindex="0" data-tip="${esc(r.tip)}"` : ''}></span></span>
    <span class="hbar-val num">${esc(r.text)}${r.note ? ` <span class="range">${esc(r.note)}</span>` : ''}</span></div>`).join('')}</div>`;
}
