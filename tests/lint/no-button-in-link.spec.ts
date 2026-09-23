// @vitest-environment node
import path from 'node:path';
import { ESLint, RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';

import wapKitPlugin from '../../scripts/lint/eslint-plugin-wap-kit.mjs';

/**
 * WAP-268 (follow-up to WAP-252 / #2579): an Astryx `Button` placed directly
 * inside a `Link` or `AstryxLink` renders `<a><button>`, which is invalid and
 * gives keyboard users two tab stops per action. The lint rule
 * `wap-kit/no-button-in-link` fails `npm run lint` on that pattern and points
 * to KitLinkButton. These cases lint fixture strings; they do not read source.
 */

const rule = wapKitPlugin.rules['no-button-in-link'];

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run('wap-kit/no-button-in-link', rule, {
  valid: [
    { code: '<KitLinkButton href="/x" label="Go"/>' },
    { code: '<Link href="/x">Go</Link>' },
    { code: '<Button/>' },
    { code: '<Card><Button/></Card>' },
  ],
  invalid: [
    {
      code: '<AstryxLink href="/x"><Button label="Go"/></AstryxLink>',
      errors: [{ messageId: 'buttonInLink', type: 'JSXElement' }],
    },
    {
      code: '<Link href="/x">\n  <Button/>\n</Link>',
      errors: [{ messageId: 'buttonInLink', line: 2, column: 3 }],
    },
  ],
});

describe('wap-kit/no-button-in-link through the repo ESLint config', () => {
  it('names KitLinkButton in its message', () => {
    expect(rule.meta?.messages?.buttonInLink).toContain('KitLinkButton (components/portal/kit/KitLinkButton.tsx)');
    expect(rule.meta?.messages?.buttonInLink).toContain('docs/KIT_GUIDE.md §9');
  });

  it(
    'fails a kit page that wraps an Astryx Button in AstryxLink',
    async () => {
      const eslint = new ESLint({ cwd: path.resolve(__dirname, '../..') });
      const code = [
        "import NextLink from 'next/link';",
        "import { Button } from '@astryxdesign/core/Button';",
        "import { Link as AstryxLink } from '@astryxdesign/core/Link';",
        '',
        'export function Fake() {',
        '  return (',
        '    <AstryxLink href="/x" as={NextLink as never} isStandalone>',
        '      <Button label="Go" variant="secondary" size="sm" />',
        '    </AstryxLink>',
        '  );',
        '}',
        '',
      ].join('\n');
      const [result] = await eslint.lintText(code, { filePath: 'components/portal/kit/pages/Fake.tsx' });
      const hits = result.messages.filter((m) => m.ruleId === 'wap-kit/no-button-in-link');
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({ severity: 2, line: 8 });
      expect(hits[0].message).toContain('KitLinkButton');
    },
    60_000,
  );
});
