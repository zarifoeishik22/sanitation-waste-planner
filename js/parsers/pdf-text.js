// Text of a PDF, page by page, from a pdf.js document. No DOM. Works in the browser and in Node.
// Text items are grouped into lines by their vertical position and read left to right, so labelled values stay together.

export async function pdfToPages(doc) {
  const pages = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const rows = new Map();
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3; // items within ~3 units share a line
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: it.transform[4], s: it.str });
    }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.sort((a, b) => a.x - b.x).map((i) => i.s.trim()).join(' ').replace(/\s+/g, ' ').trim());
    pages.push(lines.join('\n'));
  }
  return pages;
}
