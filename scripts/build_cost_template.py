"""Build data/source/P7_Cost_and_Rules_Template_v0.2.xlsx.

The workbook is the single place where cost items and option rules are edited.
Run this script only to create a fresh template; once people have typed real
BoQ data into the workbook, edit the workbook, not this script, and re-run
scripts/build_data.py to refresh the JSON the site reads.

v0.2 = v0.1 (14 Nov 2026) plus the changes accepted on 15 Nov 2026:
  R1  Option_Map gains stage, result_system, requires; sheets Systems and Chain_Package added.
  R7  the groundwater rule "replace with septic tank and soak pit" becomes a sealed-tank option (cost row C24, TO FILL).
  D30 note: households stated in the SFD report override population / hh_size (parameter hh_basis).

Usage: python scripts/build_cost_template.py [output.xlsx]
"""
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'data' / 'source' / 'P7_Cost_and_Rules_Template_v0.2.xlsx'

F = 'Arial'
f_base = Font(name=F, size=10)
f_bold = Font(name=F, size=10, bold=True)
f_title = Font(name=F, size=14, bold=True)
f_hdr = Font(name=F, size=10, bold=True, color='FFFFFF')
f_in = Font(name=F, size=10, color='0000FF')
f_grey = Font(name=F, size=10, italic=True, color='7F7F7F')
f_red = Font(name=F, size=10, bold=True, color='C00000')
fill_hdr = PatternFill('solid', fgColor='1F3864')
fill_in = PatternFill('solid', fgColor='FFFF99')
fill_calc = PatternFill('solid', fgColor='F2F2F2')
fill_ex = PatternFill('solid', fgColor='E7E6E6')
thin = Side(style='thin', color='BFBFBF')
box = Border(left=thin, right=thin, top=thin, bottom=thin)
wrap = Alignment(wrap_text=True, vertical='top')
BDT = '#,##0;(#,##0);-'
BDTM = '#,##0.0;(#,##0.0);-'
PCT = '0.0%'

wb = Workbook()


def hdr(ws, row, labels, widths=None):
    for j, t in enumerate(labels, 1):
        c = ws.cell(row=row, column=j, value=t)
        c.font = f_hdr; c.fill = fill_hdr; c.alignment = Alignment(wrap_text=True, vertical='center'); c.border = box
    ws.row_dimensions[row].height = 42
    if widths:
        for j, w in enumerate(widths, 1):
            ws.column_dimensions[ws.cell(row=row, column=j).column_letter].width = w


def put(ws, ref, v, font=f_base, fill=None, fmt=None, al=None, border=True):
    c = ws[ref]; c.value = v; c.font = font
    if fill: c.fill = fill
    if fmt: c.number_format = fmt
    c.alignment = al or wrap
    if border: c.border = box
    return c


# ------------------------------------------------------------------ README
ws = wb.active; ws.title = 'README'
ws['A1'] = 'Sanitation and waste planner: cost and rule library template v0.2'; ws['A1'].font = f_title
rows = [
 ('Purpose', 'Holds the unit costs and option rules the planning tool reads. Everything is driven by variables, so real BoQ data replaces placeholders without changing any formula.'),
 ('Yellow cells (blue text)', 'Fill these in. Overwrite placeholders with real values and set Status to REAL.'),
 ('Grey cells', 'Formulas. Do not type over them.'),
 ('Status values', 'REAL = from a WaterAid BoQ or other sourced document. PLACEHOLDER = test value, not quotable. TO FILL = empty slot. EXAMPLE = format example, delete before use. DATA = measured in the 50-town survey or SFD.'),
 ('Sheets', 'Parameters: global variables (named cells). Cost_BoQ: one row per cost item. Systems: the SFD system types and whether each contains. Option_Map: which cost items make up each option for each system type, and where the household ends up. Chain_Package: the emptying, transport and treatment items that only work together. Kaliakair_Test: runs the costing on Kaliakair to prove it works.'),
 ('How to replace placeholders', '1) Parameters: set discount rate, cost escalation, base year. 2) Cost_BoQ: for each item enter low and high cost in BDT, year of the BoQ, location, lifespan, source reference. Keep item_id unchanged. 3) Option_Map: check quantities per household. 4) Open Kaliakair_Test: the red banner disappears when no PLACEHOLDER rows remain. 5) Run scripts/build_data.py so the site reads the new values.'),
 ('Adding items', 'Add new items in the next empty row of Cost_BoQ (formulas are pre-filled to row 105). Use a new unique item_id.'),
 ('Placeholder origin', 'Cost ranges for items C01 to C15 are copied from the Kaliakair concept draft (page 4). They carry no source and are NOT BoQ data. Lifespans, frequencies and quantities per household are placeholders and carry no source either.'),
 ('DRAFT rules', 'Option_Map conditions, result systems and the Systems sheet are a first draft for expert review. They are not validated engineering guidance.'),
 ('Units', 'All money in BDT. Annualised cost = one-off cost x capital recovery factor (discount rate, lifespan) + O&M share. Per-service items = cost x uses per year. Cost level (low, mid, high) is chosen once on Parameters; the site always shows all three.'),
 ('Limit', 'Discount rate of exactly 0 breaks the annualisation formula; use a small positive value.'),
 ('Changes from v0.1', 'Option_Map: new columns stage, result_system, requires (so the tool knows what an option changes, and never ranks emptying without treatment). Groundwater rule corrected: under high groundwater risk a soak pit does not contain, so the option is now a sealed, fully lined tank (cost item C24, TO FILL). New sheets Systems and Chain_Package. New parameter hh_basis; Kaliakair_Test takes the households stated in the SFD report.'),
 ('Licence', 'Rules and costs: CC BY 4.0. Rows marked REAL that come from WaterAid BoQs are credited to WaterAid.'),
]
for i, (a, b) in enumerate(rows, 3):
    put(ws, f'A{i}', a, f_bold); put(ws, f'B{i}', b)
    ws.row_dimensions[i].height = 62 if len(b) > 260 else (48 if len(b) > 150 else 32)
