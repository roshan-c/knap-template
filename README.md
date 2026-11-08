# Knap report template

A local pipeline for university reports using Hull Harvard referencing. Each
clone holds one report: write `report.md`, keep metadata and CSL JSON references
in `project.json`, and build a portable HTML file and a submission PDF.

## Starting a new report

1. Clone this template into a new directory for the assignment.
2. Install dependencies with `npm ci`.
3. Replace the sample prose in `report.md` and update `project.json` (metadata,
   references and the pipeline records used in the build appendix).
4. Replace or remove the sample figures. You can delete the build appendix
   section and its `<!-- GENERATED_BUILD_APPENDIX -->` marker. To keep the
   generated appendix, retain exactly one marker. Keep the empty `::: {#refs}` / `:::` div under References.
5. Run the checks and build below, then inspect the PDF before submission.

The title and abstract belong in metadata; do not duplicate them in the body.
Do not edit `build/`: it is generated and ignored by Git.

## Requirements and commands

Use Node.js 20+, Pandoc **3.9.0.2**, and a Chromium browser (Chrome **131+** for
CSS page numbers). There are no TeX, Mermaid CLI or other system dependencies.
Knap is pinned to 0.4.2 and the local diagram renderer Pele to 1.13.0.

```sh
npm ci
npm run check
npm test
npm run html
npm run wordcount
npm run verify
npm run pdf
```

- `check` validates the two Knap templates.
- `render` assembles `build/report.md`, renders Mermaid SVGs to
  `build/figures/`, and writes `build/reference-index.md`.
- `html` renders, runs Pandoc and prints the body word count. The Lua
  cross-reference filter runs **before citeproc**. Pandoc uses `--number-sections`,
  `--mathml`, `--css styles/report.css`, `--embed-resources` and
  `--resource-path=build:.`. CSS and images are embedded, so the HTML can be
  moved without its source assets. Mathematics uses native MathML without a CDN.
- `wordcount` renders and counts the assembled document using Pandoc's AST.
- `verify` runs the full build, then checks the PDF page count, both word
  counts, `wordLimit` and `pageLimit`, and Pandoc warnings that mean broken
  output. It exits 0 only when every check passes. `npm run verify -- --json`
  prints one JSON object for the Quire editor.
- `pdf` rebuilds HTML, then prints `build/report.pdf` with headless Chromium.
  `build` is an alias for `pdf`.
- `clean` removes only `build/`.

The PDF script tries `CHROME_PATH`, Puppeteer's managed browser cache
(`~/.cache/puppeteer`, newest `chrome-headless-shell` or Chrome for Testing),
common Chrome/Chromium/Edge/Brave installation locations on macOS and Windows,
then browser names on PATH. To fetch a headless browser without installing
Chrome:

```sh
npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer
```

For example:

```sh
CHROME_PATH="/path/to/browser" npm run pdf
```

Set `KNAP_NO_BROWSER_SEARCH=1` to disable the automatic search and use only
`CHROME_PATH`.

It uses an isolated temporary profile, disables Chrome's own headers and
footers with `--no-pdf-header-footer`, and checks the output's PDF signature.
Missing browsers and printing failures exit non-zero.

## Metadata and submission layout

Edit `project.json`:

```json
{
  "meta": {
    "title": "Your report title",
    "subtitle": "An optional subtitle",
    "author": "Your name or student number",
    "module": "An optional course or module name",
    "date": "2026-11-07",
    "abstract": "A concise summary of your report.",
    "toc": true,
    "wordLimit": 2000,
    "pageLimit": null
  }
}
```

`title`, `author`, `date` and `abstract` populate the title page. `subtitle` and
`module` may be omitted. ISO dates display in British long format (for example,
`7 November 2026`); the stored metadata stays ISO. Other date strings display unchanged. `toc` defaults to true; set it to false to omit the
contents page. `wordLimit` is optional and should be a positive number; it is
emitted through `templates/frontmatter.kmd` using Knap's `yaml_property`.
`pageLimit` is optional and should be a positive number or `null`. The sample
uses `null` to disable the page check. Both limits are used by `npm run verify`,
not by the HTML template. `npm run html` and `npm run wordcount` only warn about
the word limit; `verify` fails.

