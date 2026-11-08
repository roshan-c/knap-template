import { constants, readdirSync } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, 'build', 'report.pdf');

// Puppeteer stores installs as <cache>/<product>/<platform>-<version>/<bundle>/.
// Sort by the version in the directory name so the newest install wins.
function versionDirectories(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const match = entry.name.match(/(\d+(?:\.\d+)+)/);
      return { name: entry.name, version: match ? match[1].split('.').map(Number) : [0] };
    })
    .sort((a, b) => {
      for (let i = 0; i < Math.max(a.version.length, b.version.length); i++) {
        const difference = (b.version[i] ?? 0) - (a.version[i] ?? 0);
        if (difference) return difference;
      }
      return 0;
    })
    .map(entry => entry.name);
}

function childDirectories(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

function puppeteerCandidates() {
  const cache = process.env.PUPPETEER_CACHE_DIR ?? path.join(os.homedir(), '.cache', 'puppeteer');
  const candidates = [];

  const shellRoot = path.join(cache, 'chrome-headless-shell');
  for (const platform of versionDirectories(shellRoot)) {
    const platformDirectory = path.join(shellRoot, platform);
    for (const bundle of childDirectories(platformDirectory)) {
      candidates.push(path.join(bundle, process.platform === 'win32'
        ? 'chrome-headless-shell.exe'
        : 'chrome-headless-shell'));
    }
  }

  const chromeRoot = path.join(cache, 'chrome');
  for (const platform of versionDirectories(chromeRoot)) {
    const platformDirectory = path.join(chromeRoot, platform);
    for (const bundle of childDirectories(platformDirectory)) {
      if (process.platform === 'darwin') {
        candidates.push(path.join(bundle, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'));
      } else {
        candidates.push(path.join(bundle, process.platform === 'win32' ? 'chrome.exe' : 'chrome'));
      }
    }
  }

  return candidates;
}

export function browserCandidates() {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(path.resolve(process.env.CHROME_PATH));
  // Tests and constrained machines can request only the explicit CHROME_PATH.
  const automatic = !process.env.KNAP_NO_BROWSER_SEARCH || process.env.KNAP_NO_BROWSER_SEARCH === '0';
  if (!automatic) return [...new Set(candidates)];

  candidates.push(...puppeteerCandidates());
  if (process.platform === 'darwin') {
    for (const base of ['/Applications', path.join(os.homedir(), 'Applications')]) {
      for (const [app, executable] of [
        ['Google Chrome', 'Google Chrome'], ['Chromium', 'Chromium'],
        ['Microsoft Edge', 'Microsoft Edge'], ['Brave Browser', 'Brave Browser'],
      ]) candidates.push(path.join(base, `${app}.app`, 'Contents', 'MacOS', executable));
    }
  }
  if (process.platform === 'win32') {
    for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)) {
      for (const executable of ['Google/Chrome/Application/chrome.exe', 'Chromium/Application/chrome.exe',
        'Microsoft/Edge/Application/msedge.exe', 'BraveSoftware/Brave-Browser/Application/brave.exe']) {
        candidates.push(path.join(base, executable));
      }
    }
  }
  const commands = process.platform === 'win32'
    ? ['chrome.exe', 'chromium.exe', 'msedge.exe', 'brave.exe']
    : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const directory of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const command of commands) candidates.push(path.resolve(directory, command));
  }
  return [...new Set(candidates)];
}

export async function findBrowser() {
  const tried = [];
  for (const candidate of browserCandidates()) {
    tried.push(candidate);
    try {
      await access(candidate, constants.X_OK);
      return { browser: candidate, tried };
    } catch { /* Continue through known locations. */ }
  }
  return { browser: undefined, tried };
}

export function missingBrowserMessage(tried) {
  return `No Chromium-based browser found. Install Chrome, Chromium, Edge or Brave, set CHROME_PATH to its executable, or fetch a headless browser with:\n  npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer\nTried:\n${tried.map(candidate => `  ${candidate}`).join('\n') || '  (no candidates)'}`;
}

export async function printPdf() {
  const { browser, tried } = await findBrowser();
  if (!browser) throw new Error(missingBrowserMessage(tried));
  await access(path.join(root, 'build', 'report.html'));
  await mkdir(path.dirname(output), { recursive: true });
  await rm(output, { force: true });
  const profile = await mkdtemp(path.join(os.tmpdir(), 'knap-pdf-'));
  try {
    console.log(`Printing with ${browser}`);
    await new Promise((resolve, reject) => {
      const child = spawn(browser, ['--headless', '--no-pdf-header-footer',
        `--user-data-dir=${profile}`, `--print-to-pdf=${output}`,
        pathToFileURL(path.join(root, 'build', 'report.html')).href], { stdio: 'inherit' });
      child.once('error', reject);
      child.once('close', (code, signal) => code === 0 ? resolve() : reject(
        new Error(`Browser failed (${signal ? `signal ${signal}` : `exit ${code}`}).`)));
    });
    const pdf = await readFile(output);
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Browser did not produce a valid PDF.');
    console.log('Wrote build/report.pdf');
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  printPdf().catch(error => {
    console.error(`[pdf] ${error.message}`);
    process.exitCode = 1;
  });
}
