"""Engineer's unit costs -> data/unit_costs.json.

  python scripts/build_unit_costs.py

Reads data/source/Engineer_Unit_Costs_v1_2026-11-16.xlsx (the sheet the project engineer filled on 16 Nov 2026),
keeps every row as priced (low, typical, high, lifespan, yearly O&M, year, source, notes, spec), and maps priced rows
to the planner's sizing lines. A row is used only when its unit can be tied to what the line counts; every
conversion is written out in the line's note, and rows that are blank or contradictory are listed with the reason.
"""
import json
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'source' / 'Engineer_Unit_Costs_v1_2026-11-16.xlsx'
OUT = ROOT / 'data' / 'unit_costs.json'


def clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = ' '.join(v.split())
        return v or None
    return v


def items():
    ws = openpyxl.load_workbook(SRC, data_only=True)['Costs']
    rows = list(ws.iter_rows(values_only=True))
    head = rows[0]
    assert head[0] == 'ID' and head[7] == 'Typical (BDT)', 'unexpected sheet layout'
    out = {}
    for r in rows[1:]:
        iid = clean(r[0])
        if not iid or iid == 'EX':
            continue
        low, typ, high = r[6], r[7], r[8]
        priced = all(isinstance(x, (int, float)) for x in (low, typ, high))
        if priced:
            assert low <= typ <= high, f'{iid}: low, typical, high out of order'
        out[iid] = {
            'id': iid, 'category': clean(r[1]), 'item': clean(r[2]), 'unit': clean(r[3]), 'spec': clean(r[5]),
            'low': low if priced else None, 'typical': typ if priced else None, 'high': high if priced else None,
            'lifespan_years': r[9] if isinstance(r[9], (int, float)) else None,
            'om_year': r[10] if isinstance(r[10], (int, float)) else None,
            'price_year': r[11] if isinstance(r[11], (int, float)) else None,
            'source': clean(r[12]), 'notes': clean(r[13]), 'priced': priced,
        }
    return out


# How each planner line is priced from the engineer's rows.
#   per: what one unit of the line is. 'household' lines convert a unit priced for N users with the town's household size:
#        rate per household = cost x persons per household / users.
#   users: people one priced unit serves (from the engineer's spec); for m3_day lines, the planner turns users into capacity.
#   ref_rule: a sizing rule that converts a per-plant price into a rate per m3 a day.
LINES = {
    'contain:New septic tank with soak pit': {
        'items': ['C07', 'C21'], 'per': 'household', 'users_rule': 'tank_users',
        'note': 'Household septic tank (C07, 10-15 users) plus a soak pit (C21), divided among the households one tank serves. '
                'C03 is not used: it is priced as a 90-100-user community toilet, not a connection. '
                'A shared 90-100-user tank with soak pit (C20) would cost about a quarter as much per household.'},
    'contain:Connect septic tank to soak pit': {
        'items': ['C21'], 'per': 'household', 'users_rule': 'tank_users',
        'note': 'One soak pit (C21) per existing tank, divided among the households one tank serves. C21 is priced for a 90-100-user pit, so this is generous for a household tank.'},
    'contain:Convert dug hole to VIP latrine': {
        'items': ['C05'], 'per': 'household', 'users': 5,
        'note': 'C05 is priced for 5 users, including the latrine structure.'},
    'contain:Cluster DEWATS for outlets': {
        'items': ['C01B'], 'per': 'household', 'users': 292.5,
        'note': 'C01B, a 285-300-user DEWATS, divided among the households it serves. Land is not included.'},
    'contain:Replace with sealed, fully lined tank': {'items': ['C24'], 'per': 'household', 'note': 'Not priced: C24 was left blank.'},
    'shared_treatment': {
        'items': ['C01B'], 'per': 'm3_day', 'users': 292.5,
        'note': 'C01B (285-300 users) priced per m3 a day of the wastewater those users produce. C02 is not used: '
                'its price for a 50,000-100,000-person plant works out at about 1/40 of DEWATS per m3, which needs checking.'},
    'vehicles': {'items': ['C30'], 'per': 'vehicle', 'note': 'C30, 1,000-2,000 litre vacuum tanker. The engineer notes the price is for the tanker only: confirm whether the truck is included.'},
    'fstp': {
        'items': ['C12'], 'per': 'm3_day', 'ref_rule': 'fstp_ref_m3_day',
        'note': 'C12 is priced per plant for a town of 50,000-100,000 people (Saidpur), land excluded, drying beds and compost area included. '
                'Turned into a rate per m3 a day with the reference capacity in the sizing rules.'},
    'beds': {'items': ['C12'], 'per': 'm2', 'included': True, 'note': 'Drying beds are part of the treatment plant price (C12), so they cost nothing extra here. C34 was left blank.'},
    'land': {'items': ['C35'], 'per': 'decimal', 'note': 'C35, land in the municipality. Varies with centre or edge of town.'},
    'collection': {'items': ['S03'], 'per': 'van', 'note': 'S03, 500-800 litre paddle or battery rickshaw van.'},
    'bins': {'items': ['S01'], 'per': 'household', 'users': None, 'note': 'S01, one 10-20 litre bin with lid for each household newly collected.'},
    'compost': {'items': ['S06'], 'per': 't_day_capacity', 'blocked': True,
                'note': 'Not used: S06 is given per tonne a day but specified as 4-6 tonnes a month and sourced from the Saidpur sludge compost shed, '
                        'so it is not a price for an organic-waste compost plant. Needs the engineer to confirm.'},
    'disposal': {'items': ['S08'], 'per': 'site', 'note': 'Not priced: S08 was left blank.'},
}

