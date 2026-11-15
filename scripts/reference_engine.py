"""Independent Python reference for the planner engine.

Written from the method description, not translated from the JavaScript. It reads the same
data files and prints one JSON object; tests/reference.test.mjs compares it with the JS engine
for all 50 towns, both groundwater settings, both household bases and the three cost cases.

Usage: python scripts/reference_engine.py > reference.json
"""
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'data'
CASES = ('low', 'mid', 'high')


def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def unit_cost(item, P, case):
    """(annual, upfront) of one unit, or (None, None) when the workbook cell would be empty."""
    lo, hi = item.get('cost_low'), item.get('cost_high')
    if lo is None or hi is None:
        return None, None
    price = {'low': lo, 'high': hi}.get(case, (lo + hi) / 2)
    if item.get('year_of_cost') is not None:
        price *= (1 + P['infl_rate']) ** (P['price_base_year'] - item['year_of_cost'])
    kind = item['cost_type']
    if kind == 'One-off':
        life = item.get('lifespan_years')
        if life is None:
            return None, price
        r = P['disc_rate']
        annuity = r * (1 + r) ** life / ((1 + r) ** life - 1)
        return price * (annuity + (item.get('om_fraction') or 0)), price
    if kind == 'Per service':
        uses = item.get('uses_per_year')
        return (None if uses is None else price * uses), 0.0
    if kind == 'Annual':
        return price, 0.0
    return None, 0.0


def run(town, sfd, rules, items, P, gw):
    pop = town['population_sfd']
    if P['hh_basis'] == 'stated' and town.get('households_stated'):
        hh_total = town['households_stated']
    else:
        hh_total = pop / P['hh_size']
    meta = {s['code']: s for s in rules['systems']}
    contains = lambda code: meta[code]['contained_gw_high'] if gw == 'high' else meta[code]['contained_gw_low']
    treated = sfd['treatment']['delivered_share'] * sfd['treatment']['treated_share']

    comp = dict(safe=0.0, s11e=0.0, w11c=0.0, f15=0.0, f11=0.0)
    rows = {}
    nc_share = 0.0
    for s in sfd['systems']:
        ok = contains(s['code'])
        safe = s['f8'] if ok else 0.0
        comp['safe'] += safe
        comp['f15'] += s['f15'] + (0.0 if ok else s['f8'])
        comp['f11'] += s['f11']; comp['w11c'] += s['w11c']; comp['s11e'] += s['s11e']
        if not ok:
            nc_share += s['pop_share']
        rows[s['code']] = dict(share=s['pop_share'], persons=s['pop_share'] * pop, hh=s['pop_share'] * hh_total, ok=ok, safe=safe, f8=s['f8'])
    binding = max(('f11', 'f15', 'w11c', 's11e'), key=lambda k: comp[k])

    opts = {}
    for o in rules['options']:
        r = rows.get(o['system'])
        if r is None:
            continue
        # cost per household, all-or-nothing
        cost = {c: [0.0, 0.0] for c in CASES}
        complete = True
        for ln in o['lines']:
            it = items.get(ln['item'])
            if it is None or ln['qty'] is None:
                complete = False
                continue
            for c in CASES:
                a, u = unit_cost(it, P, c)
                if a is None:
                    complete = False
                else:
                    cost[c][0] += ln['qty'] * a
                    cost[c][1] += ln['qty'] * u
        moved, gain = 0.0, None
        if o['stage'] == 'containment' and o['result_system']:
            res = o['result_system']
            if not r['ok'] and contains(res):
                moved = r['persons']
            if not contains(res):
                frac = 0.0
            elif res in rows and rows[res]['share'] > 0:
                frac = rows[res]['f8'] / rows[res]['share']
            elif meta[res]['contained_gw_high']:
                frac = treated
            else:
                frac = None
            gain = None if frac is None else r['persons'] * frac - r['safe'] * pop
        req = o['requires']
        if ('gw_low' in req and gw != 'low') or ('gw_high' in req and gw != 'high'):
            status = 'not_applicable_gw'
        elif o['stage'] == 'emptying':
            status = 'needs_treatment' if ('treatment' in req and treated <= 0) else 'chain'
        elif not complete:
            status = 'incomplete'
        elif o['stage'] != 'containment' or not o['result_system']:
            status = 'no_effect_model'
        else:
            status = 'ranked' if moved > 0 else 'no_gain'
        out_cost = None
        if complete:
            out_cost = {}
            for c in CASES:
                a_hh, u_hh = cost[c]
                a_tot = a_hh * r['hh']
                out_cost[c] = [a_hh, u_hh, a_tot, u_hh * r['hh'], (a_tot / moved if moved > 0 else None), (a_tot / gain if gain is not None and gain > 0 else None)]
        opts[o['id']] = dict(status=status, households=r['hh'], persons=r['persons'], moved=moved, safe_gain=gain, complete=complete, cost=out_cost,
                             system=o['system'], lines=o['lines'])

    def ranking(case):
        ids = [i for i, o in opts.items() if o['status'] == 'ranked']
        return sorted(ids, key=lambda i: (round(opts[i]['cost'][case][4] * 1e6), i))  # ties ordered by id

    ranked = {c: ranking(c) for c in CASES}
    first = {}
    for i in ranked[P['cost_case']]:
        first.setdefault(opts[i]['system'], i)
    summ = dict(persons_covered=sum(opts[i]['moved'] for i in first.values()),
                persons_uncovered=sum(r['persons'] for code, r in rows.items() if not r['ok'] and code not in first),
                safe_gain=sum(opts[i]['safe_gain'] or 0 for i in first.values()), cost={})
    for c in CASES:
        a = u = ha = hu = 0.0
        for i in first.values():
            o = opts[i]
            a += o['cost'][c][2]; u += o['cost'][c][3]
            for ln in o['lines']:
                it = items[ln['item']]
                if it.get('bearer') == 'Household':
                    ua, uu = unit_cost(it, P, c)
                    ha += ln['qty'] * ua * o['households']; hu += ln['qty'] * uu * o['households']
        summ['cost'][c] = [a, u, ha, hu]

    chain_ok = True
    for c in rules['chain_package']:
        if not c['required']:
            continue
        a, _ = unit_cost(items.get(c['item'], {'cost_type': None}), P, 'mid')
        if a is None or c['qty'] is None:
            chain_ok = False
    for o in opts.values():
        o.pop('system'); o.pop('lines')
    return dict(households=hh_total, not_contained_share=nc_share, comp=comp, binding=binding, ranked=ranked, options=opts, summary=summ,
                chain=dict(complete=chain_ok, untreated_persons=comp['f11'] * pop))


def main():
    towns, sfd, rules, costs, params = (load(n) for n in ('towns.json', 'sfd.json', 'rules.json', 'costs.json', 'params.json'))
    items = {i['id']: i for i in costs['items']}
    base = {r['name']: r['value'] for r in params['params']}
    out = {}
    for t in towns['towns']:
        for gw in ('low', 'high'):
            for basis in ('stated', 'hh_size'):
                P = dict(base, hh_basis=basis, cost_case='mid')
                out[f"{t['id']}|{gw}|{basis}"] = run(t, sfd['towns'][str(t['id'])], rules, items, P, gw)
    json.dump(out, sys.stdout)


if __name__ == '__main__':
    main()
