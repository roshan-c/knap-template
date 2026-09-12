# Knap Template

A small, local, source-first Markdown publishing project. You write plain
Markdown in `report.md`, keep metadata and references in `project.json`, and
run npm scripts. Knap templates generate the YAML front matter and the
reference inventory; Pandoc converts the assembled document to HTML and PDF
with citation processing.

Nothing here is a web editor or a GUI, and nothing is pushed to GitHub. All
artifacts are produced locally from the sources in this directory.

## File roles

| File | Role |
| --- | --- |
| `report.md` | The manuscript. Ordinary, human-edited Markdown with a title, abstract, math, and Pandoc citations (`[@knap; @pandoc]`). Contains the marker `<!-- GENERATED_REFERENCE_INVENTORY -->`, which the build replaces with the generated reference inventory. |
| `project.json` | Machine-edited data: `meta` (title, author, date), `pipeline` (stages rendered as a table), and `references` (CSL JSON-style entries used for citations). |
| `templates/frontmatter.kmd` | Knap template that renders the YAML front matter (title, author, date, references) using the `yaml_property` filter so Pandoc's citeproc can read the references. |
| `templates/reference-index.kmd` | Knap template that sorts references by ID, lists each citation key and title with a link to its URL, and renders the `pipeline` array as a Markdown table. |
| `scripts/build.mjs` | Node.js ESM script using Knap's API (`createEngine({ filters: standardFilters })`). Renders both templates, checks the marker, replaces it, prepends front matter, and writes `build/report.md` and `build/reference-index.md`. |
| `scripts/clean.mjs` | Removes only the `build/` directory. |
| `package.json` | Script aliases: `check`, `render`, `html`, `pdf`, `build`, `clean`. |
| `.gitignore` | Ignores `node_modules/`, `build/`, and `.DS_Store`. |

## Required external tools

- **Node.js 20 or newer** (Knap is ESM-first and requires Node 20+).
- **Pandoc** for HTML/PDF conversion and citation processing (`--citeproc`).
- **XeLaTeX** or another working TeX installation for PDF output. The `pdf`
  script uses `--pdf-engine=xelatex`. HTML output does not need TeX.

## Normal workflow

```bash
npm install
npm run check
npm run render
npm run html
npm run pdf
```

- `npm run check` validates both Knap templates (`knap validate`).
- `npm run render` runs `scripts/build.mjs` and writes `build/report.md` and
  `build/reference-index.md`.
- `npm run html` renders, then runs Pandoc with `--citeproc --standalone` to
  produce `build/report.html`.
- `npm run pdf` renders, then runs Pandoc with `--citeproc
  --pdf-engine=xelatex` to produce `build/report.pdf` (requires XeLaTeX).
- `npm run clean` removes the `build/` directory.

## Editing the report in VS Code

Open this folder in VS Code and edit `report.md` directly. It is plain
Markdown, so the built-in Markdown preview works. For a nicer writing
experience:

- Install the **Markdown All in One** extension (keyboard shortcuts,
  table formatting, math preview).
- Install the **Pandoc Citer** extension if you want autocompletion of
  citation keys while writing `[@key]` citations.
- The math is LaTeX-style (`$...$` inline, `$$...$$` display); several
  extensions render it in the preview.

`report.md` is the source of truth for prose and never gets overwritten by
the build. Edit it freely; the build only reads it.

## Adding or modifying references

Edit `project.json`. Each entry in the `references` array is a CSL JSON
object. A minimal entry looks like:

```json
{
  "id": "knap",
  "type": "webpage",
  "author": [{ "literal": "Knap" }],
  "title": "Knap: Turn data into Markdown",
  "URL": "https://knap.md/"
}
```

Rules:

- `id` must be unique. It is the citation key you type in `report.md`.
- `type` should be a CSL type such as `webpage`, `article-journal`, or `book`.
- Use `author` with `family`/`given` for real names, or `literal` for
  organizations.

After editing, run `npm run render` to regenerate the front matter and the
reference inventory.

## Citing a reference from `report.md`

Use Pandoc's citation syntax with the reference `id`:

- One citation: `[@knap]` → (Knap)
- Multiple: `[@knap; @pandoc]` → (Knap; MacFarlane, John)
- Suppress the author: `[-@pandoc]`
- Locators: `[@pandoc, pp. 12-15]`

Pandoc resolves the keys against the `references` list in the generated YAML
front matter and replaces the bracket syntax with formatted citations and a
bibliography in the published output.

## Custom citation styles

By default Pandoc uses the Chicago author-date style. To use a custom CSL
style, download a `.csl` file (for example from
<https://citationstyles.org/>) into the project and pass `--csl` to Pandoc.
For example, to use IEEE:

```bash
pandoc build/report.md --citeproc --standalone --csl ieee.csl -o build/report.html
```

You can also add the option to the `html` and `pdf` scripts in
`package.json` if you want one style for every build.