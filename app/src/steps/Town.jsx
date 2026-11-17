// Step 1. Town: pick it on the map.
import { useMemo, useState } from 'react';
import MapView from '../components/MapView.jsx';
import { d, t, today } from '../data.js';
import { buildContext, defaultState } from '../../../js/model/context.js';
import { int, pct, people } from '../../../js/model/format.js';

/** One row per town with both reports, from the engines (no levers set). */
function useTowns() {
  return useMemo(() => d.towns.towns.map((town) => {
    const c = buildContext(d, { ...defaultState(), townId: town.id }, t, today);
    const safe = c.r.outcome.components.safe;
    const pl = d.places.towns[town.name];
    return { id: town.id, name: town.name, district: pl ? pl.district : town.district, centre: pl ? pl.centre : null, pop: town.population_sfd, safe, gain: (1 - safe) * town.population_sfd,
      collected: c.wv ? c.wv.collected_share : null, plastic: c.wv ? c.wv.plastic_unmanaged_t : null };
  }).filter((x) => x.centre), []);
}

export default function TownStep({ w, act, go, files, busy }) {
  const towns = useTowns();
  const top = useMemo(() => [...towns].sort((a, b) => b.gain - a.gain), [towns]);
  const [sel, setSel] = useState(() => (typeof w.townId === 'number' ? w.townId : top[0].id));
  const [q, setQ] = useState('');
  const [showBoth, setShowBoth] = useState(true);
  const [showSfd, setShowSfd] = useState(true);
  const cur = towns.find((x) => x.id === sel) || top[0];
  const total = towns.reduce((a, x) => a + x.gain, 0);
  const list = q.trim() ? towns.filter((x) => `${x.name} ${x.district}`.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)) : top.slice(0, 5);
  const start = () => { act.pick(cur.id); window.location.hash = `#/reports?town=${encodeURIComponent(cur.name)}`; };

  return (
    <div className="home">
      <section className="card float" aria-label="Find a town">
        <div className="head">
          <h1 style={{ fontSize: 30 }}>Plan sanitation and waste for a town</h1>
          <p className="lede">{towns.length} municipalities have both diagrams and are ready to plan. Together they can bring safely managed sanitation to {(total / 1e6).toFixed(2)} million people.</p>
        </div>
        <label className="col" style={{ fontWeight: 600 }}>Find a town
          <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or district" autoComplete="off" />
        </label>
        <div className="col" style={{ gap: 8 }}>
          <h2 style={{ fontSize: 16 }}>{q.trim() ? `${list.length} town${list.length === 1 ? '' : 's'} found` : 'Where a plan reaches the most people'}</h2>
          <div className="townlist">
            {list.map((x) => (
              <button key={x.id} type="button" className={`townrow${x.id === cur.id ? ' sel' : ''}`} aria-pressed={x.id === cur.id} onClick={() => setSel(x.id)}>
                <span>{x.name}</span><span className="gain">{people(x.gain)} people</span>
              </button>
            ))}
            {!list.length && <p className="small muted">No town with both reports matches. Add its reports below.</p>}
          </div>
        </div>
        <fieldset className="toggles">
          <legend>On the map</legend>
          <label className="toggle"><input type="checkbox" checked={showBoth} onChange={(e) => setShowBoth(e.target.checked)} /><span className="mark-dot" style={{ boxShadow: '0 0 0 3px #D9822B', margin: 3 }} aria-hidden="true" /><span>SFD and WFD: ready to plan ({towns.length})</span></label>
          <label className="toggle"><input type="checkbox" checked={showSfd} onChange={(e) => setShowSfd(e.target.checked)} /><span className="mark-dot" style={{ width: 9, height: 9, margin: '0 4px' }} aria-hidden="true" /><span>SFD only: add a WFD to plan ({d.places.sfd_only.length})</span></label>
        </fieldset>
        <div className="col" style={{ gap: 8, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <h2 style={{ fontSize: 16 }}>Town not on the map?</h2>
          <label className="btn file block">{busy ? 'Reading…' : 'Add its SFD and WFD, or a workbook'}<input type="file" multiple accept=".pdf,.xlsx" onChange={(e) => { files(e.target.files, { fresh: true }); e.target.value = ''; }} /></label>
        </div>
      </section>

      <section className="mapwrap" aria-label="Map of Bangladesh">
        <MapView towns={towns} sfdOnly={d.places.sfd_only} selectedId={cur.id} onPick={setSel} showBoth={showBoth} showSfd={showSfd} />
        <p className="small muted">Live OpenStreetMap. Zoom in for streets and buildings. Marks sit at the centre of each town&apos;s sub-district.</p>
      </section>

      <aside className="card float" aria-label="Selected town" aria-live="polite">
        <div className="head">
          <h2 style={{ fontSize: 28 }}>{cur.name}</h2>
          <div className="muted">{cur.district} district</div>
        </div>
        <div className="row">
          <span className="chip blue"><span className="mark-dot" aria-hidden="true" />SFD published</span>
          <span className="chip orange"><span className="mark-ring" aria-hidden="true" />WFD published</span>
        </div>
        <dl className="stats">
          <div><dt>People</dt><dd>{int(cur.pop)}</dd></div>
          <div><dt>Safely managed today</dt><dd>{pct(cur.safe)}</dd></div>
          <div><dt>Waste collected today</dt><dd>{pct(cur.collected)}</dd></div>
          <div><dt>Plastic escaping a year</dt><dd>{int(cur.plastic)} t</dd></div>
        </dl>
        <div className="note-box green">{people(cur.gain)} people can gain safely managed sanitation</div>
        <button type="button" className="btn primary big block" onClick={start}>Start the plan</button>
        <p className="small muted">Six steps, about 15 minutes. You leave with a costed, phased plan and an Excel workbook.</p>
        {w.townId === 'own' && w.own && <button type="button" className="btn block" onClick={() => go('reports')}>Continue the plan for {w.own.town.name}</button>}
      </aside>
    </div>
  );
}
