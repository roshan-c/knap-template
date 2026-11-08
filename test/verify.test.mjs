import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countPdfPages } from '../scripts/pdf-pages.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

// Build a genuinely valid PDF with a page tree and correct xref offsets.
function minimalPdf(pageCount) {
  const catalog = '<< /Type /Catalog /Pages 2 0 R >>';
  const kids = Array.from({ length: pageCount }, (_, index) => `${index + 3} 0 R`).join(' ');
  const tree = `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`;
  const pages = Array.from(
    { length: pageCount },
    () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
  );
  const objects = [catalog, tree, ...pages];

  let body = '%PDF-1.4\n';
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

// Run verify in an isolated report clone; never mutate the owner's sources.
async function workspace(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'verify-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const name of ['scripts', 'templates', 'filters', 'styles', 'figures', 'report.md', 'project.json']) {
    await cp(path.join(root, name), path.join(dir, name), { recursive: true });
  }
  await symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
  return dir;
}

function verify(dir, env = {}) {
  return spawnSync(process.execPath, ['scripts/verify.mjs', '--json'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

// JSON mode must emit exactly one parseable object and nothing else on stdout.
function parseOnlyJson(stdout) {
  const trimmed = stdout.trim();
  assert.ok(trimmed.startsWith('{'), `stdout starts with JSON: ${JSON.stringify(stdout.slice(0, 120))}`);
  assert.ok(trimmed.endsWith('}'), 'stdout ends with the JSON object');
  return JSON.parse(trimmed);
}

test('PDF page counter reads page objects and ignores the page tree', () => {
  assert.equal(countPdfPages(minimalPdf(1)), 1);
  assert.equal(countPdfPages(minimalPdf(3)), 3);
  assert.equal(countPdfPages(Buffer.from('not a PDF')), null);
});

test('verify fails and reports both limits with one JSON object on stdout', async t => {
  const dir = await workspace(t);
  const projectFile = path.join(dir, 'project.json');
  const project = JSON.parse(await readFile(projectFile, 'utf8'));
  project.meta.wordLimit = 1;
  project.meta.pageLimit = 1;
  await writeFile(projectFile, JSON.stringify(project));

  const fixture = path.join(dir, 'two-pages.pdf');
  await writeFile(fixture, minimalPdf(2));
  const browser = path.join(dir, 'fake-browser');
  await writeFile(browser, `#!/bin/sh
for argument in "$@"; do
  case "$argument" in
    --print-to-pdf=*) target="\${argument#--print-to-pdf=}" ;;
  esac
done
cp "$FAKE_PDF" "$target"
`);
  await chmod(browser, 0o755);

  const result = verify(dir, {
    CHROME_PATH: browser,
    KNAP_NO_BROWSER_SEARCH: '1',
    FAKE_PDF: fixture,
  });
  assert.equal(result.status, 1, result.stderr);
  const report = parseOnlyJson(result.stdout);
  assert.deepEqual(Object.keys(report), ['pass', 'pages', 'words', 'wordsExcludingCitations',
    'pageLimit', 'wordLimit', 'errors', 'warnings']);
  assert.equal(report.pass, false);
  assert.equal(report.pages, 2);
  assert.equal(report.pageLimit, 1);
  assert.equal(report.wordLimit, 1);
  assert.ok(report.words > 1);
  assert.ok(report.errors.some(error => /^Page limit exceeded: 2 pages \(limit 1\)\.$/.test(error)));
  assert.ok(report.errors.some(error => /^Word limit exceeded: \d+ words \(limit 1\)\.$/.test(error)));
});

test('verify reports unavailable pages and an install hint when no browser exists', async t => {
  const dir = await workspace(t);
  const result = verify(dir, {
    CHROME_PATH: path.join(dir, 'missing-browser'),
    KNAP_NO_BROWSER_SEARCH: '1',
  });
  assert.equal(result.status, 1, result.stderr);
  const report = parseOnlyJson(result.stdout);
  assert.equal(report.pass, false);
  assert.equal(report.pages, null);
  assert.ok(report.errors.some(error => /No Chromium-based browser found/.test(error)));
  assert.ok(report.errors.some(error => /@puppeteer\/browsers install chrome-headless-shell@stable/.test(error)));
});

test('verify treats a missing citeproc citation as an error', async t => {
  const dir = await workspace(t);
  const manuscript = path.join(dir, 'report.md');
  await writeFile(manuscript, `${await readFile(manuscript, 'utf8')}\nSee [@missing-reference].\n`);
  const result = verify(dir, {
    CHROME_PATH: path.join(dir, 'missing-browser'),
    KNAP_NO_BROWSER_SEARCH: '1',
  });
  assert.equal(result.status, 1, result.stderr);
  const report = parseOnlyJson(result.stdout);
  assert.equal(report.pass, false);
  assert.ok(report.errors.some(error => /Citeproc:.*not found/i.test(error)), JSON.stringify(report.errors));
});
