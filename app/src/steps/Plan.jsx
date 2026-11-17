// Step 5. Build the plan: three stand-alone packages, whose money each is, how it sits against the budget, and when.
import { BudgetChart } from '../components/charts.jsx';
import { packageWords, GROUP_TITLE, PACKAGE_SHORT } from '../../../js/model/describe.js';
import { fitToBudget } from '../../../js/model/packages.js';
import { int, pct, money, inUnit, moneyUnit } from '../../../js/model/format.js';

const REASON = { no_sfd: 'Needs the SFD report. Add it in step 2.', no_wfd: 'Needs the WFD report. Add it in step 2.', in_place: 'Already in place: nothing to build here.' };

function Package({ p, plan, w, act }) {
  const x = packageWords(p, plan, w.answers);
  const cur = plan.currency;
  const toilets = p.id === 'toilets';
  const treat = plan.packages[1];
  const upkeep = p.lines.filter((l) => l.kind === 'contain' && l.rate.opex > 0).map((l) => l.rate.opex);
  return (
    <article className={`card${p.on ? '' : ' off'}`}>
      <div className="pk-head">
        <label className="pk-toggle"><input type="checkbox" checked={p.on} disabled={!p.available} onChange={() => act.toggle(p.id)} /><span>{x.title}</span></label>
        {p.available ? <span className={`chip ${x.tone}`}>{x.badge}</span> : <span className="chip plain">{REASON[p.reason]}</span>}
      </div>
      {p.available && (
        <div className="grid-3">
          <div className="col"><div className="label">{toilets && !p.lines.some((l) => l.payer === 'partners') ? 'What households build' : 'What gets built'}</div>{x.builds.map((b) => <div key={b.id}>{b.text}{p.id === 'collect' ? (b.payer === 'households' ? ', bought by households' : ', by the municipality') : ''}</div>)}</div>
          <div className="col"><div className="label">What changes</div>{x.changes.map((ch, i) => (ch.strong ? <div key={i} className="strong-green">{ch.strong}</div> : <div key={i} className="small muted">{ch.text}</div>))}</div>
          <div className="col">
            <div className="label">{x.cost.each.length ? 'What it costs a household, once' : 'What it costs'}</div>
            {x.cost.headline && <div className="big-num">{x.cost.headline}</div>}
            {x.cost.detail.map((s, i) => <div key={i} className="small muted">{s}</div>)}
            {x.cost.each.map((e) => <div key={e.label}><strong>{e.amount}</strong> {e.label}</div>)}
            {!x.cost.headline && !x.cost.each.length && <div className="small muted">No price yet for this item.</div>}
          </div>
        </div>
      )}
      {p.id === 'treat' && p.grows && (
        <p className="note-box">With Safe toilets at home switched on, more tanks are emptied, so this package is sized larger. On its own it is {money(p.alone_capex.partners, cur)}.</p>
      )}
      {toilets && p.available && x.households > 0 && (
        <p className="note-box">
          {w.answers.pays === 'municipality' ? `With the municipality paying, these works come to ${money(x.works_total, cur)} over ${plan.plan_years} years across ${int(x.households)} households.`
            : `The municipality's part here is not construction. It is a by-law, trained masons, and a loan or subsidy scheme: [COST NOT YET SET]. Across all ${int(x.households)} households the works come to ${money(x.works_total, cur)} over ${plan.plan_years} years.`}
          {upkeep.length ? ` Upkeep after that: ${money(Math.min(...upkeep), cur)}${upkeep.length > 1 ? ` to ${money(Math.max(...upkeep), cur).replace(`${cur} `, '')}` : ''} a household a year.` : ''}
          {!treat.on && treat.available ? ' Switch on the treatment package too, or the sludge these tanks produce still has nowhere safe to go.' : ''}
        </p>
      )}
    </article>
  );
}

