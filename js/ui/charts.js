// Charts as SVG strings: flow (Sankey) diagrams, end-state bars, service chains, the part each action plays, peer scatter, phasing.
// Colours come from the stylesheet by class (the page's CSP forbids inline styles). Every mark carries a <title> for hover.
// Receiver colours were checked with the dataviz palette validator; ground and burnt are deliberately neutral and always labelled.

import { esc, int, pct, qty, people } from './util.js';

const f1 = (v) => (Math.round(v * 10) / 10).toString();

/**
 * Flow diagram. nodes: [{ id, label, col, cls }], links: [{ s, t, v }]. Node order inside a column follows the nodes array.
 * fmt formats a value; aria is the accessible name.
 */
export function sankey({ nodes, links, width = 960, height: h0 = 380, fmt = int, aria = '', labelRight = 190 }) {
  let height = h0;
  const cols = Math.max(...nodes.map((n) => n.col)) + 1;
  const pad = 14; const nw = 12; const top = 8;
  const H = height - top * 2;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, { ...n, in: 0, out: 0 }]));
  const L = links.filter((l) => byId[l.s] && byId[l.t] && l.v > 0);
  for (const l of L) { byId[l.s].out += l.v; byId[l.t].in += l.v; }
  const live = Object.values(byId).filter((n) => n.in + n.out > 0);
  for (const n of live) n.value = Math.max(n.in, n.out);
  const colNodes = Array.from({ length: cols }, (_, c) => nodes.map((n) => byId[n.id]).filter((n) => n.col === c && n.value > 0));
  const k = Math.min(...colNodes.filter((c) => c.length).map((c) => (H - pad * (c.length - 1)) / c.reduce((a, n) => a + n.value, 0)));
  const usable = width - labelRight - 20;
  const xOf = (c) => 10 + (cols === 1 ? 0 : (c * (usable - nw)) / (cols - 1));
  const SLOT = 34; // room for a label and its value beside a thin node
  let bottom = 0;
  for (const c of colNodes) {
    const total = c.reduce((a, n) => a + Math.max(n.value * k, SLOT), 0) + pad * (c.length - 1);
    let y = top + Math.max(0, (H - total) / 2);
    for (const n of c) { n.x = xOf(n.col); n.h = Math.max(1.5, n.value * k); const slot = Math.max(n.h, SLOT); n.y = y + (slot - n.h) / 2; n.so = 0; n.ti = 0; y += slot + pad; }
    bottom = Math.max(bottom, y - pad + top);
  }
  height = Math.max(height, Math.ceil(bottom));
  const order = (id) => nodes.findIndex((n) => n.id === id);
  const sorted = [...L].sort((a, b) => order(a.s) - order(b.s) || order(a.t) - order(b.t));
  let paths = '';
  for (const l of sorted) {
    const s = byId[l.s]; const t = byId[l.t];
    const h = l.v * k;
    const y0 = s.y + s.so; s.so += h;
    const y1 = t.y + t.ti; t.ti += h;
    const x0 = s.x + nw; const x1 = t.x; const xm = (x0 + x1) / 2;
    const cls = t.cls || s.cls || 'n';
    paths += `<path class="sk-link sk-${cls}" d="M${f1(x0)} ${f1(y0)}C${f1(xm)} ${f1(y0)} ${f1(xm)} ${f1(y1)} ${f1(x1)} ${f1(y1)}L${f1(x1)} ${f1(y1 + h)}C${f1(xm)} ${f1(y1 + h)} ${f1(xm)} ${f1(y0 + h)} ${f1(x0)} ${f1(y0 + h)}Z"><title>${esc(s.label)} to ${esc(t.label)}: ${esc(fmt(l.v))}</title></path>`;
  }
  let marks = '';
  for (const n of live) {
    const last = n.col === cols - 1;
    const lx = n.x + nw + 6;
    const ly = n.y + n.h / 2;
    marks += `<rect class="sk-node sk-${n.cls || 'n'}" x="${f1(n.x)}" y="${f1(n.y)}" width="${nw}" height="${f1(n.h)}" rx="2"><title>${esc(n.label)}: ${esc(fmt(n.value))}</title></rect>`;
    marks += `<text class="sk-lab${last ? ' sk-lab-end' : ''}" x="${f1(lx)}" y="${f1(ly - 1)}">${esc(n.label)}</text><text class="sk-val" x="${f1(lx)}" y="${f1(ly + 15)}">${esc(fmt(n.value))}</text>`;
  }
  return `<svg class="sankey" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}">${paths}${marks}</svg>`;
}

