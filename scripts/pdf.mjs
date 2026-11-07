import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, 'build', 'report.pdf');

function browserCandidates() {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(path.resolve(process.env.CHROME_PATH));
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

async function main() {
  const tried = [];
  let browser;
  for (const candidate of browserCandidates()) {
    tried.push(candidate);
    try {
      await access(candidate, constants.X_OK);
      browser = candidate;
      break;
    } catch { /* Continue through known locations. */ }
  }
  if (!browser) {
    throw new Error(`No Chromium-based browser found. Install Chrome, Chromium, Edge or Brave, or set CHROME_PATH to its executable.\nTried:\n${tried.map(candidate => `  ${candidate}`).join('\n') || '  (no candidates)'}`);
  }
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

main().catch(error => {
  console.error(`[pdf] ${error.message}`);
  process.exitCode = 1;
});
