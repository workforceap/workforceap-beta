import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { classifyPreviewDbUrl } = require('./lib/resume-demo-secret-diagnostic.cjs');

const allowedNames = ['PREVIEW_POSTGRES_PRISMA_URL', 'PREVIEW_DATABASE_URL'];
const names = process.argv.slice(2);
if (names.length !== allowedNames.length ||
    allowedNames.some((name) => names.filter((input) => input === name).length !== 1)) {
  process.exitCode = 1;
}

for (const inputName of names) {
  // Do not read arbitrary environment variables or echo untrusted arguments.
  const validName = allowedNames.includes(inputName);
  const name = validName ? inputName : 'invalid';
  const result = classifyPreviewDbUrl(name, validName ? process.env[inputName] : undefined);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!validName || result.classification !== 'demo') process.exitCode = 1;
}