`templates/report.html` places the title, metadata and abstract on the first
page, followed by a page break. Contents starts on its own page and is followed
by another break. `styles/report.css` provides A4 paper, 25mm margins, a 12pt
serif body at 1.4 line spacing, light table rules and 11pt wrapping code. CSS
margin boxes show page numbers except on the first page. Numbering counts the
title page, so the next page is page 2. Headings stay with following content;
figures, tables and listings avoid internal page breaks where they fit on a page.
Oversized material must be shortened or split by the author. Screen output uses
a centred readable column. Inspect final pagination in the PDF, especially after
adding large figures or tables.

## Sections and cross-references

The repository's `filters/crossref.lua` supplies cross-references without
pandoc-crossref. Use unique IDs with these prefixes:

````markdown
## Methods {#sec:methods}

### Procedure {#sec:procedure}

![A descriptive caption](figures/my-image.svg){#fig:example}

| Condition | Result |
|---|---|
| Baseline | 42 |

: A descriptive caption {#tbl:results}

``` {.python #lst:example caption="A short calculation"}
print(6 * 7)
```

$$
E = mc^2
$$ {#eq:energy}

See @sec:procedure, @fig:example, [@tbl:results], @lst:example and @eq:energy.
````

Links display as “Section 1.1”, “Figure 1”, “Table 1”, “Listing 1” and
“Equation 1”. Both bare and bracket citation forms work, including forward
references. Figure, table, equation and listing counters run independently
through the document. Captions are prefixed “Figure 1: …”, “Table 1: …” and
“Listing 1: …”; equation numbers appear at the right. Keep the equation label
directly after its closing `$$`, with no blank paragraph between them.
Unknown cross-reference IDs warn on stderr and fail publication; duplicate
target IDs also fail. Keep cross-reference prefixes reserved for these targets.
Ordinary CSL citations continue through citeproc, including mixed citation groups.

Sections are numbered automatically. References and headings beginning with
“Appendix” are unnumbered; appendix subheadings are also unnumbered. Use
`{.unnumbered}` for any other heading that should have no section number.

Store local image assets under `figures/` and use paths such as
`figures/my-image.svg`. The build searches `build/` first, then the repository,
so generated diagrams and source images both resolve. Use distinct filenames
for source figures and generated diagrams.

## Mermaid diagrams

Use an attributed fence for a numbered, captioned diagram:

````markdown
``` {.mermaid #fig:process caption="The processing stages"}
flowchart LR
  A[Source] --> B[Build] --> C[Submission]
```

See @fig:process.
````

Plain ` ```mermaid ` fences also work; they receive `fig:diagram-1`,
`fig:diagram-2`, etc. and the caption “Diagram”. Pele renders synchronously in
Node without a DOM, browser, service or network request. An explicit
`#fig:process` creates `build/figures/process.svg`; an unlabelled diagram uses
`diagram-<index>.svg`. The block becomes a normal Pandoc image and participates
in figure numbering. Use IDs containing letters, numbers, dots, underscores or
hyphens after `fig:`. Invalid syntax aborts assembly with the manuscript
filename, source line, column and Pele's diagnostic snippet. Pele supports
Mermaid syntax through its own renderer; inspect diagrams after changes.

## Word count

The count runs after the cross-reference filter and citeproc, and reports both
including and excluding rendered in-text citations. Body prose, section headings
and rendered cross-references (such as “Figure 1”) count in both totals. It
excludes metadata (including abstract/title/TOC), figure and table captions and
contents, listing captions, code (inline and fenced), mathematics and equation
labels, raw HTML, the References section and headings starting with Appendix
(including their subheadings). A heading such as “Our References Model” still
counts. Linked and emphasised prose counts normally. Hyphenated words and
apostrophe contractions count as single words. Compare this local convention
with your module's counting policy.

`npm run wordcount` prints, for example, `Word count: 251 (244 excluding in-text
citations) — 12.6% of 2000`. The percentage and word-limit warning use the higher
count, including in-text citations. Exceeding the limit warns on stderr in
`html` and `wordcount`; `npm run verify` turns it into a failing check.
`npm run html` prints the same result at the end. For a standalone Markdown
fixture, run `node scripts/wordcount.mjs path/to/file.md`; include citation
metadata in the fixture when citing sources.

## Verification

`npm run verify` runs the full build (render, HTML, PDF), then reports:

- **pages** — the PDF page count, read directly from the PDF without `pdfinfo`
  or another external tool.
- **words** — body words including in-text citations, and words excluding them,
  using the same rules as `npm run wordcount`.
- **limits** — `wordLimit` and optional `pageLimit` from `project.json` meta.
- **diagnostics** — Pandoc warnings that mean broken output, such as
  `Citeproc: citation ... not found`. Unknown cross-references already fail the
  build.

It prints one line per check with ✓ or ✗ and a final summary. The exit code is 0
when every check passes and 1 otherwise. `npm run verify -- --json` writes
**only** one JSON object to stdout; build output and diagnostics go to stderr:

```json
{
  "pass": true,
  "pages": 7,
  "words": 271,
  "wordsExcludingCitations": 263,
  "pageLimit": null,
  "wordLimit": 2000,
  "errors": [],
  "warnings": []
}
```

`pages` is `null` when the PDF step fails, including when no Chromium-based
browser is available; `errors` then explains how to install one. The Quire
editor's Build button runs `npm run verify -- --json`; in Quire press ⌘B.

## References and citation style

Each `project.json` reference is a CSL JSON record with a unique `id`:

```json
{
  "id": "example",
  "type": "webpage",
  "author": [{ "literal": "Example organisation" }],
  "title": "Example resource",
  "URL": "https://example.com/",
  "issued": { "date-parts": [[2026]] },
  "accessed": { "date-parts": [[2026, 11, 7]] }
}
```

Use `family`/`given` for people's names and `literal` for organisations. In the
manuscript, cite with `[@pandoc]`, `[@knap; @pandoc]`, `[-@pandoc]` (suppress
author), or `[@pandoc, pp. 12-15]` (locator). Citeproc resolves the YAML
references and fills the `#refs` div. Knap separately sorts citation keys and
renders the project pipeline table into the generated build appendix.

`styles/hull-harvard.csl` is adapted from Cite Them Right 12th edition; Hull
does not publish an official CSL file. It follows the
[Hull Harvard guide](https://libguides.hull.ac.uk/referencing/harvard): URLs
followed by `[Accessed …]`, short months, “et al.” from three authors, up to
eight authors listed in the bibliography, `n.d.` for missing dates, and
alphabetic sorting. Review bibliographic data and assignment requirements.
To change styles, add a CSL file under `styles/` and change the `--csl` path in
`scripts/html.mjs`.

## Files, tests and CI

`scripts/build.mjs` renders the Knap templates and delegates diagram rendering
to `scripts/mermaid.mjs`; `scripts/assemble.mjs` replaces an optional appendix
marker (duplicates are rejected). `scripts/html.mjs` publishes HTML and calls `scripts/wordcount.mjs`.
`scripts/pdf.mjs` prints it. `scripts/verify.mjs` builds, checks limits and
reports; `scripts/pdf-pages.mjs` counts pages without external tools. The
filters, template and stylesheet are local.

`npm test` uses Node's test runner and installed Pandoc. Tests cover assembly
and marker diagnostics, HTML numbering and links for every target type,
citation coexistence, embedded SVGs/CSS, title metadata, optional contents,
unnumbered References/Appendix, unknown targets, Mermaid errors with source
lines, word-count exclusions, and verification (PDF page counting, JSON output,
limits and missing browsers). Publication tests use isolated temporary report
clones and do not modify your source files.

GitHub Actions uses `ubuntu-24.04`, Node 22 and Pandoc pinned to 3.9.0.2. It runs
`npm ci`, `npm run check`, `npm test`, then `npm run pdf`, using the runner's
Google Chrome. The `report` artifact contains both `build/report.html` and
`build/report.pdf`.
