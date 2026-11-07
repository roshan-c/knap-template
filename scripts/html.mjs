import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { printWordCount, renderingFilters } from './wordcount.mjs';
const project = JSON.parse(readFileSync('project.json', 'utf8'));
// Format only the presentation value; project.json and assembled metadata stay ISO.
const date = project.meta.date;
const displayDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
  : date;
execFileSync('pandoc', ['build/report.md', ...(project.meta.toc === false ? [] : ['--toc']), ...renderingFilters,
  ...(displayDate ? ['--metadata', `date=${displayDate}`] : []), '--standalone', '--mathml',
  '--number-sections', '--template', 'templates/report.html', '--css', 'styles/report.css',
  '--embed-resources', '--resource-path=build:.', '-o', 'build/report.html'], { stdio: 'inherit' });
console.log('Wrote build/report.html');
printWordCount('build/report.md');
