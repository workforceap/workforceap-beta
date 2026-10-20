// CommonJS and ESM audit callers must discover the same checked-out API tree.
// Keeping __dirname here also lets Playwright's CommonJS transform load the collector.
const { resolve } = require('node:path');
module.exports = resolve(__dirname, '../../app/api');
