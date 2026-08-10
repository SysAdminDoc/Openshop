import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const workflow = readFileSync(join(root, '.github', 'workflows', 'verify.yml'), 'utf8');
const dependabot = readFileSync(join(root, '.github', 'dependabot.yml'), 'utf8');

describe('GitHub Actions supply-chain contract', () => {
  it('pins every third-party action to a full commit SHA with a release comment', () => {
    const lines = workflow.split(/\r?\n/).filter(line => /\buses:\s*/.test(line));
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach(line => {
      const match = line.match(/\buses:\s*([^\s#]+)@([^\s#]+)/);
      expect(match?.[1]).toMatch(/^actions\/[a-z0-9-]+$/);
      expect(match?.[2]).toMatch(/^[0-9a-f]{40}$/);
      expect(line).toMatch(/#\s*v\d+\.\d+\.\d+/);
    });
    expect(workflow).not.toMatch(/\buses:\s*[^\n]+@(?![0-9a-f]{40}\b)[^\s#]+/);
  });

  it('declares least-privilege contents access and reviewed update automation', () => {
    expect(workflow).toMatch(/permissions:\s*\r?\n\s+contents:\s+read/);
    expect(dependabot).toMatch(/package-ecosystem:\s+github-actions/);
    expect(dependabot).toMatch(/interval:\s+weekly/);
    expect(dependabot).toMatch(/package-ecosystem:\s+npm/);
  });
});
