import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { readRoadmapConsistency, validateRoadmapConsistency } from '../tools/roadmap-consistency.mjs';

const root = join(process.cwd());

describe('roadmap consistency contract', () => {
  test('keeps the active tracker and historical parity ledger mechanically coherent', () => {
    const result = readRoadmapConsistency(root);
    expect(result.activeCount).toBeGreaterThanOrEqual(0);
    expect(result.checkedCount).toBe(0);
    expect(result.parityCount).toBeGreaterThan(0);
    expect(result.parityStatusCounts).toEqual({ PLANNED:42, BLOCKED:3, VERIFIED:8 });
  });

  test('rejects checked-off rows, duplicate active items, and impossible totals', () => {
    const roadmap = `# Roadmap\nROADMAP.md is the single actionable source.\nActive items: 1\n- [x] P1 — Finished\n- [ ] P2 — Duplicate\n- [ ] P2 — Duplicate`;
    const parity = `# Historical parity ledger\nThis is historical evidence; ROADMAP.md is the active engineering tracker.\n### PS-001 — Example\nStatus: PLANNED\n`;
    expect(() => validateRoadmapConsistency(roadmap, parity)).toThrow(/checked-off/);
    expect(() => validateRoadmapConsistency(roadmap.replace('- [x] P1 — Finished\n', ''), parity))
      .toThrow(/duplicate|active-item total/);
    expect(() => validateRoadmapConsistency(
      roadmap.replace('Active items: 1', 'Active items: 99').replace('- [x] P1 — Finished\n', ''),
      parity
    )).toThrow(/active-item total/);
  });

  test('rejects a drained claim while planned parity work remains', () => {
    const roadmap = '# Roadmap\nROADMAP.md is the single actionable source.\nThe parity work is fully drained.\n- [ ] P2 — Example';
    const parity = '# Historical parity ledger\nThis is historical evidence; ROADMAP.md is the active engineering tracker.\n### PS-001 — Example\nStatus: PLANNED\n';
    expect(() => validateRoadmapConsistency(roadmap, parity)).toThrow(/drained/);
  });

  test('requires parity rows to be explicitly classified as historical evidence', () => {
    const roadmap = '# Roadmap\nROADMAP.md is the single actionable source.\n- [ ] P2 — Example';
    const parity = '# Parity\n### PS-001 — Example\nStatus: PLANNED\n';
    expect(() => validateRoadmapConsistency(roadmap, parity)).toThrow(/historical evidence/);
  });
});