function When({ plan, act }) {
  const n = plan.plan_years;
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const tight = n > 6;
  return (
    <section className="card">
      <h2>When</h2>
      <div className="timeline">
        <div className="tl-years" style={cols} aria-hidden="true">{plan.years.map((y) => <span key={y.year}>{tight ? `'${String(y.year).slice(2)}` : y.year}</span>)}</div>
        {plan.groups.map((g) => (
          <div key={g.id} className="tl-row">
            <div className="tl-ctl">
              <span className="name">{GROUP_TITLE[g.id]}</span>
              <span className="row" style={{ gap: 8 }}>
                <label>from<select value={g.start} aria-label={`${GROUP_TITLE[g.id]}: first year`} onChange={(e) => act.phase(g.id, { start: Number(e.target.value), years: Math.min(g.years, n - Number(e.target.value)) })}>{plan.years.map((y, i) => <option key={y.year} value={i}>{y.year}</option>)}</select></label>
                <label>for<select value={g.years} aria-label={`${GROUP_TITLE[g.id]}: years to build`} onChange={(e) => act.phase(g.id, { start: g.start, years: Number(e.target.value) })}>{Array.from({ length: n - g.start }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} yr</option>)}</select></label>
              </span>
            </div>
            <div className="tl-track" style={cols} aria-hidden="true"><div className={`tl-bar ${g.id}`} style={{ gridColumn: `${g.start + 1} / span ${g.years}` }} /></div>
          </div>
        ))}
        {!plan.groups.length && <p className="muted">Switch on a package to see its years.</p>}
      </div>
      <p className="small muted">Change the first year or the length and the cost table follows.</p>
    </section>
  );
}

