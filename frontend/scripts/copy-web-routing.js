/* global __dirname */
const { copyFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const source = join(__dirname, '..', 'public', '_redirects');
const destination = join(__dirname, '..', 'dist', '_redirects');

if (existsSync(source)) {
  copyFileSync(source, destination);
}
