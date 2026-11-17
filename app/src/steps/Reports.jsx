// Step 2. Reports: what was read from the SFD and the WFD, and the way in for a town that is not on the map.
import { int, pct } from '../../../js/model/format.js';
import { t, sysIdx } from '../data.js';

const WFD_NEEDED = ['msw_t_day', 'collected_pct', 'plastic_generated_t', 'plastic_unmanaged_t'];

const Stat = ({ k, v }) => <div><dt>{k}</dt><dd>{v}</dd></div>;
const FileBtn = ({ children, accept, onFiles, multiple = false, primary = false }) => (
  <label className={`btn file${primary ? ' primary' : ''}`}>{children}<input type="file" accept={accept} multiple={multiple} onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} /></label>
);
const Msgs = ({ msgs }) => (msgs && msgs.length ? <div className="msgs" role="status">{msgs.map((m, i) => <div key={i} className={`msg ${m.kind}`}>{m.text}</div>)}</div> : null);

function NewTown({ w, act, files, applyForm, saveBook, busy }) {
  const f = w.ownForm;
  const started = Object.keys(f).length > 0;
  const hasSfd = Object.keys(f).some((k) => k.startsWith('share_'));
  const hasWfd = WFD_NEEDED.some((k) => f[k]) || Object.keys(f).some((k) => k.startsWith('stage_') || k.startsWith('fate_'));
  const sum = Object.keys(sysIdx).reduce((a, c) => a + (Number(f[`share_${c}`]) || 0), 0);
  const field = (k, label, type = 'text') => (
    <label className="field">{label}<input type={type} value={f[k] || ''} onChange={(e) => act.form(k, e.target.value)} /></label>
  );
  return (
    <div className="page">
      <div className="head">
        <h1>Add your town&apos;s reports</h1>
        <p className="lede">Add the town&apos;s SFD report and its WFD portal page as PDFs, or a filled planner workbook. The planner reads them in this browser and asks only for what is missing.</p>
      </div>
      <section className="card">
        <div className="row">
          <FileBtn accept=".pdf,.xlsx" multiple primary onFiles={(l) => files(l, { fresh: true })}>{busy ? 'Reading…' : started ? 'Add another file' : 'Add files'}</FileBtn>
          <button type="button" className="btn" onClick={() => saveBook(true)}>Download a blank workbook</button>
        </div>
        <Msgs msgs={w.msgs} />
        {started && (
          <>
            <h2>What is still needed</h2>
            <div className="fields">
              {field('name', 'Town or municipality')}
              {field('population', 'Population', 'number')}
              {field('households', 'Households (if known)', 'number')}
              {field('district', 'District')}
            </div>
            {hasSfd && (
              <details open={Math.abs(sum - 100) > 0.5}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: 32 }}>Sanitation systems: shares add to {sum.toFixed(1)}%{Math.abs(sum - 100) > 0.5 ? ' and must reach 100%' : ''}</summary>
                <div className="table-wrap" style={{ marginTop: 8 }}>
                  <table className="t">
                    <thead><tr><th scope="col">System, as the SFD names it</th><th scope="col">People using it, %</th><th scope="col">Of those, emptied, %</th></tr></thead>
                    <tbody>
                      {Object.keys(sysIdx).map((code) => (
                        <tr key={code}>
                          <th scope="row" style={{ fontWeight: 400 }}>{t(`sys.${code}`)}</th>
                          <td><input className="cell" type="number" min="0" max="100" step="any" aria-label={`${t(`sys.${code}`)}: people using it, %`} value={f[`share_${code}`] || ''} onChange={(e) => act.form(`share_${code}`, e.target.value)} /></td>
                          <td>{sysIdx[code].group === 'direct' ? <span className="muted small">not emptied</span> : <input className="cell" type="number" min="0" max="100" step="any" aria-label={`${t(`sys.${code}`)}: emptied, %`} value={f[`emptied_${code}`] || ''} onChange={(e) => act.form(`emptied_${code}`, e.target.value)} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="small muted">A report's text can leave a system out of its list. Add the missing share from the report's SFD matrix.</p>
              </details>
            )}
            {hasWfd && WFD_NEEDED.some((k) => !f[k]) && (
              <div className="fields">{WFD_NEEDED.map((k) => field(k, t(`w.${k}`), 'number'))}</div>
            )}
            <div><button type="button" className="btn primary" onClick={applyForm}>Use these figures</button></div>
          </>
        )}
      </section>
      <div className="nav-row"><a className="btn big" href="#/town">Back to the map</a></div>
    </div>
  );
}

export default function ReportsStep({ w, c, act, go, files, applyForm, saveBook, busy }) {
  if (!c) return <NewTown w={w} act={act} files={files} applyForm={applyForm} saveBook={saveBook} busy={busy} />;
  const { ctx, portal } = c;
  const { town, r, wv, isOwn, listing } = ctx;
  const meta = town.meta || {};
  const sfdTag = isOwn ? (meta.sfd_basis === 'workbook' ? 'From your workbook' : meta.sfd_file ? `Read from ${meta.sfd_file}` : 'Your figures')
    : listing && listing.status === 'listed' ? `Listed on SuSanA${listing.entry.year ? `, ${listing.entry.year}` : ''}` : listing && listing.status === 'not_listed' ? 'Not found on the SuSanA list' : 'SuSanA listing not checked yet';
  const wfdTag = isOwn ? (meta.basis && meta.basis.wfd === 'workbook' ? 'From your workbook' : meta.wfd_portal ? 'Read from the WFD portal page' : 'Your figures') : 'From the 50-town project dataset';
  const dataset = !isOwn ? Math.round(ctx.d.wfd.towns[String(town.id)].outputs.plastic_unmanaged_t) : null;
  return (
    <div className="page">
      <div className="head">
        <h1>The two reports for {town.name}</h1>
        <p className="lede">{isOwn ? 'This is what the planner read from your files.' : 'Both are already in the planner.'} Check what was read from each, or swap in a newer one.</p>
      </div>
      <Msgs msgs={w.msgs} />
      <section className="grid-2" aria-label="Reports">
        <article className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className={`chip ${r ? 'blue' : 'plain'}`}><span className="mark-dot" aria-hidden="true" />{r ? 'SFD read' : 'No SFD yet'}</span>
            {r && <span className="small muted">{sfdTag}</span>}
          </div>
          <div className="head"><h2>Excreta flow diagram</h2><div className="muted">{r ? (isOwn ? 'Sanitation, from containment to treatment' : `SFD Lite report by the ${town.sfd.prepared_by}`) : 'Add the SFD report to plan sanitation.'}</div></div>
          {r && (
            <dl className="stats">
              <Stat k="People" v={int(town.population_sfd)} />
              <Stat k="Households" v={int(r.households.households)} />
              <Stat k="Safely managed" v={pct(r.outcome.components.safe)} />
              <Stat k="Tanks and pits emptied" v={pct(ctx.chains.san.emptied)} />
            </dl>
          )}
          <div className="row">
            {!isOwn && <a className="btn" href="https://sfd.susana.org/" target="_blank" rel="noreferrer">Open the SuSanA SFD portal</a>}
            <FileBtn accept=".pdf" onFiles={(l) => files(l)}>{busy ? 'Reading…' : r ? 'Use another SFD (PDF)' : 'Add the SFD (PDF)'}</FileBtn>
          </div>
        </article>
        <article className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className={`chip ${wv ? 'orange' : 'plain'}`}><span className="mark-ring" aria-hidden="true" />{wv ? 'WFD read' : 'No WFD yet'}</span>
            {wv && <span className="small muted">{wfdTag}</span>}
          </div>
          <div className="head"><h2>Waste flow diagram</h2><div className="muted">{wv ? 'Solid waste and plastic, by the WFD method' : 'Add the WFD portal page to plan solid waste.'}</div></div>
          {wv && (
            <dl className="stats">
              <Stat k="Waste a day" v={`${int(wv.msw_t_day)} t`} />
              <Stat k="Collected" v={pct(wv.collected_share)} />
              <Stat k="Plastic waste a year" v={`${int(wv.plastic_generated_t)} t`} />
              <Stat k="Plastic escaping a year" v={`${int(wv.plastic_unmanaged_t)} t`} />
            </dl>
          )}
          <div className="row">
            <FileBtn accept=".pdf" onFiles={(l) => files(l)}>{busy ? 'Reading…' : wv ? 'Use a WFD portal page (PDF)' : 'Add the WFD portal page (PDF)'}</FileBtn>
          </div>
        </article>
      </section>

      {portal && wv && (
        <fieldset className="card">
          <legend>One choice to make</legend>
          <div>Two sources give different figures for plastic escaping a year. Which should the plan use?</div>
          <div className="pills">
            <label className="pill"><input type="radio" name="plastic" checked={w.plastic !== 'portal'} onChange={() => act.set({ plastic: 'dataset' })} />{int(dataset)} t, project dataset</label>
            <label className="pill"><input type="radio" name="plastic" checked={w.plastic === 'portal'} onChange={() => act.set({ plastic: 'portal' })} />{int(portal.plastic_unmanaged_t)} t, GIZ WFD portal</label>
          </div>
          <p className="small muted">The plan carries your choice and names the source in the plan document. Portal figure retrieved {portal.retrieved}.</p>
        </fieldset>
      )}

      <section className="card" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="head" style={{ flex: '1 1 380px' }}>
          <h2>Planning a town that is not on the map?</h2>
          <p className="muted">Add its SFD and WFD as PDFs, or a filled planner workbook. This step then shows what was read from each file and asks only for what is missing.</p>
        </div>
        <div className="row">
          <FileBtn accept=".pdf,.xlsx" multiple onFiles={(l) => { act.set({ townId: null, own: null, ownForm: {}, upSnap: {}, upMeta: {}, msgs: [] }); files(l, { fresh: true }); }}>Add files</FileBtn>
          <button type="button" className="btn" onClick={() => saveBook(true)}>Download a blank workbook</button>
        </div>
      </section>

      <div className="nav-row">
        <a className="btn big" href="#/town">Back to the map</a>
        <button type="button" className="btn primary big" onClick={() => go('your-town')}>Continue to your town</button>
      </div>
    </div>
  );
}
