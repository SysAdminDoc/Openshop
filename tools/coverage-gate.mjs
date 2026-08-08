import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(toolsDir, '..');
const coverageDir = join(rootDir, '.coverage-temp');
const summaryPath = join(rootDir, 'coverage', 'coverage-summary.json');
const vitestCli = join(rootDir, 'node_modules', 'vitest', 'vitest.mjs');

function mapShippedFileSummary() {
  if (!existsSync(summaryPath)) {
    throw new Error(`Coverage summary was not produced at ${summaryPath}`);
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const appEntry = Object.entries(summary).find(([file]) => {
    const normalized = file.replaceAll('\\', '/');
    return normalized.endsWith('/.coverage-temp/index.html');
  });
  if (!appEntry) {
    throw new Error('Coverage summary did not include the extracted shipped index.html script');
  }
  const [, appMetrics] = appEntry;
  writeFileSync(summaryPath, `${JSON.stringify({ total: appMetrics, 'index.html': appMetrics }, null, 2)}\n`);
}

rmSync(coverageDir, { recursive: true, force: true });
try {
  const result = spawnSync(process.execPath, [vitestCli, 'run', '--coverage'], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  mapShippedFileSummary();
} finally {
  rmSync(coverageDir, { recursive: true, force: true });
}
