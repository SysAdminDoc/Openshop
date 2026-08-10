import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { check, inlineScriptHashes, updatePolicy } from '../tools/security.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

function scriptSource(source) {
  return html.replace("'wasm-unsafe-eval' blob:;", `'wasm-unsafe-eval' blob: ${source};`);
}

describe('release security contract', () => {
  test('accepts the shipped policy and pins the inline script count', () => {
    expect(check(html).inlineScripts).toBe(2);
    expect(inlineScriptHashes(html)).toHaveLength(2);
  });

  test.each([
    "script-src-elem 'unsafe-inline' https://example.test; ",
    "script-src-attr 'unsafe-inline'; "
  ])('rejects an overriding script directive: %s', directive => {
    expect(() => check(html.replace("script-src 'self'", `${directive}script-src 'self'`)))
      .toThrow(/can override the audited script-src contract/);
  });

  test.each([
    'https:',
    '*',
    'cdn.jsdelivr.net',
    "'nonce-release'",
    "'sha384-YWJjZA=='"
  ])('rejects an unauthorized script source: %s', source => {
    expect(() => check(scriptSource(source))).toThrow(/script-src (?:contains|nonce)/);
  });

  test.each([
    '<img onerror=alert(1)>',
    '<div/onclick=alert(1)>'
  ])('rejects unquoted and slash-separated event handlers', markup => {
    expect(() => check(html.replace('</body>', `${markup}</body>`)))
      .toThrow(/executable HTML event attribute/);
  });

  test('treats whitespace around src as an external script attribute', () => {
    const changed = html.replace('</body>', '<script src = "https://example.test/a.js"></script></body>');
    expect(inlineScriptHashes(changed)).toHaveLength(2);
    expect(() => check(changed)).toThrow(/external script lacks SHA-384 integrity/);
  });

  test('pins verified asset origins and URL uniqueness', () => {
    const foreign = html.replace(
      'https://cdn.jsdelivr.net/npm/fabric@7.4.0/dist/index.min.js',
      'https://example.test/npm/fabric@7.4.0/dist/index.min.js'
    );
    expect(() => check(foreign)).toThrow(/unauthorized origin/);

    const duplicate = html.replace(
      'https://cdn.jsdelivr.net/npm/ag-psd@31.0.2/dist/bundle.js',
      'https://cdn.jsdelivr.net/npm/fabric@7.4.0/dist/index.min.js'
    );
    expect(() => check(duplicate)).toThrow(/boot asset URLs are not unique/);
  });

  test('updates a policy containing replacement-pattern characters literally', () => {
    const changed = html.replace(
      "worker-src 'self' blob:;",
      () => "worker-src 'self' blob:; report-uri https://example.test/$&;"
    );
    expect(updatePolicy(changed)).toContain('report-uri https://example.test/$&;');
  });

  test('refuses to bless an added inline script', () => {
    const changed = updatePolicy(html.replace('</body>', '<script>globalThis.extra = true;</script></body>'));
    expect(() => check(changed)).toThrow(/expected 2 inline scripts, found 3/);
  });

  test.each(['base-uri', 'object-src', 'connect-src'])(
    'requires the %s directive',
    directive => {
      const changed = html.replace(new RegExp(`${directive} [^;]+; `), '');
      expect(() => check(changed)).toThrow(new RegExp(`${directive} directive is missing`));
    }
  );

  test.each([
    ["require-trusted-types-for 'script'; ", /require-trusted-types-for 'script' directive is missing/],
    ['trusted-types openshop-loader; ', /trusted-types directive is missing/]
  ])('requires the Trusted Types CSP directives', (directive, error) => {
    expect(() => check(html.replace(directive, ''))).toThrow(error);
  });

  test('allows only the named loader policy', () => {
    expect(() => check(html.replace('trusted-types openshop-loader;', 'trusted-types other-policy;')))
      .toThrow(/trusted-types must allow only openshop-loader/);
  });

  test('rejects a second Trusted Types policy declaration', () => {
    const changed = html.replace(
      'const bootDigest =',
      "globalThis.trustedTypes.createPolicy('other-policy', {});\nconst bootDigest ="
    );
    expect(() => check(changed)).toThrow(/exactly one Trusted Types policy declaration/);
  });

  test('rejects a bare JavaScript Blob URL', () => {
    const changed = html.replace(
      '</body>',
      "<script>URL.createObjectURL(new Blob(['unverified'], { type:'application/javascript' }));</script></body>"
    );
    expect(() => check(changed)).toThrow(/JavaScript Blob URL is created without the Trusted Types loader/);
  });

  test('rejects header-only directives when they appear in meta delivery', () => {
    const changed = html.replace("object-src 'none';", "object-src 'none'; frame-ancestors https://host.example; ");
    expect(() => check(changed)).toThrow(/frame-ancestors is header-only/);
  });
});
