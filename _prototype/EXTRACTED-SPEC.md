# mReport — Extracted Specification

> **Source of truth for the v2 rebuild.** Every rule, regex, threshold, and design decision baked into the prototype, captured in one document. The Next.js rebuild references this spec; deviations from it should be intentional and documented.

> **Source file:** `_prototype/index.html` (3494 lines, frozen 2026-05-14)

---

## Table of contents

1. [Configuration constants](#1-configuration-constants)
2. [Parser layer](#2-parser-layer)
3. [Validation layer](#3-validation-layer)
4. [Sanity checks](#4-sanity-checks)
5. [Format helpers](#5-format-helpers)
6. [Rendering layer](#6-rendering-layer)
7. [Workflow & state](#7-workflow--state)
8. [Excel export](#8-excel-export)
9. [JSON export](#9-json-export)
10. [Design tokens](#10-design-tokens)
11. [Edge cases & bugs fixed](#11-edge-cases--bugs-fixed)
12. [Known limitations](#12-known-limitations)

---

## 1. Configuration constants

### 1.1 `CORRECT_TEMPLATE_URL`

```js
const CORRECT_TEMPLATE_URL = "https://example.com/CORRECT-TEMPLATE-LINK-PLACEHOLDER";
```

Placeholder URL used in the outdated-template banner. **In v2, this becomes a config/env value.**

### 1.2 `CANONICAL_RULES`

```js
const CANONICAL_RULES = {
  regional:    { offering: 0.05, tithe: 0.20 },
  parishOps:   { tithe: 0.55, offering: 0.95, thanksgiving: 0.30 },
  pastorAllow: { tithe: 0.20, thanksgiving: 0.70 },
  provincial:  { tithe: 0.05 },
};
```

The four remittance rules. Income coverage:
- **Offering**: 5% Regional + 95% Parish Ops = 100% ✓
- **Tithe**: 20% Regional + 55% Parish Ops + 20% Pastor + 5% Provincial = 100% ✓
- **Thanksgiving**: 30% Parish Ops + 70% Pastor = 100% ✓
- **Others**: no allocation rule defined (informational only)

### 1.3 `FIELD_SEVERITY`

```js
const FIELD_SEVERITY = {
  "Allocation Reconciliation": "fail",
  "Regional Remittance":       "fail",
  "Parish Operations":         "fail",
  "Pastor Allowance":          "fail",
  "Provincial Remittance":     "fail",
  "Weekly Totals":             "fail",
  "Per-Date Money":            "fail",
  "Parish Records":            "fail",   // overridden per-label below for averages
  "Per-Date Attendance":       "warn",
  "Statistics":                "warn",
  "_default":                  "fail",
};
```

Per-section severity floor. Falls back to `_default` if a section name isn't listed.

### 1.4 `LABEL_SEVERITY` (per-label overrides)

```js
const LABEL_SEVERITY = [
  { pattern: /average/i, severity: "warn" },
];
```

Array of `{pattern, severity}`. First-match-wins. Used so that *any* check whose label contains "average" tolerates rounding noise instead of failing red.

### 1.5 `STAT_FIELDS` (12 statistics columns)

```js
const STAT_FIELDS = [
  { key: "births",           label: "Births" },
  { key: "marriages",        label: "Marriages" },
  { key: "deaths",           label: "Deaths" },
  { key: "converts",         label: "Converts" },
  { key: "baptisms",         label: "Baptisms" },
  { key: "workers",          label: "Workers" },
  { key: "ministers",        label: "Ministers" },
  { key: "disciplinary",     label: "Disciplinary" },
  { key: "newParishes",      label: "New Parishes" },
  { key: "newNations",       label: "New Nations" },
  { key: "churchDedication", label: "Church Dedication" },
  { key: "projects",         label: "Projects" },
];
```

### 1.6 `STAT_LABEL_PATTERNS`

```js
const STAT_LABEL_PATTERNS = {
  births:           /^births?$/i,
  marriages:        /^marriages?$/i,
  deaths:           /^deaths?$/i,
  converts:         /^converts?$/i,
  baptisms:         /^baptisms?$/i,
  workers:          /^workers?$/i,
  ministers:        /^ministers?$/i,
  disciplinary:     /^disciplinary\s*$/i,
  newParishes:      /^new\s*parishes?$/i,
  newNations:       /^new\s*nations?$/i,
  churchDedication: /^church\s*dedication$/i,
  projects:         /^projects?$/i,
};
```

Regex per stat key, used to map a column header cell to its key during extraction. Note `disciplinary` allows trailing whitespace because the source files have a stray space.

---

## 2. Parser layer

### 2.1 Cell-lookup primitives

#### `findCell(sheet, pattern, opts = {})`
Walks every cell in the sheet's `!ref` range. Pattern can be a string (case-insensitive substring match) or a RegExp. Optional `opts.startR` / `opts.endR` to restrict row range. Returns `{r, c, value, raw}` or `null`. Raw is the trimmed string form of the value.

#### `findAllCells(sheet, pattern)`
Like `findCell` but returns every match in document order. **String pattern uses exact-equality match** (not substring) — important behavioral difference from `findCell`.

#### `valueRightOf(sheet, label, opts = {})`
Find the label cell, then walk RIGHT on the same row collecting the next non-empty cell. **Known limitation:** if other labels sit on the same row with empty cells between them (like Row 1 of the parish template where F3="Name Of Parish" and K3="Pastor In Charge"), this returns the next *label* as the value — not the actual value. **Use `valueForHeaderLabel` for Row 1 fields.**

#### `valueForHeaderLabel(sheet, label)` ⭐
Find the label cell, prefer the cell DIRECTLY BELOW it, fall back to right-walking. This is the fix for the parish-name-as-pastor-name bug. Use for any header-row field where the value is below the label (parish, pastor, mobile, email, month/year).

### 2.2 Date helpers

#### `excelDateToJS(serial)`
- If `serial instanceof Date`, return as-is.
- If `typeof serial === "number"`: build a local-time Date from `(serial - 25569)` days. Local-time intentionally — earlier UTC-based version produced off-by-one dates in negative-offset timezones (Sunday Nov 2 → Sat Nov 1). Implementation:
  ```js
  const days = Math.floor(serial - 25569);
  const d = new Date(1970, 0, 1);
  d.setDate(d.getDate() + days);
  return d;
  ```
- If `typeof serial === "string"`: delegate to `parseStringDate`.

#### `parseStringDate(s)`
Tries in order:
1. `YYYY-MM-DD` (ISO)
2. `DD.MM.YYYY` (German, used by the October-2025 old-template file)
3. `DD/MM/YYYY` or `MM/DD/YYYY` (assumes DD/MM, European)
4. Fallback: native `new Date(s)`

Two-digit years are bumped to 2000+. Returns local-midnight Date or `null`.

#### `ymd(d)`
Format Date as `YYYY-MM-DD` using LOCAL components (not `toISOString()` which would shift in UTC-negative zones).

### 2.3 Whole-sheet pattern scans

#### `scanSheetFor(sheet, pattern)`
Iterate every cell, return first string value matching pattern (trimmed). Returns `null` if nothing matches.

#### `findEmailInSheet(sheet)`
`scanSheetFor(sheet, /^[\w.+-]+@[\w-]+\.[\w.-]+$/)`. Used as a fallback when `valueForHeaderLabel("Email")` returns nothing.

#### `findMobileInSheet(sheet)`
Walks cells looking for phone-shaped strings: must contain only `+\d\s\-().`, must have ≥7 digits, must either contain a formatting char (space/dash/+/paren/dot) OR have ≥9 digits. The "must look formatted OR be 9+ digits" guard avoids matching short purely-numeric cells like attendance counts.

### 2.4 Month / year detection

#### `detectMonthYear(sheet)`
Strategy: collect every date-typed cell in the sheet, prefer Sundays, take the most common month/year.

Cell counts as a date if **any** of:
- `cell.t === "d"`
- `cell.v instanceof Date`
- `cell.t === "n"` AND `cell.w` matches `/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/`
- `cell.t === "s"` AND value matches `/^\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}$/` or `/^\d{4}-\d{1,2}-\d{1,2}$/` (string-date support)

**Defensive guards:**
- UTC-midnight Dates are re-anchored to local components: `new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())`
- **Pre-2000 dates rejected** — guards against Excel's 1900 epoch when small numbers (e.g., `1` for births count) accidentally get interpreted as dates. Earlier broken version coerced every numeric cell via `excelDateToJS()` and produced "March 1900" as the report month.

Filters dates to Sundays (`d.getDay() === 0`) if any exist; otherwise uses all dates. Picks the most common `year-month` tuple. Returns `{ month, year, label: "Month YYYY" }` or `{ month: null, year: null, label: "Unknown" }`.

### 2.5 Per-date row extraction

#### `extractPerDateRows(sheet)`

For each "Offering" header found in the sheet (one per WEEK block), maps the row's columns by label:

```js
if (s === "date") cols.date = c;
else if (s === "days") cols.days = c;
else if (s === "men") cols.men = c;
else if (s === "women") cols.women = c;
else if (s === "children") cols.children = c;
else if (s === "total") cols.totalAttendance = c;
else if (s === "offering") cols.offering = c;
else if (s === "tithe") cols.tithe = c;
else if (/tnx[_\s]?giving|thanksgiving|tnx giving/.test(s)) cols.thanksgiving = c;
else if (s === "others") cols.others = c;
else if (/^total\s*\(?€\)?$/.test(s)) cols.totalMoney = c;
```

**Column resolution is dynamic by label** — never hardcoded by letter (B, C, D, ...). This lets templates with shifted column positions still parse.

Then walks `r = hit.r + 1` to `hit.r + 8` (max 8 rows below the header), stopping when ANY cell on the row matches `/^total$/i`, `/^monthly average$/i`, or `/^week\s*\d+/i`. The "look at every column for stop markers" came from a bug where the loop only checked column C and missed terminators in column B → walked into the next section and grabbed the "Monthly Average" row as a 6th data row.

For each row that has a date OR a non-empty day label:
- Coerce date via `excelDateToJS` (number) or local-component re-anchor (Date) or `parseStringDate` (string).
- Read all columns by `cols.X` lookup; coerce via `NUM`.
- Build object with: `{ row, day, date (YYYY-MM-DD or original string), attendance: {men, women, children, totalReported, totalCalculated, validated}, money: {offering, tithe, thanksgiving, others, totalReported, totalCalculated, validated}, hasAttendance, hasMoney }`.

`validated`:
- `attendance.validated`: `Math.abs(totalReported - (men+women+children)) < 0.01`, or `null` if no `totalReported`.
- `money.validated`: same shape against money totals.

`hasAttendance` / `hasMoney`: true iff at least one component is non-zero. Used by the renderer to hide empty midweek rows.

### 2.6 Statistics extraction

#### `extractPerDateStatistics(sheet)`
Same overall structure as `extractPerDateRows` but maps STAT_FIELDS columns instead of money/attendance. Returns `{row, date, day, stats: {births, marriages, ...}, hasAny}`.

#### `readEnteredStatTotals(sheet)`
Finds the LAST "Births" header, then walks down looking for the FIRST "Total" row at least 6 rows below it (skip past the per-week Total). Returns `{row, totals: {births, ...}, addresses: {births: "M48", ...}, sheetName: null}` — the cell ADDRESSES are tracked so the auto-fix patcher knows where to write.

Only treats the row as the grand-total row if at least half of the stat columns have values populated.

### 2.7 Money totals

#### `readGrandTotalRow(sheet)`
Finds the header row containing "Offering"/"Tithe"/etc., then walks every "Total" label in the sheet, scoring each by the sum of its monetary cells. Returns the row with the highest score: `{row, offering, tithe, thanksgiving, others, cols}`.

#### `extractWeeklyTotals(sheet)`
For each "Offering" header, looks within 8 rows below for a row containing "total" in any column, captures the entered total in the totalMoney column. Returns array of `{weekIndex, totalRow, headerRow, enteredTotal}`. The recomputed total is then derived in `parseWorkbook` by summing per-date rows that fall between header and total.

### 2.8 Average attendance

#### `readMonthlyAverageTotal(sheet)`
Finds "Monthly Average" cell, returns the LAST numeric value to its right on the same row.

#### `readMonthlyAverageDemographics(sheet)`
Finds "Monthly Average" cell, then walks UP looking for the closest header row containing "Men"/"Women"/"Children". Maps those columns. Returns `{men, women, children}` with the corresponding values from the average row.

### 2.9 Remittance reading

#### `readActualRemittance(sheet)`
For each rule, finds the percentage label and reads the cell DIRECTLY BELOW (not to the right). Patterns use **negative lookbehind `(?<!\d)`** to prevent "5%" from matching inside "55%". Critical patterns:

```js
out.regional.offering5         = readLabelValuePair(/(?<!\d)5%\s*of\s*offering/i);
out.regional.tithe20           = readLabelValuePair(/(?<!\d)20%\s*of\s*tithe$/i);
out.operations.tithe55         = readLabelValuePair(/(?<!\d)55%\s*of\s*tithe/i);
out.operations.offering95      = readLabelValuePair(/(?<!\d)95%\s*of\s*offering/i);
out.operations.thanksgiving30  = readLabelValuePair(/(?<!\d)30%\s*of\s*t[\/\s]?giving|(?<!\d)30%\s*of\s*thanksgiving/i);
out.pastorAllow.thanksgiving70 = readLabelValuePair(/(?<!\d)70%\s*of\s*t[\/\s]?giving|(?<!\d)70%\s*of\s*thanksgiving/i);
out.provincial.tithe5          = readLabelValuePair(/(?<!\d)5%\s*of\s*tithe/i);
```

`pastorAllow.tithe20` is special: looks for the SECOND occurrence of `/(?<!\d)20%\s*of\s*tithes?$/i` (the first is in the Regional row). Same for `pastorAllow.total` — found via "Total (€)" on the same row as the 70% value.

### 2.10 Template validity

#### `detectTemplateValidity(sheet, totals, actualRemittance)`

Two-phase check:

**Phase 1 — Structural:**
- Required Row 1 labels (each must appear somewhere): `Name Of Parish`, `Pastor In Charge`, `Month/Year`.
- Required section headers: `Regional Remittance`, `Parish Operations` (matches `/twds\.?\s*parish\s*operations|parish\s*operations/i`), `Provincial Remittance`.
- Each missing label/section becomes a structural issue.

**Phase 2 — Formula:**
- For each remittance entry, compare the entered value against `source × canonical_rate`.
- If `|entered - expected| ≥ 0.05` (tolerance), compute `impliedRate = entered / source`.
- If the implied rate is within `0.005` of a "round" percentage (1%, 2%, ..., 99%), flag as a **template formula error** — the file is using a wrong but consistent rate (e.g., 60% instead of 55%). Message: `"Parish Ops 55% of Tithe: file uses 60% instead of canonical 55%"`.
- Issues that don't snap to a round percentage are NOT flagged here — they're treated as preparer arithmetic errors elsewhere in the pipeline.

Returns `{valid, structuralIssues, formulaIssues, issues}` where `issues` is the union.

### 2.11 Master `parseWorkbook(wb)`

Orchestration:
1. `sheetName = wb.SheetNames[0]; sheet = wb.Sheets[sheetName]`. **Single-sheet only.**
2. Read Row 1: `parish`, `pastor`, `mobile`, `email`, `monthYear`.
   - Mobile/email use `valueForHeaderLabel` → `findMobileInSheet`/`findEmailInSheet` fallback.
3. Run `readGrandTotalRow`, `readMonthlyAverageTotal`, `readMonthlyAverageDemographics`, `readActualRemittance`.
4. Run `extractPerDateRows`, `extractWeeklyTotals` (raw → enriched with `recomputedTotal`/`validated`/`contributingRows`), `extractPerDateStatistics`, `readEnteredStatTotals`.
5. Throw if no grand-total row found ("Could not locate the grand-total row in the report").
6. Compute `allocationReconciliation`: `expectedAllocations = totalIncome - others` (Others has no allocation rule), `enteredAllocations = sum of all entered remittances`, `validated` if `|delta| < 0.01`.
7. Compute monthly re-sum: sum every per-date row's offering/tithe/thanksgiving/others. Compare against reported totals (monetary tolerance 0.01).
8. Compute per-demographic averages: `sum / datedWeekCount` (no rounding — comparison done at full precision; tolerance 0.05).
9. Build sanityChecks (see §4).
10. Call `detectTemplateValidity`.
11. Assemble Statistics validation (per-stat-column sum vs entered total, `cellAddress` carried for auto-fix).
12. Return the full report object (see §9 for full JSON shape).

---

## 3. Validation layer

### 3.1 `buildChecks(report)` — the canonical check list

Builds 30+ checks, each `{section, label, calc, actual, tol}`. Default tolerance is implicit (0.01); averages override with `AVG_TOL = 0.05`.

**Order is intentional** (it determines display order in the validation banner):

1. **Parish Records** — Total Offering / Tithe / Thanksgiving / Others / Sum (re-summed from per-date)
2. **Parish Records** — Average Attendance (tol 0.05) if reported
3. **Parish Records** — Average Men/Women/Children (tol 0.05) if reported
4. **Per-Date Attendance** — for each per-date row with attendance: `men+women+children = totalReported`
5. **Per-Date Money** — for each per-date row with money: `offering+tithe+tnx+others = totalReported`
6. **Weekly Totals** — for each WEEK with an entered total: `recomputedTotal = enteredTotal`
7. **Allocation Reconciliation** — sum of all entered remittances = `totalIncome - others`
8. **Statistics** — for each stat with a reported total: `recomputed = reported`
9. **Regional Remittance** — `5% of Total Offering`, `20% of Total Tithe`, `Total Regional Remittance`
10. **Parish Operations** — `55% of Total Tithe`, `95% of Total Offering`, `30% of Total Thanksgiving`, `Total Parish Operations`
11. **Pastor Allowance** — `20% of Total Tithe`, `70% of Total Thanksgiving`, `Total Pastor Allowance`
12. **Provincial Remittance** — `5% of Total Tithe`

### 3.2 `gradeChecks(checks)`

For each check:
- `actual == null` → bucket as **missing**
- `Math.abs(calc - actual) < (c.tol ?? 0.01)` → **validated**
- otherwise → **notValidated**

Returns `{validated, notValidated, missing, total}`.

### 3.3 `buildFailure(check, report)` — enrichment

Each `notValidated` check is enriched with:
- `subType` (see classifyFailure)
- `severity` (see severityForCheck)
- `cellAddress` (see cellAddressForCheck)
- `autoFixable` (see isAutoFixable)
- `title`, `explanation`, `fixText` (see explainFailure)

### 3.4 `classifyFailure(check, report)` — sub-types

Decision tree, in order:

1. **`template-defect`** — if any `formulaIssues[i].message` (lowercased) contains a `\d+%\s*of\s*\w+` token that also appears in `${check.section} ${check.label}`.lowercase. Catches the "55% of Tithe" remittance check when the template uses 60%.
2. **`wrong-allocation`** — if `check.section` matches `/regional remittance|parish operations|pastor allowance|provincial remittance|allocation reconciliation/i`. Any failure in a remittance section that wasn't caught as template-defect.
3. **`missing-entry`** — `actual != null && actual !== 0 && calc === 0`.
4. **`forgot-to-total`** — `calc > 0 && (actual == null || actual === 0)`.
5. **`wrong-arithmetic`** — fallback. Both exist but disagree.

The `rounding` sub-type referenced elsewhere is reserved/unused — rounding is handled via tolerance, not as a separate sub-type.

### 3.5 `severityForCheck(check)`

```js
function severityForCheck(check) {
  for (const entry of LABEL_SEVERITY) {
    if (entry.pattern.test(check.label)) return entry.severity;
  }
  return FIELD_SEVERITY[check.section] || FIELD_SEVERITY._default;
}
```

LABEL_SEVERITY first (currently only matches `/average/i` → warn), then FIELD_SEVERITY by section, fallback to `_default` (`"fail"`).

### 3.6 `isAutoFixable(failure)`

```js
function isAutoFixable(failure) {
  if (failure.subType !== "forgot-to-total") return false;
  if (failure.severity === "fail") return false;  // money fields never auto-fix
  if (!failure.cellAddress) return false;
  return true;
}
```

In practice this means: only Statistics fields (severity=warn) with a tracked cell address. Per-Date Attendance is severity=warn but doesn't track cell addresses currently.

### 3.7 `formatterForCheck(check)`

Section-aware (label-blind so "per-date sum" doesn't accidentally match the monetary regex):

```js
function formatterForCheck(check) {
  const section = (check.section || "").toLowerCase();
  const label = (check.label || "").toLowerCase();
  if (section === "statistics") return fmtCount;
  if (section === "per-date attendance") return fmtCount;
  if (/average|avg/.test(label)) return fmtSmart;
  if (/^(parish operations|regional remittance|pastor allowance|provincial remittance|allocation reconciliation|weekly totals|per-date money|parish records)$/i.test(section)) return fmt;
  return fmt;  // default
}
```

### 3.8 `cellAddressForCheck(check, report)`

Currently only resolves Statistics: matches `check.label` against each `report.statistics.validation[i].label` by `startsWith`, returns `cellAddress` if found. Returns `null` for non-statistics.

### 3.9 `explainFailure(failure, report)` — message templates

**Field name** is derived from `check.label`: strip trailing parenthetical (e.g., "(per-date sum vs Total row)") and leading "Total ".

#### `forgot-to-total`
- title: ``The "${fieldName}" total wasn't updated``
- explanation (with statistics contributors):
  > `${entryCount} ${entry/entries} this month — ${friendlyJoin(contributors as "X on April 11", ...)} — for a total of ${total}. But ${cellRef} shows ${reported}. Likely the preparer added ${fieldName} to the weekly rows but forgot to update the totals row.`
- explanation (without contributors):
  > `The weekly entries add up to ${total}, but ${cellRef} shows ${reported}. Likely the totals row was never updated.`
- fixText: `Set ${cellAddress} to ${total}` or `Update the ${fieldName} total to ${total}`

#### `wrong-arithmetic`
- title: ``The "${fieldName}" totals don't agree``
- explanation: `Adding the weekly entries gives ${calculated}, but ${cellRef} shows ${reported}. Either some weekly entries are missing, or the totals row is incorrect. Please review.`
- fixText: `Please review the file and re-upload.`

#### `wrong-allocation`
- title: `${fieldName} amount doesn't match the rule`
- explanation: `Based on the canonical rules, this should be ${expected}, but the file has ${actual} (a difference of ${delta}). This affects how money is allocated.`
- fixText: `Please review the values in the spreadsheet, correct them, and re-upload.`

#### `missing-entry`
- title: ``"${fieldName}" total has a value but no weekly entries``
- explanation: `The totals row shows ${actual}, but no weekly rows have any ${fieldName} values. The per-date entries may have been deleted.`
- fixText: `Please review and re-upload.`

#### `template-defect`
- title: `${fieldName} is affected by a template defect`
- explanation: `The file's built-in formula uses the wrong rate. See the outdated-template banner above.`
- fixText: `Re-export with the current template.`

#### default
- title: `${section} — ${label}`
- explanation: `Calculated ${calc}, file has ${actual}.`
- fixText: `Please review and re-upload.`

### 3.10 Helpers used by explainFailure

#### `statisticsContributors(check, report)`
Returns array of `{date: "April 11", value: 3}` for non-zero per-date entries of the matched stat field. Date format from `formatLongDate`.

#### `formatLongDate(yyyymmdd)`
`"2026-04-11"` → `"April 11"`. Uses full month name, no zero-padding on day.

#### `friendlyJoin(items)`
Natural-language list:
- `["a"]` → `"a"`
- `["a","b"]` → `"a and b"`
- `["a","b","c"]` → `"a, b, and c"`

#### `subTypeLabel` (in renderFailureCard)
Sub-type → user-facing chip label:
- `"forgot-to-total"` → `"Totals row not updated"`
- `"wrong-arithmetic"` → `"Totals don't match"`
- `"wrong-allocation"` → `"Allocation rule not met"`
- `"missing-entry"` → `"Missing weekly entries"`
- `"template-defect"` → `"Outdated template"`

### 3.11 Tolerances summary

| Check | Tolerance | Notes |
|---|---|---|
| Money totals (per-date, weekly, monthly, allocation reconciliation) | 0.01 | Cents-level |
| Monetary remittance rules (5%, 20%, 55%, etc.) | 0.01 | Cents-level |
| Demographic averages (Avg Men/Women/Children/Attendance) | 0.05 | Allows for rounding noise |
| Template formula detection (impliedRate vs canonical) | 0.05 € abs / 0.005 rate | Two thresholds: amount diff and round-percent snap |
| Statistics totals | 0.01 | Counts are integers but threshold catches FP noise |
| Per-date attendance/money sums | 0.01 | Same as money |

---

## 4. Sanity checks

Built inside `parseWorkbook` as an IIFE returning an array of `{id, label, level, detail}` where level is `"ok" | "warn" | "fail"`.

Order is intentional:

1. **`no-negatives`** — scan every per-date row for negative attendance or money values. `fail` if any negatives, `ok` otherwise. Detail: comma-separated list like `"2025-11-09 money.tithe=-50"`.

2. **`row1-complete`** — checks `parish`, `pastor`, `monthYear.month` are all non-null. `fail` listing missing fields, `ok` otherwise. Note: doesn't check mobile/email.

3. **`sundays-consecutive`** — only added if at least 2 Sundays exist. Iterates pairs and checks each delta is exactly 7 days. `warn` if any non-7-day gap, `ok` otherwise. Detail format: `"2025-11-09 → 2025-11-23 (14d)"`.

4. **`dates-in-month`** — only added if monthYear is detected and Sundays exist. `warn` if any Sunday falls outside the detected report month, `ok` otherwise. Detail: comma-separated YYYY-MM-DD list.

5. **`no-empty-sundays`** — only flags Sundays that have a DATE entered but no values (attendance and money both zero). Undated empty Sunday rows (the optional WEEK 5 placeholder) are ignored — earlier version flagged them and produced false alarms every month with only 4 Sundays. `warn` if any, `ok` otherwise. Detail: comma-separated dates.

---

## 5. Format helpers

```js
const fmt      = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt   = (n) => Number(n).toLocaleString();
const fmtCount = (n) => Math.round(Number(n)).toLocaleString();   // rounds before display
const fmtSmart = (n) => Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
```

All return `"—"` when input is `null`/`undefined`.

`escapeHtml(s)` — standard `&<>"'` replacement. Also coerces non-string values via `String(s)`.

`icon(name, extra = "")` — returns `<i data-lucide="${name}" class="lucide-icon ${extra}"></i>`. `wireLucideIcons()` calls `lucide.createIcons()` after every render to swap markers for SVGs.

`NUM(v)` — `null/""` → 0, numbers as-is, strings parsed via `parseFloat` after stripping non-numeric chars.

`round2(n)` — `Math.round(n * 100) / 100`.

---

## 6. Rendering layer

### 6.1 Top-level `render(report)` flow

1. Stash `CURRENT_REPORT = report`.
2. **Early exit**: if `report.templateValidity.valid === false`, render only the template banner. No validation summary, no per-date detail, no remittance tables. User must re-upload.
3. Build checks via `buildChecks` and grade them.
4. **All-clean fast path**: if 0 failures AND 0 missing AND `!SHOW_FULL_REPORT_FORCED`, render only `renderFixesLog() + renderCompactSummary()`.
5. Otherwise render the full report (template banner already excluded by step 2):
   - Fixes Applied log (if any)
   - Validation summary banner with rich failure cards
   - Row 1 — Parish Info (Name of Parish, Month, Pastor, Mobile, Email)
   - Row 2 — Parish Records (with re-summed validation table)
   - Row 2 Build-Up section
   - Ordered sections #1: Sanity, Weekly Totals, Allocation Reconciliation
   - Rows 3–6 — Remittance tables (Regional, Parish Ops, Pastor, Provincial)
   - Row 7 — Others
   - Coverage check table
   - Ordered sections #2: Per-Date Detail, Statistics
   - Inspect raw report object (`<details>` with JSON dump)
   - Action row: Download JSON, Download Excel summary

### 6.2 `renderSummary(grade, report)`

Banner at the top of the report. Computes:
- `failures = notValidated.map(c => buildFailure(c, report))` (full enrichment) and stashes them in `CURRENT_FAILURES`.
- `worstSev = max(failure.severity for f in failures)` using rank `{fail:3, warn:2, info:1}`.
- Banner color: `bad` if worst is fail, `partial` if worst is warn/info, `ok` if all clean.
- Title: `"All ${total} checks validated"` OR `"${notValidated} of ${total} checks failed validation${maybeBreakdown}"` where the breakdown reads `(N fail · M warn)` only if both are non-zero.
- Renders all failure cards via `renderFailureCard(failure, idx)`.
- Missing list rendered as a small bulleted summary at the bottom (no rich cards).

### 6.3 `renderFailureCard(failure, idx)` — Layout C (chosen)

Structure:

```
[card.warn|fail|info]
  ┌─────────────────────────────────────────────────┐
  │ ┌──┐ Field name total              [Sub-type]   │  ← subject header
  │ │P48│                                            │
  │ └──┘                                            │
  ├─────────────────────────────────────────────────┤
  │ The Field name total needs to be updated.       │  ← headline
  │                                                  │
  │ CURRENTLY    0                                   │  ← compare list
  │ SHOULD BE    5    3 on April 11 + 2 on April 18 │
  │                                                  │
  │ Probable cause: the totals row wasn't refreshed │  ← cause line (forgot-to-total only)
  │                                                  │
  │ [✓ Fix this for me — Set P48 to 5]              │  ← fix CTA OR italic review text
  └─────────────────────────────────────────────────┘
```

Specifics:
- Cell pill is clickable → `data-cell="${cellAddress}"` → copy-to-clipboard with toast.
- Subject text: `${cellChip}${fieldName} total` if address known, otherwise just `${fieldName} total`.
- Sub-type chip uses the friendly labels from §3.10.
- Headline: `The ${fieldName} total needs to be updated.`
- Source text (after "should be" value): `entries.map(e => "${e.value} on ${e.date}").join(" + ")` or `"weekly entries"` if no contributors.
- Probable cause line only renders when `subType === "forgot-to-total"`: `the totals row wasn't refreshed after weekly entries were added.`
- Fix CTA:
  - Auto-fixable: `<button class="fix-btn" data-fix-idx="${idx}">${icon("check")} Fix this for me — Set ${cellAddress} to ${correctValue}</button>`
  - Manual: italic `<span class="fix-text">${fixText}</span>`

### 6.4 `renderTemplateBanner` / `renderTemplateWarningVariant`

Single variant chosen: `amber`. Structure:
- Header: `alert-triangle` icon in circle + title "This report uses an outdated template" + subtitle ("Detected N formula errors. ...")
- Detail card: list of formula issues, each parsed by `parseFormulaIssue` into `{rule, fileRate, canonicalRate, detail}`.
  - Render: rule name + `[FileRate%]` (struck-through bad pill) + arrow + `[CanonicalRate%]` (good pill) + meta detail text.
- Detail card for structural issues if any (same shell, no rate badges).
- CTAs: `[Get the correct template]` (primary, links to CORRECT_TEMPLATE_URL) + `[Try another file]` (secondary, triggers `data-action="reset-upload"`).

### 6.5 `renderCompactSummary(report, grade)`

Shown when 100% clean. Structure:
- Big green card with check-circle icon.
- Title: `Everything checks out for ${reportMonth} Report`.
- Subtitle: `${pastor} at ${parish} · all ${total} validation checks passed`.
- 3 checklist rows:
  - **Monetary** — `${count} checks passed · Offering, Tithe, Thanksgiving, Others`
  - **Remittance** — `${count} checks passed · Regional, Parish Ops, Pastor, Provincial`
  - **Statistics** — `${count} checks passed · Attendance, Births, Marriages, Workers, etc.`
- 2 CTAs: `[Submit your report →]` (primary) + `[Show full report]` (secondary, sets `SHOW_FULL_REPORT_FORCED = true` and re-renders).

### 6.6 `categorizeChecks(checks)`

Buckets validated checks for the compact summary count:
- `remittance` — section matches `/regional remittance|parish operations|pastor allowance|provincial remittance|allocation reconciliation/i`
- `statistics` — `section === "Statistics"`
- `monetary` — fallback when `/money|offering|tithe|thanksgiving|others|sum|weekly totals|per-date money|parish records/i` matches the section + label combo
- `other` — anything else

### 6.7 `renderSubmitConfirmation(report, submittedAt)`

Replaces the compact summary after the user submits. Shows submitted-time, "Saved to records" checklist row, "Submit another report" CTA.

### 6.8 `renderFixesLog()`

Rendered above the validation summary when `SESSION_FIXES.length > 0`. Each row: timestamp · field name + cell address pill · `oldValue → newValue` (old struck-through in red, new bold green).

### 6.9 `renderBuildUp(perDate, monthlyValidation)`

Collapsible `<details class="section" data-section-id="buildup">`. Auto-opens if any of the 5 build-up entries (Avg Attendance, Total Offering, Total Tithe, Total Thanksgiving, Total Others) failed validation.

Each entry renders as a card with:
- Field name + formula
- Result badge (green if validated, red if not)
- For attendance: `(week1+week2+...+weekN) ÷ count = sum ÷ count = result`
- For money: `weekVal1 + weekVal2 + ... + weekValN = result` (zeros shown faded)

### 6.10 `renderSanity(checks)`

Collapsible. Auto-opens if any check is `warn` or `fail`. Badge: `${ok} ok · ${warn} warn · ${fail} fail`.

### 6.11 `renderWeeklyTotals(weeklyTotals)`

Collapsible. Auto-opens if any week failed. Table: Week · Entered € Total · Re-summed · Δ · Match (centered icon).

### 6.12 `renderAllocationReconciliation(a)`

Collapsible. Auto-opens if not validated. Table:
- Total monetary income
- Others (no allocation rule defined)
- **Expected allocations** (Total − Others)
- Sum of all entered remittances
- Δ (entered − expected)
- Match

### 6.13 `renderStatistics(stats)`

Collapsible. Auto-opens if any stat fails. Adaptive — only shows columns where `s.hasAnyValue` is true. If all stats are zero, badge says "all zero".

Table: Field · Per-date sum · Reported total · Match (centered icon, no "Validated" text — just the icon for ✓; "✗ Not validated" for failures).

### 6.14 `renderPerDateDetail(perDate)`

Collapsible. Auto-opens if any per-date row has invalid attendance or money. Hides empty (no-attendance, no-money) rows. Footer note shows `${hidden} empty midweek rows hidden.` if any.

Adaptive columns: only shows attendance columns if any visible row has attendance, only shows money columns if any visible row has money.

Match column uses `<th class="flag">Match</th>` (centered) with inline ✓/✗ icons via `perDateFlag(validated, hasValues)`.

### 6.15 `renderOrderedSections(sections)`

Stable sort — sections with `hasErrors: true` come first, in input order, then clean sections in input order. Used to float failed sections to the top of their group.

`hasXxxErrors` helpers:
- `hasSanityErrors(checks)` — any `level !== "ok"`
- `hasWeeklyTotalsErrors(weeklyTotals)` — any `validated === false`
- `hasPerDateErrors(perDate)` — any per-date row with `attendance.validated === false || money.validated === false`
- `hasStatisticsErrors(stats)` — any `validation[i].validated === false`
- `hasBuildUpErrors(monthlyValidation)` — any of the 5 build-up entries with `reported != null && !validated`

### 6.16 Showcase (`?demo=errors`)

`renderShowcase()` builds mock data via `buildShowcaseFailures()` (5 failure types), `buildShowcaseSanity()` (mixed ok/warn/fail), `buildShowcaseTemplateValidity()`. Renders each in its own section with an h2 header. Used for design iteration; accessible via footer link or URL param.

---

## 7. Workflow & state

### 7.1 Module-level state

```js
let CURRENT_FILE = { workbook: null, filename: null, sheetName: null };  // last-loaded workbook + name
let CURRENT_REPORT = null;          // last-rendered parsed report
let CURRENT_FAILURES = [];          // current renderable failures (resolved via data-fix-idx)
let SESSION_FIXES = [];             // log of in-session auto-fixes; cleared on new file load
let SHOW_FULL_REPORT_FORCED = false;// when user clicks "Show full report" on compact view
```

`SESSION_FIXES` and `SHOW_FULL_REPORT_FORCED` reset on every new file load.

### 7.2 File handling (`handleFile(file)`)

Reads file via FileReader, calls `XLSX.read(uint8array, { type: "array", cellDates: true })`, stashes in `CURRENT_FILE`, resets `SESSION_FIXES` and `SHOW_FULL_REPORT_FORCED`, calls `parseWorkbook` and `render`.

**Drop-zone wiring:**
- `<label class="drop">` opens file picker natively when clicked. **No script-level click handler** — the prototype had this initially and produced double-open bugs. Just `dragover`/`dragleave`/`drop` handlers, and `change` on the input.
- `change` handler clears the input value after each load so re-selecting the same file fires `change` again.

### 7.3 Auto-fix (`applyPatchAndRevalidate(failure)`)

1. Confirm dialog with old → new value.
2. Mutate the in-memory sheet: `sheet[cellAddress] = { ...existing, t: "n", v: newValue, w: undefined, f: undefined }` (clear cached display string and any formula).
3. Push entry to `SESSION_FIXES`: `{appliedAt, cellAddress, field, section, oldValue, newValue}`.
4. Re-parse the patched workbook and re-render.
5. **Original .xlsx on disk is never touched.** Fixes live only in this session — reload = back to original.

### 7.4 Submit (`submitReport(report, btn)`)

Currently mocked — sets button to "Submitting…", awaits a 400ms timer, replaces `#report` with `renderFixesLog() + renderSubmitConfirmation()`. **Real backend call goes here in v2.**

### 7.5 Wiring helpers

- `wireFailureCardActions()` — binds Fix buttons via `data-fix-idx` and cell-pills via `data-cell` (copy + toast).
- `wireTemplateWarningActions()` — binds "Try another file" buttons.
- `wireCompactSummaryActions(report)` — binds "Show full report" → flips `SHOW_FULL_REPORT_FORCED` and re-renders. Binds "Submit your report" → `submitReport`. Binds "Upload another file" → resets DOM and re-opens picker.
- `wireLucideIcons()` — calls `lucide.createIcons()` after every render to swap `<i data-lucide>` markers for SVGs.

### 7.6 URL routing

`?demo=errors` → renders the showcase via `renderShowcase()`. Footer link points to this for easy access.

---

## 8. Excel export (`downloadXLSX(r)`)

Sheets, in order:

### Sheet 1: "Summary"

```
mReport — Parish Summary
(blank)
Parish Info
Name of Parish               | <value>
Month of the Report          | <value>
Name of Pastor               | <value>
Mobile                       | <value>
Email                        | <value>
(blank)
Parish Records
Average Attendance           | <value>
Total Offering               | <value>
Total Tithe                  | <value>
Total Thanksgiving           | <value>
Total of Others              | <value>
Sum                          | <value>
(blank)
Regional Remittance          | Calculated | Actual    | Match
5% of Offering               | <calc>     | <actual>  | Validated/Not validated/missing
20% of Tithe                 | <calc>     | <actual>  | ...
Total Regional Remittance    | <calc>     | <actual>  | ...
(blank)
Parish Operations            | Calculated | Actual    | Match
55% of Tithe                 | ...        | ...       | ...
95% of Offering              | ...        | ...       | ...
30% of Thanksgiving          | ...        | ...       | ...
Total Parish Operations      | ...        | ...       | ...
(blank)
Parish Pastor Allowance      | Calculated | Actual    | Match
20% of Tithe                 | ...        | ...       | ...
70% of Thanksgiving          | ...        | ...       | ...
Total Parish Pastor Allowance| ...        | ...       | ...
(blank)
Provincial Remittance        | Calculated | Actual    | Match
5% of Tithe                  | ...        | ...       | ...
(blank)
Others
Total Others                 | <value>
(blank)
Row 2 Validation             | Reported  | Re-summed | Match
Average Attendance           | ...       | ...       | ...
Total Offering               | ...       | ...       | ...
Total Tithe                  | ...       | ...       | ...
Total Thanksgiving           | ...       | ...       | ...
Total Others                 | ...       | ...       | ...
Sum                          | ...       | ...       | ...
```

Column widths: 32, 18, 18, 14.

### Sheet 2: "Per-Date Detail"

Columns: Date · Day · Men · Women · Children · Att. Reported · Att. Calculated · Att. Match · Offering · Tithe · Thanksgiving · Others · € Reported · € Calculated · € Match.

Includes ALL rows (visible AND hidden midweek). Match values use `validationLabel(v)` — `"Validated" / "Not validated" / "n/a"`.

### Sheet 3: "Weekly Totals"

Columns: Week · Entered € Total · Re-summed · Δ · Match.

### Sheet 4: "Allocation"

Two-column layout summarising the Allocation Reconciliation (Total income, Others, Expected allocations, Sum entered, Δ, Match).

### Sheet 5: "Statistics"

Columns: Field · Per-date sum · Reported total · Match. **All 12 fields**, not just the visible ones.

### Sheet 6: "Sanity"

Columns: Check · Level · Detail.

Filename: `mreport_${parish_underscored}_${reportMonth_underscored}.xlsx`.

`validationLabel(v)`: `null → "n/a"`, `true → "Validated"`, `false → "Not validated"`.

---

## 9. JSON export (`downloadJSON(report)`)

The full `report` object as returned by `parseWorkbook`. Top-level shape:

```ts
{
  source: { sheet, parish, pastor, mobile, email, reportMonth, monthIndex, year },
  parishRecords: { averageAttendance, totalOffering, totalTithe, totalThanksgiving, totalOthers, sum },
  perDate: Array<{
    row, day, date, hasAttendance, hasMoney,
    attendance: { men, women, children, totalReported, totalCalculated, validated },
    money: { offering, tithe, thanksgiving, others, totalReported, totalCalculated, validated },
  }>,
  monthlyValidation: {
    offering | tithe | thanksgiving | others | sum: { reported, recomputed, validated },
    averageAttendance | averageMen | averageWomen | averageChildren: { reported, recomputed, validated },
  },
  weeklyTotals: Array<{ weekIndex, enteredTotal, recomputedTotal, contributingRows, validated }>,
  allocationReconciliation: { totalIncome, others, expectedAllocations, enteredAllocations, delta, validated },
  sanityChecks: Array<{ id, label, level, detail }>,
  templateValidity: {
    valid,
    structuralIssues: Array<{ kind: "structural", message, detail }>,
    formulaIssues: Array<{ kind: "formula", message, detail }>,
    issues: combined,
  },
  statistics: {
    perDate: Array<{ row, date, day, stats: {births, marriages, ...}, hasAny }>,
    validation: Array<{ key, label, reported, recomputed, cellAddress, validated, hasAnyValue }>,
  },
  regionalRemittance: { calculated: {offering5, tithe20, total}, actual: {...} },
  parishOperations:   { calculated: {tithe55, offering95, thanksgiving30, total}, actual: {...} },
  parishPastorAllowance: { calculated: {tithe20, thanksgiving70, total}, actual: {...} },
  provincialRemittance:  { calculated: {tithe5}, actual: {...} },
  others: { totalOthers, allocationRule: null },
  coverage: {
    offering:     { rules: "5% Regional + 95% Parish Ops", coveragePct: 100 },
    tithe:        { rules: "20% Regional + 55% Parish Ops + 20% Pastor + 5% Provincial", coveragePct: 100 },
    thanksgiving: { rules: "30% Parish Ops + 70% Pastor", coveragePct: 100 },
    others:       { rules: "no allocation rule defined", coveragePct: 0 },
  },
}
```

Filename: `mreport_${parish_underscored}_${reportMonth_underscored}.json`.

---

## 10. Design tokens

### 10.1 CSS variables (`:root`)

```css
--bg:      #0f172a;   /* page background */
--panel:   #1e293b;   /* panel/card backgrounds */
--panel-2: #334155;   /* alt panel (table headers, etc.) */
--text:    #e2e8f0;
--muted:   #94a3b8;
--accent:  #38bdf8;   /* cyan-ish blue */
--good:    #22c55e;   /* green */
--bad:     #ef4444;   /* red */
--warn:    #f59e0b;   /* amber */
--border:  #334155;
```

### 10.2 Severity backgrounds (failure cards)

- `.failure-card.fail`: `#2a0e0e` bg, `var(--bad)` border, `#fecaca` text
- `.failure-card.warn`: `#2a1f0a` bg, `var(--warn)` border, `#fde68a` text
- `.failure-card.info`: `#0e1f2a` bg, `var(--accent)` border, `#bae6fd` text

### 10.3 Outdated-template (amber variant)

- bg: `linear-gradient(135deg, #2a1f0a 0%, #1f1607 100%)`
- border: `#92400e`
- text: `#fde68a`
- icon-circle bg: `#78350f`, icon color `#fbbf24`
- title: `#fef3c7`
- detail-card accent: `#f59e0b`
- primary CTA: bg `#f59e0b`, text `#1f1300`

### 10.4 Compact summary (green)

- bg: `linear-gradient(135deg, #052e1a 0%, #04200f 100%)`
- border: `var(--good)`
- text: `#d1fae5`
- icon: `#052e1a` on `var(--good)` background
- row bg: `rgba(0,0,0,0.25)`
- primary CTA: bg `var(--good)`, text `#052e1a`

### 10.5 Fixes Applied log (green)

- bg: `#052e1a`, border `var(--good)`, text `#bbf7d0`

### 10.6 Lucide icon sizing

```css
.lucide-icon { width: 16px; height: 16px; vertical-align: -3px; }
.lucide-icon.size-12 { 12px; vertical-align: -2px; }
.lucide-icon.size-14 { 14px; vertical-align: -2px; }
.lucide-icon.size-18 { 18px; vertical-align: -4px; }
.lucide-icon.size-20 { 20px; vertical-align: -4px; }
.lucide-icon.size-24 { 24px; vertical-align: -5px; }
.lucide-icon.size-32 { 32px; vertical-align: -7px; }
.lucide-icon.no-offset { vertical-align: middle; }  /* for buttons / chips */
```

---

## 11. Edge cases & bugs fixed

**This is the most important section — every one of these took an iteration in the prototype to discover. The v2 build must not regress on any of them.**

### 11.1 Header-row label lookup

**Bug:** `valueRightOf("Name Of Parish")` walked right and found the next *label* on the same row (e.g., K3="Pastor In Charge") because there were empty cells between F3 and K3. Result: parish name displayed as "Pastor In Charge".

**Fix:** `valueForHeaderLabel()` checks the cell DIRECTLY BELOW the label first, falls back to right-walking only if below is empty.

**Test case:** Mount Zion / New Song / October 2025 files all have Row 3 labels with values in Row 4 below.

### 11.2 Pre-2000 date guard

**Bug:** `detectMonthYear` initially converted every numeric cell via `excelDateToJS`. The number `1` (a Births count in column M) became Dec 31, 1899. Many small numeric cells (1, 2, 5, 6, etc.) all landed in early 1900 and outvoted the 4 real October 2025 Sundays. Result: report month detected as "March 1900".

**Fix:** Only treat cells as dates when explicitly date-typed (`cell.t === "d"`, `cell.v instanceof Date`, or text matching a date pattern). Reject any detected date with `year < 2000`.

### 11.3 Percentage substring matching

**Bug:** Regex `/5%\s*of\s*tithe/i` matched both "5% of Tithe" AND "55% of Tithe" because "55%" contains "5%" as a substring. Provincial Remittance (5%) was reading the value from Parish Ops (55%).

**Fix:** Negative lookbehind `(?<!\d)` on every percentage matcher prevents matching inside larger numbers.

**Test case:** Mount Zion file has both "5% of Tithe" and "55% of Tithe" — must read 128.05 from Provincial, not 1408.55 from Parish Ops.

### 11.4 UTC date off-by-one

**Bug:** `excelDateToJS` initially built dates via UTC math. In negative-offset timezones (US Pacific, etc.) the resulting Date objects' local-time components were off by one day. Sunday Nov 2 displayed as "Sat Nov 1".

**Fix:** Build local Date directly via `new Date(1970, 0, 1)` then `setDate(days)`. `ymd()` formats using local components, never `toISOString().slice(0,10)`.

### 11.5 SheetJS date re-anchoring

**Bug:** SheetJS's `cellDates: true` returns `Date` objects in UTC. Same UTC-shift problem.

**Fix:** Re-anchor every Date encountered in `detectMonthYear` and `extractPerDateRows`:
```js
new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
```

### 11.6 Per-date walker stop markers

**Bug:** `extractPerDateRows` only checked the Days column (C) for the "Total" stop marker. Some templates put "Total" in column B. Walker continued past the section end, picking up the "Monthly Average" row (row 46 for Mount Zion) as a 6th data row. Display showed 6 rows instead of 5.

**Fix:** Sweep ALL columns of each row when checking for stop markers. Stop on `/^total$/i`, `/^monthly average$/i`, or `/^week\s*\d+/i`.

### 11.7 Empty WEEK 5 false positive

**Bug:** Sanity check "no-empty-sundays" flagged the optional WEEK 5 placeholder row (no date, day=Sunday, all values zero) as a warning. Triggered false alarms every month with only 4 Sundays.

**Fix:** Only flag empty Sundays that ALSO have a date entered. Undated empty rows are ignored.

### 11.8 String-date support (DD.MM.YYYY)

**Bug:** The October 2025 Report file stored dates as text strings ("05.10.2025") instead of Excel date values. Parser only handled Date objects and serial numbers, returning `null`. Cascaded into:
- `detectMonthYear` returned "Unknown"
- Sanity checks created `new Date(null + "T00:00:00")` → `"null → null (NaNd)"`

**Fix:** `parseStringDate` handles ISO, DD.MM.YYYY (German), and DD/MM/YYYY (European). `extractPerDateRows` and `detectMonthYear` both call it on string cells matching date-shape regexes.

### 11.9 Average rounding mismatch

**Bug:** Parser rounded recomputed averages to integers/one-decimal BEFORE comparing to the file's value. Result:
- Average Attendance: file shows 160.25, parser computed 160 (int rounded), flagged as Not validated.
- Average Women: file shows 63.75, parser computed `Math.round(63.75 × 10) / 10 = 63.8` due to half-to-even, flagged as Not validated.

**Fix:** Keep recomputed averages at full floating-point precision. Display rounding happens only at render time. Tolerance widened to 0.05 for averages.

### 11.10 Banner tolerance vs field tolerance mismatch

**Bug:** Field-level checks used 0.05 tolerance for averages, but the banner used a hardcoded 0.01 — same data, banner still showed failure even when the field card said validated.

**Fix:** Each check carries its own `tol` field; `gradeChecks` uses `c.tol ?? 0.01`. Single source of truth.

### 11.11 "sum" substring in monetary classifier

**Bug:** `formatterForCheck` tested the entire `${section} ${label}` string against `/sum/`, matching the word "sum" inside "(per-date sum vs Total row)" — which made Statistics fields use the monetary formatter (5.00) instead of count formatter (5).

**Fix:** Section-aware classifier. Statistics is checked by `section === "statistics"` first, before any label-based regex.

### 11.12 Double file-picker open

**Bug:** `<label class="drop">` opens the picker natively on click, AND there was a script-level click handler that also called `fileInput.click()`. Result: clicking the drop zone opened two file pickers.

**Fix:** Removed the script click handler. Native label behavior is enough. Also clear `fileInput.value` after each `change` so re-selecting the same file works.

### 11.13 720 vs 730 column-mapping investigation

**Suspected bug** during testing: a Per-Date row showed "720.00" for a money total when the file had 730. Investigation showed the screenshot was stale — actual rendering was correct after the §11.6 stop-marker fix. Worth knowing because the symptom (wrong number on a per-date row) could recur if `cols.X` lookup ever drifts.

### 11.14 Parish-name "Pastor In Charge" leak

The most user-visible incarnation of §11.1. Mount Zion compact summary briefly displayed "Everything checks out for Pastor In Charge" until `valueForHeaderLabel` was introduced.

### 11.15 Template-defect classification leak

`classifyFailure` checks template-defect FIRST. Without that order, a "55% of Tithe" failure caused by an outdated template (file uses 60%) would be classified as `wrong-allocation` and surfaced as a preparer-side error. With template-defect first, the failure card correctly references the template banner.

### 11.16 `LABEL_SEVERITY` data structure

**Bug:** Initial implementation used `{ /average/i: "warn" }` as an object literal. JS coerced the regex key to the string `"/average/i"`, breaking severity lookup for averages.

**Fix:** Array of `{pattern: RegExp, severity}`. First match wins.

---

## 12. Known limitations

**Not bugs — design choices or constraints to be aware of:**

1. **Single-sheet only.** Parser reads `wb.Sheets[wb.SheetNames[0]]`. Multi-sheet workbooks ignore sheets 2+.
2. **No multi-language support.** All labels and messages in English.
3. **No PDF/CSV import.** Only `.xlsx` via SheetJS.
4. **No undo for auto-fixes.** `SESSION_FIXES` logs but provides no rollback. To revert, reload the page.
5. **Cell address tracking is currently only wired for Statistics.** Per-date attendance totals are not auto-fixable even though they meet the structural criteria, because `cellAddressForCheck` doesn't resolve them. Future work.
6. **No currency conversion.** All monetary values assumed to be euros.
7. **Mobile fallback is heuristic.** A long numeric string accidentally appearing in a cell could be misidentified as a phone number (e.g., a long account number).
8. **Template detection requires totals to be present.** If the file has zero Tithe and zero Offering, the formula-rate check can't run (division by zero) and `detectTemplateValidity` may pass even on a broken template.
9. **No version field in the template.** Detection is heuristic — a manually-edited cell can mask an outdated template.
10. **Excel export has no styling.** Plain values, no colors or formatting.
11. **No backend.** Submit is mocked. All persistence is in-memory.
12. **`renderShowcase` is a developer convenience.** Not protected behind any auth — anyone with the URL can see it.

---

## Audit footer

**Coverage:** Every section, every regex, every threshold, every failure sub-type, every render path, every documented bug fix.

**Confidence high on:** parser flow, validation rules, formatter dispatch, sanity checks, edge cases.

**Confidence medium on:** Excel export sheet structure (text-only inspection — no live verification of column widths). JSON shape (assembled from individual function returns; not produced as a single typed schema in the prototype).

**Confidence low on:** showcase mock-data details (shaped to look reasonable; no rigorous verification that every shape matches what production would produce).

**Last verified against source:** 2026-05-14 against `_prototype/index.html` (3494 lines, frozen).
