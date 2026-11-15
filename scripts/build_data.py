"""Turn the two source workbooks into the JSON files the site reads.

  python scripts/build_data.py                      rules, costs and parameters from the template workbook
  python scripts/build_data.py --check              same, but only compare with the committed JSON (used in CI)
  python scripts/build_data.py --master PATH.xlsx   also rebuild towns.json, sfd.json and wfd.json from the 50-town master

The template is read for its INPUT cells only. Computed cells are never copied:
the engine recomputes everything, and scripts/check_workbook.py compares the two.

The master workbook is not in this repository (it holds household records).
Only town-level aggregates are exported, through an explicit whitelist of columns.
"""
import argparse
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
TEMPLATE = DATA / 'source' / 'P7_Cost_and_Rules_Template_v0.2.xlsx'
TODAY = '2026-11-15'


def clean(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def r6(v):
    return None if v is None else round(float(v), 6)


def dump(obj):
    return json.dumps(obj, indent=1, ensure_ascii=False, sort_keys=False) + '\n'


# ------------------------------------------------------------------ template
def read_template(path):
    wb = load_workbook(path)  # formulas as text: computed cells are ignored
    version = path.stem.split('_v')[-1]
    head = {'data_version': version, 'source': f'data/source/{path.name}', 'generated': TODAY}

    # Parameters
    wp = wb['Parameters']
    params = []
    for row in wp.iter_rows(min_row=5, max_col=6, values_only=True):
        if not row[0]:
            continue
        params.append({'name': row[0], 'description': clean(row[1]), 'unit': clean(row[2]), 'value': row[3],
                       'status': clean(row[4]), 'note': clean(row[5])})

    # Cost_BoQ
    wc = wb['Cost_BoQ']
    items = []
    for row in wc.iter_rows(min_row=5, max_row=105, max_col=17, values_only=True):
        iid = clean(row[0])
        if not iid or clean(row[14]) == 'EXAMPLE':
            continue
        items.append({
            'id': iid, 'category': clean(row[1]), 'item': clean(row[2]), 'unit': clean(row[3]), 'cost_type': clean(row[4]),
            'year_of_cost': row[5], 'location': clean(row[6]), 'cost_low': row[7], 'cost_high': row[8],
            'lifespan_years': row[9], 'uses_per_year': row[10], 'om_fraction': row[11], 'bearer': clean(row[12]),
            'source_ref': clean(row[13]), 'status': clean(row[14]), 'notes': clean(row[16]),
        })

    # Systems
    wsys = wb['Systems']
    systems = []
    for row in wsys.iter_rows(min_row=5, max_col=7, values_only=True):
        if not row[0]:
            continue
        systems.append({'code': row[0], 'label': clean(row[1]), 'group': clean(row[2]),
                        'contained_gw_low': row[3] == 'Y', 'contained_gw_high': row[4] == 'Y',
                        'sludge_factor': row[5] == 'Y', 'note': clean(row[6])})

    # Option_Map: group the lines of each option
    wo = wb['Option_Map']
    options = {}
    for row in wo.iter_rows(min_row=5, max_row=80, max_col=13, values_only=True):
        oid = clean(row[0])
        if not oid:
            continue
        o = options.setdefault(oid, {
            'id': oid, 'system': clean(row[1]), 'name': clean(row[4]), 'stage': clean(row[5]),
            'result_system': clean(row[6]),
            'requires': [t.strip() for t in (row[7] or '').split(';') if t.strip()],
            'applies_when': clean(row[11]), 'review_status': clean(row[12]), 'lines': []})
        o['lines'].append({'item': clean(row[8]), 'qty': row[9], 'qty_status': clean(row[10])})

    # Chain_Package
    wch = wb['Chain_Package']
    chain = []
    for row in wch.iter_rows(min_row=5, max_col=7, values_only=True):
        if not row[0]:
            continue
        chain.append({'component': clean(row[0]), 'stage': clean(row[1]), 'item': clean(row[2]), 'basis': clean(row[3]),
                      'qty': row[4], 'required': row[5] == 'Y', 'sizing_note': clean(row[6])})

    return {
        'params.json': {**head, 'params': params},
        'costs.json': {**head, 'licence': 'CC BY 4.0', 'items': items},
        'rules.json': {**head, 'licence': 'CC BY 4.0', 'review_status': 'DRAFT - expert review',
                       'systems': systems, 'options': list(options.values()), 'chain_package': chain},
    }


# ------------------------------------------------------------------ master (town aggregates only)
STATED_HOUSEHOLDS = {1: (68163, 'Kaliakair SFD Lite report, Table 1')}  # town_id -> (households, source)

DISTRICT_SPELLING = {'Chittagong': 'Chattogram'}  # one official spelling per district

WFD_KEYS = {  # (metric, stream, unit) -> key
    ('Municipal solid waste generation', 'plastic', 'Tonnes/year'): 'plastic_generated_t',
    ('Municipal solid waste generation', 'msw', 'Tonnes/year'): 'msw_generated_t',
    ('Collected waste', 'plastic', 'Tonnes/year'): 'plastic_collected_t',
    ('Collected waste', 'msw', 'Tonnes/year'): 'msw_collected_t',
    ('Collected waste', 'msw', '% of waste generation'): 'msw_collected_share',
    ('Collected waste', 'plastic', '% of waste generation'): 'plastic_collected_share',
    ('Uncollected waste', 'plastic', 'Tonnes/year'): 'plastic_uncollected_t',
    ('Uncollected waste', 'msw', 'Tonnes/year'): 'msw_uncollected_t',
    ('Waste sorted for recovery (excludes energy from waste)', 'plastic', 'Tonnes/year'): 'plastic_recovered_t',
    ('Waste sorted for recovery (excludes energy from waste)', 'msw', 'Tonnes/year'): 'msw_recovered_t',
    ('Disposal in disposal facilities', 'plastic', 'Tonnes/year'): 'plastic_disposed_t',
    ('Disposal in disposal facilities', 'msw', 'Tonnes/year'): 'msw_disposed_t',
    ('Managed in controlled facilities', 'plastic', 'Tonnes/year'): 'plastic_controlled_t',
    ('Unmanaged plastic waste', 'plastic', 'Tonnes/year'): 'plastic_unmanaged_t',
    ('Unmanaged plastic waste', 'plastic', '% of plastic waste generation'): 'plastic_unmanaged_share',
    ('Contribution from uncollected waste', 'plastic', '% of mismanaged plastic waste'): 'stage_uncollected_share',
    ('Contribution from collection service', 'plastic', '% of mismanaged plastic waste'): 'stage_collection_share',
    ('Contribution from informal value-chain collection', 'plastic', '% of mismanaged plastic waste'): 'stage_informal_collection_share',
    ('Contribution from formal sorting', 'plastic', '% of mismanaged plastic waste'): 'stage_formal_sorting_share',
    ('Contribution from informal sorting', 'plastic', '% of mismanaged plastic waste'): 'stage_informal_sorting_share',
    ('Contribution from transportation', 'plastic', '% of mismanaged plastic waste'): 'stage_transport_share',
    ('Contribution from disposal facilities', 'plastic', '% of mismanaged plastic waste'): 'stage_disposal_share',
    ('Plastic waste retained on land', 'plastic', 'Tonnes/year'): 'fate_land_t',
    ('Plastic waste openly burnt', 'plastic', 'Tonnes/year'): 'fate_burnt_t',
    ('Plastic waste cleaned from drains', 'plastic', 'Tonnes/year'): 'fate_drains_t',
    ('Plastic waste to water systems', 'plastic', 'Tonnes/year'): 'fate_water_t',
    ('Plastic to water systems per person', 'plastic', 'kg per person/year'): 'water_kg_per_person',
}


def read_master(path):
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    wb = load_workbook(path, read_only=True, data_only=True)

    def rows(name):
        it = wb[name].iter_rows(values_only=True)
        h = next(it)
        return [dict(zip(h, r)) for r in it if r[0] is not None]

    head = {'data_version': '1.0', 'source': f'{path.name.split("-")[-1] if "project-file" in path.name else path.name}',
            'source_sha256': sha, 'generated': TODAY, 'licence': 'CC BY 4.0'}
    head['source'] = 'SFD_WFD_50_Master_v1.0.xlsx'
    T, S, F, WI, WO = rows('towns'), rows('sfd_systems'), rows('sfd_flows'), rows('wfd_inputs'), rows('wfd_outputs')

    # towns: whitelist only. Never export giz_last_saved_by (a person's name) or any household-level field.
    towns = []
    for t in T:
        tid = t['town_id']
        flags = []
        if t['population_sfd'] != t['population_wfd']:
            flags.append(f"SFD and WFD use different populations ({t['population_sfd']:,} and {t['population_wfd']:,}).")
        if t['sfd_date_flag']:
            flags.append('SFD date precedes the household survey: probable typo in the source, not altered.')
        if str(t['bag_weight_basis_assumed']).startswith('2-day'):
            flags.append('Waste bag weights are 2-day totals; the WFD generation input was halved.')
        if t['wfd_flag']:
            flags.append('WFD inputs fail mass balance (disposal plus informal recovery exceed generation); negative outputs set to 0.')
        if str(t['giz_last_saved']).startswith('2025'):
            flags.append('The GIZ WFD file was re-saved in 2025; whether inputs changed is not established.')
        hh = STATED_HOUSEHOLDS.get(tid)
        towns.append({
            'id': tid, 'name': t['town'], 'district': DISTRICT_SPELLING.get((clean(t['district']) or '').title().replace("'S", "'s"), (clean(t['district']) or '').title().replace("'S", "'s")) or None,
            'population_sfd': t['population_sfd'], 'population_wfd': t['population_wfd'],
            'households_stated': hh[0] if hh else None, 'households_source': hh[1] if hh else None,
            'sfd': {'date': str(t['sfd_date'])[:10] if t['sfd_date'] else None, 'level': str(t['sfd_level']), 'status': t['sfd_status'],
                    'prepared_by': 'CWIS-FSM Support Cell, DPHE'},
            'wfd': {'generation_kg_cap_day': t['wfd_gen_kg_cap_day'], 'giz_file_saved': str(t['giz_last_saved'])[:10] if t['giz_last_saved'] else None},
            'flags': flags,
        })

    # sfd: per-system shares and outcomes
    by = defaultdict(list)
    for s in S:
        if s['active'] and (s['pop_share'] or 0) > 0:
            by[s['town_id']].append(s)
    flows = {f['town_id']: f for f in F}
    sfd = {}
    for t in T:
        tid = t['town_id']
        systems = []
        for s in by[tid]:
            p, e = s['pop_share'], s['Pop_FS_Emptied'] or 0
            emptied = (s['F3a'] or 0) + (s['F3b'] or 0)
            factor = r6(emptied / (p * e)) if (e and s['system'].startswith('T1A2')) else None
            row = {'code': s['system'], 'pop_share': r6(p), 'emptied_share': r6(e), 'sludge_factor': factor,
                   'f8': r6(max(s['F8'] or 0, 0)), 'f11': r6(s['F11'] or 0), 'f15': r6(s['F15'] or 0),
                   'w11c': r6(s['W11c'] or 0), 's11e': r6(s['S11e'] or 0)}
            total = row['f8'] + row['f11'] + row['f15'] + row['w11c'] + row['s11e']
            assert abs(total - row['pop_share']) < 5e-6, (t['town'], s['system'], total, p)
            systems.append(row)
        f = flows[tid]
        assert not (f['F4'] or f['F5'] or f['OD9'] or f['F12']), t['town']
        sfd[str(tid)] = {
            'systems': systems,
            'treatment': {'delivered_share': 0.0, 'treated_share': 0.0},
            'flows': {'pop_sum': r6(f['Pop']), 'safe': r6(f['safe']), 'unsafe': r6(f['unsafe']), 'f8': r6(f['F8']), 'f11': r6(f['F11']),
                      'f15': r6(f['F15']), 'w11c': r6(f['W11c']), 's11e': r6(f['S11e'])},
        }

    # wfd: published outputs and inputs, compact
    out = defaultdict(dict)
    flagged = defaultdict(bool)
    for w in WO:
        k = WFD_KEYS.get((w['metric'], w['stream'], w['unit']))
        if k:
            out[w['town_id']][k] = r6(w['value'])
        if w['flag']:
            flagged[w['town_id']] = True
    inputs = defaultdict(dict)
    labels = {}
    for w in WI:
        no = str(w['no'])
        if no == '-' or w['is_check_row']:
            continue
        v = w['value_text'] if w['value_num'] is None else r6(w['value_num'])
        inputs[w['town_id']][no] = v
        if w['town_id'] == 1:
            labels[no] = {'item': clean(w['item']), 'description': clean(w['description']), 'unit': clean(w['unit'])}
    wfd = {str(t['town_id']): {'outputs': out[t['town_id']], 'inputs': inputs[t['town_id']],
                               'mass_balance_flag': flagged[t['town_id']]} for t in T}

    return {
        'towns.json': {**head, 'note': 'Town-level aggregates only. No household records, coordinates or personal identifiers.', 'towns': towns},
        'sfd.json': {**head,
                     'note': 'SFD Lite, level 0.5, Draft. Shares are fractions of population. f8 = contained, not emptied (safe). '
                             'f11 = emptied, not delivered to treatment. f15 = not contained, not emptied. w11c = toilet discharge not delivered to treatment. '
                             's11e = septic tank effluent not delivered to treatment. All 50 SFDs assume low groundwater risk.',
                     'towns': sfd},
        'wfd.json': {**head, 'model_version': 'GIZ WFD tool file; version not yet established. Plastic burnt at the disposal site is not counted as unmanaged in these results.',
                     'note': 'Disposal and informal-recovery inputs are informant estimates from municipal officials; there are no weighbridge data.',
                     'input_labels': labels, 'towns': wfd},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--master', type=Path)
    ap.add_argument('--template', type=Path, default=TEMPLATE)
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()

    files = read_template(a.template)
    if a.master:
        files.update(read_master(a.master))
    bad = []
    for name, obj in files.items():
        text = dump(obj)
        target = DATA / name
        if a.check:
            if not target.exists() or target.read_text(encoding='utf-8') != text:
                bad.append(name)
        else:
            target.write_text(text, encoding='utf-8')
            print('wrote', target.relative_to(ROOT), len(text), 'bytes')
    if a.check:
        if bad:
            print('OUT OF DATE (run scripts/build_data.py):', ', '.join(bad))
            sys.exit(1)
        print('data files match the template workbook')


if __name__ == '__main__':
    main()
