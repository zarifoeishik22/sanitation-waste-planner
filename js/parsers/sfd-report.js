// Reads the text of an SFD Lite report (DPHE CWIS-FSM Support Cell template) into values for the review table.
// Pure functions on text. The SFD matrix and graphic in these reports are images, so system shares come from the prose,
// which can leave systems out: the caller must show the share total and ask for what is missing. Nothing is filled silently.

const numberOf = (s) => Number(String(s).replace(/,/g, ''));
const CODE = 'T\\dA\\dC\\d{1,2}';

/** Drop the running page header and page numbers so sentences that cross a page break read as one. */
export function cleanReportText(pages) {
  const out = [];
  for (const page of pages) {
    const lines = page.split('\n');
    let i = 0;
    if (/Produced by:\s*$/.test(lines[0] || '')) { // header: town, "SFD Lite Report", producer, country
      i = 1;
      while (i < Math.min(lines.length, 6) && !/^[A-Z][a-z]+$/.test(lines[i - 1] === lines[0] ? '' : lines[i - 1])) i += 1;
    }
    for (; i < lines.length; i += 1) {
      const ln = lines[i].trim();
      if (!ln || /^\d{1,3}$/.test(ln) || /^Last update:/i.test(ln)) continue;
      out.push(ln);
    }
  }
  return out.join(' ').replace(/\s+/g, ' ');
}

export function parseSfdReport(pages) {
  const cover = pages[0] || '';
  const text = cleanReportText(pages);
  const found = { is_sfd_report: /SFD Lite Report|SFD Report|Shit Flow Diagram/i.test(cover + text.slice(0, 3000)) };
  const m1 = cover.match(/^(.+?)\s+(?:Municipality|Paurashava|City Corporation|Town)\b/m);
  found.town = m1 ? m1[1].trim() : null;
  const date = (cover + ' ' + text).match(/Date of production(?:\/ last update)?:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  found.date = date ? `${date[3]}-${date[2]}-${date[1]}` : null;
  const pop = text.match(/Estimated population,?\s*(\d{4})\s+([\d,]{4,})/i);
  found.population = pop ? numberOf(pop[2]) : null;
  found.year = pop ? Number(pop[1]) : null;
  const hh = text.match(/Households,?\s*\d{4}\s+([\d,]{3,})/i);
  found.households = hh ? numberOf(hh[1]) : null;

  // System shares. Three wordings appear in the template; a code can be stated more than once.
  const seen = new Map();
  const note = (code, value, how) => {
    if (!(value >= 0 && value <= 100)) return;
    if (!seen.has(code)) seen.set(code, []);
    seen.get(code).push({ value, how });
  };
  for (const m of text.matchAll(new RegExp(`(${CODE}) system is considered as ([\\d.]+)\\s*%`, 'g'))) note(m[1], Number(m[2]), 'considered_as');
  for (const m of text.matchAll(new RegExp(`([\\d.]+)\\s*% of the (?:population|people|households|toilets)[^()%]{0,170}\\((${CODE})\\)`, 'g'))) note(m[2], Number(m[1]), 'population_uses');
  for (const m of text.matchAll(new RegExp(`\\(system (${CODE}),\\s*([\\d.]+)\\s*%\\)`, 'g'))) note(m[1], Number(m[2]), 'assumption');
  for (const m of text.matchAll(new RegExp(`([\\d.]+)\\s*% of [^()%]{0,80}\\(system (${CODE})\\)`, 'g'))) note(m[2], Number(m[1]), 'assumption');

  // Share emptied (SFD variable F3).
  const emptied = {};
  for (const m of text.matchAll(new RegExp(`variable F3 for systems? ((?:${CODE}(?:,\\s*|\\s+and\\s+)?)+)\\s*is set to ([\\d.]+)\\s*%`, 'g'))) {
    for (const code of m[1].match(new RegExp(CODE, 'g'))) emptied[code] = Number(m[2]) / 100;
  }

  const conflicts = [];
  const systems = [...seen.entries()].map(([code, list]) => {
    const values = [...new Set(list.map((x) => x.value))];
    if (values.length > 1 && Math.max(...values) - Math.min(...values) > 0.15) conflicts.push({ code, values });
    const pick = (list.find((x) => x.how !== 'assumption') || list[0]).value;
    return { code, share: Math.round(pick * 100) / 10000, emptied: code in emptied ? emptied[code] : null };
  }).sort((a, b) => a.code.localeCompare(b.code));
  found.systems = systems;
  found.conflicts = conflicts;
  found.share_sum = Math.round(systems.reduce((a, s) => a + s.share, 0) * 10000) / 10000;

  const sf = text.match(/proportion of FS in septic tanks[^%]{0,120}?([\d.]+)\s*%/i);
  found.sludge_factor = sf ? Number(sf[1]) / 100 : null;
  const safe = text.match(/\(([\d.]+)\s*%\)\s*of the excreta flow is classified\s+as safely managed/i) || text.match(/([\d.]+)\s*%\s*of the excreta (?:flow )?is (?:classified as )?safely managed/i);
  found.stated_safe = safe ? Number(safe[1]) / 100 : null;
  found.no_treatment = /F4 and F5 for all systems are considered\s+to be 0\s*%/i.test(text) || /no (?:wastewater or )?faecal sludge treatment/i.test(text);
  return found;
}
