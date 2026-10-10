# ADR-0005 — ExcelJS for spreadsheets

**Status:** Accepted and implemented through the opt-in catalog.

`templates/packages/spreadsheet` (`@loom/spreadsheet`) wraps ExcelJS for XLSX and papaparse for
CSV behind one dependency boundary, and the `import-export` catalog feature uses it for admin
import/export screens. Both stay opt-in: the default install carries no spreadsheet dependency.
Registry-distributed SheetJS xlsx was rejected on maintenance/security grounds during the original
evaluation. Recheck the pinned versions before changing them; historical assessments are not
current vulnerability evidence.