ws.column_dimensions['A'].width = 26; ws.column_dimensions['B'].width = 110

# ------------------------------------------------------------------ Parameters
wp = wb.create_sheet('Parameters')
wp['A1'] = 'Parameters (named variables)'; wp['A1'].font = f_title
wp['A2'] = 'Formulas elsewhere use these by name, e.g. disc_rate. Change the value only.'; wp['A2'].font = f_grey
hdr(wp, 4, ['variable', 'description', 'unit', 'value', 'status', 'source / note'], [18, 52, 16, 14, 14, 70])
params = [
 ('disc_rate', 'Discount rate used to annualise one-off costs', 'fraction', 0.08, 'PLACEHOLDER', 'Placeholder. Set per DPHE or WaterAid appraisal guidance.', PCT),
 ('infl_rate', 'Annual cost escalation to bring older BoQ prices to the base year', 'fraction', 0.06, 'PLACEHOLDER', 'Placeholder. Replace with construction cost index trend.', PCT),
 ('price_base_year', 'Year all costs are expressed in', 'year', 2026, 'REAL', 'Chosen base year.', '0'),
 ('cost_case', 'Which cost to use from each low-high range', 'low / mid / high', 'mid', 'REAL', 'Switch to see the plan under low or high costs.', None),
 ('hh_size', 'Average household size, used when a town has no stated household count', 'persons', 5, 'DATA', 'Median of 20,179 households in the 50-town survey (q2.7.1 + q2.7.2). The mean is distorted by entry errors up to 1,647.', '0.0'),
 ('hh_basis', 'Which household count to use', 'stated / hh_size', 'stated', 'REAL', 'stated = households stated in the SFD report where given, otherwise population / hh_size. hh_size = always population / hh_size. Kaliakair: 68,163 stated against 55,485 at hh_size 5.', None),
]
for i, (v, d, u, val, st, note, fmt) in enumerate(params, 5):
    put(wp, f'A{i}', v, f_bold); put(wp, f'B{i}', d); put(wp, f'C{i}', u)
    put(wp, f'D{i}', val, f_in, fill_in, fmt); put(wp, f'E{i}', st); put(wp, f'F{i}', note)
    wb.defined_names[v] = DefinedName(v, attr_text=f'Parameters!$D${i}')
dv = DataValidation(type='list', formula1='"low,mid,high"', allow_blank=False); wp.add_data_validation(dv); dv.add('D8')
dvb = DataValidation(type='list', formula1='"stated,hh_size"', allow_blank=False); wp.add_data_validation(dvb); dvb.add('D10')
dvs = DataValidation(type='list', formula1='"REAL,PLACEHOLDER,TO FILL,EXAMPLE,DATA"'); wp.add_data_validation(dvs); dvs.add('E5:E10')

# ------------------------------------------------------------------ Cost_BoQ
wc = wb.create_sheet('Cost_BoQ')
wc['A1'] = 'Cost_BoQ: one row per cost item (BDT)'; wc['A1'].font = f_title
wc['A2'] = 'Fill yellow cells from WaterAid BoQs. Grey columns R and S calculate. Row 5 is a format example: delete it when you start.'; wc['A2'].font = f_grey
cols = ['item_id', 'category', 'item', 'unit', 'cost_type', 'year_of_cost', 'location (district)', 'cost_low (BDT)', 'cost_high (BDT)',
        'lifespan (years)', 'uses_per_year', 'O&M per year (fraction of one-off cost)', 'cost_bearer', 'source_ref (BoQ no. / project)',
        'status', 'in_your_draft', 'notes', 'cost_selected (BDT, base-year prices)', 'annual_cost_per_unit (BDT)']
