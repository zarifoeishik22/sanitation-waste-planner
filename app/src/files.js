// Reading the files a planner brings (SFD and WFD PDFs, a planner workbook) and handing files back. Everything stays in the browser.
import { d, t, sysIdx } from './data.js';
import { applySfd, applyWfd, readWizardBook } from '../../js/model/wizard.js';

const MAX_FILE = 30 * 1024 * 1024;

export function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function pdfPages(file) {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, verbosity: 0 }).promise;
  const { pdfToPages } = await import('../../js/parsers/pdf-text.js');
  return pdfToPages(doc);
}

/**
 * Read up to four files onto a starting form. Returns { patch, msgs, good }: patch is what to merge into the wizard state
 * (a workbook replaces the answers and choices; a PDF changes only the report it carries).
 */
export async function readFiles(list, start) {
  let cur = { ownForm: { ...start.ownForm }, upSnap: { ...start.upSnap }, upMeta: { ...start.upMeta }, country: start.country };
  let extra = {};
  const msgs = []; let good = 0;
  for (const file of [...list].slice(0, 4)) {
    const name = file.name;
    if (file.size > MAX_FILE) { msgs.push({ kind: 'err', text: `${name} is larger than 30 MB.` }); continue; }
    if (/\.xlsx$/i.test(name)) {
      try {
        const { readWorkbook } = await import('../../js/xlsx/workbook.js');
        const res = readWizardBook(await readWorkbook(new Uint8Array(await file.arrayBuffer())), { d, t, sysIdx });
        if (!res) { msgs.push({ kind: 'err', text: `${name} is not a planner workbook this tool can read.` }); continue; }
        const { problems, tiers, ownForm, upSnap, upMeta, country, ...rest } = res;
        cur = { ownForm, upSnap, upMeta, country };
        extra = rest;
        msgs.push({ kind: 'ok', text: `Planner workbook for ${ownForm.name || 'the town'}: figures, answers and choices read.` });
        for (const p of problems) msgs.push({ kind: 'note', text: t(p.key) });
        good += 1;
      } catch (err) { console.error(err); msgs.push({ kind: 'err', text: `${name} is not a planner workbook this tool can read.` }); }
      continue;
    }
    let pages;
    try { pages = await pdfPages(file); } catch (err) { console.error(err); msgs.push({ kind: 'err', text: `${name} could not be opened as a PDF.` }); continue; }
    if (!pages.join('').trim()) { msgs.push({ kind: 'err', text: `${name} has no readable text. It may be a scan.` }); continue; }
    const { parseSfdReport } = await import('../../js/parsers/sfd-report.js');
    const s = parseSfdReport(pages);
    if (s.is_sfd_report && s.systems.length) {
      const a = applySfd(cur.ownForm, s, name, pages, sysIdx, d, cur.country);
      cur = { ownForm: a.form, upSnap: { ...cur.upSnap, sfd: a.snap }, upMeta: { ...cur.upMeta, wb: false, sfd: a.meta }, country: a.country };
      msgs.push(...a.msgs); good += 1; continue;
    }
    const { parseWfdPortal } = await import('../../js/parsers/wfd-portal.js');
    const wf = parseWfdPortal(pages);
    if (wf.is_wfd_portal && wf.plastic_unmanaged_t !== null) {
      const a = applyWfd(cur.ownForm, wf);
      cur = { ...cur, ownForm: a.form, upSnap: { ...cur.upSnap, wfd: a.snap }, upMeta: { ...cur.upMeta, wb: false, wfd: a.meta } };
      msgs.push(...a.msgs); good += 1; continue;
    }
    msgs.push({ kind: 'err', text: `${name} is not an SFD report or a WFD portal page this tool can read.` });
  }
  return { patch: { ...cur, ...extra }, msgs, good };
}
