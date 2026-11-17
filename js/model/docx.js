// A plan document as a Word file (.docx), written with the planner's own ZIP writer: headings, paragraphs, lists and tables.

import { writeZip } from '../xlsx/zip.js';

const x = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const run = (text, { b = false, size = null, color = null } = {}) => `<w:r><w:rPr>${b ? '<w:b/>' : ''}${size ? `<w:sz w:val="${size}"/>` : ''}${color ? `<w:color w:val="${color}"/>` : ''}</w:rPr><w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
const para = (text, style = null, opts = {}) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${opts.right ? '<w:jc w:val="right"/>' : ''}</w:pPr>${run(text, opts)}</w:p>`;
const bullet = (text) => `<w:p><w:pPr><w:pStyle w:val="ListBullet"/><w:ind w:left="360" w:hanging="240"/></w:pPr>${run(`•  ${text}`)}</w:p>`;

function table(t) {
  const n = t.head.length;
  const width = 9360; // 6.5 inches of text width, in twentieths of a point
  const first = t.numeric ? 2200 : Math.round(width / n);
  const rest = Math.floor((width - first) / (n - 1));
  const cols = [first, ...Array(n - 1).fill(rest)];
  const cell = (v, i, head) => `<w:tc><w:tcPr><w:tcW w:w="${cols[i]}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF2F5"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/>${t.numeric && i > 0 ? '<w:jc w:val="right"/>' : ''}</w:pPr>${run(v, { b: head || i === 0, size: 19 })}</w:p></w:tc>`;
  const row = (cells, head) => `<w:tr>${head ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.map((c, i) => cell(c, i, head)).join('')}</w:tr>`;
  const b = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="B9C5D1"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${cols.map((c) => `<w:gridCol w:w="${c}"/>`).join('')}</w:tblGrid>${row(t.head, true)}${t.rows.map((r) => row(r, false)).join('')}</w:tbl><w:p/>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/><w:color w:val="13233A"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="28"/><w:color w:val="13233A"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="13233A"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="13233A"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Small"><w:name w:val="Small"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="19"/><w:color w:val="46586E"/></w:rPr></w:style>
</w:styles>`;

/** doc = planDocument() result. Returns the .docx bytes. */
export function writeDocx(doc, footer = '') {
  const body = [para(doc.kicker, 'Small', { b: true }), para(doc.title, 'Title'), para(doc.subtitle, 'Subtitle'), para(doc.basis, 'Small')];
  for (const s of doc.sections) {
    body.push(para(s.h, 'Heading1'));
    for (const b of s.blocks) {
      if (b.p) body.push(para(b.p));
      else if (b.h3) body.push(para(b.h3, 'Heading2'));
      else if (b.list) body.push(...b.list.map(bullet));
      else if (b.table) body.push(table(b.table));
      else if (b.targets) body.push(table({ head: ['Target', 'From today to the end of the plan'], rows: b.targets.map((t) => [t.label, t.value]) }));
    }
  }
  if (footer) body.push(para(footer, 'Small'));
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1300" w:right="1273" w:bottom="1300" w:left="1273" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return writeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'word/document.xml', data: document },
    { name: 'word/styles.xml', data: STYLES },
  ]);
}
