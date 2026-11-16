// Read and write the planner workbook (.xlsx). Plain-text XML handling so it runs in the browser and in Node tests.
// Reading: values only (formulas are read as their cached values). Writing: inline strings, three cell styles.

import { readZip, writeZip } from './zip.js';

const unxml = (s) => s.replace(/&(lt|gt|quot|apos|amp|#(\d+)|#x([0-9a-f]+));/gi, (m, n, d, h) =>
  d ? String.fromCodePoint(Number(d)) : h ? String.fromCodePoint(parseInt(h, 16)) : { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[n.toLowerCase()]);
const xml = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? unxml(m[1]) : null; };
const texts = (frag) => [...frag.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)].map((m) => unxml(m[1] || '')).join('');

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
const colName = (i) => { let s = ''; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

/** bytes -> { sheetName: rows (array of arrays of string | number | null) } */
export async function readWorkbook(bytes) {
  const files = await readZip(bytes, (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  const dec = new TextDecoder();
  const get = (n) => (files.has(n) ? dec.decode(files.get(n)) : null);
  const wb = get('xl/workbook.xml');
  if (!wb) throw new Error('not a workbook');
  const rels = Object.fromEntries([...(get('xl/_rels/workbook.xml.rels') || '').matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  const shared = [...(get('xl/sharedStrings.xml') || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const out = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], 'name');
    const target = rels[attr(m[0], 'r:id')] || '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const body = get(path);
    if (!body) continue;
    const rows = [];
    for (const rm of body.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rIdx = Number(attr(`<row${rm[1]}>`, 'r')) - 1;
      const row = [];
      for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tag = `<c${cm[1]}>`;
        const ref = attr(tag, 'r');
        const type = attr(tag, 't');
        const inner = cm[2] || '';
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = null;
        if (type === 's') val = v === undefined ? null : shared[Number(v)] ?? null;
        else if (type === 'inlineStr') val = texts(inner);
        else if (type === 'str' || type === 'e') val = v === undefined ? null : unxml(v);
        else if (type === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else if (v !== undefined) { const n = Number(v); val = Number.isFinite(n) ? n : unxml(v); }
        row[ref ? colIndex(ref) : row.length] = val;
      }
      rows[Number.isFinite(rIdx) && rIdx >= 0 ? rIdx : rows.length] = Array.from(row, (x) => (x === undefined ? null : x));
    }
    out[name] = Array.from(rows, (x) => x || []);
  }
  return out;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font><font><i/><sz val="10"/><color rgb="FF555555"/><name val="Arial"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF6CC"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3EFEE"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
const STYLE_ID = { head: 1, input: 2, note: 3 };

/** sheets: [{ name, widths: [number], rows: [[cell]] }], cell = string | number | null | { v, s: 'head'|'input'|'note' } */
export function writeWorkbook(sheets) {
  const files = [];
  const sheetXml = (sh) => {
    const cols = (sh.widths || []).length ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const rows = sh.rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => {
      const o = cell !== null && typeof cell === 'object' ? cell : { v: cell };
      const ref = `${colName(c)}${r + 1}`;
      const s = o.s ? ` s="${STYLE_ID[o.s]}"` : '';
      if (o.v === null || o.v === undefined || o.v === '') return o.s ? `<c r="${ref}"${s}/>` : '';
      if (typeof o.v === 'number' && Number.isFinite(o.v)) return `<c r="${ref}"${s}><v>${o.v}</v></c>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(o.v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${sh.freeze ? '><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView>' : '/>'}</sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
  };
  files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` });
  files.push({ name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
  files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${xml(sh.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
  files.push({ name: 'xl/styles.xml', data: STYLES });
  sheets.forEach((sh, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sh) }));
  return writeZip(files);
}
