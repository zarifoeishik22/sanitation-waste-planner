"""Third check: the workbook's own computed cells (Kaliakair_Test) against the Python reference.

The workbook must have been opened and saved by Excel or LibreOffice so that it holds
computed values; a file written by openpyxl alone has none, and the check then says so.

Usage: python scripts/check_workbook.py
"""
import sys
from pathlib import Path

from openpyxl import load_workbook

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reference_engine as ref  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
wb = load_workbook(ROOT / 'data' / 'source' / 'P7_Cost_and_Rules_Template_v0.2.xlsx', data_only=True)
k = wb['Kaliakair_Test']
if k['B8'].value is None:
    print('workbook holds no computed values (not recalculated); nothing to compare')
    sys.exit(0)

towns, sfd, rules, costs, params = (ref.load(n) for n in ('towns.json', 'sfd.json', 'rules.json', 'costs.json', 'params.json'))
P = {r['name']: r['value'] for r in params['params']}
town = next(t for t in towns['towns'] if t['name'] == 'Kaliakair')
res = ref.run(town, sfd['towns'][str(town['id'])], rules, {i['id']: i for i in costs['items']}, P, 'low')
case = P['cost_case']
bad = []


def near(a, b, what):
    if abs((a or 0) - (b or 0)) > 1e-6 * max(1.0, abs(b or 0)):
        bad.append(f'{what}: workbook {a}, engine {b}')


near(k['B8'].value, res['households'], 'households used')
near(k['D22'].value, res['not_contained_share'], 'not contained share')
n = 0
for row in k.iter_rows(min_row=25, max_row=60, max_col=10, values_only=True):
    oid = row[0]
    if not oid or oid not in res['options']:
        continue
    o = res['options'][oid]
    near(row[3], o['households'], f'{oid} households')
    if o['complete']:
        near(row[4], o['cost'][case][1], f'{oid} upfront per household')
        near(row[5], o['cost'][case][0], f'{oid} annual per household')
        near(row[6], o['cost'][case][3] / 1e6, f'{oid} total upfront')
        near(row[7], o['cost'][case][2] / 1e6, f'{oid} total annual')
    else:
        if not str(row[9]).startswith('INCOMPLETE'):
            bad.append(f'{oid}: engine says incomplete, workbook says {row[9]}')
    n += 1
if bad:
    print('WORKBOOK AND ENGINE DISAGREE')
    for b in bad:
        print('  -', b)
    sys.exit(1)
print(f'workbook Kaliakair_Test matches the engine ({n} options compared)')
