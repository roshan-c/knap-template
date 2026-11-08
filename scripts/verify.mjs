import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countPdfPages } from './pdf-pages.mjs';
import { measureWordCount } from './wordcount.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PDF_FILE = path.join(ROOT, 'build', 'report.pdf');
const JSON_MODE = process.argv.includes('--json');

const BROWSER_HINT = 'No Chromium-based browser found. Install Chrome, Chromium, Edge or Brave, set CHROME_PATH, or run: npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer';

// Pandoc diagnostics that mean the published output is broken, even when Pandoc
// itself exits successfully.
const CRITICAL_DIAGNOSTICS = [
  /Citeproc:.*not found/i,
  /citation .* not found/i,
  /Could not find bibliography/i,
  /Unknown cross-reference/i,
  /Unresolved cross-references/i,
  /Duplicate cross-reference id/i,
  /Duplicate identifier/i,
  /Could not fetch resource/i,
  /Error running filter/i,
];

// Browser chatter, not a report problem.
const HARMLESS_DIAGNOSTICS = [
  /^\d+ bytes written to file /i,
  /^\[?DevTools listening/i,
  /^Fontconfig warning:/i,
];

const errors = [];
const warnings = [];
const seenErrors = new Set();
const seenWarnings = new Set();
const steps = [];

function addError(message) {
  if (seenErrors.has(message)) return;
  seenErrors.add(message);
  errors.push(message);
}

function addWarning(message) {
  if (seenWarnings.has(message)) return;
  seenWarnings.add(message);
  warnings.push(message);
}

function positiveLimit(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function relay(text) {
  if (!text) return;
  process.stderr.write(text.endsWith('\n') ? text : `${text}\n`);
}

function scanDiagnostics(stderr, { collectWarnings }) {
  for (const raw of stderr.split('\n')) {
    const diagnostic = raw.trim();
    if (!diagnostic) continue;
    if (HARMLESS_DIAGNOSTICS.some(pattern => pattern.test(diagnostic))) continue;
    if (CRITICAL_DIAGNOSTICS.some(pattern => pattern.test(diagnostic))) addError(diagnostic);
    else if (collectWarnings) addWarning(diagnostic);
  }
}

function runStep(name, script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  const status = result.status ?? 1;
  const ok = status === 0;
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';

  // In JSON mode every child process output belongs on stderr.
  if (JSON_MODE) {
    relay(stdout);
    relay(stderr);
  } else if (!ok) {
    relay(stdout);
    relay(stderr);
  }

  if (!ok) {
    if (name === 'pdf' && /No Chromium-based browser/i.test(stderr)) addError(BROWSER_HINT);
    else addError(`${name} build failed${result.signal ? ` (signal ${result.signal})` : ` (exit code ${status})`}`);
  }
  // The browser writes platform chatter to stderr; only Pandoc/build warnings matter.
  scanDiagnostics(stderr, { collectWarnings: name !== 'pdf' });

  steps.push({ name, ok, status, stderr });
  return result;
}

// ---------------------------------------------------------------------------
// Full build: render -> HTML -> PDF. Later steps depend on earlier output.
// ---------------------------------------------------------------------------
const render = runStep('render', 'scripts/build.mjs');

let htmlResult = null;
if (render.status === 0) htmlResult = runStep('html', 'scripts/html.mjs');
else steps.push({ name: 'html', ok: false, skipped: 'render failed' });

let pdfResult = null;
if (htmlResult?.status === 0) pdfResult = runStep('pdf', 'scripts/pdf.mjs');
else steps.push({ name: 'pdf', ok: false, skipped: htmlResult ? 'HTML build failed' : 'render failed' });

// ---------------------------------------------------------------------------
// Word count from the assembled document, through the same filters as HTML.
// ---------------------------------------------------------------------------
let words = 0;
let wordsExcludingCitations = 0;
if (render.status === 0) {
  try {
    const measured = measureWordCount(path.join(ROOT, 'build', 'report.md'), { cwd: ROOT });
    words = measured.words;
    wordsExcludingCitations = measured.wordsExcludingCitations;
  } catch (error) {
    addError(`Word count failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Page count from the printed PDF.
// ---------------------------------------------------------------------------
let pages = null;
if (pdfResult?.status === 0) {
  try {
    pages = countPdfPages(await readFile(PDF_FILE));
    if (pages === null) addError('Could not read a page count from build/report.pdf.');
  } catch (error) {
    addError(`Could not read build/report.pdf: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Limits from project.json meta.
// ---------------------------------------------------------------------------
let wordLimit = null;
let pageLimit = null;
try {
  const project = JSON.parse(await readFile(path.join(ROOT, 'project.json'), 'utf8'));
  wordLimit = positiveLimit(project.meta?.wordLimit);
  pageLimit = positiveLimit(project.meta?.pageLimit);
} catch (error) {
  addError(`Could not read project.json limits: ${error.message}`);
}

if (wordLimit && words > wordLimit) addError(`Word limit exceeded: ${words} words (limit ${wordLimit}).`);
if (pageLimit && pages !== null && pages > pageLimit) addError(`Page limit exceeded: ${pages} pages (limit ${pageLimit}).`);

const pass = errors.length === 0;
const report = {
  pass,
  pages,
  words,
  wordsExcludingCitations,
  pageLimit,
  wordLimit,
  errors,
  warnings,
};

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
if (JSON_MODE) {
  process.stdout.write(`${JSON.stringify(report)}\n`);
} else {
  const lines = [];
  for (const step of steps) {
    if (step.skipped) lines.push(`✗ ${step.name}: skipped (${step.skipped})`);
    else lines.push(`${step.ok ? '✓' : '✗'} ${step.name}`);
  }

  if (pages === null) lines.push('✗ pages: unavailable');
  else {
    const limitText = pageLimit ? `limit ${pageLimit}` : 'limit: none';
    lines.push(`${pageLimit && pages > pageLimit ? '✗' : '✓'} pages: ${pages} (${limitText})`);
  }

  if (render.status !== 0) lines.push('✗ words: unavailable');
  else {
    const limitText = wordLimit ? `limit ${wordLimit}` : 'limit: none';
    lines.push(`${wordLimit && words > wordLimit ? '✗' : '✓'} words: ${words} (${wordsExcludingCitations} excluding in-text citations; ${limitText})`);
  }

  for (const warning of warnings) lines.push(`! warning: ${warning}`);
  if (errors.length === 0) lines.push('✓ no build errors');
  else for (const error of errors) lines.push(`✗ ${error}`);
  lines.push(pass ? '✓ verify passed' : `✗ verify failed with ${errors.length} error${errors.length === 1 ? '' : 's'}`);

  process.stdout.write(`${lines.join('\n')}\n`);
}

process.exitCode = pass ? 0 : 1;
