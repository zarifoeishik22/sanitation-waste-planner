// The drain scene: one schematic of the place where a town's excreta and escaped plastic meet.
// Every mark is bound to a number: a dot is a fixed number of people's excreta, a fleck a fixed tonnage of plastic.
// Returns SVG as a string. No DOM access. Colours and sizes come from the stylesheet (the page's CSP forbids inline styles).

import { seeded, niceStep } from './util.js';

const W = 1000;
const H = 400;
const HOUSES = 14;
const houseX = (i) => 58 + i * 43;

const REGION = {
  drain: (rnd) => [56 + rnd() * 590, 209 + rnd() * 20],
  water: (rnd) => { const a = rnd() * Math.PI * 2; const q = Math.sqrt(rnd()) * 0.86; return [822 + Math.cos(a) * 148 * q, 258 + Math.sin(a) * 84 * q]; },
  ground: (rnd) => [72 + rnd() * 330, 304 + rnd() * 56],
  dumped: (rnd) => [462 + rnd() * 150, 306 + rnd() * 52],
  burnt: (rnd) => [884 + rnd() * 86, 62 + rnd() * 62],
};

/** How foul a receiver looks: 0 = as today, 4 = clear. */
function clarity(now, today) {
  if (!(today > 0)) return 4;
  const k = now / today;
  return k > 0.75 ? 0 : k > 0.5 ? 1 : k > 0.25 ? 2 : k > 0.05 ? 3 : 4;
}

function marks(kind, region, countToday, countNow, seed) {
  const rnd = seeded(seed);
  let out = '';
  for (let i = 0; i < countToday; i += 1) {
    const [x, y] = REGION[region](rnd);
    const gone = i >= countNow;
    if (kind === 'dot') out += `<circle class="dot${gone ? ' gone' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.2"/>`;
    else out += `<rect class="fleck${gone ? ' gone' : ''}" x="${(x - 5).toFixed(1)}" y="${(y - 2.5).toFixed(1)}" width="10" height="5" rx="1" transform="rotate(${Math.round(rnd() * 150 - 75)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  return out;
}

/** Scales shared by the picture and its key: people per dot, tonnes per fleck. */
export function sceneScale(ex0, pl0) {
  const maxP = ex0 ? Math.max(...Object.values(ex0.receivers).map((v) => v.persons)) : 0;
  const maxT = pl0 ? Math.max(...Object.values(pl0.receivers).map((v) => v.tonnes)) : 0;
  return { perDot: niceStep(maxP / 45), perFleck: niceStep(maxT / 36) };
}

const count = (v, per) => (v > 0 ? Math.max(1, Math.round(v / per)) : 0);

export function drainScene({ ex0, ex1, pl0, pl1, label }) {
  const { perDot, perFleck } = sceneScale(ex0, pl0);
  const p = (ex, k) => (ex ? ex.receivers[k].persons : 0);
  const tn = (pl, k) => (pl ? pl.receivers[k].tonnes : 0);
  const cDrain = clarity(p(ex1, 'drain') + tn(pl1, 'drain'), p(ex0, 'drain') + tn(pl0, 'drain'));
  const cWater = ex0 ? clarity(p(ex1, 'water') + p(ex1, 'drain'), p(ex0, 'water') + p(ex0, 'drain')) : clarity(tn(pl1, 'water'), tn(pl0, 'water'));

  // Outlets from houses into the drain: 60% of the town on such outlets fills every house.
  const pipes = (share) => (share > 0 ? Math.min(HOUSES, Math.max(1, Math.round((share / 0.6) * HOUSES))) : 0);
  const n0 = ex0 ? pipes(ex0.receivers.drain.share) : 0;
  const n1 = ex1 ? Math.min(n0, pipes(ex1.receivers.drain.share)) : 0;
  const order = [6, 2, 10, 4, 8, 0, 12, 7, 3, 11, 5, 9, 1, 13];
  const open = new Set(order.slice(0, n1));
  const capped = new Set(order.slice(n1, n0));
  let houses = '';
  for (let i = 0; i < HOUSES; i += 1) {
    const x = houseX(i);
    houses += `<path class="house" d="M${x} 150v-24l14-11 14 11v24z"/>`;
    if (open.has(i)) houses += `<path class="pipe" d="M${x + 14} 150v52"/>`;
    else if (capped.has(i)) houses += `<path class="pipe capped" d="M${x + 14} 150v20"/><path class="cap" d="M${x + 8} 171h12"/>`;
  }
  const w0 = ex0 ? Math.min(4, Math.round((ex0.receivers.water.share / 0.15) * 4)) : 0;
  const w1 = ex1 ? Math.min(w0, Math.round((ex1.receivers.water.share / 0.15) * 4)) : 0;
  let bank = '';
  for (let i = 0; i < w0; i += 1) {
    const x = 716 + i * 26;
    bank += i < w1 ? `<path class="pipe" d="M${x} 150v38"/>` : `<path class="pipe capped" d="M${x} 150v16"/><path class="cap" d="M${x - 6} 167h12"/>`;
  }

  const seedBase = 7;
  const dots = ['drain', 'water', 'ground', 'dumped'].map((k, i) => marks('dot', k, count(p(ex0, k), perDot), count(p(ex1, k), perDot), seedBase + i)).join('');
  const flecks = ['drain', 'water', 'ground', 'burnt'].map((k, i) => marks('fleck', k, count(tn(pl0, k), perFleck), count(tn(pl1, k), perFleck), seedBase + 20 + i)).join('');

  return `<svg class="scene" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">
  <rect class="earth" x="0" y="150" width="${W}" height="${H - 150}"/>
  <path class="ground-patch" d="M60 296h352v72H60z"/>
  <path class="heap" d="M452 296h172v72H452z"/>
  <path class="smoke" d="M876 56h102v76H876z"/>
  <ellipse class="water c${cWater}" cx="822" cy="258" rx="162" ry="96"/>
  <path class="channel c${cDrain}" d="M40 202h640v34H40z"/>
  <path class="wall" d="M40 202h622M40 236h628"/>
  ${houses}${bank}
  <g class="marks">${dots}${flecks}</g>
</svg>`;
}
