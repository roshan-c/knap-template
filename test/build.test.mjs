import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { APPENDIX_MARKER, replaceAppendix } from '../scripts/assemble.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('build assembles metadata, bibliography placement, and exactly one appendix', async () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
  const report = await readFile(new URL('../build/report.md', import.meta.url), 'utf8');
  const inventory = await readFile(new URL('../build/reference-index.md', import.meta.url), 'utf8');
  const project = JSON.parse(await readFile(new URL('../project.json', import.meta.url), 'utf8'));
  const frontmatter = report.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(frontmatter, 'YAML front matter is delimited at the start');
  assert.match(frontmatter[1], /^title: .+/m);
  assert.match(frontmatter[1], /^abstract: .+/m);
  assert.match(frontmatter[1], /^references:\n/m);
  assert.ok(frontmatter[1].includes(project.meta.title));
  assert.ok(frontmatter[1].includes(project.meta.abstract));
  for (const reference of project.references) assert.ok(frontmatter[1].includes(`id: "${reference.id}"`));
  const body = report.slice(frontmatter[0].length);
  assert.doesNotMatch(body, /^# /m, 'title belongs only in metadata');
  assert.match(body, /## References \{.unnumbered\}\n\n::: \{#refs\}\n:::\n\n## Appendix: Build pipeline/);
  assert.equal(body.split('## Appendix: Build pipeline').length - 1, 1);
  assert.equal(body.split('### Citation keys').length - 1, 1);
  assert.equal(body.split('### Pipeline').length - 1, 1);
  assert.ok(!body.includes(APPENDIX_MARKER));
  assert.equal(body.split('## Appendix: Build pipeline')[1].replace(/^ \{.unnumbered\}/, '').trim(), inventory.replace(/^# Reference Index\n\n/, '').trim());
});

test('appendix insertion preserves replacement metacharacters and surrounding manuscript', () => {
  const inventory = "Citation $& costs $$; prefix $` and suffix $' stay literal.";
  assert.equal(replaceAppendix(`Before\n${APPENDIX_MARKER}\nAfter`, inventory), `Before\n${inventory}\nAfter`);
});

test('assembly allows no appendix and rejects duplicate markers', () => {
  assert.equal(replaceAppendix('No marker', 'inventory'), 'No marker');
  assert.throws(() => replaceAppendix(`${APPENDIX_MARKER}\n${APPENDIX_MARKER}`, 'inventory'), /report\.md contains 2.*expected at most one/);
});