export default function PlanStep({ w, c, act, go }) {
  const { plan, ctx } = c;
  const cur = plan.currency; const m = plan.money; const unit = moneyUnit(cur);
  const onCount = plan.packages.filter((p) => p.on).length;
  const fit = plan.budget && !plan.budget.fits ? fitToBudget(plan, plan.budget.value) : null;
  const rows = [['Municipality, build', 'municipality'], ['Municipality, running', 'running'], ['Partners, build', 'partners']].filter(([, k]) => plan.years.some((y) => y[k] > 0));
  return (
    <div className="page wide">
      <div className="split">
        <div className="main">
          <div className="head">
            <h1>Build the plan in packages</h1>
            <p className="lede">Each package stands on its own: one result, one price, and a payer for every line. Switch on what the town can take up, in the order that fits its budget.</p>
          </div>
          {plan.packages.map((p) => <Package key={p.id} p={p} plan={plan} w={w} act={act} />)}
          <p className="small muted">{ctx.sizing.totals.any_engineer || plan.lines.some((l) => l.rate.source === 'engineer') ? "Prices: the project engineer's unit cost sheet, 16 November 2026, Bangladesh." : 'Prices: your workbook.'} Quantities: the planner&apos;s sizing rules, in the workbook.</p>
          {onCount > 0 && plan.years.some((y) => y.public > 0 || y.running > 0) && (
            <section className="card">
              <h2>Public money by year</h2>
              <div className="table-wrap">
                <table className="t num">
                  <thead><tr><th scope="col">{unit.label}</th>{plan.years.map((y) => <th key={y.year} scope="col">{y.year}</th>)}<th scope="col">Total</th></tr></thead>
                  <tbody>
                    {rows.map(([label, k]) => <tr key={k}><th scope="row">{label}</th>{plan.years.map((y) => <td key={y.year}>{inUnit(y[k], cur)}</td>)}<td>{inUnit(plan.years.reduce((a, y) => a + y[k], 0), cur)}</td></tr>)}
                    <tr><th scope="row">Public money to build</th>{plan.years.map((y) => <td key={y.year}>{inUnit(y.public, cur)}</td>)}<td>{inUnit(m.public, cur)}</td></tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <div className="nav-row">
            <button type="button" className="btn big" onClick={() => go('findings')}>Back</button>
            <button type="button" className="btn primary big" onClick={() => go('document')}>Make the plan document</button>
          </div>
        </div>

        <aside className="side">
          <section className="card">
            <h2>Whose money</h2>
            <div className="col" style={{ gap: 12 }}>
              <div className="money-block">
                <div className="small" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>From the municipality&apos;s own budget</div>
                <div className="v">{m.municipality > 0 ? money(m.municipality, cur) : `${cur} 0`}</div>
                <div className="small">{m.municipality > 0 ? 'once, plus ' : ''}{money(m.running, cur)} a year to run what is built</div>
              </div>
              <div className="money-block">
                <div className="small" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>To raise with partners</div>
                <div className="v">{m.partners > 0 ? money(m.partners, cur) : `${cur} 0`}</div>
                <div className="small">{m.partners > 0 ? 'a project case to take to DPHE or a development partner' : 'no partner-financed package is switched on'}</div>
              </div>
              <div className="money-block">
                <div className="small" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>Paid by households</div>
                <div className="v">{m.household_each && w.answers.pays !== 'municipality' ? (m.household_each.low === m.household_each.high ? money(m.household_each.low, cur) : `${money(m.household_each.low, cur)} to ${money(m.household_each.high, cur).replace(`${cur} `, '')}`) : m.bin_each !== null ? money(m.bin_each, cur) : `${cur} 0`}</div>
                <div className="small">{m.household_each && w.answers.pays !== 'municipality' ? `each, once, for toilet work, depending on what the home has today.${m.bin_each !== null ? ` A bin is about ${money(m.bin_each, cur)}.` : ''}` : m.bin_each !== null ? 'each, once, for a bin' : 'nothing in the packages switched on'}</div>
              </div>
            </div>
            {m.public > 0 && <p className="note-box green">Municipal and partner money to build it all: {money(m.per_resident_year, cur)} per resident a year over {plan.plan_years} years.</p>}
          </section>

          <section className="card">
            <h2>Against your budget</h2>
            {plan.budget ? (
              <>
                <p className="muted">{plan.budget.fits ? `The municipality's own share stays within ${money(plan.budget.value, cur)} a year in every year of the plan.` : `The municipality's own share is above ${money(plan.budget.value, cur)} in ${plan.budget.over.join(', ')}.`}</p>
                <BudgetChart plan={plan} />
                {fit && <button type="button" className="btn outline block" onClick={() => act.phases(fit)}>Spread the municipality&apos;s building to fit</button>}
                {!plan.budget.fits && !fit && <p className="small muted">Building is already spread as far as the plan&apos;s years allow. The running cost alone is {money(m.running, cur)} a year: a longer plan, a later start or partner support closes the rest.</p>}
              </>
            ) : (
              <>
                <p className="muted">No yearly budget entered yet. Add it and the plan shows which years fit, and what has to wait.</p>
                <button type="button" className="btn outline block" onClick={() => go('your-town')}>Add the yearly budget</button>
              </>
            )}
          </section>

          <When plan={plan} act={act} />

          <section className="card positive">
            <h2>{onCount === 3 ? 'With all three' : onCount === 0 ? 'No package switched on' : `With ${onCount === 1 ? 'this package' : 'these two'}`}</h2>
            {ctx.r && <div style={{ fontSize: 17, fontWeight: 600 }}>Safely managed sanitation: {pct(plan.base.safe)} to {pct(plan.end.safe)}</div>}
            {ctx.wv && <div style={{ fontSize: 17, fontWeight: 600 }}>Plastic escaping: {int(plan.base.plastic)} t to {int(plan.end.plastic)} t a year</div>}
            {onCount > 0 && onCount < 3 && <div className="small">On: {plan.packages.filter((p) => p.on).map((p) => PACKAGE_SHORT[p.id]).join(', ')}</div>}
          </section>
        </aside>
      </div>
    </div>
  );
}
