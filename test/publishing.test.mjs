import test from 'node:test';
import * as cssTree from 'css-tree';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, cp, symlink, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMermaid } from '../scripts/mermaid.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));

// Run the real pipeline in an isolated report clone; never mutate the owner's sources.
async function workspace(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'report-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const name of ['scripts', 'templates', 'filters', 'styles', 'figures', 'report.md', 'project.json']) {
    await cp(path.join(root, name), path.join(dir, name), { recursive: true });
  }
  await symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
  return dir;
}
function html(dir) {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: dir });
  return spawnSync(process.execPath, ['scripts/html.mjs'], { cwd: dir, encoding: 'utf8' });
}

test('published sample embeds assets, resolves every reference type, and presents submission metadata', async t => {
  const dir = await workspace(t);
  const result = html(dir);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /not found|Unknown cross-reference/);
  const output = await readFile(path.join(dir, 'build/report.html'), 'utf8');
  for (const [id, label] of [['fig:overview', 'Figure 1'], ['fig:pipeline', 'Figure 2'], ['tbl:stages', 'Table 1'],
    ['eq:coverage', 'Equation 1'], ['sec:reproducibility', 'Section 2.1'], ['lst:build', 'Listing 1']]) {
    assert.ok(output.includes(`href="#${id}">${label}</a>`), `${id} resolves`);
    assert.ok(output.includes(`id="${id}"`), `${id} has a target`);
  }
  assert.match(output, /<figcaption>Figure 2: The report publishing pipeline/);
  assert.match(output, /<caption>Table 1: Responsibilities/);
  assert.match(output, /Listing 1: Build and inspect/);
  assert.match(output, /aria-label="Equation 1">\(1\)/);
  assert.match(output, /<h3 data-number="2.1" id="sec:reproducibility"/);
  for (const id of ['references', 'appendix-build-pipeline']) {
    assert.match(output, new RegExp(`<h2 class="unnumbered" id="${id}">`));
  }
  const project = JSON.parse(await readFile(path.join(dir, 'project.json'), 'utf8'));
  const title = output.match(/<header class="title-page">([\s\S]*?)<\/header>/)[1];
  for (const field of ['title', 'subtitle', 'author', 'module', 'abstract']) assert.ok(title.replace(/\s+/g, ' ').includes(project.meta[field]));
  assert.match(output, /<nav id="TOC"[\s\S]*?<a href="#sec:workflow"/);
  assert.match(output, /@page :first.*content: none/);
  assert.match(output, /@bottom-center \{ content: counter\(page\)/);
  assert.match(title, /7 November 2026/);
  assert.doesNotMatch(output, /<link[^>]+stylesheet|src="(?:figures\/|https?:)/);
  assert.equal((output.match(/src="data:image\/svg\+xml;base64,/g) ?? []).length, 2);
  assert.match(await readFile(path.join(dir, 'build/figures/pipeline.svg'), 'utf8'), /<svg/);
  assert.match(output, /class="citation"/);
  assert.match(output, /id="ref-pandoc"/);
});

test('TOC defaults on and can be disabled; optional title fields can be omitted', async t => {
  const dir = await workspace(t);
  const file = path.join(dir, 'project.json');
  const project = JSON.parse(await readFile(file, 'utf8'));
  delete project.meta.toc;
  await writeFile(file, JSON.stringify(project));
  assert.equal(html(dir).status, 0);
  assert.match(await readFile(path.join(dir, 'build/report.html'), 'utf8'), /<nav id="TOC"[\s\S]*<a href="#sec:workflow"/);
  project.meta.toc = false;
  delete project.meta.subtitle; delete project.meta.module;
  await writeFile(file, JSON.stringify(project));
  assert.equal(html(dir).status, 0);
  const output = await readFile(path.join(dir, 'build/report.html'), 'utf8');
  assert.doesNotMatch(output, /<nav id="TOC"|class="subtitle"|class="module"/);
});

test('unknown cross-reference fails publication before citeproc', async t => {
  const dir = await workspace(t);
  const file = path.join(dir, 'report.md');
  await writeFile(file, (await readFile(file, 'utf8')) + '\nSee [@fig:missing].\n');
  const result = html(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown cross-reference id: fig:missing/);
  assert.doesNotMatch(result.stderr, /citation fig:missing not found/);
});

test('Mermaid syntax errors identify the manuscript line and fail assembly', async t => {
  const dir = await workspace(t);
  await writeFile(path.join(dir, 'report.md'), '## Example\n\n```mermaid\nflowchart TD\n A[broken\n```\n<!-- GENERATED_BUILD_APPENDIX -->');
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /report.md:5:\d+: Mermaid:/);
  assert.match(result.stderr, /A\[broken/);
});

test('plain Mermaid fences render while fenced documentation remains literal', async t => {
  const dir = await workspace(t);
  const source = '````markdown\n```mermaid\ninvalid\n```\n````\n\n```mermaid\nflowchart LR\n A --> B\n```';
  const output = await renderMermaid(source, { buildDir: dir });
  assert.match(output, /```mermaid\ninvalid\n```/);
  assert.match(output, /!\[Diagram\]\(figures\/diagram-1.svg\)\{#fig:diagram-1\}/);
  assert.match(await readFile(path.join(dir, 'figures/diagram-1.svg'), 'utf8'), /<svg/);
});

test('word count measures body prose and headings, excluding publishing material', () => {
  const result = spawnSync(process.execPath, ['scripts/wordcount.mjs', 'test/fixtures/wordcount.md'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  // Original prose (7), heading (3), See Figure 1 and (4), rendered citation (2).
  assert.match(result.stdout, /Word count: 16 \(14 excluding in-text citations\) — 106.7% of 15/);
  assert.match(result.stderr, /word limit exceeded by 1 words \(including in-text citations\)/);
});

test('stylesheet font declarations preserve the 11pt minimum', async () => {
  const ast = cssTree.parse(await readFile(path.join(root, 'styles/report.css'), 'utf8'));
  let checked = 0;
  cssTree.walk(ast, {
    visit: 'Declaration',
    enter(declaration) {
      if (!['font', 'font-size'].includes(declaration.property)) return;
      const dimensions = [];
      cssTree.walk(declaration.value, node => { if (node.type === 'Dimension' || node.type === 'Percentage') dimensions.push(node); });
      const size = dimensions[0]; // In font shorthand, the size precedes line-height.
      assert.ok(size, `Explicit, measurable font size required: ${cssTree.generate(declaration)}`);
      const value = Number(size.value);
      const points = { pt: value, px: value * 72 / 96, em: value * 12, rem: value * 12 }[size.unit];
      assert.ok(points >= 11, `Below 11pt or unsupported size: ${cssTree.generate(declaration)}`);
      if (['em', 'rem'].includes(size.unit)) assert.ok(value >= 1, 'Relative text sizes must be at least 1em/rem');
      checked++;
    },
  });
  assert.ok(checked > 0);
});

test('a report without the generated appendix still writes the reference index', async t => {
  const dir = await workspace(t);
  const file = path.join(dir, 'report.md');
  await writeFile(file, (await readFile(file, 'utf8')).split('## Appendix: Build pipeline')[0]);
  const result = html(dir);
  assert.equal(result.status, 0, result.stderr);
  const output = await readFile(path.join(dir, 'build/report.html'), 'utf8');
  assert.doesNotMatch(output, /Appendix: Build pipeline|Citation keys/);
  assert.match(await readFile(path.join(dir, 'build/reference-index.md'), 'utf8'), /### Citation keys/);
});

test('listing captions retain Markdown inlines, including an empty caption', async t => {
  const dir = await workspace(t);
  await writeFile(path.join(dir, 'report.md'), '## Body\n\n``` {#lst:formatted caption="Use `code` and *emphasis*"}\nhello\n```\n\n``` {#lst:empty}\nworld\n```');
  const result = html(dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(path.join(dir, 'build/report.html'), 'utf8'), /Listing 1: Use <code>code<\/code> and <em>emphasis<\/em>/);
});

test('non-ISO dates display unchanged', async t => {
  const dir = await workspace(t);
  const file = path.join(dir, 'project.json');
  const project = JSON.parse(await readFile(file, 'utf8'));
  project.meta.date = 'Michaelmas term 2026';
  await writeFile(file, JSON.stringify(project));
  assert.equal(html(dir).status, 0);
  assert.match(await readFile(path.join(dir, 'build/report.html'), 'utf8'), /class="date">Michaelmas term 2026<\/p>/);
});

test('template accepts standard Pandoc hooks and omits an absent title', async t => {
  const dir = await workspace(t);
  for (const [file, contents] of [['head.html', '<meta name="custom-hook" content="present">'],
    ['before.html', '<aside>Before hook</aside>'], ['after.html', '<aside>After hook</aside>']]) {
    await writeFile(path.join(dir, file), contents);
  }
  const output = execFileSync('pandoc', ['--standalone', '--template', 'templates/report.html',
    '-H', 'head.html', '-B', 'before.html', '-A', 'after.html'], { cwd: dir, input: 'Body prose.', encoding: 'utf8' });
  assert.match(output, /<head>[\s\S]*custom-hook[\s\S]*<\/head>/);
  assert.match(output, /<body>\s*<aside>Before hook<\/aside>[\s\S]*<main><p>Body prose\.<\/p><\/main>\s*<aside>After hook<\/aside>/);
  assert.doesNotMatch(output, /<h1/);
});