hdr(wc, 4, cols, [9, 16, 40, 16, 12, 9, 14, 13, 13, 10, 10, 13, 14, 34, 13, 9, 44, 16, 16])
DRAFT = 'Concept_SFD_in_planning_Kaliakoir.pdf p.4, unsourced range'
items = [
 # id, cat, item, unit, type, low, high, life, uses, om, bearer, status, indraft, note
 ('EX01', 'Containment', 'Twin-pit latrine (EXAMPLE ONLY, delete)', 'per latrine', 'One-off', 14000, 18000, 15, None, 0.02, 'Household', 'EXAMPLE', 'N', 'Shows the format. Year 2024, Satkhira, BoQ number goes in source_ref.'),
 ('C01', 'Treatment', 'DEWATS (decentralised wastewater treatment)', 'per system', 'One-off', 500000, 1500000, 20, None, None, 'Municipality', 'PLACEHOLDER', 'Y', 'Depends on scale and complexity (draft).'),
 ('C02', 'Treatment', 'Small-scale wastewater treatment plant', 'per plant', 'One-off', 2000000, 5000000, 20, None, None, 'Municipality', 'PLACEHOLDER', 'Y', ''),
 ('C03', 'Containment', 'Latrine connection to septic tank', 'per connection', 'One-off', 10000, 25000, 15, None, None, 'Household', 'PLACEHOLDER', 'Y', ''),
 ('C04', 'Containment', 'Connect septic tank to soak pit', 'per connection', 'One-off', 5000, 15000, 15, None, None, 'Household', 'PLACEHOLDER', 'Y', ''),
 ('C05', 'Containment', 'Convert dug hole to VIP latrine', 'per latrine', 'One-off', 8000, 20000, 15, None, None, 'Household', 'PLACEHOLDER', 'Y', ''),
 ('C06', 'Containment', 'Convert single-pit latrine to dual-pit', 'per conversion', 'One-off', 12000, 30000, 15, None, None, 'Household', 'PLACEHOLDER', 'Y', ''),
 ('C07', 'Containment', 'Construct septic tank', 'per tank', 'One-off', 15000, 40000, 20, None, None, 'Household', 'PLACEHOLDER', 'Y', ''),
 ('C08', 'Emptying', 'Manual emptying safety kit', 'per kit', 'One-off', 1000, 3000, 3, None, None, 'Municipality', 'PLACEHOLDER', 'Y', 'Lifespan is a placeholder.'),
 ('C09', 'Emptying', 'Scheduled emptying service', 'per service', 'Per service', 2000, 5000, None, 0.25, None, 'Household', 'PLACEHOLDER', 'Y', 'Varies with volume and distance (draft). 0.25 services a year (every 4 years) is a placeholder.'),
 ('C10', 'Treatment', 'Decentralised constructed wetland in hotspot', 'per site', 'One-off', 300000, 800000, 20, None, None, 'Municipality', 'PLACEHOLDER', 'Y', ''),
 ('C11', 'Treatment', 'Co-treatment of faecal sludge and wastewater', 'per scheme', 'One-off', 1500000, 4000000, 20, None, None, 'Municipality', 'PLACEHOLDER', 'Y', 'Depends on scale (draft).'),
 ('C12', 'Treatment', 'Faecal sludge treatment plant (FSTP)', 'per plant', 'One-off', None, None, None, None, None, 'Municipality', 'TO FILL', 'Y', 'In the draft with no cost. Add capacity (m3/day) in notes.'),
 ('C13', 'O&M', 'Regular inspection', 'per inspection', 'Per service', 5000, 15000, None, 1, None, 'Municipality', 'PLACEHOLDER', 'Y', '1 inspection a year is a placeholder.'),
 ('C14', 'O&M', 'Maintenance fund reserve', 'per reserve', 'One-off', 100000, 500000, 5, None, None, 'Municipality', 'PLACEHOLDER', 'Y', 'Treated as a reserve replenished every 5 years. Confirm.'),
 ('C15', 'O&M', 'Local repair team: training and toolkit', 'per team', 'One-off', 10000, 30000, 3, None, None, 'Municipality', 'PLACEHOLDER', 'Y', ''),
]
# id, cat, item, unit, bearer
blank_items = [
 ('C20', 'Containment', 'Septic tank with soak pit (complete unit)', 'per unit', None), ('C21', 'Containment', 'Soak pit (new)', 'per pit', None),
 ('C22', 'Containment', 'Twin-pit latrine (new)', 'per latrine', None), ('C23', 'Containment', 'Community / shared toilet block', 'per block', None),
 ('C24', 'Containment', 'Fully lined sealed tank, no outlet (raised where flood-prone)', 'per tank', 'Household'),
 ('C30', 'Emptying', 'Vacuum truck (mechanised emptying)', 'per vehicle', 'Municipality'), ('C31', 'Emptying', 'Small vacuum tug', 'per vehicle', 'Municipality'),
 ('C32', 'Emptying', 'Mechanical emptying trip', 'per trip', None), ('C33', 'Emptying', 'Manual emptying with PPE', 'per service', None),
 ('C34', 'Treatment', 'Sludge drying beds', 'per m2', 'Municipality'), ('C35', 'Land', 'Land for treatment site', 'per decimal', 'Municipality'),
 ('S01', 'Solid waste', 'Household bin', 'per bin', None), ('S02', 'Solid waste', 'Community bin / container', 'per unit', None),
 ('S03', 'Solid waste', 'Collection van / rickshaw van', 'per vehicle', None), ('S04', 'Solid waste', 'Compactor truck', 'per vehicle', None),
 ('S05', 'Solid waste', 'Secondary transfer point', 'per point', None), ('S06', 'Solid waste', 'Compost plant', 'per tonne/day', None),
 ('S07', 'Solid waste', 'Recyclables buy-back / sorting point', 'per point', None), ('S08', 'Solid waste', 'Sanitary landfill cell', 'per cell', None),
 ('S09', 'Solid waste', 'Drain cleaning and litter trap', 'per km', None), ('S10', 'Solid waste', 'Awareness campaign', 'per ward per year', None),
 ('S11', 'Solid waste', 'Waste collection crew (annual operation)', 'per crew', None),
]
r = 5
for it in items:
    (iid, cat, nm, unit, typ, lo, hi, life, uses, om, bear, st, ind, note) = it
    vals = [iid, cat, nm, unit, typ, 2024 if iid == 'EX01' else None, 'Satkhira' if iid == 'EX01' else ('Kaliakair (draft)' if st == 'PLACEHOLDER' else None),
            lo, hi, life, uses, om, bear, 'WaterAid BoQ no. (example)' if iid == 'EX01' else (DRAFT if st == 'PLACEHOLDER' else None), st, ind, note]
    for j, v in enumerate(vals, 1):
        c = wc.cell(row=r, column=j, value=v); c.font = f_grey if iid == 'EX01' else f_base; c.border = box; c.alignment = wrap
        if j >= 6 and j not in (15, 16, 17): c.fill = fill_ex if iid == 'EX01' else fill_in
        if j >= 6 and j not in (15, 16, 17) and iid != 'EX01': c.font = f_in
    r += 1
