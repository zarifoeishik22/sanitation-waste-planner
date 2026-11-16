# Sanitation and waste planner (draft v0.4)

A planning workspace built on the reports a town already has: its **SFD** (excreta flow diagram) and its **WFD** (waste flow diagram).
Drop the reports or a filled planner workbook. The page reads them in the browser, shows where excreta and plastic leak, turns that into
insights and actions, lets you test them in up to three scenarios, and sizes, costs and phases what to build.

Live: https://zarifoeishik22.github.io/sanitation-waste-planner/

Draft tool. The decision rules await expert review. Unit rates are entered by the user. Use it to frame a proposal, not to fix a budget.

## The workspace

| Group | Screen | What it answers |
|---|---|---|
| Town | Import | Load reports (PDF), a planner workbook (.xlsx), or one of the 50 surveyed towns |
| Town | Data and sources | What the figures rest on, how complete each data tier is, the workbook out and in |
| Diagnose | Overview | Headline figures, the main failure, three actions, flags, both service chains |
| Diagnose | Sanitation | Excreta flow diagram (Sankey), service chain, containment systems, how the service is run |
| Diagnose | Solid waste | Plastic flow diagram (Sankey), service chain, waste figures, how the service is run |
| Diagnose | Drains | The one place both reports describe: drains, water and open ground receive excreta and plastic together |
| Diagnose | Compare towns | The town among the 50: scatter and ranking |
| Plan | Insights and actions | Biggest leak, shared hotspot, peer gap, contradictions, missing data; each opens the scenario that tests it |
| Plan | Scenarios | Up to three named scenarios; where excreta and plastic end up; what each action contributes; side by side |
| Plan | Investment and phasing | Deficit, sizing rule, units (net of what exists), unit rates, totals, years, spend against budget |
| Deliver | Plan report | Summary, baseline, priorities, scenarios, interventions with cost and phasing, targets, data and limits |

## The planner workbook

One Excel file in three tiers. Tier 1 (Town, SFD systems, WFD) is what the published reports give and is required. Tier 2 (Operations, Wards)
is what the municipality runs today. Tier 3 (Costs, Sizing rules, Governance) is money, local design figures and how services are run.
Blank cells keep the planner's defaults, marked "assumed". The workbook is written and read in the browser with no third-party library.

## What runs where

| In the browser | Bundled, dated snapshot | Not possible on a static site |
|---|---|---|
| PDF and workbook reading, all calculations, charts, the plan report through the browser's print | A partial copy of SuSanA's SFD portal list, sizing rules with sources, national context figures, 50 Bangladeshi municipalities with both an SFD and a WFD | A live check against SuSanA or the GIZ WFD portal, reading scanned PDFs, reading the SFD matrix where it is an image |

## Honest limits

- **"Listed on SuSanA" is a name match** against a copy of the SFD portal list. The copy covers names from A to "Cuttack" and from "Kalaroa" to "Natore"; other names are reported as "not checked".
- **The built-in WFD figures come from the project's 50-municipality dataset, not the GIZ portal.** For Kaliakair the two differ (812 against 1,158 tonnes of escaped plastic a year).
- **Money is never added up from draft figures.** Totals use rates the user enters, or cost items marked as reviewed.
- **Sizing rules marked "assumption" have no source behind them.** All can be changed in the page or the workbook.
- **Outcomes are the planner's reading of the published SFD and WFD, not a re-run of either tool.** Plastic after a change is scaled.
- **The governance sheet is a self-assessment** under CSDA and Wasteaware headings, not either method in full.
- **No map:** the dataset has no coordinates for the towns.
- **The report readers are tested on one SFD Lite report and one WFD portal page.** Other layouts may fall back to typing or the workbook.

## Run it locally

```
python3 -m http.server 8000     # then open http://localhost:8000
node --test tests/*.test.mjs    # engine, reference, page and workbook tests
```

No build step, no backend, no tracking. The page allows no other origin (Content-Security-Policy `default-src 'self'`) and stores nothing in the browser.

## Layout

| Path | Contents |
|---|---|
| `js/engine/` | Pure functions: SFD outcome and plan, what-if, WFD view, drain loads, sizing bridge, planning analysis and insights, workbook template, flags, verdict, listing check |
| `js/xlsx/` | Minimal ZIP and .xlsx reader and writer |
| `js/parsers/` | SFD Lite report and WFD portal page readers |
| `js/ui/` | Workspace shell and screens, charts, views as HTML strings, the drain picture, page wiring |
| `data/` | Generated data files and reference snapshots |
| `scripts/` | Data build, repository guard, Python reference engine |
| `tests/` | Node tests, including a Python cross-check of the plan engine |

## Licence

Code: MIT. Data: see `LICENSE-data` and `NOTICE`.
