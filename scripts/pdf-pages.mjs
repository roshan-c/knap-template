import { inflateSync } from 'node:zlib';

// /Type /Pages is the tree node, not a page; the trailing boundary excludes it.
const PAGE_OBJECT = /\/Type\s*\/Page\b/g;
const PAGE_COUNT = /\/Count\s+(\d+)/g;

function countPageObjects(text) {
  return (text.match(PAGE_OBJECT) ?? []).length;
}

// Chromium writes page objects in plain form, but compressed object streams are
// legal too. Try to inflate every stream and look inside.
function decompressedStreams(buffer) {
  const text = buffer.toString('latin1');
  const streams = [];
  const opening = /stream\r?\n/g;
  let match;
  while ((match = opening.exec(text))) {
    const start = match.index + match[0].length;
    const end = text.indexOf('endstream', start);
    if (end === -1) break;
    try {
      streams.push(inflateSync(buffer.subarray(start, end)));
    } catch {
      // Not a Flate stream, or not a stream that inflates on its own.
    }
    opening.lastIndex = end;
  }
  return streams;
}

function largestPageCount(text) {
  let count = null;
  for (const match of text.matchAll(PAGE_COUNT)) {
    const value = Number(match[1]);
    if (Number.isInteger(value) && (count === null || value > count)) count = value;
  }
  return count;
}

/**
 * Count pages in a PDF without external tools.
 *
 * Counts /Type /Page objects first, then searches compressed object streams,
 * then falls back to the largest /Count entry in a page tree.
 * Returns null when the document has no recognisable page information.
 */
export function countPdfPages(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const text = buffer.toString('latin1');
  const direct = countPageObjects(text);
  if (direct > 0) return direct;
  for (const stream of decompressedStreams(buffer)) {
    const count = countPageObjects(stream.toString('latin1'));
    if (count > 0) return count;
  }
  return largestPageCount(text);
}