for (iid, cat, nm, unit, bear) in blank_items:
    vals = [iid, cat, nm, unit, 'One-off', None, None, None, None, None, None, None, bear, None, 'TO FILL', 'N',
            'Added in v0.2 for the high-groundwater option (R7).' if iid == 'C24' else '']
    for j, v in enumerate(vals, 1):
        c = wc.cell(row=r, column=j, value=v); c.font = f_base; c.border = box; c.alignment = wrap
        if j >= 6 and j not in (15, 16, 17): c.fill = fill_in; c.font = f_in
    r += 1
last = 105
for rr in range(5, last + 1):
    for j in range(1, 18):
        c = wc.cell(row=rr, column=j)
        c.border = box
        if rr >= r and j >= 6 and j not in (15, 16, 17): c.fill = fill_in; c.font = f_in
        if rr >= r and j in (1, 2, 3, 4, 5, 15, 16, 17): c.font = f_base
    wc[f'R{rr}'] = (f'=IF(OR(H{rr}="",I{rr}=""),"",IF(cost_case="low",H{rr},IF(cost_case="high",I{rr},(H{rr}+I{rr})/2))'
                    f'*IF(F{rr}="",1,(1+infl_rate)^(price_base_year-F{rr})))')
    wc[f'S{rr}'] = (f'=IF(R{rr}="","",IF(E{rr}="One-off",IF(J{rr}="","",R{rr}*(disc_rate*(1+disc_rate)^J{rr}/((1+disc_rate)^J{rr}-1)+IF(L{rr}="",0,L{rr}))),'
                    f'IF(E{rr}="Per service",IF(K{rr}="","",R{rr}*K{rr}),IF(E{rr}="Annual",R{rr},""))))')
    for col in 'RS':
        c = wc[f'{col}{rr}']; c.number_format = BDT; c.font = f_base; c.fill = fill_calc; c.border = box
    for col in 'HI': wc[f'{col}{rr}'].number_format = BDT
    wc[f'L{rr}'].number_format = PCT
