// The planning wizard: six steps over one plan state. The state lives in this browser tab; the Excel workbook is how it is kept.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { d, t, sysIdx, today } from './data.js';
import { STEPS, defaultWizard, compute, wizardSheets, analyseForm, currentForm } from '../../js/model/wizard.js';
import { int, slug } from '../../js/model/format.js';
import { download, readFiles } from './files.js';
import TownStep from './steps/Town.jsx';
import ReportsStep from './steps/Reports.jsx';
import YourTownStep from './steps/YourTown.jsx';
import FindingsStep from './steps/Findings.jsx';
import PlanStep from './steps/Plan.jsx';
import DocumentStep from './steps/Document.jsx';

const KEY = 'planner-0.5';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SCREENS = { town: TownStep, reports: ReportsStep, 'your-town': YourTownStep, findings: FindingsStep, plan: PlanStep, document: DocumentStep };

function initial() {
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (s && s.answers && s.on) return { ...defaultWizard(), ...s, msgs: [] }; } catch { /* a private window may refuse storage */ }
  return defaultWizard();
}
const parseHash = () => {
  const m = window.location.hash.match(/^#\/([a-z-]+)(?:\?town=([^&]+))?/);
  return { step: m && SCREENS[m[1]] ? m[1] : 'town', town: m && m[2] ? decodeURIComponent(m[2]) : null };
};

export default function App() {
  const [w, setW] = useState(initial);
  const [step, setStep] = useState(() => parseHash().step);
  const [busy, setBusy] = useState(false);
  const main = useRef(null);

  const c = useMemo(() => { try { return compute(d, w, t, today); } catch (err) { console.error(err); return null; } }, [w]);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(w)); } catch { /* not kept */ } }, [w]);

  const pick = useCallback((id) => setW((cur) => (String(cur.townId) === String(id) ? cur : { ...defaultWizard(), townId: id })), []);
  useEffect(() => {
    const onHash = () => {
      const h = parseHash();
      if (h.town) { const town = d.towns.towns.find((x) => x.name === h.town); if (town) setW((cur) => (String(cur.townId) === String(town.id) ? cur : { ...defaultWizard(), townId: town.id })); }
      setStep(h.step);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  // Steps 3 to 6 need a town.
  const needsTown = step !== 'town' && step !== 'reports';
  const shown = needsTown && !c ? 'town' : step;
  const go = useCallback((id) => {
    const name = c && !c.ctx.isOwn ? `?town=${encodeURIComponent(c.ctx.town.name)}` : '';
    window.location.hash = `#/${id}${id === 'town' ? '' : name}`;
  }, [c]);
  useEffect(() => { window.scrollTo(0, 0); if (main.current) main.current.focus({ preventScroll: true }); }, [shown]);
  useEffect(() => { document.title = c ? `${c.ctx.town.name} plan: sanitation and waste planner (draft)` : 'Sanitation and waste planner (draft)'; }, [c]);

  const act = useMemo(() => ({
    set: (patch) => setW((cur) => ({ ...cur, ...patch })),
    answer: (k, v) => setW((cur) => ({ ...cur, answers: { ...cur.answers, [k]: v } })),
    pick,
    toggle: (id) => setW((cur) => ({ ...cur, on: { ...cur.on, [id]: !cur.on[id] } })),
    phase: (g, patch) => setW((cur) => ({ ...cur, phase: { ...cur.phase, [g]: { ...(cur.phase[g] || {}), ...patch } } })),
    phases: (ph) => setW((cur) => ({ ...cur, phase: { ...cur.phase, ...ph } })),
    site: (k, p) => setW((cur) => ({ ...cur, sites: { ...cur.sites, [k]: p } })),
    form: (k, v) => setW((cur) => ({ ...cur, ownForm: { ...cur.ownForm, [k]: v } })),
    reset: () => { setW(defaultWizard()); window.location.hash = '#/town'; },
  }), [pick]);

  /** Files: a workbook restores a whole plan; a PDF changes the one report it carries and keeps the rest. */
  const files = useCallback(async (list, { fresh = false } = {}) => {
    if (!list || !list.length) return;
    setBusy(true);
    try {
      const adding = w.townId === null && Object.keys(w.ownForm).length > 0;
      const base = fresh && !adding ? defaultWizard() : w;
      const start = fresh ? (adding ? w : defaultWizard())
        : c && !c.ctx.isOwn ? { ownForm: currentForm(c.ctx, w, c.district), upSnap: {}, upMeta: {}, country: 'Bangladesh' } : w;
      const res = await readFiles(list, start);
      if (!res.good) { setW((cur) => ({ ...cur, msgs: res.msgs })); return; }
      let next = { ...base, ...res.patch, plastic: res.patch.plastic || 'dataset' };
      const a = analyseForm(next, sysIdx, t);
      next = a.own ? { ...next, townId: 'own', own: a.own, msgs: [...res.msgs, ...a.msgs] } : { ...next, townId: null, own: null, msgs: [...res.msgs, ...a.msgs] };
      setW(next);
      // The address names a published town only; a town read from files has none, so a reload keeps it.
      const at = parseHash().step;
      window.location.hash = `#/${at === 'town' ? 'reports' : at}`;
    } finally { setBusy(false); }
  }, [w, c]);
  const applyForm = useCallback(() => {
    const a = analyseForm(w, sysIdx, t);
    setW((cur) => (a.own ? { ...cur, townId: 'own', own: a.own, msgs: a.msgs } : { ...cur, msgs: a.msgs }));
  }, [w]);
  const saveBook = useCallback(async (blank = false) => {
    const { writeWorkbook } = await import('../../js/xlsx/workbook.js');
    const sheets = blank || !c ? wizardSheets({ d, w: defaultWizard(), ctx: null, t, sysIdx, blank: true }) : wizardSheets({ d, w, ctx: c.ctx, t, district: c.district, sysIdx });
    download(writeWorkbook(sheets), blank || !c ? 'planner-workbook-blank.xlsx' : `plan-${slug(c.ctx.town.name)}-${today}.xlsx`, XLSX);
  }, [w, c]);

  const Screen = SCREENS[shown];
  const at = STEPS.findIndex((s) => s.id === shown);
  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          <a className="brand" href="#/town">
            <svg aria-hidden="true" width="26" height="26" viewBox="0 0 28 28"><circle cx="14" cy="14" r="7" fill="#1B5FAE" /><circle cx="14" cy="14" r="11.5" fill="none" stroke="#D9822B" strokeWidth="3" /></svg>
            {c && shown !== 'town' ? `${c.ctx.town.name} plan` : 'Sanitation and waste planner'}
          </a>
          <div className="top-meta">
            {c && shown !== 'town' && <>{c.district && <span>{c.district} district</span>}<span>{int(c.population)} people</span></>}
            <label className="btn file">Open a workbook<input type="file" accept=".xlsx" onChange={(e) => { files(e.target.files, { fresh: true }); e.target.value = ''; }} /></label>
            {c && <button type="button" className="btn" onClick={() => saveBook(false)}>Save as workbook</button>}
          </div>
        </div>
        <nav aria-label="Steps">
          <ol className="steps">
            {STEPS.map((s, i) => {
              const open = i < 2 || Boolean(c);
              return (
                <li key={s.id}>
                  <button type="button" className={`step${i === at ? ' now' : i < at ? ' done' : ''}`} aria-current={i === at ? 'step' : undefined} disabled={!open} onClick={() => go(s.id)}>
                    <span className="n">{i + 1}</span>{s.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </header>
      <main ref={main} tabIndex={-1} style={{ outline: 'none', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Screen w={w} c={c} act={act} go={go} files={files} applyForm={applyForm} saveBook={saveBook} busy={busy} />
      </main>
      <footer className="foot">
        Draft tool, version 0.5. Figures come from published SFD and WFD reports; prices from the project engineer&apos;s unit cost sheet. Your files and answers stay in this browser.
        The map and the town&apos;s position are loaded from OpenStreetMap. <a href="https://github.com/zarifoeishik22/sanitation-waste-planner">Source and method</a>
      </footer>
    </div>
  );
}