UNUSED = {
    'C01A': 'Smaller DEWATS (85-100 users); the 285-300-user unit C01B is used because it is cheaper per user.',
    'C02': 'Price per m3 is about 1/40 of DEWATS; needs checking before use.',
    'C03': 'Specified as a community toilet with septic tank, not a connection.',
    'C04': 'Same as C21; C21 is used.',
    'C06': 'No planner option converts single pits to twin pits yet.',
    'C08': 'Only a yearly figure was given.',
    'C09': 'Scheduled emptying fee per household a year; shown as context, not built.',
    'C10': 'No planner option for wetlands at hotspots yet.',
    'C11': 'Same specification and price as C12.',
    'C13': 'Yearly staff cost per plant; listed in the plan report as running cost context.',
    'C14': 'Yearly repair reserve; listed as running cost context.',
    'C15': 'Training and toolkit; listed as running cost context.',
    'C20': 'Shared 90-100-user tank with soak pit; shown as the shared alternative in the note on new septic tanks.',
    'C22': 'No planner option for new twin pits yet.',
    'C23': 'No planner option for shared toilet blocks yet.',
    'C31': 'The sizing assumes 2 m3 per emptying; a 500-litre vacutug would need four trips.',
    'C32': 'Fee per emptying trip; shown as context.',
    'C33': 'Fee per manual emptying; shown as context.',
    'S02': 'No planner line for community bins yet.',
    'S04': 'The sizing counts rickshaw vans, not compactor trucks.',
}


def main():
    it = items()
    for lid, m in LINES.items():
        for i in m['items']:
            assert i in it, f'{lid}: item {i} not in the sheet'
        m['priced'] = (not m.get('blocked')) and all(it[i]['priced'] for i in m['items'])
    blank = sorted(i for i, v in it.items() if not v['priced'])
    out = {
        'data_version': '1.0', 'retrieved': '2026-11-16', 'currency': 'BDT',
        'source': 'Planner_Unit_Costs_for_Engineer_v1.xlsx, filled by the project engineer, returned 16 Nov 2026',
        'note': 'Prices are as given, in the year stated per row (2023 to 2026), with no inflation adjustment. Typical is used; low and high give the range.',
        'items': list(it.values()), 'lines': LINES, 'unused': UNUSED, 'blank': blank,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{OUT.relative_to(ROOT)}: {len(it)} rows, {len(it) - len(blank)} priced, blank: {", ".join(blank)}')


if __name__ == '__main__':
    main()
