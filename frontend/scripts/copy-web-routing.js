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
THESIS: Nurik's Academy operations feel like a disciplined branded register, not a marketing page, children's product, or futuristic AI dashboard.
OWN-WORLD: Warm black fields, quiet liquid-glass panels, brass-gold active markers, warm-white copy, the real academy mark, and precise controls.
STORY: Identity and current operational status lead; familiar role tasks follow; decorative content never competes with the work.
FIRST VIEWPORT: Academy identity, overview, today and status, and the original role bottom navigation; login uses a compact panel over quiet gold atmosphere.
FORM: Layered but restrained institutional glass, user-pinned direction, seed 6abe2f43.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

if (existsSync(htmlPath)) {
  let html = readFileSync(htmlPath, 'utf8');
  html = html.replace(
    /<meta\s+name=["']viewport["']\s+content=["'][^"']*["']\s*\/?\s*>/i,
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />',
  );
  const hardeningStyle = '<style id="nuriks-web-hardening">html{-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:manipulation}button,[role="button"],input,select,textarea{touch-action:manipulation;-webkit-tap-highlight-color:transparent}input,select,textarea{font-size:16px!important}</style>';
  if (!html.includes('id="nuriks-web-hardening"')) {
    html = html.replace('</head>', `${hardeningStyle}</head>`);
  }
  const previousContract = /(<body[^>]*>)\s*<!--\s*THESIS:[\s\S]*?FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN\.md\s*-->/i;
  if (previousContract.test(html)) {
    html = html.replace(previousContract, `$1\n${designContract}`);
  } else if (!html.includes('seed 6abe2f43')) {
    html = html.replace(/<body([^>]*)>/i, (match) => `${match}\n${designContract}`);
  }
  writeFileSync(htmlPath, html);
}
