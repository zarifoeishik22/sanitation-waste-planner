# Test fixtures

Text of two published reports as pdf.js reads them, one page per form-feed, used to test the report parsers.

- `sfd/kaliakair-sfd-lite.pages.txt`: SFD Lite Report, Kaliakair Municipality, Bangladesh. Produced by the CWIS-FSM Support Cell, DPHE, 6 March 2023; published on the SFD portal (sfd.susana.org). Cover and sections 3 to 5 only. The pages naming authors, informants and acknowledgements are left out.
- `wfd/kaliakair-portal.pages.txt`: labels and figures from the WFD Data Portal case-study page for Kaliakair (study 119, wfd-data.rwm.global), saved as PDF on 15 November 2026. The portal report is © GIZ, all rights reserved, so the PDF and its narrative text are not in this repository.

To test against the PDFs themselves, set `SFD_PDF` and `WFD_PDF` to their paths and run `node --test tests/parsers.test.mjs`.
