// Remove the last build (index.html and assets/ at the repository root) so no stale hashed file is left behind.
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(join(root, 'assets'), { recursive: true, force: true });
rmSync(join(root, 'index.html'), { force: true });
