// Step 6. Plan document: the council-ready draft, the three downloads, and what is still assumed or to confirm.
import { useMemo } from 'react';
import { planDocument } from '../../../js/model/document.js';
import { slug } from '../../../js/model/format.js';
import { today } from '../data.js';
import { download } from '../files.js';

function Block({ b }) {
  if (b.p) return <p>{b.p}</p>;
  if (b.h3) return <h3>{b.h3}</h3>;
  if (b.list) return <ul className="bul">{b.list.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  if (b.targets) return <div className="targets">{b.targets.map((x) => <div key={x.label}><div className="small" style={{ fontWeight: 600 }}>{x.label}</div><div className="v">{x.value}</div></div>)}</div>;
  if (b.table) {
    return (
      <div className="table-wrap">
        <table className={`t${b.table.numeric ? ' num' : ''}`}>
          <thead><tr>{b.table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{b.table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => (j === 0 ? <th key={j} scope="row">{v}</th> : <td key={j}>{v}</td>))}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  return null;
}

export default function DocumentStep({ w, c, act, go, saveBook }) {
  const doc = useMemo(() => planDocument({ ctx: c.ctx, plan: c.plan, find: c.find, w, district: c.district, portal: c.portal, today }), [c, w]);
  const name = slug(c.ctx.town.name);
  const word = async () => {
    const { writeDocx } = await import('../../../js/model/docx.js');
    download(writeDocx(doc, 'Draft made with the sanitation and waste planner, version 0.5. Figures in square brackets are still to be set.'), `plan-${name}-${today}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  };
  return (
    <div className="page wide">
      <div className="split">
        <article className="paper">
          <div className="head" style={{ gap: 8 }}>
            <div className="kicker">{doc.kicker}</div>
            <h1>{doc.title}</h1>
            <div className="sub">{doc.subtitle}</div>
            <div className="small muted">{doc.basis}</div>
          </div>
          {doc.sections.map((s) => <section key={s.h}><h2>{s.h}</h2>{s.blocks.map((b, i) => <Block key={i} b={b} />)}</section>)}
        </article>
        <aside className="side">
          <section className="card">
            <h2>Take it with you</h2>
            <button type="button" className="btn primary block" onClick={word}>Download as Word</button>
            <button type="button" className="btn block" onClick={() => window.print()}>Print or save as PDF</button>
            <button type="button" className="btn block" onClick={() => saveBook(false)}>Download the Excel workbook</button>
            <p className="small muted">The workbook holds every answer and figure. Open it again later to pick up where you stopped.</p>
          </section>
          {doc.assumed.length > 0 && (
            <section className="card">
              <h2>Still assumed</h2>
              <ul className="ticks">{doc.assumed.map((x) => <li key={x}>{x}</li>)}</ul>
              <button type="button" className="btn outline block" onClick={() => go('your-town')}>Answer these in step 3</button>
            </section>
          )}
          <section className="card">
            <h2>Confirm before council</h2>
            <ul className="ticks">{doc.confirm.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
          <div className="nav-row">
            <button type="button" className="btn big" onClick={() => go('plan')}>Back</button>
            <button type="button" className="btn big" onClick={act.reset}>Plan another town</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
