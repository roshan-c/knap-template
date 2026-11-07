import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaceAppendix } from './assemble.mjs';
import { createEngine, standardFilters } from 'knap';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEMPLATE_DIR = path.join(ROOT, 'templates');
const BUILD_DIR = path.join(ROOT, 'build');

// ---------------------------------------------------------------------------
// Load data and create the Knap engine.
// ---------------------------------------------------------------------------
const project = JSON.parse(await readFile(path.join(ROOT, 'project.json'), 'utf8'));
const engine = createEngine({ filters: standardFilters });

// ---------------------------------------------------------------------------
// Render a template and report structured diagnostics on failure.
// ---------------------------------------------------------------------------
async function renderTemplate(name) {
  const templatePath = path.join(TEMPLATE_DIR, name);
  const template = await readFile(templatePath, 'utf8');
  const result = await engine.render(template, { variables: project });

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      const code = error.code ?? 'UNKNOWN';
      const line = error.line ?? '?';
      const column = error.column ?? '?';
      const message = error.message ?? String(error);
      console.error(
        `[render:${name}] ${path.basename(templatePath)}: error ${code} ` +
          `at line ${line}, column ${column}: ${message}`,
      );
    }
    process.exit(1);
  }

  for (const warning of result.warnings ?? []) {
    console.warn(`[render:${name}] warning: ${warning.message}`);
  }
  return result.output;
}

// ---------------------------------------------------------------------------
// Render both templates.
// ---------------------------------------------------------------------------
const frontmatter = (await renderTemplate('frontmatter.kmd')).trim();
const inventory = (await renderTemplate('reference-index.kmd')).trim();

// ---------------------------------------------------------------------------
// Assemble the manuscript: front matter + body with the generated section.
// ---------------------------------------------------------------------------
const source = await readFile(path.join(ROOT, 'report.md'), 'utf8');

let body;
try {
  body = replaceAppendix(source, inventory);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const report = `${frontmatter}\n\n${body}\n`;

// ---------------------------------------------------------------------------
// Write build artifacts.
// ---------------------------------------------------------------------------
await mkdir(BUILD_DIR, { recursive: true });
await writeFile(path.join(BUILD_DIR, 'report.md'), report);
await writeFile(
  path.join(BUILD_DIR, 'reference-index.md'),
  `# Reference Index\n\n${inventory}\n`,
);

console.log('Wrote build/report.md');
console.log('Wrote build/reference-index.md');