// Step 4. What we found: what already works, the gaps that hold most of the gain, and where the flows end up today.
import { useState } from 'react';
import { FlowDiagram } from '../components/charts.jsx';
import { RECEIVER, FATE, PACKAGE_SHORT } from '../../../js/model/describe.js';
import { int, pct } from '../../../js/model/format.js';

const EX_COLOUR = { safe: '#0E7A5C', drain: '#173F73', dumped: '#5C6B7D', ground: '#9DB9D9', water: '#4C8BD6' };
const PL_COLOUR = { land: '#B8651B', water: '#4C8BD6', burnt: '#5C6B7D', drains: '#173F73' };

function Bar({ parts, total, colour, labels, fmt, aria }) {
  return (
    <>
      <div className="segbar" role="img" aria-label={aria}>{parts.map((p) => <div key={p.key} style={{ flex: `${p.v / total} 1 0`, background: colour[p.key] }} title={`${labels[p.key]}: ${fmt(p.v)}`} />)}</div>
      <ul className="legend">{parts.map((p) => <li key={p.key}><span className="sw" style={{ background: colour[p.key] }} aria-hidden="true" />{labels[p.key]} <strong>{fmt(p.v)}</strong></li>)}</ul>
    </>
  );
}

export default function FindingsStep({ w, c, go }) {
  const { ctx, find, portal } = c;
  const [open, setOpen] = useState({ san: false, plastic: false });
  const n = find.working.length; const g = find.gaps.length;
  const word = (k) => ['No', 'One', 'Two', 'Three'][k] || String(k);
  const ex = find.excreta ? find.excreta.map((x) => ({ key: x.key, v: x.share })) : null;
  const pl = find.plastic ? find.plastic.map((x) => ({ key: x.key, v: x.tonnes })) : null;
  return (
    <div className="page">
      <div className="head">
        <h1>What the {ctx.r && ctx.wv ? 'two reports say' : 'report says'} about {ctx.town.name}</h1>
        <p className="lede">{n ? `${word(n)} thing${n === 1 ? ' already works and is' : 's already work and are'} worth building on. ` : ''}{word(g)} gap{g === 1 ? ' holds' : 's hold'} most of the gain. Each gap leads to one package in the next step.</p>
      </div>
      {n > 0 && (
        <section className="col" style={{ gap: 10 }} aria-label="Already working">
          <h2>Already working</h2>
          <div className="grid-tiles">{find.working.map((x) => <div key={x.id} className="tile"><div className="v">{x.value}</div><div className="l">{x.label}</div><div className="small">{x.note}</div></div>)}</div>
        </section>
      )}
      <section className="col" style={{ gap: 10 }} aria-label="Where a plan helps most">
        <h2>Where a plan helps most</h2>
        <ol className="gaps">
          {find.gaps.map((x) => (
            <li key={x.id} className="gap">
              <div className={`src ${x.pkg === 'collect' ? 'waste' : 'san'}`}>{x.source}</div>
              <h3>{x.title}</h3>
              <p>{x.text}</p>
              <button type="button" className="btn outline" onClick={() => go('plan')}>Package: {PACKAGE_SHORT[x.pkg]}</button>
            </li>
          ))}
        </ol>
      </section>
      <section className="grid-2" aria-label="Flows">
        {ex && (
          <div className="card">
            <h2>Where excreta goes today</h2>
            <Bar parts={ex} total={1} colour={EX_COLOUR} labels={RECEIVER} fmt={(v) => pct(v)} aria={ex.map((p) => `${RECEIVER[p.key]} ${pct(p.v)}`).join(', ')} />
            <button type="button" className="linkbtn" aria-expanded={open.san} onClick={() => setOpen({ ...open, san: !open.san })}>{open.san ? 'Close the full flow diagram' : 'Open the full flow diagram'}</button>
            {open.san && <><FlowDiagram flows={ctx.flows.san} unit=" people" label="Flow of excreta from the kind of toilet, through containment, to where it ends up" /><p className="small muted">People, from the SFD. Left: the kind of toilet. Middle: contained or not. Right: where it ends up.</p></>}
          </div>
        )}
        {pl && (
          <div className="card">
            <h2>Where escaping plastic goes today</h2>
            <Bar parts={pl} total={find.plastic_total} colour={PL_COLOUR} labels={FATE} fmt={(v) => `${int(v)} t`} aria={`Of ${int(find.plastic_total)} tonnes a year: ${pl.map((p) => `${FATE[p.key]} ${int(p.v)}`).join(', ')}`} />
            <button type="button" className="linkbtn" aria-expanded={open.plastic} onClick={() => setOpen({ ...open, plastic: !open.plastic })}>{open.plastic ? 'Close the full flow diagram' : 'Open the full flow diagram'}</button>
            {open.plastic && <><FlowDiagram flows={ctx.flows.plastic} unit=" t" label="Flow of plastic waste from generation to where it escapes" /><p className="small muted">Tonnes a year, from the WFD.</p></>}
          </div>
        )}
      </section>
      {portal && ctx.wv && (
        <section className="card">
          <h2>One figure to confirm</h2>
          <p className="muted">The WFD portal gives {int(portal.plastic_unmanaged_t)} tonnes of plastic escaping a year; the project dataset gives {int(ctx.d.wfd.towns[String(ctx.town.id)].outputs.plastic_unmanaged_t)}. This plan uses {int(ctx.wv.plastic_unmanaged_t)}. Check which is current before the plan goes to council. <button type="button" className="linkbtn" onClick={() => go('reports')}>Change it in step 2</button></p>
        </section>
      )}
      <div className="nav-row">
        <button type="button" className="btn big" onClick={() => go('your-town')}>Back</button>
        <button type="button" className="btn primary big" onClick={() => go('plan')}>Continue to build the plan</button>
      </div>
    </div>
  );
}
