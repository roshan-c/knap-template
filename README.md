# Knap Template

A small, local, source-first Markdown publishing project. Write the manuscript
in `report.md`, keep metadata and CSL JSON references in `project.json`, and
use Knap templates and Pandoc to publish HTML and PDF. No web editor or remote
service is required.

## File roles

| File | Role |
| --- | --- |
| `report.md` | Manuscript with math and Pandoc citations. References contains only the `::: {#refs}` bibliography div; an appendix after it contains the single `<!-- GENERATED_BUILD_APPENDIX -->` marker. No title H1 or abstract heading is needed here. |
| `project.json` | `meta` (title, author, date, abstract), pipeline records, and CSL JSON references. |
| `templates/frontmatter.kmd` | Emits title, author, date, abstract, and references via Knap's `yaml_property` filter. Pandoc renders the title and abstract in its title block. |
| `templates/reference-index.kmd` | Sorts references by ID, lists citation keys and linked titles, and renders the pipeline table for the appendix. |
| `scripts/build.mjs` | Renders Knap templates, assembles the manuscript, and writes `build/report.md` plus `build/reference-index.md`. Reports template diagnostics and missing or repeated markers. |
| `scripts/assemble.mjs` | Replaces exactly one appendix marker, preserving literal replacement text such as `$&`. |
| `scripts/pdf.mjs` | Resolves a Chromium browser and prints the HTML using an absolute file URL. |
| `scripts/clean.mjs` | Removes only `build/`. |
| `test/build.test.mjs` | Node tests for generated document structure, literal insertion, and marker diagnostics. |
| `styles/hull-harvard.csl` | Hull Harvard citation style, adapted from Cite Them Right 12th edition. |
| `.github/workflows/build.yml` | Push/PR checks, tests, HTML build, and HTML artifact upload. |
| `package.json`, `package-lock.json` | npm scripts and locked Knap dependency. |
| `.gitignore` | Ignores `node_modules/`, `build/`, and `.DS_Store`. |

## Required external tools

- **Node.js 20 or newer**; CI uses Node 22.
- **Pandoc** with citeproc and MathML support (tested locally with 3.9.0.2).
- **A Chromium-based browser** for PDF output. No TeX installation is needed.

## Normal workflow

```bash
npm install
npm run check
npm test
npm run html
npm run pdf
```

- `npm run check` statically validates both Knap templates.
- `npm run render` writes `build/report.md` and `build/reference-index.md`.
- `npm test` uses `node --test` without extra dependencies. It runs the build
  and checks front matter, bibliography placement, appendix insertion, literal
  dollar sequences, and missing/duplicate marker errors.
- `npm run html` renders, then runs Pandoc with `--citeproc --csl
  styles/hull-harvard.csl --standalone --mathml` to write `build/report.html`.
  MathML renders natively without JavaScript or a CDN.
- `npm run pdf` rebuilds HTML and prints `build/report.pdf` with headless
  Chromium. `npm run build` is an alias for this full PDF pipeline.
- `npm run clean` removes `build/`.

The PDF script tries `$CHROME_PATH` first (an executable path, without embedded
quotes), then common installation locations: Google Chrome, Chromium,
Microsoft Edge, and Brave under `/Applications` and `~/Applications` on macOS;
Chrome, Chromium, Edge, and Brave under Program Files, Program Files (x86), and
Local AppData on Windows. It also searches PATH for `google-chrome`,
`google-chrome-stable`, `chromium`, and `chromium-browser` (or `chrome.exe`,
`chromium.exe`, `msedge.exe`, and `brave.exe` on Windows).

For example:

```bash
CHROME_PATH="/path/to/browser" npm run pdf
```

If no executable is found, the script lists every path tried and exits
non-zero. Browser launch/print failures also exit non-zero; a successful run
checks that the output starts with a PDF signature.

## CI

On every push and pull request, GitHub Actions installs Node 22, runs `npm ci`,
installs Pandoc 3.9.0.2, runs `npm run check`, `npm test`, and `npm run html`, then
uploads `build/report.html` as the `report-html` artifact. PDF generation is
local and requires a browser.

## Adding or modifying references

Edit `project.json`. Each reference is a CSL JSON object, for example:

```json
{
  "id": "knap",
  "type": "webpage",
  "author": [{ "literal": "Knap" }],
  "title": "Knap: Turn data into Markdown",
  "URL": "https://knap.md/",
  "issued": { "date-parts": [[2026]] },
  "accessed": { "date-parts": [[2026, 11, 7]] }
}
```

Use a unique `id` as the citation key and a CSL type such as `webpage`,
`article-journal`, or `book`. Use `family`/`given` for people's names and
`literal` for organizations. Supply publication (`issued`) and access dates
when known. The sample web references use 2026 as their edition year.

Run `npm run render` to regenerate front matter and the appendix. Knap's
built-in `sort` orders reference records by ID, `yaml_property` serializes
named YAML properties, and `table` renders pipeline records as a Markdown
table. `build/reference-index.md` remains a separate inventory artifact.

## Citing a reference from `report.md`

Use Pandoc's citation syntax with a reference ID:

- One citation: `[@pandoc]` → (MacFarlane, 2026)
- Multiple: `[@knap; @pandoc]` → (Knap, 2026; MacFarlane, 2026)
- Suppress the author: `[-@pandoc]`
- Locators: `[@pandoc, pp. 12-15]`

Pandoc resolves the generated YAML references, formats in-text citations,
and inserts the bibliography into the `#refs` div under References. The
citation-key inventory and pipeline table follow in Appendix: Build pipeline.

## Citation style

This project uses the University of Hull Harvard style, defined in
`styles/hull-harvard.csl`. The University of Hull does not publish an
official CSL file, so this style is adapted from the Cite Them Right 12th
edition style (the standard UK Harvard) with these changes to follow the
[Hull guide](https://libguides.hull.ac.uk/referencing/harvard):

- Access information renders as `URL [Accessed 13 Jun 2025]`; the Hull
  guide omits "Available at:" and uses square brackets. Months use short
  names without periods, with an explicit `Jun` override for June.
- In-text citations use "et al." from three authors.
- The bibliography lists all authors up to eight, then "et al."
- No date renders as `n.d.`; entries sort alphabetically by author.

The file is plain XML. Edit it to tune details such as punctuation or the
accessed-date format.

## Using another citation style

To switch styles, download a `.csl` file (for example from
<https://citationstyles.org/> or the Zotero style repository at
<https://www.zotero.org/styles>) into `styles/` and point `--csl` at it.
For example, to use IEEE instead:

```bash
pandoc build/report.md --citeproc --standalone --csl styles/ieee.csl -o build/report.html
```

You can also change the style permanently by editing the `--csl` path in
the `html` script in `package.json`.
