// Reads the text of a WFD Data Portal case-study page saved as PDF into values for the review table.
// Pure functions on text. Tonnes are per year unless stated.

const n = (s) => (s === undefined || s === null ? null : Number(String(s).replace(/,/g, '')));
const first = (text, re) => { const m = text.match(re); return m ? n(m[1]) : null; };
const NUM = '([\\d,]+(?:\\.\\d+)?)';

export function parseWfdPortal(pages) {
  const text = pages.join('\n').replace(/[ \t]+/g, ' ');
  const flat = text.replace(/\s+/g, ' ');
  const f = { is_wfd_portal: /Waste Flow Diagram Data Portal|wfd-data\.rwm\.global/i.test(flat) };
  const city = text.match(/\bCity\s+([^\n]+)/);
  f.town = city ? city[1].trim() : null;
  f.model_version = (flat.match(/Waste Flow Diagram Version ([\d.]+)/) || [])[1] || null;
  f.burning_model = (flat.match(/Uses ([a-z ]+?) model/i) || [])[1] || null;
  f.factor_set = (flat.match(/Factor set:\s*([^\n]+?)(?=\s+Original set|\s+https?:|$)/) || [])[1]?.trim() || null;
  f.year = first(flat, /Year of Survey[^\d]{0,80}(20\d{2})\b/);
  f.population = first(flat, new RegExp(`Overview data\\s+Population\\s+${NUM}`)) ?? first(flat, new RegExp(`Population\\s+${NUM}`));
  f.kg_cap_day = first(flat, new RegExp(`${NUM} kg\\/capita\\/day`));
  f.msw_t_day = first(flat, new RegExp(`Total MSW generation\\s+${NUM} tonnes\\/day`, 'i'));
  f.collected_share = pctOf(flat, /Collection rate\s+([\d.]+) ?%/);
  f.disposal_share = pctOf(flat, /MSW sent to disposal\s+([\d.]+) ?%/);
  f.recovery_share = pctOf(flat, /MSW sorted for recovery\s+([\d.]+) ?%/);
  f.controlled_share = pctOf(flat, /MSW managed in controlled facilities\s+([\d.]+) ?%/);
  f.plastic_generated_t = first(flat, new RegExp(`Plastic waste generation\\s+${NUM} tonnes\\/year`));
  f.plastic_unmanaged_share = pctOf(flat, /Unmanaged plastic\s+([\d.]+) ?% of the entire/);
  f.plastic_unmanaged_t = first(flat, new RegExp(`Plastic waste to the\\s+${NUM} tonnes\\/year`)) ?? first(flat, new RegExp(`PLASTIC LEAKAGE\\s+${NUM} t\\/y`));
  f.fate_water_t = first(flat, new RegExp(`Plastic to water systems\\s+${NUM} tonnes\\/year`)) ?? first(flat, new RegExp(`Water: ${NUM}`));
  f.water_kg_person = first(flat, new RegExp(`${NUM} kg\\/person\\/year`));
  const st = flat.match(new RegExp(`${NUM} t\\/y ${NUM} t\\/y ${NUM} t\\/y ${NUM} t\\/y ${NUM} t\\/y`));
  [f.stage_uncollected_t, f.stage_collection_t, f.stage_sorting_t, f.stage_transport_t, f.stage_disposal_t] = st ? st.slice(1, 6).map(n) : [null, null, null, null, null];
  f.fate_land_t = first(flat, new RegExp(`Land: ${NUM}`));
  f.fate_drains_t = first(flat, new RegExp(`Drains: ${NUM}`));
  f.fate_burnt_t = first(flat, new RegExp(`Burnt: ${NUM}`));
  f.recovered_plastic_t = first(flat, new RegExp(`Sorted for recovery: ${NUM}`));
  f.retained_disposal_t = first(flat, new RegExp(`Retained at disposal sites: ${NUM}`));
  const comp = (a, b) => { const m = flat.match(new RegExp(`${a} ${b}(?: [A-Za-z ]{0,40})? ([\\d.]+) ?% ([\\d.]+) ?%`)); return m ? [Math.round(Number(m[1]) * 100) / 10000, Math.round(Number(m[2]) * 100) / 10000] : [null, null]; };
  [f.comp_paper, f.comp_metals] = comp('paper', 'metals');
  [f.comp_plastics, f.comp_other] = comp('plastics', 'other');
  [f.comp_glass, f.organic_share] = comp('glass', 'organic');
  f.disposal_burning_level = (flat.match(/\bburning (Very high|High|Medium|Low|Very low|None)\b/) || [])[1] || null;

  // Checks the review table shows. Published figures are rounded, so allow 1% or 2 tonnes.
  const stages = [f.stage_uncollected_t, f.stage_collection_t, f.stage_sorting_t, f.stage_transport_t, f.stage_disposal_t];
  const fates = [f.fate_land_t, f.fate_drains_t, f.fate_water_t, f.fate_burnt_t];
  const total = f.plastic_unmanaged_t;
  const close = (sum) => total !== null && Math.abs(sum - total) <= Math.max(2, 0.01 * total);
  f.checks = {
    stage_sum: stages.every((v) => v !== null) ? stages.reduce((a, b) => a + b, 0) : null,
    fate_sum: fates.every((v) => v !== null) ? fates.reduce((a, b) => a + b, 0) : null,
  };
  f.checks.stage_ok = f.checks.stage_sum === null ? null : close(f.checks.stage_sum);
  f.checks.fate_ok = f.checks.fate_sum === null ? null : close(f.checks.fate_sum);
  return f;
}

function pctOf(text, re) { const m = text.match(re); return m ? Number(m[1]) / 100 : null; }
