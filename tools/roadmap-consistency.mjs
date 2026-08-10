import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function actionableRows(source) {
  return source.split(/\r?\n/)
    .map((line, lineNumber) => {
      const match = line.match(/^-\s+\[([ xX])\]\s+(?:(P[0-3])\s+—\s+)?(.+?)\s*$/);
      if (!match) return null;
      return {
        line:lineNumber + 1,
        checked:match[1].toLowerCase() === 'x',
        priority:match[2] || null,
        title:match[3].trim()
      };
    })
    .filter(Boolean);
}

function parityEntries(source) {
  const lines = source.split(/\r?\n/);
  const entries = [];
  for (let index = 0; index < lines.length; index++) {
    const heading = lines[index].match(/^###\s+(PS-\d+)\s+—\s+(.+?)\s*$/);
    if (!heading) continue;
    const body = [];
    for (let next = index + 1; next < lines.length && !/^###\s+PS-\d+\s+—\s+/.test(lines[next]); next++) {
      body.push(lines[next]);
    }
    const status = body.join('\n').match(/^Status:\s*(PLANNED|BLOCKED|VERIFIED)\s*$/m);
    entries.push({
      id:heading[1],
      title:heading[2].trim(),
      line:index + 1,
      status:status?.[1] || null,
      body:body.join('\n')
    });
  }
  return entries;
}

function duplicateValues(values) {
  const counts = new Map();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts].filter(([, count]) => count > 1).map(([value]) => value);
}

export function validateRoadmapConsistency(roadmap, parity) {
  const failures = [];
  const roadmapHeader = roadmap.split(/^##\s+/m, 2)[0];
  const active = actionableRows(roadmap);
  const checked = active.filter(row => row.checked);
  const actionable = active.filter(row => !row.checked);
  const duplicateActive = duplicateValues(actionable.map(row => row.title));
  const entries = parityEntries(parity);
  const duplicateParityIds = duplicateValues(entries.map(entry => entry.id));
  const statusCounts = Object.fromEntries(['PLANNED', 'BLOCKED', 'VERIFIED'].map(status => [
    status,
    entries.filter(entry => entry.status === status).length
  ]));

  if (checked.length) failures.push(`active roadmap contains checked-off rows at ${checked.map(row => row.line).join(', ')}`);
  if (duplicateActive.length) failures.push(`active roadmap contains duplicate items: ${duplicateActive.join(', ')}`);
  if (!/ROADMAP\.md[\s\S]{0,160}(?:single|sole) actionable source/i.test(roadmap)) {
    failures.push('ROADMAP.md does not declare itself the single actionable source');
  }
  if (!entries.length) failures.push('parity ledger has no PS entries');
  if (duplicateParityIds.length) failures.push(`parity ledger contains duplicate IDs: ${duplicateParityIds.join(', ')}`);
  const missingStatus = entries.filter(entry => !entry.status);
  if (missingStatus.length) failures.push(`parity entries have no valid status: ${missingStatus.map(entry => entry.id).join(', ')}`);
  if (statusCounts.PLANNED > 0 && /\b(?:fully\s+)?drained\b|\broadmap\s+is\s+empty\b/i.test(roadmapHeader)) {
    failures.push('ROADMAP.md claims the parity work is drained while PLANNED parity entries remain');
  }
  if (statusCounts.PLANNED > 0 && !/historical[\s\S]{0,180}(?:ledger|evidence)[\s\S]{0,180}(?:ROADMAP\.md|active engineering)/i.test(parity)) {
    failures.push('parity PLANNED entries are not explicitly marked as historical evidence');
  }

  const declaredActive = roadmap.match(/^\s*(?:Active|Actionable)\s+items?\s*:\s*(\d+)\s*$/im);
  if (declaredActive && Number(declaredActive[1]) !== actionable.length) {
    failures.push(`roadmap active-item total is ${declaredActive[1]}, but ${actionable.length} actionable rows exist`);
  }
  const declaredParityStatuses = [...parity.matchAll(/^\s*(PLANNED|BLOCKED|VERIFIED)\s*:\s*(\d+)\s*$/gm)];
  for (const [, status, count] of declaredParityStatuses) {
    if (Number(count) !== statusCounts[status]) {
      failures.push(`parity ${status} total is ${count}, but ${statusCounts[status]} entries exist`);
    }
  }

  if (failures.length) throw new Error(`Roadmap consistency failed:\n- ${failures.join('\n- ')}`);
  return {
    activeCount:actionable.length,
    checkedCount:checked.length,
    parityCount:entries.length,
    parityStatusCounts:statusCounts
  };
}

export function readRoadmapConsistency(rootPath = root) {
  return validateRoadmapConsistency(
    readFileSync(join(rootPath, 'ROADMAP.md'), 'utf8'),
    readFileSync(join(rootPath, 'PHOTOSHOP_PARITY_ROADMAP.md'), 'utf8')
  );
}

if (process.argv[1] && join(process.argv[1]) === join(fileURLToPath(import.meta.url))) {
  const result = readRoadmapConsistency();
  console.log(`Roadmap consistency OK: ${result.activeCount} actionable items, ${result.parityCount} historical parity entries (${result.parityStatusCounts.PLANNED} planned, ${result.parityStatusCounts.BLOCKED} blocked, ${result.parityStatusCounts.VERIFIED} verified).`);
}