/** One horizontal bar split into parts. parts: [{ key, cls, value, label }], total = full width. */
function stack(parts, total, y, h, W, fmt) {
  let x = 0; let out = '';
  const gap = 2;
  for (const p of parts) {
    if (!(p.value > 0)) continue;
    const w = Math.max(0, (p.value / total) * W - gap);
    out += `<rect class="bar bar-${p.cls}" x="${f1(x)}" y="${y}" width="${f1(Math.max(1, w))}" height="${h}" rx="3"><title>${esc(p.label)}: ${esc(fmt(p.value))}</title></rect>`;
    if (w > 54) out += `<text class="bar-in" x="${f1(x + 6)}" y="${y + h / 2 + 5}">${esc(fmt(p.value))}</text>`;
    x += w + gap;
  }
  return out;
}

/** Before and after, where it ends up. rows: [{ label, parts }]; legend from the first row's parts. */
export function endBars({ rows, total, fmt, aria, legend }) {
  const W = 640; const h = 26; const rowH = 52;
  let y = 0; let out = '';
  for (const r of rows) {
    out += `<text class="bar-row" x="0" y="${y + 13}">${esc(r.label)}</text>`;
    out += `<g transform="translate(0 ${y + 18})">${stack(r.parts, total, 0, h, W, fmt)}</g>`;
    y += rowH;
  }
  const key = (legend || rows[0].parts).map((p) => `<span class="lg"><i class="sw sw-${p.cls}"></i>${esc(p.label)}</span>`).join('');
  return `<figure class="endbars"><svg viewBox="0 0 ${W} ${y}" role="img" aria-label="${esc(aria)}">${out}</svg><figcaption class="legend">${key}</figcaption></figure>`;
}

/** Service chain: one bar per stage, as shares. stages: [{ label, value, note }] */
export function chainBars({ stages, cls, aria }) {
  const W = 420; const rowH = 34;
  const out = stages.map((s, i) => {
    const y = i * rowH;
    const w = Math.max(0, Math.min(1, s.value)) * (W - 170);
    return `<text class="ch-l" x="0" y="${y + 17}">${esc(s.label)}</text><rect class="ch-track" x="150" y="${y + 6}" width="${W - 170}" height="14" rx="3"/>
      <rect class="ch-bar ch-${cls}" x="150" y="${y + 6}" width="${f1(Math.max(w, s.value > 0 ? 2 : 0))}" height="14" rx="3"><title>${esc(s.label)}: ${esc(pct(s.value))}</title></rect>
      <text class="ch-v" x="${W - 12}" y="${y + 18}" text-anchor="end">${esc(pct(s.value))}</text>`;
  }).join('');
  return `<svg class="chain" viewBox="0 0 ${W} ${stages.length * rowH}" role="img" aria-label="${esc(aria)}">${out}</svg>`;
}

/**
 * Waterfall: start value, one step per action, end value. steps: [{ label, delta }]; good = 'up' or 'down'.
 */