wc.freeze_panes = 'D5'
for rng, lst in (('E5:E105', '"One-off,Per service,Annual"'), ('M5:M105', '"Household,Municipality,Shared,Donor"'),
                 ('O5:O105', '"REAL,PLACEHOLDER,TO FILL,EXAMPLE"'), ('P5:P105', '"Y,N"')):
    d = DataValidation(type='list', formula1=lst, allow_blank=True); wc.add_data_validation(d); d.add(rng)
wc.conditional_formatting.add('O5:O105', CellIsRule(operator='equal', formula=['"PLACEHOLDER"'], fill=PatternFill('solid', bgColor='F8CBAD')))
wc.conditional_formatting.add('O5:O105', CellIsRule(operator='equal', formula=['"REAL"'], fill=PatternFill('solid', bgColor='C6E0B4')))
wc.conditional_formatting.add('O5:O105', CellIsRule(operator='equal', formula=['"TO FILL"'], fill=PatternFill('solid', bgColor='FFE699')))

# ------------------------------------------------------------------ Systems
wsys = wb.create_sheet('Systems')
wsys['A1'] = 'Systems: SFD system types and whether each contains'; wsys['A1'].font = f_title
wsys['A2'] = ('DRAFT reading of the SFD method. "Contained" follows the SFD definition; under high groundwater risk, systems with an open bottom or a soak pit '
              'do not contain. sludge_factor = yes where the SFD applies a town-specific share of tank contents that is faecal sludge.'); wsys['A2'].font = f_grey
hdr(wsys, 4, ['system_code', 'system_label (SFD)', 'group', 'contained, low groundwater risk', 'contained, high groundwater risk', 'sludge_factor', 'note'],
    [13, 56, 14, 16, 16, 12, 60])
# code, label, group, low, high, sludge factor, note
SYS = [
 ('T1A1C6', 'Toilet discharges directly to open drain or storm sewer', 'direct', 'N', 'N', 'N', ''),
 ('T1A1C7', 'Toilet discharges directly to water body', 'direct', 'N', 'N', 'N', ''),
 ('T1A1C8', 'Toilet discharges directly to open ground', 'direct', 'N', 'N', 'N', ''),
 ('T1A2C5', 'Septic tank connected to soak pit', 'septic', 'Y', 'N', 'Y', ''),
 ('T1A2C6', 'Septic tank connected to open drain or storm sewer', 'septic', 'N', 'N', 'Y', ''),
 ('T1A2C7', 'Septic tank connected to open water body', 'septic', 'N', 'N', 'Y', ''),
 ('T1A2C8', 'Septic tank connected to open ground', 'septic', 'N', 'N', 'Y', ''),
 ('T1A3C10', 'Fully lined tank (sealed), no outlet or overflow', 'tank', 'Y', 'Y', 'N', 'Not present in the 50 towns. Result system of the high-groundwater option. A sealed tank fills and must be emptied.'),
 ('T1A4C10', 'Lined tank, impermeable walls, open bottom, no outlet', 'tank', 'Y', 'N', 'N', ''),
 ('T1A5C10', 'Lined pit, semi-permeable walls, open bottom, no outlet', 'pit', 'Y', 'N', 'N', ''),
 ('T1A6C10', 'Unlined pit, no outlet or overflow', 'pit', 'Y', 'N', 'N', ''),
]
for i, row in enumerate(SYS, 5):
    for j, v in enumerate(row, 1):
        c = wsys.cell(row=i, column=j, value=v); c.font = f_base; c.border = box; c.alignment = wrap
        if j in (4, 5, 6): c.fill = fill_in; c.font = f_in
dyn = DataValidation(type='list', formula1='"Y,N"'); wsys.add_data_validation(dyn); dyn.add('D5:F30')
sysd = {s[0]: s for s in SYS}

# ------------------------------------------------------------------ Option_Map
wo = wb.create_sheet('Option_Map')
wo['A1'] = 'Option_Map: which cost items make up each option, per SFD system type'; wo['A1'].font = f_title
wo['A2'] = ('DRAFT for expert review. One row per cost item within an option. Quantity = units of the item per household using that system. Leave quantity blank if unknown. '
            'stage: containment / emptying / treatment. result_system: the SFD code the household is on afterwards. requires: gw_low, gw_high, treatment (separate with ;).')
