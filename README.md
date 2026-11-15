# Sanitation and waste planner (draft v0.3)

Drop a town's **SFD** (excreta flow diagram) report, its **WFD** (waste flow diagram) portal page, or both. The page reads them
in the browser, shows where excreta and escaped plastic end up together, and sizes what to build.

Live: https://zarifoeishik22.github.io/sanitation-waste-planner/

Draft tool. The decision rules await expert review. Unit rates are entered by the user. Use it to frame a proposal, not to fix a budget.

## What it does

| Step | What happens |
|---|---|
| Upload | PDF text is read in the browser with a vendored copy of pdf.js. Nothing is uploaded. SFD alone, WFD alone or both. |
| Check | Shows what was read in plain words and asks only for what the report leaves out. Nothing is filled in silently. |
| Verdict | The town's main failure in one line for each system, up to three flags, and three actions in order. |
| The drain | One schematic of open drains, water and open ground, which receive both excreta and plastic. Controls switch interventions on and the picture, the loads and the safely managed share update. |
| Sizing bridge | For each intervention the town's flows call for: deficit, sizing rule, units, your unit rates, investment. |
| Evidence | Where the figures come from, every flag, the town among 50 Bangladeshi municipalities, and what the tool cannot tell you. |

## What runs where

| In the browser | Bundled, dated snapshot | Not possible on a static site |
|---|---|---|
| PDF text reading, all calculations, the drain picture, PDF output through the browser's print | A partial copy of SuSanA's SFD portal list (`data/pubindex.json`), sizing rules with sources (`data/sizing.json`), national context figures (`data/benchmarks.json`), 50 Bangladeshi municipalities with both an SFD and a WFD | A live check against SuSanA or the GIZ WFD portal, reading scanned PDFs, reading the SFD matrix where it is an image |

## Honest limits

- **"Listed on SuSanA" is a name match** against a copy of the SFD portal list taken on the date in `data/pubindex.json`. It does not prove a file is the published one. The copy covers names from A to "Cuttack" and from "Kalaroa" to "Natore"; other names are reported as "not checked".
- **No WFD index is bundled.** A WFD is labelled by where its figures came from: a GIZ portal page, the project dataset, or typed in.
- **The built-in WFD figures come from the project's 50-municipality dataset, not the GIZ portal.** For Kaliakair the two differ (812 against 1,158 tonnes of escaped plastic a year); the page shows both.
- **Money is never added up from draft figures.** The cost list in `data/costs.json` is a draft and appears only as a hint in each rate box. Totals use rates the user enters, or cost items marked as reviewed.
- **Sizing rules marked "assumption" have no source behind them.** Rules marked "cited" name their source. All can be changed in the page.
- **No health or flood estimate is made for a town.** No town-level model supports one.
- **The report readers are tested on one SFD Lite report and one WFD portal page.** Other layouts may fall back to typing.
- **Plastic after a change is scaled, not modelled.** The WFD tool is not re-run.
- **JMP and GLAAS:** one national JMP figure (Bangladesh) is bundled as context. Urban figures by country and GLAAS figures could not be retrieved and are not used.

## Run it locally

```
python3 -m http.server 8000     # then open http://localhost:8000
node --test tests/*.test.mjs    # engine, reference and page tests
```

No build step, no backend, no tracking. The page allows no other origin (Content-Security-Policy `default-src 'self'`) and stores nothing in the browser.

## Layout

| Path | Contents |
|---|---|
| `js/engine/` | Pure functions: SFD outcome and plan, what-if, WFD view, drain loads, sizing bridge, flags, verdict, listing check |
| `js/parsers/` | SFD Lite report and WFD portal page readers |
| `js/ui/` | Views as HTML strings, the drain picture, page wiring |
| `data/` | Generated data files and reference snapshots; `data/source/` holds the cost and rules workbook |
| `scripts/` | Data build, repository guard, Python reference engine |
| `tests/` | Node tests, including a Python cross-check of the plan engine |

## Licence

Code: MIT. Data: see `LICENSE-data` and `NOTICE`.
