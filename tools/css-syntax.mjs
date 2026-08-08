import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'css-tree';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, '..');

function lineAndColumn(source, offset) {
  const before = source.slice(0, Math.max(0, Number(offset) || 0));
  const lines = before.split(/\r?\n/);
  return { line:lines.length, column:lines.at(-1).length + 1 };
}

export function extractInlineStylesheetSources(html, file = 'index.html') {
  const sources = [];
  const pattern = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
  for (const match of html.matchAll(pattern)) {
    const css = match[1];
    const contentOffset = match.index + match[0].indexOf(css);
    const prefix = html.slice(0, contentOffset);
    const linePrefix = prefix.slice(prefix.lastIndexOf('\n') + 1);
    sources.push({
      file,
      css,
      lineOffset:prefix.split(/\r?\n/).length - 1,
      columnOffset:linePrefix.length
    });
  }
  return sources;
}

export function trackedStylesheetSources(root = REPO_ROOT) {
  const files = execFileSync('git', ['-C', root, 'ls-files', '--', '*.css'], { encoding:'utf8' })
    .split(/\r?\n/)
    .map(file => file.trim())
    .filter(Boolean);
  return files.map(file => ({ file, css:readFileSync(join(root, file), 'utf8'), lineOffset:0, columnOffset:0 }));
}

export function shippedStylesheetSources(root = REPO_ROOT) {
  const htmlPath = join(root, 'index.html');
  return [
    ...extractInlineStylesheetSources(readFileSync(htmlPath, 'utf8'), 'index.html'),
    ...trackedStylesheetSources(root)
  ];
}

export function assertCssSyntax(sources) {
  const failures = [];
  for (const source of sources) {
    try {
      parse(source.css, {
        positions:true,
        onParseError(error) { throw error; }
      });
    } catch (error) {
      const relative = lineAndColumn(source.css, error.offset);
      const line = Number(error.line) || relative.line;
      const column = Number(error.column) || relative.column;
      const adjustedLine = (source.lineOffset || 0) + line;
      const adjustedColumn = line === 1 ? column + (source.columnOffset || 0) : column;
      failures.push(`${source.file}:${adjustedLine}:${adjustedColumn}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`CSS syntax check failed:\n- ${failures.join('\n- ')}`);
  return { files:sources.length };
}

export function checkShippedCss(root = REPO_ROOT) {
  return assertCssSyntax(shippedStylesheetSources(root));
}

if (resolve(process.argv[1] || '') === fileURLToPath(pathToFileURL(import.meta.url))) {
  const result = checkShippedCss();
  console.log(`CSS syntax OK: ${result.files} stylesheet${result.files === 1 ? '' : 's'}.`);
}