wo['A2'].font = f_grey
hdr(wo, 4, ['option_id', 'system_code', 'system_label (SFD)', 'SFD status', 'option_name', 'stage', 'result_system', 'requires',
            'cost_item_id', 'qty per household', 'qty_status', 'applies_when (DRAFT)', 'review_status',
            'annual cost per unit (BDT)', 'annual cost per household (BDT)', 'upfront cost per household (BDT)'],
    [9, 12, 44, 12, 40, 13, 12, 14, 10, 11, 20, 52, 18, 15, 15, 15])
lines = []   # (option_id, system, name, stage, result, requires, item, qty, qty_status, applies)
n = 0


def opt(system, name, stage, result, requires, items_, applies):
    global n
    n += 1; oid = f'O{n:02d}'
    for (it, q, qs) in items_:
        lines.append((oid, system, name, stage, result, requires, it, q, qs, applies))


A1 = 'qty 1 per household assumed'
Q0 = 'FILL (e.g. 1 / cluster size)'
for s in ('T1A1C6', 'T1A1C7', 'T1A1C8'):
    opt(s, 'New septic tank with soak pit', 'containment', 'T1A2C5', 'gw_low', [('C03', 1, A1), ('C07', 1, A1), ('C04', 1, A1)],
        'Plot space for tank and soak pit; water table below pit base.')
opt('T1A1C8', 'Convert dug hole to VIP latrine', 'containment', 'T1A5C10', 'gw_low', [('C05', 1, A1)], 'Low density; no flooding; water table below pit base.')
for s in ('T1A2C6', 'T1A2C7', 'T1A2C8'):
    opt(s, 'Connect septic tank to soak pit', 'containment', 'T1A2C5', 'gw_low', [('C04', 1, A1)], 'Plot space for soak pit; water table below pit base.')
for s in ('T1A2C6', 'T1A2C7', 'T1A2C8'):
    opt(s, 'Cluster DEWATS for outlets', 'treatment', None, None, [('C01', None, Q0)], 'Dense area; land available for a shared unit.')
opt('T1A2C5', 'Scheduled emptying', 'emptying', None, 'treatment', [('C09', 1, A1)], 'Road access for emptying vehicle or manual emptier.')
for s in ('T1A4C10', 'T1A5C10', 'T1A6C10'):
    opt(s, 'Scheduled emptying', 'emptying', None, 'treatment', [('C09', 1, A1)], 'Road access for emptying vehicle or manual emptier.')
for s in ('T1A4C10', 'T1A5C10', 'T1A6C10'):
    opt(s, 'Manual emptying safety kits', 'emptying', None, 'treatment', [('C08', None, Q0)], 'Narrow lanes where vehicles cannot reach.')
for s in ('T1A4C10', 'T1A5C10', 'T1A6C10'):
    opt(s, 'Replace with sealed, fully lined tank', 'containment', 'T1A3C10', 'gw_high', [('C24', 1, A1)],
        'High groundwater or flood risk (the SFD assumes low). Raised where flood-prone. A sealed tank must be emptied, so it is safe only with treatment.')
opt_ids = []
r = 5
for (oid, s, nm, stg, res, req, it, q, qs, ap) in lines:
    if oid not in opt_ids: opt_ids.append(oid)
    vals = [oid, s, sysd[s][1], 'Contained' if sysd[s][3] == 'Y' else 'Not contained', nm, stg, res, req, it, q, qs, ap, 'DRAFT - expert review']
    for j, v in enumerate(vals, 1):
        c = wo.cell(row=r, column=j, value=v); c.font = f_base; c.border = box; c.alignment = wrap
    for j in (6, 7, 8, 10, 11, 12, 13): wo.cell(row=r, column=j).fill = fill_in; wo.cell(row=r, column=j).font = f_in
    r += 1
omax = r - 1
OMLAST = 80
for rr in range(5, OMLAST + 1):
    m = f'MATCH(I{rr},Cost_BoQ!$A$5:$A$105,0)'
    wo[f'N{rr}'] = f'=IF(I{rr}="","",IFERROR(INDEX(Cost_BoQ!$S$5:$S$105,{m}),""))'
    wo[f'O{rr}'] = f'=IF(OR(N{rr}="",J{rr}=""),"",J{rr}*N{rr})'
    wo[f'P{rr}'] = (f'=IF(I{rr}="","",IFERROR(IF(INDEX(Cost_BoQ!$E$5:$E$105,{m})="One-off",IF(OR(J{rr}="",INDEX(Cost_BoQ!$R$5:$R$105,{m})=""),"",'
                    f'J{rr}*INDEX(Cost_BoQ!$R$5:$R$105,{m})),""),""))')
    for col in 'NOP':
        c = wo[f'{col}{rr}']; c.number_format = BDT; c.font = f_base; c.fill = fill_calc; c.border = box
