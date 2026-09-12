import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BUILD_DIR = path.join(ROOT, 'build');

// Safety guard: only ever remove the build directory in this project root.
if (path.basename(BUILD_DIR) !== 'build' || !BUILD_DIR.startsWith(ROOT)) {
  console.error(`Refusing to remove unexpected path: ${BUILD_DIR}`);
  process.exit(1);
}

const exists = await stat(BUILD_DIR).then(
  () => true,
  () => false,
);

if (exists) {
  await rm(BUILD_DIR, { recursive: true, force: true });
  console.log(`Removed ${BUILD_DIR}`);
} else {
  console.log(`Nothing to clean (${BUILD_DIR} does not exist)`);
}