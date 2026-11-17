// The planner's two charts: the municipality's yearly money against its budget, and the full flow diagrams.
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Sankey, Tooltip, XAxis, YAxis, Layer, Rectangle } from 'recharts';
import { t } from '../data.js';
import { int, fix, moneyUnit } from '../../../js/model/format.js';

const BUILD = '#1B5FAE';
const RUN = '#B8651B';

function Tip({ active, payload, label, unit }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="tip">
      <div className="small muted">{label}</div>
      {payload.map((p) => <div key={p.dataKey}><span className="k" style={{ background: p.color }} /><strong>{fix(p.value, 2)}</strong> {unit} {p.name.toLowerCase()}</div>)}
    </div>
  );
}

/** Stacked columns: what the municipality itself spends each year (build + running), with its budget as a line. One axis. */
export function BudgetChart({ plan }) {
  const u = moneyUnit(plan.currency);
  const data = plan.years.map((y) => ({ year: String(y.year), build: y.municipality / u.factor, run: y.running / u.factor }));
  const b = plan.budget ? plan.budget.value / u.factor : null;
  const max = Math.max(b || 0, ...data.map((x) => x.build + x.run));
  return (
    <figure className="col" style={{ gap: 6 }}>
      <div className="chart" role="img" aria-label={`The municipality's own spending by year in ${u.label}, against a budget of ${b === null ? 'none' : fix(b, 2)}. The table below gives the figures.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: -12 }} barSize={24}>
            <CartesianGrid vertical={false} stroke="#E4EAF0" />
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: '#B9C5D1' }} tick={{ fill: '#46586E', fontSize: 13 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: '#46586E', fontSize: 13 }} domain={[0, Math.ceil(max * 1.15 * 10) / 10 || 1]} width={52} />
            <Tooltip content={<Tip unit={u.word} />} cursor={{ fill: 'rgba(19,35,58,0.05)' }} />
            <Legend iconType="rect" iconSize={10} wrapperStyle={{ fontSize: 13, color: '#33475E' }} formatter={(v) => <span style={{ color: '#33475E' }}>{v}</span>} />
            <Bar dataKey="build" name="Build" stackId="a" fill={BUILD} stroke="#fff" strokeWidth={2} />
            <Bar dataKey="run" name="Running" stackId="a" fill={RUN} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} />
            {b !== null && <ReferenceLine y={b} stroke="#13233A" strokeWidth={1.5} label={{ value: `Budget ${fix(b, 2)}`, position: 'insideTopLeft', fill: '#13233A', fontSize: 13, fontWeight: 600, dy: -18, dx: 4 }} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="small muted">{u.label} a year. Partner-financed building is not counted against the municipality&apos;s budget.</figcaption>
    </figure>
  );
}

const NODE_FILL = (id) => (id === 'f:safe' || id === 'c:yes' || id === 'p:managed' ? '#0E7A5C' : id.startsWith('p:') || id.startsWith('s:') || id.startsWith('x:') ? '#B8651B' : id === 'f:dumped' ? '#5C6B7D' : '#1B5FAE');

function Node({ x, y, width, height, payload, unit, ends }) {
  // The last column is labelled to its left so the text stays inside the picture.
  const end = ends.has(payload.id);
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={Math.max(height, 2)} fill={NODE_FILL(payload.id)} radius={2} />
      <text x={end ? x - 6 : x + width + 6} y={y + height / 2} textAnchor={end ? 'end' : 'start'} dominantBaseline="middle" stroke="#fff" strokeWidth={4} strokeOpacity={0.85} paintOrder="stroke" strokeLinejoin="round">
        {payload.name} <tspan fill="#46586E">{int(payload.value)}{unit}</tspan>
      </text>
    </Layer>
  );
}

/** Flow diagram from the engine's links: [{ s, t, v }]. People for excreta, tonnes a year for plastic. */
export function FlowDiagram({ flows, unit, label }) {
  // Bands under half a percent of the largest are left out of the picture; the figures stay in the bar above.
  const big = Math.max(...flows.links.map((l) => l.v));
  const links = flows.links.filter((l) => l.v >= big * 0.005);
  const ids = [...new Set(links.flatMap((l) => [l.s, l.t]))];
  const ends = new Set(ids.filter((id) => !links.some((l) => l.s === id)));
  const data = { nodes: ids.map((id) => ({ id, name: t(`node.${id}`) })), links: links.map((l) => ({ source: ids.indexOf(l.s), target: ids.indexOf(l.t), value: l.v })) };
  return (
    <div className="sankey" role="img" aria-label={label}>
      <div style={{ minWidth: 440, height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey data={data} nodePadding={30} nodeWidth={12} margin={{ top: 10, right: 6, bottom: 10, left: 6 }} link={{ stroke: '#9DB9D9', strokeOpacity: 0.45 }} node={(p) => <Node {...p} unit={unit} ends={ends} />}>
            <Tooltip content={({ active, payload }) => (active && payload && payload.length ? <div className="tip"><strong>{int(payload[0].value)}</strong>{unit} {payload[0].name}</div> : null)} />
          </Sankey>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