export function waterfall({ start, steps, endLabel, startLabel, fmt, good, aria }) {
  const W = 440; const H = 230; const left = 4; const bottom = 44;
  const vals = [start]; let cur = start;
  for (const s of steps) { cur += s.delta; vals.push(cur); }
  const max = Math.max(...vals, start) * 1.08 || 1;
  const n = steps.length + 2; const bw = Math.min(90, (W - left) / n - 16);
  const y = (v) => H - bottom - (v / max) * (H - bottom - 14);
  const col = (i) => left + i * ((W - left) / n) + 8;
  let out = `<path class="wf-axis" d="M0 ${H - bottom}H${W}"/>`;
  const bar = (i, a, b, cls, label, val) => {
    const y0 = Math.min(y(a), y(b)); const h = Math.max(1.5, Math.abs(y(a) - y(b)));
    return `<rect class="wf wf-${cls}" x="${f1(col(i))}" y="${f1(y0)}" width="${f1(bw)}" height="${f1(h)}" rx="2"><title>${esc(label)}: ${esc(val)}</title></rect>
      <text class="wf-v" x="${f1(col(i) + bw / 2)}" y="${f1(y0 - 5)}" text-anchor="middle">${esc(val)}</text>
      <foreignObject x="${f1(col(i) - 6)}" y="${H - bottom + 4}" width="${f1(bw + 12)}" height="${bottom - 4}"><p xmlns="http://www.w3.org/1999/xhtml" class="wf-l">${esc(label)}</p></foreignObject>`;
  };
  out += bar(0, 0, start, 'total', startLabel, fmt(start));
  cur = start;
  steps.forEach((s, i) => {
    const next = cur + s.delta;
    const better = good === 'up' ? s.delta > 0 : s.delta < 0;
    const sign = s.delta > 0 ? '+' : s.delta < 0 ? '−' : '';
    out += bar(i + 1, cur, next, Math.abs(s.delta) < 1e-9 ? 'flat' : better ? 'good' : 'bad', s.label, `${sign}${fmt(Math.abs(s.delta))}`);
    cur = next;
  });
  out += bar(steps.length + 1, 0, cur, 'total', endLabel, fmt(cur));
  return `<svg class="waterfall" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${out}</svg>`;
}

/** Peer scatter: x and y for each town, this town highlighted. points: [{ id, name, x, y, me }] */
export function scatter({ points, xLabel, yLabel, xFmt, yFmt, aria }) {
  const W = 640; const H = 340; const L = 56; const B = 44; const T = 12; const R = 16;
  const xs = points.map((p) => p.x); const ys = points.map((p) => p.y);
  const xMax = Math.max(...xs) * 1.05 || 1; const yMax = Math.max(...ys) * 1.05 || 1;
  const X = (v) => L + (v / xMax) * (W - L - R); const Y = (v) => H - B - (v / yMax) * (H - B - T);
  let out = `<path class="sc-axis" d="M${L} ${T}V${H - B}H${W - R}"/>`;
  for (let i = 0; i <= 4; i += 1) {
    const xv = (xMax * i) / 4; const yv = (yMax * i) / 4;
    out += `<text class="sc-tick" x="${f1(X(xv))}" y="${H - B + 16}" text-anchor="middle">${esc(xFmt(xv))}</text><text class="sc-tick" x="${L - 6}" y="${f1(Y(yv) + 4)}" text-anchor="end">${esc(yFmt(yv))}</text>`;
    if (i) out += `<path class="sc-grid" d="M${L} ${f1(Y(yv))}H${W - R}"/>`;
  }
  out += `<text class="sc-axl" x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">${esc(xLabel)}</text><text class="sc-axl" transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>`;
  for (const p of points.filter((q) => !q.me)) out += `<circle class="sc-pt" cx="${f1(X(p.x))}" cy="${f1(Y(p.y))}" r="5"><title>${esc(p.name)}: ${esc(xFmt(p.x))}, ${esc(yFmt(p.y))}</title></circle>`;
  for (const p of points.filter((q) => q.me)) out += `<circle class="sc-me" cx="${f1(X(p.x))}" cy="${f1(Y(p.y))}" r="8"><title>${esc(p.name)}: ${esc(xFmt(p.x))}, ${esc(yFmt(p.y))}</title></circle><text class="sc-me-l" x="${f1(X(p.x) + 12)}" y="${f1(Y(p.y) + 4)}">${esc(p.name)}</text>`;
  return `<svg class="scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${out}</svg>`;
}