wo.freeze_panes = 'F5'
dst = DataValidation(type='list', formula1='"containment,emptying,treatment"', allow_blank=True); wo.add_data_validation(dst); dst.add('F5:F80')
wo.conditional_formatting.add('K5:K80', FormulaRule(formula=['LEFT(K5,4)="FILL"'], fill=PatternFill('solid', bgColor='FFE699')))

# ------------------------------------------------------------------ Chain_Package
wch = wb.create_sheet('Chain_Package')
wch['A1'] = 'Chain_Package: emptying, transport and treatment only work together'; wch['A1'].font = f_title
wch['A2'] = ('Emptying without treatment moves sludge from the pit to the environment, so the tool never ranks emptying alone. The package is costed only when every '
             'required item has a cost and a sizing rule. basis: per_household (quantity per household served) or town (units for the whole town).'); wch['A2'].font = f_grey
hdr(wch, 4, ['component', 'stage', 'cost_item_id', 'basis', 'qty', 'required', 'sizing note (DRAFT)'], [34, 13, 12, 16, 10, 10, 70])
CHAIN = [
 ('Scheduled emptying service', 'emptying', 'C09', 'per_household', 1, 'Y', 'Services per year come from Cost_BoQ (uses_per_year).'),
 ('Emptying vehicle', 'transport', 'C30', 'town', None, 'Y', 'Number of vehicles from households served, trips per day and haul distance. Sizing rule to be agreed.'),
 ('Small vacuum tug for narrow lanes', 'transport', 'C31', 'town', None, 'N', ''),
 ('Faecal sludge treatment plant', 'treatment', 'C12', 'town', None, 'Y', 'Capacity (m3/day) from sludge volume emptied per year. Sizing rule to be agreed.'),
 ('Sludge drying beds', 'treatment', 'C34', 'town', None, 'N', 'Area from sludge loading rate.'),
 ('Land for treatment site', 'treatment', 'C35', 'town', None, 'Y', ''),
 ('Co-treatment of faecal sludge and wastewater', 'treatment', 'C11', 'town', None, 'N', 'Alternative to a stand-alone plant.'),
]
for i, row in enumerate(CHAIN, 5):
    for j, v in enumerate(row, 1):
        c = wch.cell(row=i, column=j, value=v); c.font = f_base; c.border = box; c.alignment = wrap
        if j in (4, 5, 6, 7): c.fill = fill_in; c.font = f_in

# ------------------------------------------------------------------ Kaliakair_Test
KAL = [('T1A1C6', 0.0963), ('T1A1C7', 0.0296), ('T1A1C8', 0.0123), ('T1A2C5', 0.0593), ('T1A2C6', 0.4148), ('T1A2C7', 0.0716),
       ('T1A2C8', 0.1111), ('T1A4C10', 0.0123), ('T1A5C10', 0.1630), ('T1A6C10', 0.0296)]
wk = wb.create_sheet('Kaliakair_Test')
wk['A1'] = 'Kaliakair_Test: costing check on one real town'; wk['A1'].font = f_title
wk['A2'] = ('=IF(COUNTIF(Cost_BoQ!$O$5:$O$105,"PLACEHOLDER")>0,"PLACEHOLDER COSTS IN USE: outputs only test the engine and must not be quoted",'
            '"No PLACEHOLDER cost rows remain")')
wk['A2'].font = f_red
put(wk, 'A4', 'Town', f_bold); put(wk, 'B4', 'Kaliakair Municipality, Gazipur', f_base)
put(wk, 'A5', 'Population (SFD)', f_bold); put(wk, 'B5', 277423, f_in, fill_in, '#,##0'); put(wk, 'C5', 'DATA: SFD population, 50-town master (towns.population_sfd)')
put(wk, 'A6', 'Households at hh_size', f_bold); put(wk, 'B6', '=B5/hh_size', f_base, fill_calc, '#,##0'); put(wk, 'C6', 'population / hh_size')
put(wk, 'A7', 'Households stated', f_bold); put(wk, 'B7', 68163, f_in, fill_in, '#,##0'); put(wk, 'C7', 'DATA: Kaliakair SFD Lite report, Table 1. Leave blank if the report gives none.')
put(wk, 'A8', 'Households used', f_bold); put(wk, 'B8', '=IF(AND(hh_basis="stated",B7<>""),B7,B6)', f_bold, fill_calc, '#,##0'); put(wk, 'C8', 'Set by the hh_basis parameter')
wk.column_dimensions['A'].width = 20; wk.column_dimensions['B'].width = 44
for col, w in zip('CDEFGHIJ', (50, 14, 16, 16, 16, 16, 12, 28)): wk.column_dimensions[col].width = w
hdr(wk, 10, ['system_code', 'system_label (SFD)', 'SFD status', 'share of population', 'households'])
for i, (code, share) in enumerate(KAL, 11):
    put(wk, f'A{i}', code, f_base); put(wk, f'B{i}', sysd[code][1]); put(wk, f'C{i}', 'Contained' if sysd[code][3] == 'Y' else 'Not contained')
    put(wk, f'D{i}', share, f_in, fill_in, PCT)
    put(wk, f'E{i}', f'=D{i}*$B$8', f_base, fill_calc, '#,##0')
