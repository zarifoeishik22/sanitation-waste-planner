// Step 3. Your town: ten questions the reports cannot answer, beside a live map of the town.
import TownMap from '../components/TownMap.jsx';
import { CHOICES } from '../../../js/model/wizard.js';
import { int, pct, moneyUnit } from '../../../js/model/format.js';

function Radios({ name, q, value, onChange }) {
  return (
    <div className="radios" role="radiogroup" aria-label={q}>
      <div className="q">{q}</div>
      <div className="pills">
        {CHOICES[name].map(([id, label]) => (
          <label key={id} className="pill"><input type="radio" name={name} checked={value === id} onChange={() => onChange(id)} onClick={() => { if (value === id && name !== 'pays') onChange(''); }} />{label}</label>
        ))}
      </div>
    </div>
  );
}

export default function YourTownStep({ w, c, act, go }) {
  const a = w.answers;
  const { ctx, plan } = c;
  const unit = moneyUnit(plan.currency);
  const num = (k, label, props = {}) => (
    <label className="field">{label}<input type="number" inputMode="decimal" min="0" value={a[k]} onChange={(e) => act.answer(k, e.target.value)} {...props} /></label>
  );
  return (
    <div className="page wide">
      <div className="split">
        <form className="main" onSubmit={(e) => { e.preventDefault(); go('findings'); }}>
          <div className="head">
            <h1>Tell us about {ctx.town.name}</h1>
            <p className="lede">The reports say where waste goes. They do not say what the town already runs or can spend. Ten short questions close that gap. Leave any blank: the planner uses its default and marks the result as assumed.</p>
          </div>
          <fieldset className="card">
            <legend>The plan</legend>
            <div className="fields">
              {num('start_year', 'First year', { placeholder: String(plan.start_year), min: 2000, max: 2100 })}
              <label className="field">Years it covers
                <select value={a.plan_years} onChange={(e) => act.answer('plan_years', e.target.value)}>{['3', '5', '10'].map((y) => <option key={y} value={y}>{y}</option>)}</select>
              </label>
              {num('budget', `Yearly budget, ${unit.label}`, { placeholder: 'e.g. 2.5', step: 'any' })}
            </div>
            <p className="small muted">The budget is what the municipality can commit a year to sanitation and waste. The plan is then fitted to it year by year, not the other way round.</p>
          </fieldset>
          <fieldset className="card">
            <legend>What the town already runs</legend>
            <div className="fields">
              {ctx.r && num('tankers', 'Vacuum tankers in service', { placeholder: '0' })}
              {ctx.wv && num('vans', 'Waste vans and trucks in service', { placeholder: '0' })}
              {ctx.r && num('fstp', 'Sludge treatment in use, m³ a day', { placeholder: '0 if none', step: 'any' })}
            </div>
            {ctx.wv && <Radios name="site" q="Where does collected waste go?" value={a.site} onChange={(v) => act.answer('site', v)} />}
            <p className="small muted">What already exists comes off what the plan asks you to buy.</p>
          </fieldset>
          {ctx.r && (
            <fieldset className="card">
              <legend>Land and who pays</legend>
              <Radios name="land" q="Does the municipality hold land for a treatment plant?" value={a.land} onChange={(v) => act.answer('land', v)} />
              <Radios name="pays" q="Who pays for toilet and tank work at home?" value={a.pays} onChange={(v) => act.answer('pays', v || 'households')} />
              <p className="small muted">This decides whose budget each cost lands in. Household works are the largest cost in most towns and are rarely the municipality&apos;s to pay.</p>
            </fieldset>
          )}
          {ctx.r && (
            <fieldset className="card">
              <legend>Local conditions</legend>
              <Radios name="gw" q="Do parts of the town flood or have high groundwater?" value={a.gw} onChange={(v) => act.answer('gw', v)} />
              <p className="small muted">Pits and soak pits do not contain where groundwater is high, so the plan changes what it recommends there. &quot;Most of the town&quot; switches the whole town to that case.</p>
            </fieldset>
          )}
          <div className="nav-row">
            <button type="button" className="btn big" onClick={() => go('reports')}>Back</button>
            <button type="submit" className="btn primary big">Continue to what we found</button>
          </div>
        </form>
        <aside className="side">
          <div className="card">
            <h2>{ctx.town.name} on the map</h2>
            <TownMap name={ctx.town.name} district={c.district} country={ctx.isOwn ? w.country : 'Bangladesh'} place={c.place} sites={w.sites} onSite={act.site} />
          </div>
          <div className="card">
            <h2>Already read from the reports</h2>
            <dl className="stats">
              {ctx.r && <div><dt>Households</dt><dd>{int(ctx.r.households.households)}</dd></div>}
              {ctx.r && <div><dt>Safely managed sanitation</dt><dd>{pct(plan.base.safe)}</dd></div>}
              {ctx.wv && <div><dt>Waste a day</dt><dd>{int(ctx.wv.msw_t_day)} t</dd></div>}
              {ctx.wv && <div><dt>Waste collected</dt><dd>{pct(plan.base.collected)}</dd></div>}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
