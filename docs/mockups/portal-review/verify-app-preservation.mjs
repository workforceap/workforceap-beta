/** Fail closed if the reviewed appearance patch changes application behavior. */
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import postcss from 'postcss';

const arg = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const app = resolve(arg('app', '.'));
const base = arg('base', 'f8a12f527810ba8c1e08840a762358b0fd86e4f1');
const head = arg('head', 'HEAD');
const git = (...args) => execFileSync('git', args, {cwd: app, encoding: 'utf8'}).trimEnd();
const baseSha = git('rev-parse', base);
const headSha = git('rev-parse', head);
const changed = git('diff', '--name-only', baseSha, headSha).split('\n').filter(Boolean);
const runtime = changed.filter(path => !path.startsWith('docs/') && !path.startsWith('tests/') && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path));
const tsxAllowed = new Set(['components/portal/ReadinessCoachReturnButton.tsx', 'components/portal/kit/pages/VoiceStudioKit.tsx']);
const cssAllowed = new Set(['css/portal-tokens.css', 'css/portal-kit.css', 'css/portal.css']);
const paint = new Set(['background', 'background-color', 'border-color', 'box-shadow', 'color', '--wa-bg-wave', '--wa-shell-header-bg']);

function functionalCss(source) {
  const sheet = postcss.parse(source);
  const declarations = [];
  const atRules = [];
  const paintResources = [];
  sheet.walkAtRules(rule => atRules.push([rule.name, rule.params]));
  sheet.walkDecls(declaration => {
    const ancestors = [];
    for (let node = declaration.parent; node && node.type !== 'root'; node = node.parent) ancestors.unshift(node.type === 'rule' ? node.selector : `@${node.name} ${node.params}`);
    if (paint.has(declaration.prop)) {
      if (/url\s*\(/i.test(declaration.value)) paintResources.push([ancestors, declaration.prop, declaration.value, !!declaration.important]);
      return;
    }
    declarations.push([ancestors, declaration.prop, declaration.value, !!declaration.important]);
  });
  return {atRules, declarations, paintResources};
}

function functionalTsx(source, path) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result = ts.transform(file, [context => {
    const visit = node => {
      if (ts.isJsxAttribute(node) && node.name.getText(file) === 'style' && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isObjectLiteralExpression(node.initializer.expression)) {
        const object = node.initializer.expression;
        const properties = object.properties.map(property => {
          if (!ts.isPropertyAssignment(property) || !['background', 'color'].includes(property.name.getText(file)) || !ts.isStringLiteralLike(property.initializer) || /url\s*\(/i.test(property.initializer.text)) return property;
          return ts.factory.updatePropertyAssignment(property, property.name, ts.factory.createStringLiteral('REVIEWED_PAINT_VALUE'));
        });
        return ts.factory.updateJsxAttribute(node, node.name, ts.factory.updateJsxExpression(node.initializer, node.initializer.dotDotDotToken, ts.factory.updateObjectLiteralExpression(object, properties)));
      }
      return ts.visitEachChild(node, visit, context);
    };
    return root => ts.visitNode(root, visit);
  }]);
  try { return ts.createPrinter({removeComments: true}).printFile(result.transformed[0]); }
  finally { result.dispose(); }
}

const checks = [];
for (const path of runtime) {
  const before = git('show', `${baseSha}:${path}`);
  const after = git('show', `${headSha}:${path}`);
  if (tsxAllowed.has(path)) {
    assert.equal(functionalTsx(after, path), functionalTsx(before, path), `Behavior changed outside literal background/color styles: ${path}`);
    checks.push({path, verified: 'AST unchanged outside literal JSX background/color values and comments'});
  } else if (cssAllowed.has(path)) {
    assert.deepEqual(functionalCss(after), functionalCss(before), `Non-paint CSS changed: ${path}`);
    checks.push({path, verified: 'Non-paint declarations, at-rules, resource URLs, selectors and enclosing conditions unchanged'});
  } else throw Error(`Unexpected runtime change requires a separate feature review: ${path}`);
}
assert.ok(runtime.length > 0, 'No runtime appearance changes found; check the supplied refs.');
const receipt = {baseSha,headSha,checks,otherTrackedFiles: 'Unchanged outside listed runtime files and docs/tests',liveAcceptance:false,limits:'This proves a bounded code change, not authenticated deployment health or complete visual accessibility.'};
const output = arg('output', '');
if (output) writeFileSync(resolve(output), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
