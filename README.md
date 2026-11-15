# sanitation-waste-planner

A rule-based planning tool for Bangladeshi municipalities (paurashavas). It reads a town's excreta flow diagram (SFD) and waste flow diagram (WFD), shows where excreta and plastic end up and which loss is largest, and turns that into an ordered plan in plain terms. Every figure traces to a rule and a cost row you can open and change. It runs in the browser; nothing you enter or upload leaves your device.

**Status: draft v0.2. Costs are placeholders that test the calculation. Do not quote any taka figure from this tool.** Draft for review; not an official publication of DPHE, WaterAid or GIZ.

## What v0.2 does

- **Overview.** One statement and one picture each for excreta and solid waste, and the first three things to do.
- **Sanitation.** Where the excreta goes (flows from toilet and tank types to outcomes), the largest loss and what it means, who is on which system, containment options ordered by yearly cost per person newly contained, and emptying, transport and treatment as one package. Emptying is never ranked alone.
- **Solid waste.** Waste produced and collected, where plastic escapes by stage, and where it ends up. Options are listed by stage and not costed.
- **Plan.** An ordered list of decisions for sanitation and solid waste. A "what if" for each: move households to the cheapest fix, treat a share of emptied sludge, raise collection, control the dumpsite, or set a target for safely managed excreta and see what it takes.
- **Costs.** Every unit cost can be changed in the page. Changed figures are marked as the user's own, on screen and in the saved run file.
- **Compare.** The town among the 50 surveyed towns, on sanitation and solid waste.
- **Your town.** Type a town in, or read a published report in the browser: an SFD Lite report (DPHE CWIS-FSM Support Cell format) or a WFD Data Portal page saved as PDF. The tool fills a form, shows what it could not find, and waits for you to confirm.
- **Sources.** National context figures with source, year and scope; what the draft cannot tell you; how the tool works.
- **Download PDF.** A one-page sheet for the town. It carries no taka totals while costs are placeholders.
- Works offline after one visit.
- Holds 50 municipalities (SFD Lite, level 0.5, status Draft, 2023, and their WFDs) as built-in examples, with a groundwater switch: all 50 SFDs assume low groundwater risk.

## What v0.2 cannot do

- Cost treatment. The treatment plant, emptying vehicles and land have no cost data or sizing rule yet, and in 49 of the 50 towns sludge that is emptied and not treated is the largest loss.
- Cost anything in solid waste, or estimate municipal cost. Every costed option so far is paid by households.
- Give real costs. Every cost row is a placeholder with no source.
- Read the SFD matrix or graphic in a report: they are images. Shares come from the report's prose, which can leave systems out; the tool shows the shortfall and asks.
- Re-run a WFD. The solid-waste "what if" scales the published result.
- Turn a town's flows into deaths, illness or economic return. National and global figures are shown as context and labelled as such.
- Check conditions such as plot space, road access or flooding for individual households.

## How it is built

Plain HTML, CSS and JavaScript modules. No build step, no backend, no analytics, no cookies, no requests to other sites (enforced by a Content-Security-Policy).

```
index.html, css/        the page
js/engine/              the calculation: pure functions, no page access (cost.js, sfd.js, plan.js)
js/ui/                  rendering and page wiring
data/                   rules.json, costs.json, params.json   generated from the workbook
                        towns.json, sfd.json, wfd.json        town-level aggregates
                        strings.en.json                       all page text
data/source/            the cost and rule workbook (edit this, not the JSON)
scripts/                build_data.py, reference_engine.py, check_repo.py, check_workbook.py, run_all_towns.mjs
tests/                  node --test
vendor/fonts/           Hind Siliguri (SIL Open Font License)
```

### Changing costs or rules

1. Edit `data/source/P7_Cost_and_Rules_Template_v0.2.xlsx` (yellow cells). Set a row's status to `REAL` once it has a source.
2. Run `python scripts/build_data.py`.
3. Run the checks below and commit both the workbook and the JSON.

### Checks

```
python scripts/check_repo.py          # nothing forbidden is in the repository
python scripts/build_data.py --check  # JSON matches the workbook
python scripts/check_workbook.py      # the workbook's own test sheet matches the engine
node --test tests/*.test.mjs          # engine, independent Python reference, parsers, every tab of the page, offline list
```

The JavaScript engine is compared with an independent Python implementation on all 50 towns, both groundwater settings, both household bases and the three cost cases. The what-if, decision and solid-waste modules are new in v0.2 and are tested in JavaScript only; they are not yet in the Python reference.

To test the report parsers against the PDFs themselves, set `SFD_PDF` and `WFD_PDF` to their paths. The WFD portal report is copyright GIZ and is never committed; `tests/fixtures/` holds text fixtures only.

### Running it locally

```
python -m http.server 8000
```

then open `http://localhost:8000`. Opening `index.html` straight from disk does not work, because browsers block module and data loading from `file://`.

## Method in brief

- **Contained** follows the SFD definition. In the 50 SFDs "safely managed" means contained and not emptied, because no town has a working treatment step.
- **Outcome of a contained system**, as a share of population: `safe = pop × (1 − f × e) + pop × f × e × delivered × treated`, where `e` is the share emptied and `f` the SFD's sludge factor for septic tanks (1 elsewhere). This reproduces every contained system in the 50 SFDs.
- **An option** moves the households of one system to a result system. People newly contained = people on the system, if it did not contain and the result system does. "Safely managed" after the option assumes they empty as today's users of the result system in that town do.
- **Annual cost** = one-off cost × capital recovery factor (discount rate, lifespan) + O&M share; per-service items = cost × uses per year.
- **Households** = the number stated in the SFD report where the tool has it, otherwise population ÷ household size.

Option rules are a first draft awaiting expert review.

## Data

- Town data: 50-municipality SFD and WFD study, Bangladesh, 2023. SFDs prepared by the CWIS-FSM Support Cell, DPHE. Only town-level aggregates are published here.
- This repository never holds household records, coordinates, personal identifiers or WFD Data Portal reports (copyright GIZ). `scripts/check_repo.py` enforces that on every push.

## Licence and credit

- Code: MIT (`LICENSE`).
- Rules, costs and data files: CC BY 4.0 (`LICENSE-data`). Cost rows with status `REAL` that come from WaterAid Bangladesh bills of quantities are credited to WaterAid Bangladesh; v0.1 has none.
- Third-party material: `NOTICE`.
- How to cite: `CITATION.cff`. Please do not cite figures from a draft.
