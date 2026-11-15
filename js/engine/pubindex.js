// Is this town's SFD on SuSanA's SFD portal list? A name match against a bundled, dated, partial copy of that list.
// It cannot prove an uploaded PDF is the published file, so the result is worded "listed", never "verified".

export function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(municipality|municipal|paurashava|pourashava|city corporation|metropolitan city|sub-metropolitan city|town|city)\b/g, ' ')
    .replace(/[^a-z]/g, '');
}

/** SuSanA library downloads are named 3-<entry>-7-<unix time>.pdf. Returns { id, date } or null. */
export function libraryFile(fileName, pattern) {
  const base = String(fileName || '').split(/[\\/]/).pop();
  const m = base.match(/(?:^|[^0-9])3-(\d{3,5})-7-(\d{9,11})\.pdf$/i);
  if (!m || (pattern && !new RegExp(pattern, 'i').test(`3-${m[1]}-7-${m[2]}.pdf`))) return null;
  const d = new Date(Number(m[2]) * 1000);
  return { id: Number(m[1]), date: Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) };
}

/**
 * status: 'listed' (an entry with this name), 'not_listed' (the name falls in a part of the list we hold, and is not there),
 * 'not_checked' (the name falls outside the parts of the list we hold).
 */
export function checkListing(name, country, index, fileName = null) {
  const n = normName(name);
  const file = libraryFile(fileName, index.library_file_pattern);
  if (!n) return { status: 'not_checked', entry: null, file };
  const pool = index.entries.filter((e) => !country || e.country === country);
  const entry = pool.find((e) => normName(e.name) === n)
    || pool.find((e) => { const m = normName(e.name); return Math.min(m.length, n.length) >= 5 && (m.startsWith(n) || n.startsWith(m)); }) || null;
  if (entry) return { status: 'listed', entry, file };
  const covered = index.covered.some((c) => n >= normName(c.from) && n <= `${normName(c.to)}￿`);
  return { status: covered ? 'not_listed' : 'not_checked', entry: null, file };
}
