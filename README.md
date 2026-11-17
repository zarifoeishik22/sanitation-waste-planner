# Sanitation and waste planner (draft v0.5)

A town planning wizard. It turns the two reports a municipality already has, its **SFD** (excreta flow diagram) and its **WFD** (waste flow diagram),
into a costed, phased sanitation and waste plan: three packages, a payer for every line, money by year, and a council-ready document.

Live: https://zarifoeishik22.github.io/sanitation-waste-planner/

Draft tool. The decision rules await expert review. Prices are the project engineer's unit costs for Bangladesh. Use it to frame a plan, not to fix a budget.

## The six steps

| Step | What happens |
|---|---|
| 1. Town | A map of Bangladesh on live OpenStreetMap. Each mark is a town: blue dot = SFD published, orange ring = WFD published. Pick one, or add your own town's reports |
| 2. Reports | What was read from the SFD and the WFD. Swap in another PDF. Choose between two published figures where they differ |
| 3. Your town | Ten questions the reports cannot answer: first year, length, yearly budget; tankers, vans and treatment already in service; where waste goes; land; who pays for household works; flooding. Beside them, the town on the map, with streets and buildings, to mark the treatment plant and disposal site |
| 4. What we found | Up to three things that already work, and the gaps that hold most of the gain. Each gap leads to one package |
| 5. Build the plan | Three stand-alone packages (collect the waste; treat the sludge that is already emptied; safe toilets at home). Whose money each line is, the municipality's share against its budget, and the years |
| 6. Plan document | The draft plan on screen, as a Word file, as a PDF through the browser's print, and the Excel workbook that holds every answer |

## Cost by payer, not one total

A single figure for a town mixes three different purses and reads as unaffordable. The planner never adds them together:

- **Municipality's own budget:** collection vans, and the running cost of what gets built.
- **Partners:** shared works (land, treatment plant, tankers), presented as one project case.
- **Households:** their own bin and their own toilet or tank work, shown as a price per household.

The town's answers move lines between these: land the municipality already holds drops out; household works can be set to the municipality.

## The planner workbook

One Excel file holds the report figures (sheets Town, SFD systems, WFD), what the town runs (Operations, Wards), prices and design figures
(Costs, Sizing rules, Governance) and the wizard's choices (Plan choices). Download it at any step; open it later to continue.
Nothing is stored on a server and there is no login.

## What leaves the browser

- Map tiles are loaded from `tile.openstreetmap.org`, and the town's outline is looked up once from OpenStreetMap's place search (`nominatim.openstreetmap.org`) with the town's name.
- Nothing else. PDFs and workbooks are read in the browser. Answers are kept in the browser tab until it is closed.

## Honest limits

- **Marks on the national map sit at the centre of each town's sub-district**, not on the town itself (eight are at the town). Step 3 looks the town up on OpenStreetMap and falls back to that centre.
- **The treatment plant price rests on an assumed design capacity** (25 m³ a day) for the plant the engineer priced. The plan document lists this under "Confirm before council".
- **Household works are priced, the municipality's programme around them is not** (by-law, trained masons, loan or subsidy scheme).
- **Composting and a controlled disposal site are not in the packages:** the unit cost sheet has no usable price for either.
- **High groundwater is all or nothing.** "Most of the town" switches the whole town to shared treatment sized by flow; "some wards" is only noted.
- **"Listed on SuSanA" is a name match** against a partial copy of the SFD portal list; other names are reported as "not checked".
- **The built-in WFD figures come from the project's 50-municipality dataset, not the GIZ portal.** For Kaliakair the two differ (812 against 1,158 tonnes of plastic escaping a year); step 2 asks which to use.
- **Outcomes are the planner's reading of the published SFD and WFD, not a re-run of either tool.**
- **The report readers are tested on one SFD Lite report and one WFD portal page.** Other layouts may need the workbook.

## Run it locally

```
npm install
npm run dev        # the app, with live reload
npm test           # engines, Python cross-check, wizard model, workbook and Word file
npm run build      # writes index.html and assets/ at the repository root
```

GitHub Pages serves this repository from the root of `main`, so the built `index.html` and `assets/` are committed. Run `npm run build` before committing a change to `app/`, `js/` or `data/`; CI fails if the committed build is stale.

## Layout

| Path | Contents |
|---|---|
| `app/` | The interface: React, MapLibre GL (OpenStreetMap tiles), Recharts. Source of the build |
| `js/engine/` | Pure functions: SFD outcome and plan, what-if, WFD view, drain loads, sizing bridge, planning analysis, workbook template, flags, listing check |
| `js/model/` | The wizard's model: plan state, packages by payer and year, findings in words, the plan document, the Word writer |
| `js/xlsx/` | Minimal ZIP and .xlsx reader and writer |
| `js/parsers/` | SFD Lite report and WFD portal page readers |
| `data/` | Generated data files, the engineer's unit costs, approximate town positions, reference snapshots |
| `scripts/` | Data build, repository guard, Python reference engine |
| `tests/` | Node tests, including a Python cross-check of the plan engine |
| `index.html`, `assets/` | The built app (generated; do not edit) |

## Licence

Code: MIT. Data: see `LICENSE-data` and `NOTICE`. Map data © OpenStreetMap contributors (ODbL).
