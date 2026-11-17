// Number, money and text helpers shared by the model and the screens. No DOM access.

const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const int = (v) => nf0.format(v);
export const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
/** People and households are estimates: round to three significant figures at most. */
export const people = (v) => {
  if (!(v > 0)) return '0';
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 2));
  return int(Math.round(v / mag) * mag);
};
/** Tonnes and other small quantities: one decimal under 10, whole numbers above. */
export const qty = (v) => (Math.abs(v) < 10 && Math.round(v * 10) % 10 !== 0 ? nf1.format(v) : int(Math.round(v)));

export function makeT(strings) {
  return (key, vars = {}) => {
    const s = strings[key];
    if (s === undefined) return key;
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? `{${k}}` : String(vars[k])));
  };
}

/** Deterministic pseudo-random numbers in [0, 1) so a picture is the same every time it is drawn. */
export function seeded(seed) {
  let x = (seed >>> 0) || 1;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}

/** 1, 2 or 5 times a power of ten, at or above v. */
export function niceStep(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (m * p >= v - 1e-9) return m * p;
  return 10 * p;
}

/** The unit budgets and totals are typed and shown in: crore for taka, million otherwise. */
export const moneyUnit = (cur) => (cur === 'BDT' || !cur ? { label: `${cur || 'BDT'} crore`, word: 'crore', factor: 1e7 } : { label: `million ${cur}`, word: 'million', factor: 1e6 });

/** toFixed that rounds halves up (0.285 -> 0.29), not by the binary value. */
export const fix = (x, d) => (Math.round(x * 10 ** d + 1e-7) / 10 ** d).toFixed(d);

/** Money in words a council reads: "BDT 18.0 crore", "BDT 4.2 lakh", "BDT 3,900". */
export function money(v, cur = 'BDT') {
  const c = cur || 'BDT';
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (c === 'BDT') {
    if (a >= 1e6) return `${c} ${fix(v / 1e7, a >= 1e8 ? 1 : 2)} crore`;
    if (a >= 1e5) return `${c} ${fix(v / 1e5, 1)} lakh`;
  } else if (a >= 1e6) return `${c} ${fix(v / 1e6, a >= 1e7 ? 1 : 2)} million`;
  return `${c} ${int(a >= 1000 ? Math.round(v / 100) * 100 : Math.round(v))}`;
}

/** A figure in the table unit (crore or million), two decimals, zero as "0". */
export const inUnit = (v, cur) => { const x = v / moneyUnit(cur).factor; return Math.abs(x) < 0.005 ? '0' : fix(x, 2); };

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'town';
