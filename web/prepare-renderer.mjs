import { cpSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.join(root, '..', 'desktop');
const renderer = path.join(root, 'generated');
mkdirSync(path.join(renderer, 'dist'), { recursive: true });
cpSync(path.join(desktop, 'scripts'), path.join(renderer, 'scripts'), { recursive: true });
cpSync(path.join(desktop, 'styles'), path.join(renderer, 'styles'), { recursive: true });
for (const name of ['app.css', 'clipboard.css', 'writer.css', 'login.css', 'quick.css']) {
  copyFileSync(path.join(desktop, name), path.join(renderer, name));
}
copyFileSync(
  require.resolve('highlight.js/styles/github-dark.css'),
  path.join(renderer, 'dist', 'highlight.css'),
);
const assets = path.join(root, 'public', 'assets');
mkdirSync(assets, { recursive: true });
for (const name of ['spotify-white.svg', 'spotify-black.svg']) {
  copyFileSync(path.join(desktop, 'assets', name), path.join(assets, name));
}
const { version } = JSON.parse(readFileSync(path.join(desktop, 'package.json'), 'utf8'));
writeFileSync(path.join(renderer, 'version.json'), JSON.stringify({ version }) + '\n');
