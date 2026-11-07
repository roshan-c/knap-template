import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { render } from 'pele';

// Track all fences so mermaid examples inside longer fences stay literal.
export async function renderMermaid(source, { buildDir, sourceFile = 'report.md' }) {
  const lines = source.split('\n');
  const output = [];
  const used = new Set();
  let index = 0;
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!open) { output.push(lines[i]); continue; }
    let end = i + 1;
    const close = new RegExp(`^ {0,3}${open[1][0]}{${open[1].length},}\\s*$`);
    while (end < lines.length && !close.test(lines[end])) end++;
    const info = open[2].trim();
    if (!(info === 'mermaid' || /^\{.*\.mermaid(?:\s|\})/.test(info))) {
      output.push(...lines.slice(i, Math.min(end + 1, lines.length))); i = end; continue;
    }
    if (end === lines.length) throw new Error(`${sourceFile}:${i + 1}: unclosed Mermaid fence`);
    index++;
    const id = info.match(/#(fig:[\w.-]+)/)?.[1] ?? `fig:diagram-${index}`;
    const filename = `${id.slice(4)}.svg`;
    if (used.has(filename)) throw new Error(`${sourceFile}:${i + 1}: duplicate Mermaid id ${id}`);
    used.add(filename);
    const caption = info.match(/caption\s*=\s*(?:"([^"]*)"|'([^']*)')/);
    const label = (caption?.[1] ?? caption?.[2] ?? 'Diagram').replace(/([\\\[\]])/g, '\\$1');
    try {
      const { svg } = render(lines.slice(i + 1, end).join('\n'));
      await mkdir(path.join(buildDir, 'figures'), { recursive: true });
      await writeFile(path.join(buildDir, 'figures', filename), svg);
    } catch (error) {
      throw new Error(`${sourceFile}:${i + 1 + (error.line ?? 1)}:${error.column ?? 1}: Mermaid: ${error.message}\n${error.snippet ?? ''}`);
    }
    output.push(`![${label}](figures/${filename}){#${id}}`);
    i = end;
  }
  return output.join('\n');
}
