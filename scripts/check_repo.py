"""Guard: fail if the repository holds anything it must never hold.

Public repository rule: town-level aggregates only. No household records, household or facility coordinates,
personal identifiers, source masters or copyrighted WFD portal reports.
The one spatial file allowed is data/places.json: one approximate point per town (the centre of its sub-district,
from public OpenStreetMap-derived boundaries), under the key "centre". Built files (index.html, assets/) are generated.

Usage: python scripts/check_repo.py   (run in CI on every push)
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BAD_KEY = re.compile(r'(^|_)(gps|lat|lon|lng|latitude|longitude|holding|phone|mobile|respondent|hh_id|household_id|nid|saved_by|enumerator)(_|$)', re.I)
BAD_SHEETS = {'hh', 'bag_hh', 'hh_copy_diffs', 'hh_pooled_only', 'points', 'unions'}
BD_PHONE = re.compile(r'(?<!\d)01[3-9]\d{8}(?!\d)')
MAX_ROWS = 400  # a list longer than this in a data file would be record-level, not town-level

problems = []
files = subprocess.run(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split('\n')
# The built bundle and the lock file are generated; minified code is not scanned for phone-like digit runs.
files = [f for f in files if f and not f.startswith('assets/') and f != 'package-lock.json']


def walk(obj, where):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if BAD_KEY.search(str(k)):
                problems.append(f'{where}: forbidden key "{k}"')
            walk(v, where)
    elif isinstance(obj, list):
        if len(obj) > MAX_ROWS and all(isinstance(x, dict) for x in obj):
            problems.append(f'{where}: list of {len(obj)} records (limit {MAX_ROWS}); record-level data must not be committed')
        for v in obj:
            walk(v, where)


for f in files:
    p = ROOT / f
    low = f.lower()
    if low.endswith('.pdf') and not low.startswith('tests/fixtures/sfd/'):
        problems.append(f'{f}: PDF outside tests/fixtures/sfd/ (WFD portal reports are copyright GIZ)')
    if low.endswith(('.xlsx', '.xlsm', '.xls')):
        if not low.startswith('data/source/'):
            problems.append(f'{f}: workbook outside data/source/')
        else:
            from openpyxl import load_workbook
            sheets = set(load_workbook(p, read_only=True).sheetnames)
            if sheets & BAD_SHEETS:
                problems.append(f'{f}: contains record-level sheets {sorted(sheets & BAD_SHEETS)}')
    if low.endswith(('.csv', '.kml', '.shp', '.geojson', '.gpx', '.dta', '.sav')):
        problems.append(f'{f}: record-level or spatial file type')
    if low.endswith('.json'):
        try:
            walk(json.loads(p.read_text(encoding='utf-8')), f)
        except json.JSONDecodeError as e:
            problems.append(f'{f}: not valid JSON ({e})')
    if low.endswith(('.json', '.md', '.js', '.mjs', '.py', '.html', '.css', '.cff', '.yml')):
        if BD_PHONE.search(p.read_text(encoding='utf-8', errors='ignore')):
            problems.append(f'{f}: looks like it contains a phone number')

if problems:
    print('REPOSITORY GUARD FAILED')
    for x in problems:
        print('  -', x)
    sys.exit(1)
print(f'repository guard passed ({len(files)} files checked)')