/** Phasing: one row per line, bars over plan years. rows: [{ label, start, years, cls }] */
export function timeline({ rows, startYear, years, aria }) {
  const W = 1000; const L = 300; const rowH = 30; const head = 24;
  const cw = (W - L) / years;
  let out = '';
  for (let y = 0; y < years; y += 1) out += `<text class="tl-y" x="${f1(L + y * cw + cw / 2)}" y="15" text-anchor="middle">${startYear + y}</text><path class="tl-grid" d="M${f1(L + y * cw)} ${head - 4}V${head + rows.length * rowH}"/>`;
  rows.forEach((r, i) => {
    const y0 = head + i * rowH;
    out += `<text class="tl-l" x="0" y="${y0 + 19}">${esc(r.label.length > 44 ? `${r.label.slice(0, 43)}…` : r.label)}</text>
      <rect class="tl-bar tl-${r.cls}" x="${f1(L + r.start * cw + 2)}" y="${y0 + 6}" width="${f1(r.years * cw - 4)}" height="18" rx="3"><title>${esc(r.label)}: ${startYear + r.start} to ${startYear + r.start + r.years - 1}</title></rect>`;
  });
  return `<svg class="timeline" viewBox="0 0 ${W} ${head + rows.length * rowH + 4}" role="img" aria-label="${esc(aria)}">${out}</svg>`;
}

/** Spend per year against an optional budget line. */
export function spendBars({ spend, startYear, budget, fmt, aria }) {
  const W = 1000; const H = 190; const B = 26; const L = 6;
  const max = Math.max(...spend, budget || 0) * 1.12 || 1;
  const cw = (W - L) / spend.length; const bw = Math.min(70, cw - 18);
  const Y = (v) => H - B - (v / max) * (H - B - 18);
  let out = `<path class="wf-axis" d="M0 ${H - B}H${W}"/>`;
  spend.forEach((v, i) => {
    const x = L + i * cw + (cw - bw) / 2;
    const over = budget && v > budget;
    out += `<rect class="sp ${over ? 'sp-over' : ''}" x="${f1(x)}" y="${f1(Y(v))}" width="${f1(bw)}" height="${f1(Math.max(0, H - B - Y(v)))}" rx="2"><title>${startYear + i}: ${esc(fmt(v))}</title></rect>
      <text class="wf-v" x="${f1(x + bw / 2)}" y="${f1(Y(v) - 5)}" text-anchor="middle">${v > 0 ? esc(fmt(v)) : ''}</text><text class="tl-y" x="${f1(x + bw / 2)}" y="${H - 8}" text-anchor="middle">${startYear + i}</text>`;
  });
  if (budget) out += `<path class="sp-budget" d="M0 ${f1(Y(budget))}H${W}"/><text class="sp-budget-l" x="${W - 4}" y="${f1(Y(budget) - 5)}" text-anchor="end">budget ${esc(fmt(budget))}</text>`;
  return `<svg class="spend" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${out}</svg>`;
}

/** Data completeness meter: three short bars. tiers: [{ label, have, of }] */
export function meter(tiers) {
  return `<div class="meter">${tiers.map((x) => {
    const share = x.of ? x.have / x.of : 0;
    const step = Math.round(share * 10);
    return `<div class="meter-row"><span class="meter-l">${esc(x.label)}</span><span class="meter-track" role="img" aria-label="${esc(`${x.label}: ${x.have} of ${x.of}`)}"><span class="meter-fill mf-${step}"></span></span><span class="meter-n num">${x.have}/${x.of}</span></div>`;
  }).join('')}</div>`;
}

export { pct, qty, int, people };
