import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const renderingFilters = ['--lua-filter', 'filters/crossref.lua',
  '--citeproc', '--csl', 'styles/hull-harvard.csl'];

// Keep whitespace and punctuation intact, including rendered citation inlines.
function inlineText(nodes) {
  if (Array.isArray(nodes)) return nodes.map(inlineText).join('');
  if (!nodes || typeof nodes !== 'object') return '';
  if (nodes.t === 'Str') return nodes.c;
  if (['Space', 'SoftBreak', 'LineBreak'].includes(nodes.t)) return ' ';
  if (['Code', 'Math', 'RawInline'].includes(nodes.t)) return '';
  if (['Link', 'Image', 'Span'].includes(nodes.t)) return inlineText(nodes.c[1]);
  if (nodes.t === 'Cite') return inlineText(nodes.c[1]);
  return inlineText(nodes.c);
}

export function countWords(document, { includeCitations = true } = {}) {
  const text = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (['CodeBlock', 'Code', 'Math', 'Figure', 'Table', 'Image', 'RawBlock', 'RawInline'].includes(node.t)) return;
    if (node.t === 'Cite') { if (includeCitations) text.push(inlineText(node.c[1])); return; }
    if (node.t === 'Div' && (node.c[0][0] === 'refs' || node.c[0][1].includes('listing'))) return;
    if (node.t === 'Span' && node.c[0][1].includes('equation-number')) return;
    if (node.t === 'Str') { text.push(node.c); return; }
    visit(node.c);
  }
  let excludedLevel;
  for (const block of document.blocks) {
    if (block.t === 'Header') {
      const title = inlineText(block.c[2]).trim();
      if (title === 'References' || title.startsWith('Appendix')) { excludedLevel = block.c[0]; continue; }
      if (excludedLevel && block.c[0] <= excludedLevel) excludedLevel = undefined;
    }
    if (!excludedLevel) visit(block);
  }
  return (text.join(' ').match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? []).length;
}

export function measureWordCount(file, { cwd } = {}) {
  const document = JSON.parse(execFileSync('pandoc', [file, ...renderingFilters, '-t', 'json'], { encoding: 'utf8', ...(cwd ? { cwd } : {}) }));
  const words = countWords(document);
  const wordsExcludingCitations = countWords(document, { includeCitations: false });
  const limit = Number(inlineText(document.meta.wordLimit?.c));
  return { words, wordsExcludingCitations, limit: Number.isFinite(limit) && limit > 0 ? limit : null };
}

export function printWordCount(file) {
  const { words, wordsExcludingCitations, limit } = measureWordCount(file);
  console.log(`Word count: ${words} (${wordsExcludingCitations} excluding in-text citations)${limit ? ` — ${(words / limit * 100).toFixed(1)}% of ${limit}` : ''}`);
  if (limit && words > limit) console.warn(`Warning: word limit exceeded by ${words - limit} words (including in-text citations).`);
  return words;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  printWordCount(process.argv[2] ?? 'build/report.md');
}
