import { describe, expect, it } from 'vitest';
import { assertCssSyntax, checkShippedCss, extractInlineStylesheetSources } from '../tools/css-syntax.mjs';

describe('shipped CSS syntax gate', () => {
  it('parses every inline and tracked stylesheet', () => {
    expect(checkShippedCss().files).toBeGreaterThanOrEqual(1);
  });

  it('reports the source location of malformed CSS', () => {
    const sources = extractInlineStylesheetSources('<style>\n.ok { color: red; }\n}\n</style>', 'fixture.html');
    expect(() => assertCssSyntax(sources)).toThrow('fixture.html:3:1: Selector is expected');
  });
});
