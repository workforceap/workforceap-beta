/**
 * Local ESLint plugin for design-kit rules that cannot live in
 * `no-restricted-syntax` (flat config replaces that rule per block, and the
 * repo config restates it in about 10 blocks; see eslint.config.mjs).
 *
 * no-button-in-link (WAP-268, follow-up to WAP-252 / #2579): a JSX `Button`
 * that is the direct child of a JSX `Link` or `AstryxLink` renders
 * `<a><button>`, which is invalid HTML and gives keyboard users two tab stops
 * per action. Use KitLinkButton instead. Whitespace text between the tags
 * does not change the parent, so multi-line markup is caught too.
 */

const LINK_NAMES = new Set(['Link', 'AstryxLink']);

/**
 * The tag name of a JSXElement written as a plain identifier (`<Button>`),
 * or null for anything else (member names like `<Foo.Button>`, non-elements).
 * @param {any} node
 */
function jsxIdentifierName(node) {
  if (!node || node.type !== 'JSXElement') return null;
  const name = node.openingElement.name;
  return name.type === 'JSXIdentifier' ? name.name : null;
}

/** @type {import('eslint').Rule.RuleModule} */
const noButtonInLink = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow an Astryx Button placed directly inside a Link or AstryxLink; use KitLinkButton.',
    },
    schema: [],
    messages: {
      buttonInLink:
        "Don't put a Button inside a Link (two tab stops, invalid <a><button>). Use KitLinkButton (components/portal/kit/KitLinkButton.tsx); see docs/KIT_GUIDE.md §9.",
    },
  },
  create(context) {
    return {
      /** @param {any} node */
      JSXElement(node) {
        if (jsxIdentifierName(node) !== 'Button') return;
        const parentName = jsxIdentifierName(node.parent);
        if (parentName && LINK_NAMES.has(parentName)) {
          context.report({ node, messageId: 'buttonInLink' });
        }
      },
    };
  },
};

/** @type {import('eslint').ESLint.Plugin & { rules: { 'no-button-in-link': import('eslint').Rule.RuleModule } }} */
const plugin = {
  meta: { name: 'eslint-plugin-wap-kit', version: '1.0.0' },
  rules: {
    'no-button-in-link': noButtonInLink,
  },
};

export default plugin;
