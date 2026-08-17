/* global __dirname */
const { copyFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const source = join(__dirname, '..', 'public', '_redirects');
const destination = join(__dirname, '..', 'dist', '_redirects');

if (existsSync(source)) {
  copyFileSync(source, destination);
}

const htmlPath = join(__dirname, '..', 'dist', 'index.html');
const designContract = `<!--
THESIS: The academy is a working day ledger; scheduled work, accountable owners, exceptions, and resolution replace the generic dashboard-card wall.
OWN-WORLD: Ink-black ruled surfaces, warm-white information, brass-gold active markers, compact native controls, and restrained semantic status colors.
STORY: Each role sees what is happening now, what needs attention, who owns it, and the next authorized action.
FIRST VIEWPORT: Role navigation frames a dated operational header, a dominant daily work register, a supporting exception queue, and quiet exact-number ledgers.
FORM: Day Ledger, grounded structure 4, seed d7c63128.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

if (existsSync(htmlPath)) {
  const html = readFileSync(htmlPath, 'utf8');
  if (!html.includes('seed d7c63128')) {
    writeFileSync(htmlPath, html.replace(/<body([^>]*)>/i, (match) => `${match}\n${designContract}`));
  }
}