put(wk, 'A21', 'Total', f_bold); put(wk, 'D21', '=SUM(D11:D20)', f_bold, fill_calc, PCT); put(wk, 'E21', '=SUM(E11:E20)', f_bold, fill_calc, '#,##0')
put(wk, 'A22', 'Not contained', f_bold); put(wk, 'D22', '=SUMIF(C11:C20,"Not contained",D11:D20)', f_bold, fill_calc, PCT)
put(wk, 'E22', '=SUMIF(C11:C20,"Not contained",E11:E20)', f_bold, fill_calc, '#,##0')
put(wk, 'B21', 'DATA: pop_share of the 10 active systems, Kaliakair SFD (50-town master)', f_grey, border=False)
hdr(wk, 24, ['option_id', 'option_name', 'system_code', 'households on system', 'upfront per household (BDT)', 'annual per household (BDT)',
             'total upfront (BDT million)', 'total annual (BDT million)', 'incomplete lines', 'status'])
for i, oid in enumerate(opt_ids, 25):
    put(wk, f'A{i}', oid, f_base)
    put(wk, f'B{i}', f'=INDEX(Option_Map!$E$5:$E$80,MATCH(A{i},Option_Map!$A$5:$A$80,0))')
    put(wk, f'C{i}', f'=INDEX(Option_Map!$B$5:$B$80,MATCH(A{i},Option_Map!$A$5:$A$80,0))')
    put(wk, f'D{i}', f'=INDEX($E$11:$E$20,MATCH(C{i},$A$11:$A$20,0))', f_base, fill_calc, '#,##0')
    put(wk, f'E{i}', f'=SUMIFS(Option_Map!$P$5:$P$80,Option_Map!$A$5:$A$80,A{i})', f_base, fill_calc, BDT)
    put(wk, f'F{i}', f'=SUMIFS(Option_Map!$O$5:$O$80,Option_Map!$A$5:$A$80,A{i})', f_base, fill_calc, BDT)
    put(wk, f'G{i}', f'=D{i}*E{i}/1000000', f_base, fill_calc, BDTM)
    put(wk, f'H{i}', f'=D{i}*F{i}/1000000', f_base, fill_calc, BDTM)
    put(wk, f'I{i}', f'=SUMPRODUCT((Option_Map!$A$5:$A$80=A{i})*(Option_Map!$O$5:$O$80=""))', f_base, fill_calc, '0')
    put(wk, f'J{i}', f'=IF(I{i}>0,"INCOMPLETE: missing cost or qty","complete")', f_base, fill_calc)
endo = 24 + len(opt_ids)
t0 = endo + 3
put(wk, f'A{t0-1}', 'Town-level items (not per household). Enter units needed; leave blank if unknown.', f_bold, border=False)
hdr(wk, t0, ['item_id', 'item', '', 'units needed', 'upfront (BDT million)', 'annual (BDT million)'])
for k, iid in enumerate(('C10', 'C11', 'C12'), t0 + 1):
    m = f'MATCH(A{k},Cost_BoQ!$A$5:$A$105,0)'
    put(wk, f'A{k}', iid, f_base)
    put(wk, f'B{k}', f'=INDEX(Cost_BoQ!$C$5:$C$105,{m})')
    put(wk, f'D{k}', None, f_in, fill_in, '0')
    put(wk, f'E{k}', f'=IF(OR(D{k}="",INDEX(Cost_BoQ!$R$5:$R$105,{m})=""),"",D{k}*INDEX(Cost_BoQ!$R$5:$R$105,{m})/1000000)', f_base, fill_calc, BDTM)
    put(wk, f'F{k}', f'=IF(OR(D{k}="",INDEX(Cost_BoQ!$S$5:$S$105,{m})=""),"",D{k}*INDEX(Cost_BoQ!$S$5:$S$105,{m})/1000000)', f_base, fill_calc, BDTM)
wk.freeze_panes = 'A11'
wk.conditional_formatting.add(f'J25:J{endo}', FormulaRule(formula=['LEFT(J25,4)="INCO"'], fill=PatternFill('solid', bgColor='FFE699')))

OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print('saved', OUT, '| options', len(opt_ids), '| option lines', len(lines), '| last option row', omax)
